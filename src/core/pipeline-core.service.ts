/**
 * Pipeline Core Service
 * =====================
 * Handles core infrastructure operations for the pipeline:
 * - Loading conversations, messages, and state
 * - Saving messages and state snapshots
 * - Managing conversation lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
import {
  conversationRepository,
  messageRepository,
  stateRepository,
} from '@/database/repositories/index.js';
import { logger } from '@/core/logger.js';
import { config } from '@/config/index.js';
import { pipelineDomainService } from './pipeline-domain.service.js';
import {
  PipelineError,
  MessageRole,
  ConversationStatus,
  ConversationMode,
  type PipelineContext,
  type Conversation,
  type Message,
  type ConversationState,
} from '@/types/index.js';

export class PipelineCoreService {
  // ═══════════════════════════════════════════════════════════════════════
  // LOAD STAGE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Load Stage: Load or create conversation, messages, and state
   * Handles conversation initialization and history loading
   */
  async loadStage(
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

      // Load domain history if enabled
      if (config.domainHistory.enabled) {
        state = await pipelineDomainService.loadDomainHistory(
          state,
          conversation.id,
          context.userId
        );
      }

      return { conversation, messages, state };
    } catch (error) {
      throw new PipelineError('load', error as Error, context);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAVE STAGE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save Stage: Save user message, assistant response, and updated state
   * Handles message persistence and state snapshot creation
   */
  async saveStage(
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
          contextByType: pipelineDomainService.countContextByType(state.contextElements),
        },
        'Save stage: State snapshot saved'
      );

      return assistantMessage.id;
    } catch (error) {
      throw new PipelineError('save', error as Error);
    }
  }
}

export const pipelineCoreService = new PipelineCoreService();
