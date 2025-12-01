// Pipeline for MVP v3+
// Stages: Load → Decay → Classification → Global → Handle → Save

import { v4 as uuidv4 } from 'uuid';
import {
  conversationRepository,
  messageRepository,
  stateRepository,
} from '@/database/repositories/index.js';
import { decayStage } from '@/core/stages/decay.stage.js';
import { globalStage } from '@/core/stages/global.stage.js';
import { safetyClassifier, intentClassifier, arbiter } from '@/core/classifiers/index.js';
import { consultHandler } from '@/core/modes/consult.handler.js';
import { smalltalkHandler } from '@/core/modes/smalltalk.handler.js';
import { metaHandler } from '@/core/modes/meta.handler.js';
import { logger } from '@/core/logger.js';
import { config } from '@/config/index.js';
import {
  PipelineError,
  MessageRole,
  ConversationStatus,
  ConversationMode,
  SafetyLevel,
  type PipelineContext,
  type PipelineResult,
  type Conversation,
  type Message,
  type ConversationState,
  type IModeHandler,
  type ArbiterDecision,
  type ClassificationContext,
  type SafetyResult,
  type IntentResult,
} from '@/types/index.js';

export class Pipeline {
  private modeHandlers: Map<ConversationMode, IModeHandler>;

  constructor() {
    // Register mode handlers
    this.modeHandlers = new Map<ConversationMode, IModeHandler>();
    this.modeHandlers.set(ConversationMode.CONSULT, consultHandler);
    this.modeHandlers.set(ConversationMode.SMALLTALK, smalltalkHandler);
    this.modeHandlers.set(ConversationMode.META, metaHandler);
  }

  /**
   * Execute the full pipeline for a user message (MVP v3+)
   * Stages: Load → Decay → Classification → Global → Handle → Save
   */
  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Load conversation, messages, and state
      const { conversation, messages, state } = await this.loadStage(context);

      // Stage 2: Apply decay to state
      const decayedState = decayStage.applyDecay(state);

      logger.debug(
        {
          conversationId: conversation.id,
          beforeDecay: {
            contextElements: state.contextElements.length,
            goals: state.goals.length,
          },
          afterDecay: {
            contextElements: decayedState.contextElements.length,
            goals: decayedState.goals.length,
          },
          elementsRemoved: state.contextElements.length - decayedState.contextElements.length,
          goalsRemoved: state.goals.length - decayedState.goals.length,
        },
        'Decay stage: State decay applied'
      );

      // Stage 3: Classification (Sequential: Safety → Intent → Arbiter)
      const { decision, safetyResult, intentResult } = await this.classificationStage(
        context,
        messages,
        decayedState
      );

      // Stage 4: Global - Extract context elements from classification
      const { state: stateWithContext } = await globalStage.execute({
        message: context.message,
        state: decayedState,
        safetyResult,
        intentResult,
      });

      logger.info(
        {
          conversationId: conversation.id,
          contextElements: stateWithContext.contextElements.length,
          contextByType: this.countContextByType(stateWithContext.contextElements),
        },
        'Global stage: Context elements extracted'
      );

      // Stage 5: Handle message with appropriate mode handler
      const handler = this.modeHandlers.get(decision.finalMode);
      if (!handler) {
        throw new Error(`No handler found for mode: ${decision.finalMode}`);
      }

      logger.info(
        {
          conversationId: conversation.id,
          handlerMode: decision.finalMode,
          safetyLevel: decision.safetyContext.level,
          isCrisis: decision.safetyContext.isCrisis,
          contextProvided: {
            messages: messages.length,
            contextElements: decayedState.contextElements.length,
            activeGoals: decayedState.goals.filter((g) => g.status === 'active').length,
          },
        },
        'Handler stage: Routing to mode handler'
      );

      // Build classification context for handler
      const classificationContext: ClassificationContext = {
        decision,
        safetySignals: [], // Will be populated from safety result
        entities: [], // Will be populated from intent result
      };

      const handlerResult = await handler.handle({
        conversationId: conversation.id,
        userId: context.userId,
        message: context.message,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        currentMode: decision.finalMode,
        state: stateWithContext as any,
        classification: classificationContext,
      });

      // Stage 5: Save messages and updated state
      const messageId = await this.saveStage(
        conversation.id,
        context.message,
        handlerResult.response,
        stateWithContext,
        decision.finalMode
      );

      const processingTime = Date.now() - startTime;

      return {
        response: handlerResult.response,
        processingTime,
        messageId,
        conversationId: conversation.id,
      };
    } catch (error) {
      throw new PipelineError('pipeline', error as Error, context);
    }
  }

  /**
   * Classification Stage: Sequential Safety → Intent → Arbiter (MVP v3+)
   * Returns decision and classification results for Global stage
   */
  private async classificationStage(
    context: PipelineContext,
    messages: Message[],
    state: ConversationState
  ): Promise<{ decision: ArbiterDecision; safetyResult: SafetyResult; intentResult: IntentResult }> {
    try {
      const classificationStart = Date.now();

      // Step 1: Safety Classification (always runs first)
      const safetyResult = await safetyClassifier.classify({
        message: context.message,
        recentUserMessages: messages
          .filter((m) => m.role === MessageRole.USER)
          .slice(-3)
          .map((m) => m.content),
        currentSafetyLevel: SafetyLevel.SAFE, // TODO: Track safety level in state
      });

      logger.info(
        {
          safetyLevel: safetyResult.level,
          confidence: safetyResult.confidence,
          signals: safetyResult.signals,
          isCrisis: safetyResult.level === SafetyLevel.CRISIS,
        },
        'Classification: Safety check complete'
      );

      // Step 2: Intent Classification (runs sequentially after safety)
      const intentResult = await intentClassifier.classify({
        message: context.message,
        recentMessages: messages.slice(-5).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        currentMode: state.mode,
      });

      logger.info(
        {
          intent: intentResult.intent,
          suggestedMode: intentResult.suggestedMode,
          confidence: intentResult.confidence,
          entities: intentResult.entities.length,
        },
        'Classification: Intent detection complete'
      );

      // Step 3: Arbiter makes final decision
      const decision = await arbiter.arbitrate({
        safetyResult,
        intentResult,
        currentMode: state.mode,
      });

      const classificationDuration = Date.now() - classificationStart;

      logger.info(
        {
          finalMode: decision.finalMode,
          safetyLevel: decision.safetyContext.level,
          isCrisis: decision.safetyContext.isCrisis,
          overrideApplied: !!decision.overrideReason,
          duration: classificationDuration,
        },
        'Classification: Arbiter decision complete'
      );

      return { decision, safetyResult, intentResult };
    } catch (error) {
      throw new PipelineError('classification', error as Error, context);
    }
  }

  /**
   * Helper to count context elements by type
   */
  private countContextByType(elements: Array<{ contextType?: string }>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const element of elements) {
      const type = element.contextType || 'general';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Load Stage: Load or create conversation, messages, and state (MVP v2)
   */
  private async loadStage(
    context: PipelineContext
  ): Promise<{ conversation: Conversation; messages: Message[]; state: ConversationState }> {
    try {
      let conversation: Conversation | null = null;

      // Debug log to verify flag is received
      logger.debug(
        {
          forceNewConversation: context.forceNewConversation,
          conversationId: context.conversationId,
          userId: context.userId,
        },
        'Load stage: Received context'
      );

      // If forceNewConversation is true, skip finding existing conversations
      if (context.forceNewConversation) {
        logger.info(
          { userId: context.userId },
          'Load stage: Force creating new conversation (ignoring active conversations)'
        );
        // conversation stays null, will create new below
      } else if (context.conversationId) {
        // Try to find specific conversation by ID
        conversation = await conversationRepository.findById(context.conversationId);
      } else {
        // Find active conversation for user
        const activeConversations = await conversationRepository.findActiveByUserId(context.userId);
        conversation = activeConversations[0] ?? null;
      }

      // Create new conversation if none exists or force new
      if (!conversation) {
        conversation = await conversationRepository.create({
          id: uuidv4(),
          userId: context.userId,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          status: ConversationStatus.ACTIVE,
        });

        logger.info(
          { conversationId: conversation.id, userId: context.userId },
          'Load stage: Created new conversation'
        );
      } else {
        // Update last activity
        await conversationRepository.updateActivity(conversation.id);
      }

      // Load recent messages for context
      const messages = await messageRepository.getRecentMessages(
        conversation.id,
        config.context.messageLimit
      );

      // Load or initialize conversation state
      let state = await stateRepository.getLatestByConversationId(conversation.id);

      if (!state) {
        // Initialize new state with SMALLTALK as default mode
        state = await stateRepository.create({
          id: uuidv4(),
          conversationId: conversation.id,
          mode: ConversationMode.SMALLTALK,
          contextElements: [],
          goals: [],
          lastActivityAt: new Date(),
        });

        logger.info(
          {
            conversationId: conversation.id,
            isNew: true,
            initialMode: state.mode,
          },
          'Load stage: New conversation initialized'
        );
      } else {
        logger.info(
          {
            conversationId: conversation.id,
            messagesLoaded: messages.length,
            currentMode: state.mode,
            contextElements: state.contextElements.length,
            activeGoals: state.goals.filter((g) => g.status === 'active').length,
          },
          'Load stage: Existing conversation loaded'
        );
      }

      return { conversation, messages, state };
    } catch (error) {
      throw new PipelineError('load', error as Error, context);
    }
  }

  /**
   * Save Stage: Save user message, assistant response, and updated state (MVP v2)
   */
  private async saveStage(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    state: ConversationState,
    newMode: ConversationMode
  ): Promise<string> {
    try {
      const timestamp = new Date();

      // Save user message
      await messageRepository.create({
        id: uuidv4(),
        conversationId,
        role: MessageRole.USER,
        content: userMessage,
        timestamp,
      });

      // Save assistant response
      const assistantMessage = await messageRepository.create({
        id: uuidv4(),
        conversationId,
        role: MessageRole.ASSISTANT,
        content: assistantResponse,
        timestamp: new Date(),
      });

      // Always save state snapshot to persist context elements
      const modeChanged = newMode !== state.mode;
      await stateRepository.create({
        id: uuidv4(),
        conversationId,
        mode: newMode,
        contextElements: state.contextElements,
        goals: state.goals,
        lastActivityAt: new Date(),
      });

      logger.info(
        {
          conversationId,
          modeChanged,
          oldMode: state.mode,
          newMode,
          contextElements: state.contextElements.length,
          contextByType: this.countContextByType(state.contextElements),
        },
        'Save stage: State snapshot saved'
      );

      return assistantMessage.id;
    } catch (error) {
      throw new PipelineError('save', error as Error);
    }
  }
}

export const pipeline = new Pipeline();
