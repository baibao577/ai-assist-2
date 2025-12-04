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
 *
 * MODULAR ARCHITECTURE
 * --------------------
 * - pipeline.ts: Main orchestration and parallel enrichment coordination
 * - pipeline-domain.service.ts: Domain classification, extraction, steering, and history
 * - pipeline-core.service.ts: Core infrastructure (load/save stages)
 */

import { decayStage } from '@/core/stages/decay.stage.js';
import { globalStage } from '@/core/stages/global.stage.js';
import { safetyClassifier, intentClassifier, arbiter } from '@/core/classifiers/index.js';
import { consultHandler } from '@/core/modes/consult.handler.js';
import { smalltalkHandler } from '@/core/modes/smalltalk.handler.js';
import { metaHandler } from '@/core/modes/meta.handler.js';
import { trackProgressHandler } from '@/core/modes/track-progress.handler.js'; // MVP v4
import { logger } from '@/core/logger.js';
import { multiIntentClassifier, responseOrchestrator } from '@/core/orchestrator/index.js'; // MVP v3
import { pipelineDomainService } from './pipeline-domain.service.js';
import { pipelineCoreService } from './pipeline-core.service.js';
import { performanceTracker } from './performance-tracker.js';
import {
  PipelineError,
  MessageRole,
  SafetyLevel,
  ConversationMode,
  type PipelineContext,
  type PipelineResult,
  type Message,
  type ConversationState,
  type IModeHandler,
  type ArbiterDecision,
  type ClassificationContext,
  type SafetyResult,
  type IntentResult,
} from '@/types/index.js';

/**
 * Main Pipeline Class
 * ===================
 * Orchestrates the 6-stage pipeline execution flow
 * Coordinates between domain services and core services
 */
export class Pipeline {
  private modeHandlers: Map<ConversationMode, IModeHandler>;

  constructor() {
    // Register mode handlers
    this.modeHandlers = new Map<ConversationMode, IModeHandler>();
    this.modeHandlers.set(ConversationMode.CONSULT, consultHandler);
    this.modeHandlers.set(ConversationMode.SMALLTALK, smalltalkHandler);
    this.modeHandlers.set(ConversationMode.META, metaHandler);
    this.modeHandlers.set(ConversationMode.TRACK_PROGRESS, trackProgressHandler); // MVP v4
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN PIPELINE EXECUTION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute the full pipeline for a user message
   * Stages: Load → Decay → Classification → Parallel Enrichment → Handle → Save
   */
  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();

    // Start root performance span
    performanceTracker.reset(); // Clear any previous tracking
    const rootSpan = performanceTracker.startSpan('pipeline.execute');

    try {
      // Stage 1: Load conversation, messages, and state
      const loadSpan = performanceTracker.startSpan('stage.load', rootSpan);
      const { conversation, messages, state } = await pipelineCoreService.loadStage(context);
      performanceTracker.endSpan(loadSpan);

      // Stage 2: Apply decay to state
      const decaySpan = performanceTracker.startSpan('stage.decay', rootSpan);
      const decayedState = decayStage.applyDecay(state);
      performanceTracker.endSpan(decaySpan);

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
      const classificationSpan = performanceTracker.startSpan('stage.classification', rootSpan);
      const { decision, safetyResult, intentResult } = await this.classificationStage(
        context,
        messages,
        decayedState,
        classificationSpan
      );
      performanceTracker.endSpan(classificationSpan);

      // Stage 4: Parallel Enrichment (Global + Domain Classification + Extraction + Steering)
      const enrichmentSpan = performanceTracker.startSpan('stage.enrichment', rootSpan);
      const enrichedState = await this.parallelEnrichmentStage(
        context,
        messages,
        decayedState,
        { decision, safetyResult, intentResult },
        conversation.id
      );
      performanceTracker.endSpan(enrichmentSpan);

      // Stage 5: Handle message - check for multi-intent and orchestrate if needed
      const handlerSpan = performanceTracker.startSpan('stage.handler', rootSpan);

      // Check for multi-intent after enrichment
      const multiIntentSpan = performanceTracker.startSpan('multi_intent.classify', handlerSpan);
      const multiIntentResult = await multiIntentClassifier.classify(
        context.message,
        enrichedState
      );
      performanceTracker.endSpan(multiIntentSpan);

      let handlerResult: { response: string; stateUpdates?: any };

      // Use smart orchestration decision for better performance
      const shouldOrchestrate = multiIntentClassifier.shouldOrchestrate(multiIntentResult);

      if (shouldOrchestrate) {
        // Use orchestrator for multi-mode responses
        logger.info(
          {
            conversationId: conversation.id,
            primaryMode: multiIntentResult.primary.mode,
            secondaryModes: multiIntentResult.secondary.map((m) => m.mode),
            strategy: multiIntentResult.compositionStrategy,
          },
          'Handler stage: Multi-intent detected, using orchestrator'
        );

        const handlerContext = {
          conversationId: conversation.id,
          userId: context.userId,
          message: context.message,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          currentMode: decision.finalMode,
          state: enrichedState as any, // ConversationState to Record<string, unknown>
        };

        const orchestrateSpan = performanceTracker.startSpan('handler.orchestrate', handlerSpan);
        const orchestratedResponse = await responseOrchestrator.orchestrate(
          handlerContext,
          this.modeHandlers,
          multiIntentResult
        );
        performanceTracker.endSpan(orchestrateSpan);

        handlerResult = {
          response: orchestratedResponse.response,
          stateUpdates: orchestratedResponse.stateUpdates,
        };

        logger.info(
          {
            conversationId: conversation.id,
            modesUsed: orchestratedResponse.modesUsed,
            segments: orchestratedResponse.segments.length,
            compositionTime: orchestratedResponse.metadata.compositionTime,
          },
          'Handler stage: Orchestration complete'
        );
      } else {
        // Single intent - use traditional handler
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
          'Handler stage: Single intent, routing to mode handler'
        );

        // Build classification context for handler
        const classificationContext: ClassificationContext = {
          decision,
          safetySignals: safetyResult.signals || [],
          entities: intentResult.entities || [],
        };

        const singleHandlerSpan = performanceTracker.startSpan('handler.single', handlerSpan);
        handlerResult = await handler.handle({
          conversationId: conversation.id,
          userId: context.userId,
          message: context.message,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          currentMode: decision.finalMode,
          state: enrichedState as any, // Use fully enriched state
          classification: classificationContext,
        });
        performanceTracker.endSpan(singleHandlerSpan);
      }
      performanceTracker.endSpan(handlerSpan);

      // Stage 6: Save messages and updated state
      const saveSpan = performanceTracker.startSpan('stage.save', rootSpan);
      const messageId = await pipelineCoreService.saveStage(
        conversation.id,
        context.message,
        handlerResult.response,
        enrichedState,
        decision.finalMode
      );
      performanceTracker.endSpan(saveSpan);

      // End root span and get performance report
      performanceTracker.endSpan(rootSpan);
      const processingTime = Date.now() - startTime;

      // Log performance report if enabled
      if (performanceTracker.isEnabled()) {
        // Log to dedicated performance.log file and optionally to console
        performanceTracker.logReport();
      }

      return {
        response: handlerResult.response,
        processingTime,
        messageId,
        conversationId: conversation.id,
      };
    } catch (error) {
      performanceTracker.endSpan(rootSpan);
      throw new PipelineError('pipeline', error as Error, context);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLASSIFICATION STAGE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Classification Stage: Sequential Safety → Intent → Arbiter
   * Returns decision and classification results for enrichment
   */
  private async classificationStage(
    context: PipelineContext,
    messages: Message[],
    state: ConversationState,
    _parentSpan?: string
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

  // ═══════════════════════════════════════════════════════════════════════
  // PARALLEL ENRICHMENT STAGE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Parallel enrichment of state with context, extractions, and steering
   * Orchestrates 3 parallel groups while maintaining clear logging
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

    // ──────────────────────────────────────────────────────────────────────
    // PARALLEL GROUP 1: Global Context + Domain Classification
    // ──────────────────────────────────────────────────────────────────────
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
      pipelineDomainService.classifyDomainsAsync(stateWithMessages),
    ]);

    // Preserve existing global stage logging
    logger.info(
      {
        conversationId,
        contextElements: globalResult.state.contextElements.length,
        contextByType: pipelineDomainService.countContextByType(globalResult.state.contextElements),
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

    // ──────────────────────────────────────────────────────────────────────
    // PARALLEL GROUP 2: Domain Extractions
    // ──────────────────────────────────────────────────────────────────────
    const parallelGroup2Start = Date.now();

    // Run all domain extractions in parallel
    const extractionResults = await Promise.all(
      domainClassification.map((domain) =>
        pipelineDomainService.extractForSingleDomain(domain, stateForDomains, context.message)
      )
    );

    // Merge extraction results into state
    const stateWithExtractions = pipelineDomainService.mergeExtractionResults(
      stateForDomains,
      extractionResults
    );

    // Store extractions if configured
    await pipelineDomainService.storeExtractions(extractionResults, stateWithExtractions);

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

    // ──────────────────────────────────────────────────────────────────────
    // PARALLEL GROUP 3: Steering Strategies
    // ──────────────────────────────────────────────────────────────────────
    const parallelGroup3Start = Date.now();

    // Run all steering strategies in parallel for extracted domains
    const steeringResults = await Promise.all(
      extractionResults
        .filter((r) => r.extracted && r.data)
        .map((result) =>
          pipelineDomainService.generateSteeringForDomain(result.domainId, stateWithExtractions)
        )
    );

    // Merge steering hints
    const finalState = pipelineDomainService.mergeSteeringResults(
      stateWithExtractions,
      steeringResults
    );

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
}

export const pipeline = new Pipeline();
