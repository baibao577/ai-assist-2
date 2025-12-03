/**
 * PIPELINE ARCHITECTURE OVERVIEW
 * ==============================
 *
 * The pipeline processes user messages through 6 sequential stages with parallel optimization:
 *
 * 1. LOAD STAGE
 *    - Loads or creates conversation, retrieves message history, initializes state
 *    - Default mode: SMALLTALK for new conversations
 *
 * 2. DECAY STAGE
 *    - Applies time-based decay to context elements and goals
 *    - Maintains memory freshness based on configured half-life values
 *
 * 3. CLASSIFICATION STAGE (Sequential)
 *    - Safety Classifier: Detects crisis/concern/safe levels
 *    - Intent Classifier: Determines user intent and suggests mode
 *    - Arbiter: Makes final routing decision, applies safety overrides
 *
 * 4. PARALLEL ENRICHMENT STAGE (3 Parallel Groups)
 *    - Group 1: Global context extraction + Domain classification (in parallel)
 *    - Group 2: Domain-specific data extraction (all domains in parallel)
 *    - Group 3: Steering strategy generation (all strategies in parallel)
 *
 * 5. HANDLER STAGE
 *    - Routes to appropriate mode handler (CONSULT/SMALLTALK/META)
 *    - Generates contextual response using enriched state
 *
 * 6. SAVE STAGE
 *    - Persists messages and updated state to database
 *    - Stores domain extractions if configured
 *
 * PARALLEL OPTIMIZATION
 * ---------------------
 * - Independent operations run concurrently to reduce latency
 * - Domain operations (classify → extract → steer) are pipelined
 * - Typical performance gain: 30-40% reduction in processing time
 *
 * STATE FLOW
 * ----------
 * Initial State → Decayed State → Enriched State (with context/domains) → Final State
 * Each stage enhances the state with additional information for the next stage.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  conversationRepository,
  messageRepository,
  stateRepository,
} from '@/database/repositories/index.js';
import { decayStage } from '@/core/stages/decay.stage.js';
import { globalStage } from '@/core/stages/global.stage.js';
import {
  safetyClassifier,
  intentClassifier,
  arbiter,
  DomainRelevanceClassifier,
} from '@/core/classifiers/index.js';
import {
  domainRegistry,
  extractorRegistry,
  steeringRegistry,
} from '@/core/domains/registries/index.js';
import { domainConfig } from '@/core/domains/config/DomainConfig.js';
import { StorageFactory } from '@/core/domains/storage/index.js';
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
import type { ExtractedData, DomainDefinition, SteeringHints } from '@/core/domains/types.js';

// Helper types for parallel operations
interface DomainExtractionResult {
  domainId: string;
  extracted: boolean;
  data: ExtractedData | null;
  error?: Error;
}

interface SteeringResult {
  domainId: string;
  hints: SteeringHints | null;
  error?: Error;
}

export class Pipeline {
  private modeHandlers: Map<ConversationMode, IModeHandler>;
  private domainClassifier: DomainRelevanceClassifier;

  constructor() {
    // Register mode handlers
    this.modeHandlers = new Map<ConversationMode, IModeHandler>();
    this.modeHandlers.set(ConversationMode.CONSULT, consultHandler);
    this.modeHandlers.set(ConversationMode.SMALLTALK, smalltalkHandler);
    this.modeHandlers.set(ConversationMode.META, metaHandler);

    // Initialize domain classifier
    this.domainClassifier = new DomainRelevanceClassifier();
  }

  /**
   * Execute the full pipeline for a user message (MVP v3+ with Parallel Optimization)
   * Stages: Load → Decay → Classification → Parallel Enrichment → Handle → Save
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

      // Stage 4: Parallel Enrichment (Global + Domain Classification + Extraction + Steering)
      const enrichedState = await this.parallelEnrichmentStage(
        context,
        messages,
        decayedState,
        { decision, safetyResult, intentResult },
        conversation.id
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
            contextElements: enrichedState.contextElements.length,
            activeGoals: enrichedState.goals.filter((g) => g.status === 'active').length,
            activeDomains: enrichedState.metadata?.activeDomains?.length || 0,
            steeringHints: enrichedState.steeringHints?.suggestions?.length || 0,
          },
        },
        'Handler stage: Routing to mode handler'
      );

      // Build classification context for handler
      const classificationContext: ClassificationContext = {
        decision,
        safetySignals: safetyResult.signals || [],
        entities: intentResult.entities || [],
      };

      const handlerResult = await handler.handle({
        conversationId: conversation.id,
        userId: context.userId,
        message: context.message,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        currentMode: decision.finalMode,
        state: enrichedState as any, // Use fully enriched state
        classification: classificationContext,
      });

      // Stage 6: Save messages and updated state
      const messageId = await this.saveStage(
        conversation.id,
        context.message,
        handlerResult.response,
        enrichedState,
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
   * Parallel enrichment of state with context, extractions, and steering
   * Groups parallel operations while maintaining clear logging
   */
  private async parallelEnrichmentStage(
    context: PipelineContext,
    messages: Message[],
    decayedState: ConversationState,
    classificationResults: {
      decision: ArbiterDecision;
      safetyResult: SafetyResult;
      intentResult: IntentResult;
    },
    conversationId: string
  ): Promise<ConversationState> {
    const parallelStart = Date.now();

    // Prepare state with messages for domain classification
    const stateWithMessages = {
      ...decayedState,
      messages: [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: context.message },
      ],
      userId: context.userId,
      conversationId,
    };

    // === PARALLEL GROUP 1: Global Context + Domain Classification ===
    const parallelGroup1Start = Date.now();

    const [globalResult, domainClassification] = await Promise.all([
      // 4a: Global context extraction
      globalStage.execute({
        message: context.message,
        state: decayedState,
        safetyResult: classificationResults.safetyResult,
        intentResult: classificationResults.intentResult,
      }),

      // 4b: Domain relevance classification
      this.classifyDomainsAsync(stateWithMessages),
    ]);

    // Preserve existing global stage logging
    logger.info(
      {
        conversationId,
        contextElements: globalResult.state.contextElements.length,
        contextByType: this.countContextByType(globalResult.state.contextElements),
      },
      'Global stage: Context elements extracted'
    );

    // Log parallel group 1 timing
    logger.info(
      {
        conversationId,
        relevantDomains: domainClassification.map((d) => d.id),
        parallelGroup1Ms: Date.now() - parallelGroup1Start,
      },
      'Parallel Group 1: Global context + Domain classification complete'
    );

    // If no domains are relevant, return early with just global context
    if (domainClassification.length === 0) {
      logger.debug('No relevant domains found, skipping extraction/steering');
      return globalResult.state;
    }

    // Use global result state merged with messages for domain operations
    const stateForDomains = {
      ...globalResult.state,
      messages: stateWithMessages.messages,
      userId: context.userId,
      conversationId,
    };

    // === PARALLEL GROUP 2: Domain Extractions ===
    const parallelGroup2Start = Date.now();

    // Run all domain extractions in parallel
    const extractionResults = await Promise.all(
      domainClassification.map((domain) =>
        this.extractForSingleDomain(domain, stateForDomains, context.message)
      )
    );

    // Merge extraction results into state
    const stateWithExtractions = this.mergeExtractionResults(stateForDomains, extractionResults);

    // Store extractions if configured
    await this.storeExtractions(extractionResults, stateWithExtractions);

    // Preserve existing extraction logging
    if (stateWithExtractions.metadata?.activeDomains?.length) {
      logger.info(
        {
          conversationId,
          extractedDomains: stateWithExtractions.metadata.activeDomains,
          extractionCount: Object.keys(stateWithExtractions.extractions || {}).length,
          parallelGroup2Ms: Date.now() - parallelGroup2Start,
        },
        'Parallel Group 2: Domain extractions complete'
      );
    }

    // === PARALLEL GROUP 3: Steering Strategies ===
    const parallelGroup3Start = Date.now();

    // Run all steering strategies in parallel for extracted domains
    const steeringResults = await Promise.all(
      extractionResults
        .filter((r) => r.extracted && r.data)
        .map((result) => this.generateSteeringForDomain(result.domainId, stateWithExtractions))
    );

    // Merge steering hints
    const finalState = this.mergeSteeringResults(stateWithExtractions, steeringResults);

    // Preserve existing steering logging
    if (finalState.steeringHints?.suggestions.length) {
      logger.info(
        {
          conversationId,
          steeringStrategies: finalState.metadata?.steeringApplied || [],
          suggestionCount: finalState.steeringHints.suggestions.length,
          parallelGroup3Ms: Date.now() - parallelGroup3Start,
        },
        'Parallel Group 3: Steering strategies complete'
      );
    }

    // Log total parallel processing time
    logger.info(
      {
        conversationId,
        totalParallelMs: Date.now() - parallelStart,
        domains: domainClassification.length,
        extractions: extractionResults.filter((r) => r.extracted).length,
        steeringHints: finalState.steeringHints?.suggestions.length || 0,
      },
      'Parallel enrichment stage complete'
    );

    return finalState;
  }

  // === Helper Methods for Parallel Operations (ordered by execution flow) ===

  /**
   * Classify which domains are relevant for the conversation
   */
  private async classifyDomainsAsync(state: ConversationState): Promise<DomainDefinition[]> {
    // Check if domain system is enabled
    if (!domainConfig.isEnabled()) {
      logger.debug('Domain system disabled');
      return [];
    }

    // Classify domains using the domain relevance classifier
    const relevantDomains = await this.domainClassifier.classifyDomains(state);

    // Filter to only enabled domains
    const enabledDomains = relevantDomains.filter((d) => domainConfig.isDomainEnabled(d.id));

    logger.debug(
      {
        totalRelevant: relevantDomains.length,
        enabledRelevant: enabledDomains.length,
        domains: enabledDomains.map((d) => ({ id: d.id, priority: d.priority })),
      },
      'Domain classification complete'
    );

    return enabledDomains;
  }

  /**
   * Extract data for a single domain
   */
  private async extractForSingleDomain(
    domain: DomainDefinition,
    state: ConversationState,
    currentMessage: string
  ): Promise<DomainExtractionResult> {
    try {
      const extractor = extractorRegistry.getExtractor(domain.id);
      if (!extractor) {
        logger.warn({ domainId: domain.id }, 'No extractor found for domain');
        return { domainId: domain.id, extracted: false, data: null };
      }

      // Get extraction config for this domain
      const extractionConfig = domainConfig.getExtractionConfig(domain.id);

      const context = {
        recentMessages: (state.messages || []).slice(-5).map((m) => ({
          role: m.role as string,
          content: m.content,
        })),
        domainContext: state.domainContext?.[domain.id] || {},
      };

      const extraction = await extractor.extract(currentMessage, context);

      // Check confidence threshold
      if (extraction && extraction.confidence >= (extractionConfig?.confidenceThreshold || 0.5)) {
        logger.debug(
          {
            domainId: domain.id,
            confidence: extraction.confidence,
            fieldsExtracted: Object.keys(extraction.data).length,
          },
          'Domain extraction successful'
        );

        return {
          domainId: domain.id,
          extracted: true,
          data: extraction,
        };
      }

      return { domainId: domain.id, extracted: false, data: null };
    } catch (error) {
      logger.error(
        {
          domainId: domain.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Domain extraction failed'
      );

      return {
        domainId: domain.id,
        extracted: false,
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Merge extraction results into state
   */
  private mergeExtractionResults(
    state: ConversationState,
    results: DomainExtractionResult[]
  ): ConversationState {
    const extractions: Record<string, ExtractedData[]> = {};
    const activeDomains: string[] = [];

    for (const result of results) {
      if (result.extracted && result.data) {
        // Initialize array for domain if not exists
        if (!extractions[result.domainId]) {
          extractions[result.domainId] = [];
        }

        // Add extraction to domain array
        extractions[result.domainId].push(result.data);
        activeDomains.push(result.domainId);
      }
    }

    return {
      ...state,
      extractions,
      metadata: {
        ...state.metadata,
        activeDomains,
      },
    };
  }

  /**
   * Store extractions to domain storage
   */
  private async storeExtractions(
    results: DomainExtractionResult[],
    state: ConversationState
  ): Promise<void> {
    // Store extractions in parallel
    const storagePromises = results
      .filter((r) => r.extracted && r.data)
      .map(async (result) => {
        try {
          const domain = domainRegistry.getDomain(result.domainId);
          if (domain?.config.storageConfig) {
            const storage = StorageFactory.create(result.domainId, domain.config.storageConfig);

            const dataWithContext = {
              ...result.data!.data,
              userId: state.userId || 'unknown',
              conversationId: state.conversationId,
              confidence: result.data!.confidence,
            };

            await storage.store(dataWithContext);

            logger.debug({ domainId: result.domainId }, 'Domain data stored successfully');
          }
        } catch (error) {
          logger.error(
            {
              domainId: result.domainId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to store domain data'
          );
        }
      });

    await Promise.all(storagePromises);
  }

  /**
   * Generate steering for a single domain
   */
  private async generateSteeringForDomain(
    domainId: string,
    state: ConversationState
  ): Promise<SteeringResult> {
    try {
      const strategies = steeringRegistry.getStrategiesForDomain(domainId);

      if (strategies.length === 0) {
        logger.debug({ domainId }, 'No steering strategies found for domain');
        return { domainId, hints: null };
      }

      // Get domain extraction for this domain
      const domainExtraction = state.extractions?.[domainId];
      if (!domainExtraction || domainExtraction.length === 0) {
        return { domainId, hints: null };
      }

      // Generate steering hints from all strategies for this domain
      const allHints: string[] = [];
      let priority = 0.5;

      for (const strategy of strategies) {
        // Generate hints using the strategy (strategy has access to state with extractions)
        const hints = await strategy.generateHints(state);

        if (hints && hints.suggestions.length > 0) {
          allHints.push(...hints.suggestions);
          priority = Math.max(priority, hints.priority || 0.5);
        }
      }

      if (allHints.length > 0) {
        logger.debug(
          {
            domainId,
            suggestionsGenerated: allHints.length,
            strategies: strategies.length,
          },
          'Steering hints generated for domain'
        );

        return {
          domainId,
          hints: {
            type: domainId,
            priority,
            suggestions: allHints,
            context: { domainId },
          },
        };
      }

      return { domainId, hints: null };
    } catch (error) {
      logger.error(
        {
          domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Steering generation failed'
      );

      return {
        domainId,
        hints: null,
        error: error as Error,
      };
    }
  }

  /**
   * Merge steering results into final state
   */
  private mergeSteeringResults(
    state: ConversationState,
    results: SteeringResult[]
  ): ConversationState {
    const allSuggestions: string[] = [];
    const strategiesApplied: string[] = [];
    let maxPriority = 0.5;

    for (const result of results) {
      if (result.hints && result.hints.suggestions.length > 0) {
        allSuggestions.push(...result.hints.suggestions);
        strategiesApplied.push(result.domainId);
        maxPriority = Math.max(maxPriority, result.hints.priority || 0.5);
      }
    }

    if (allSuggestions.length === 0) {
      return state;
    }

    return {
      ...state,
      steeringHints: {
        type: strategiesApplied.length > 1 ? 'multi-domain' : strategiesApplied[0],
        priority: maxPriority,
        suggestions: allSuggestions,
        context: { domains: strategiesApplied },
      },
      metadata: {
        ...state.metadata,
        steeringApplied: strategiesApplied,
      },
    };
  }

  // === Existing Methods (unchanged) ===

  /**
   * Classification Stage: Sequential Safety → Intent → Arbiter (MVP v3+)
   * Returns decision and classification results for Global stage
   */
  private async classificationStage(
    context: PipelineContext,
    messages: Message[],
    state: ConversationState
  ): Promise<{
    decision: ArbiterDecision;
    safetyResult: SafetyResult;
    intentResult: IntentResult;
  }> {
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
