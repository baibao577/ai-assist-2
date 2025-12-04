/**
 * Response Orchestrator
 *
 * MVP v3 - Mode Cooperation
 * Coordinates multiple mode handlers to generate unified multi-mode responses
 */

import { ConversationMode } from '@/types/modes.js';
import { logger } from '@/core/logger.js';
import type { HandlerContext, HandlerResult, IModeHandler } from '@/types/index.js';
import type {
  ModeSegment,
  OrchestratedResponse,
  OrchestratorConfig,
  MultiIntentResult,
  ModeCooperationRules,
} from './types.js';
import { multiIntentClassifier } from './multi-intent.classifier.js';
import { ResponseComposer } from './response-composer.js';

export class ResponseOrchestrator {
  private composer: ResponseComposer;
  private config: OrchestratorConfig;
  private cooperationRules: ModeCooperationRules;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      maxModesPerResponse: 3,
      enableTransitions: true,
      enableDeduplication: true,
      enablePriorityOrdering: true,
      handlerTimeout: 5000,
      parallelExecution: true,
      ...config,
    };

    this.composer = new ResponseComposer({
      enableTransitions: this.config.enableTransitions,
      enableDeduplication: this.config.enableDeduplication,
    });

    this.cooperationRules = {
      incompatiblePairs: [[ConversationMode.META, ConversationMode.SMALLTALK]],
      preferredOrder: [
        ConversationMode.SMALLTALK,
        ConversationMode.TRACK_PROGRESS,
        ConversationMode.CONSULT,
        ConversationMode.META,
      ],
      maxSegmentsPerMode: new Map([
        [ConversationMode.SMALLTALK, 1],
        [ConversationMode.CONSULT, 2],
        [ConversationMode.TRACK_PROGRESS, 2],
        [ConversationMode.META, 1],
      ]),
      standaloneModes: [ConversationMode.META],
    };
  }

  /**
   * Orchestrate a multi-mode response
   */
  async orchestrate(
    context: HandlerContext,
    handlers: Map<ConversationMode, IModeHandler>,
    multiIntent: MultiIntentResult
  ): Promise<OrchestratedResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Determine if orchestration is needed
      if (!multiIntent.requiresOrchestration) {
        // Single mode - use primary handler directly
        return this.handleSingleMode(context, handlers, multiIntent.primary.mode);
      }

      // Step 2: Get recommended mode combination
      const selectedModes = this.selectModes(multiIntent);

      // Step 3: Generate segments from selected modes
      const segments = await this.generateSegments(context, handlers, selectedModes);

      // Critical: Handle empty segments
      if (segments.length === 0) {
        logger.warn({ selectedModes }, 'No segments generated, using fallback');

        // Fallback to primary mode handler
        const primaryHandler = handlers.get(multiIntent.primary.mode);
        if (primaryHandler) {
          try {
            const result = await primaryHandler.handle(context);
            return {
              response: result.response || "I'm here to help. Could you tell me more?",
              segments: [],
              modesUsed: [multiIntent.primary.mode],
              primaryMode: multiIntent.primary.mode,
              metadata: {
                compositionTime: Date.now() - startTime,
                segmentCount: 0,
                transitionsAdded: false,
                warnings: ['No segments generated, used fallback'],
              },
              stateUpdates: result.stateUpdates,
            };
          } catch (fallbackError) {
            logger.error({ fallbackError }, 'Fallback handler also failed');
          }
        }

        // Ultimate fallback
        return {
          response: "I understand what you're asking. Let me help you with that.",
          segments: [],
          modesUsed: [multiIntent.primary.mode],
          primaryMode: multiIntent.primary.mode,
          metadata: {
            compositionTime: Date.now() - startTime,
            segmentCount: 0,
            transitionsAdded: false,
            warnings: ['No segments generated, used default fallback'],
          },
          stateUpdates: {},
        };
      }

      // Step 4: Compose final response (now async)
      const composedResponse = await this.composer.compose(segments);

      // Step 5: Build orchestrated response
      return {
        response: composedResponse,
        segments,
        modesUsed: selectedModes,
        primaryMode: multiIntent.primary.mode,
        metadata: {
          compositionTime: Date.now() - startTime,
          segmentCount: segments.length,
          transitionsAdded: this.config.enableTransitions,
          warnings: this.validateComposition(segments),
        },
        stateUpdates: this.mergeStateUpdates(segments),
      };
    } catch (error) {
      logger.error({ error }, 'Orchestration failed');

      // Fallback to primary mode
      return this.handleSingleMode(context, handlers, ConversationMode.CONSULT);
    }
  }

  /**
   * Select modes based on rules and intent classification
   */
  private selectModes(multiIntent: MultiIntentResult): ConversationMode[] {
    let modes = multiIntentClassifier.getRecommendedCombination(multiIntent);

    // Apply cooperation rules
    modes = this.applyCooperationRules(modes);

    // Limit to max modes
    modes = modes.slice(0, this.config.maxModesPerResponse);

    return modes;
  }

  /**
   * Apply cooperation rules to mode selection
   */
  private applyCooperationRules(modes: ConversationMode[]): ConversationMode[] {
    const filtered: ConversationMode[] = [];

    for (const mode of modes) {
      // Check if mode is compatible with already selected modes
      const isCompatible = filtered.every(
        (existingMode) =>
          !this.cooperationRules.incompatiblePairs.some(
            ([a, b]) => (mode === a && existingMode === b) || (mode === b && existingMode === a)
          )
      );

      if (isCompatible) {
        filtered.push(mode);
      }
    }

    // Sort by preferred order
    return filtered.sort((a, b) => {
      const aIndex = this.cooperationRules.preferredOrder.indexOf(a);
      const bIndex = this.cooperationRules.preferredOrder.indexOf(b);
      return aIndex - bIndex;
    });
  }

  /**
   * Generate segments from selected mode handlers
   */
  private async generateSegments(
    context: HandlerContext,
    handlers: Map<ConversationMode, IModeHandler>,
    modes: ConversationMode[]
  ): Promise<ModeSegment[]> {
    if (this.config.parallelExecution) {
      // Generate segments in parallel
      const segmentPromises = modes.map((mode) =>
        this.generateSegmentWithTimeout(context, handlers.get(mode)!, mode)
      );

      const results = await Promise.allSettled(segmentPromises);

      return results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<ModeSegment>).value)
        .filter((segment) => segment.content.trim().length > 0);
    } else {
      // Generate segments sequentially
      const segments: ModeSegment[] = [];

      for (const mode of modes) {
        try {
          const segment = await this.generateSegmentWithTimeout(context, handlers.get(mode)!, mode);
          if (segment.content.trim().length > 0) {
            segments.push(segment);
          }
        } catch (error) {
          logger.warn({ mode, error }, 'Failed to generate segment');
        }
      }

      return segments;
    }
  }

  /**
   * Generate segment with timeout
   */
  private async generateSegmentWithTimeout(
    context: HandlerContext,
    handler: IModeHandler,
    mode: ConversationMode
  ): Promise<ModeSegment> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Handler timeout')), this.config.handlerTimeout)
    );

    const segmentPromise = this.generateSegment(context, handler, mode);

    return Promise.race([segmentPromise, timeoutPromise]);
  }

  /**
   * Generate a segment from a mode handler
   */
  private async generateSegment(
    context: HandlerContext,
    handler: IModeHandler,
    mode: ConversationMode
  ): Promise<ModeSegment> {
    // Check if handler supports segment generation
    if ('generateSegment' in handler && typeof handler.generateSegment === 'function') {
      return (handler as any).generateSegment(context);
    }

    // Fallback: Use regular handle method and convert to segment
    const result = await handler.handle(context);

    return this.convertToSegment(mode, result);
  }

  /**
   * Convert handler result to segment
   */
  private convertToSegment(mode: ConversationMode, result: HandlerResult): ModeSegment {
    // Dynamically determine content type based on mode
    const contentType = this.inferContentType(mode, result.response);

    return {
      mode,
      content: result.response,
      priority: this.getModePriority(mode),
      standalone: true,
      contentType,
      metadata: {
        stateUpdates: result.stateUpdates,
      },
    };
  }

  /**
   * Infer content type from mode and response content
   */
  private inferContentType(mode: ConversationMode, response: string): ModeSegment['contentType'] {
    // Simple heuristics - can be enhanced with LLM
    const lowerResponse = response.toLowerCase();

    // Check for greetings
    if (
      lowerResponse.includes('hello') ||
      lowerResponse.includes('hi ') ||
      lowerResponse.includes('good morning') ||
      lowerResponse.includes('good evening')
    ) {
      return 'greeting';
    }

    // Check for questions
    if (response.trim().endsWith('?')) {
      return 'question';
    }

    // Check for analytics/data
    if (
      lowerResponse.includes('progress') ||
      lowerResponse.includes('goal') ||
      lowerResponse.includes('metric') ||
      lowerResponse.includes('%')
    ) {
      return 'analytics';
    }

    // Check for advice
    if (
      lowerResponse.includes('should') ||
      lowerResponse.includes('recommend') ||
      lowerResponse.includes('suggest') ||
      lowerResponse.includes('try')
    ) {
      return 'advice';
    }

    // Default based on mode
    const modeDefaults: Partial<Record<ConversationMode, ModeSegment['contentType']>> = {
      [ConversationMode.SMALLTALK]: 'greeting',
      [ConversationMode.CONSULT]: 'advice',
      [ConversationMode.TRACK_PROGRESS]: 'analytics',
      [ConversationMode.META]: 'information',
    };

    return modeDefaults[mode] || 'information';
  }

  /**
   * Get default priority for a mode (dynamically)
   */
  private getModePriority(mode: ConversationMode): number {
    // Dynamic priority based on mode enum order
    const modeKeys = Object.keys(ConversationMode);
    const modeIndex = modeKeys.findIndex(
      (key) => ConversationMode[key as keyof typeof ConversationMode] === mode
    );

    // Higher priority for modes that appear earlier
    // Scale from 100 (first) to 50 (last)
    const maxPriority = 100;
    const minPriority = 50;
    const step = (maxPriority - minPriority) / Math.max(modeKeys.length - 1, 1);

    return Math.round(maxPriority - modeIndex * step);
  }

  /**
   * Handle single mode response (no orchestration needed)
   */
  private async handleSingleMode(
    context: HandlerContext,
    handlers: Map<ConversationMode, IModeHandler>,
    mode: ConversationMode
  ): Promise<OrchestratedResponse> {
    const handler = handlers.get(mode);
    if (!handler) {
      throw new Error(`No handler for mode: ${mode}`);
    }

    const result = await handler.handle(context);
    const segment = this.convertToSegment(mode, result);

    return {
      response: result.response,
      segments: [segment],
      modesUsed: [mode],
      primaryMode: mode,
      metadata: {
        compositionTime: 0,
        segmentCount: 1,
        transitionsAdded: false,
      },
      stateUpdates: result.stateUpdates,
    };
  }

  /**
   * Merge state updates from all segments
   */
  private mergeStateUpdates(segments: ModeSegment[]): Record<string, any> {
    const merged: Record<string, any> = {};

    for (const segment of segments) {
      if (segment.metadata?.stateUpdates) {
        Object.assign(merged, segment.metadata.stateUpdates);
      }
    }

    return merged;
  }

  /**
   * Validate composition for potential issues
   */
  private validateComposition(segments: ModeSegment[]): string[] {
    const warnings: string[] = [];

    // Check for empty segments
    if (segments.some((s) => !s.content.trim())) {
      warnings.push('Empty segments detected');
    }

    // Check for duplicate modes
    const modes = segments.map((s) => s.mode);
    const uniqueModes = new Set(modes);
    if (modes.length !== uniqueModes.size) {
      warnings.push('Duplicate mode segments');
    }

    // Check segment count limits
    for (const [mode, maxSegments] of this.cooperationRules.maxSegmentsPerMode) {
      const count = segments.filter((s) => s.mode === mode).length;
      if (count > maxSegments) {
        warnings.push(`Mode ${mode} exceeds segment limit`);
      }
    }

    return warnings;
  }
}

export const responseOrchestrator = new ResponseOrchestrator();
