/**
 * Response Orchestrator
 *
 * MVP v3 - Mode Cooperation (Simplified)
 * Coordinates multiple mode handlers using LLM-based intelligent composition
 */

import { ConversationMode } from '@/types/modes.js';
import { logger } from '@/core/logger.js';
import type { HandlerContext, IModeHandler } from '@/types/index.js';
import type { OrchestratedResponse, MultiIntentResult } from './types.js';
import { llmService } from '@/core/llm.service.js';

export class ResponseOrchestrator {
  private readonly config = {
    maxModesPerResponse: 3,
    handlerTimeout: 15000, // Increased to 15s to allow for LLM response time
    parallelExecution: true,
  };

  /**
   * Orchestrate a multi-mode response with lazy initialization
   * Performance optimization: Generate primary first, only add secondary if valuable
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

      // Step 2: LAZY INITIALIZATION - Generate primary response first
      const primaryHandler = handlers.get(multiIntent.primary.mode);
      if (!primaryHandler) {
        throw new Error(`No handler for primary mode: ${multiIntent.primary.mode}`);
      }

      const primaryResult = await primaryHandler.handle(context);
      const primaryResponse = {
        mode: multiIntent.primary.mode,
        response: primaryResult.response,
        stateUpdates: primaryResult.stateUpdates,
      };

      // Step 3: Check if primary response already covers secondary intents
      // Skip secondary if primary is comprehensive (> 200 chars) or secondary is low confidence
      const secondaryModes = multiIntent.secondary
        .filter((s) => s.confidence > 0.6) // Only high-confidence secondary intents
        .slice(0, this.config.maxModesPerResponse - 1)
        .map((s) => s.mode);

      // If primary response is substantial or no high-confidence secondary, return primary only
      if (primaryResponse.response.length > 300 || secondaryModes.length === 0) {
        logger.debug(
          {
            primaryLength: primaryResponse.response.length,
            secondaryModes,
            reason: primaryResponse.response.length > 300 ? 'primary_comprehensive' : 'no_secondary',
          },
          'Lazy init: Using primary response only'
        );

        return {
          response: primaryResponse.response,
          segments: [],
          modesUsed: [multiIntent.primary.mode],
          primaryMode: multiIntent.primary.mode,
          metadata: {
            compositionTime: Date.now() - startTime,
            segmentCount: 1,
            transitionsAdded: false,
          },
          stateUpdates: primaryResult.stateUpdates,
        };
      }

      // Step 4: Generate secondary responses (only if needed)
      logger.debug({ secondaryModes }, 'Lazy init: Generating secondary responses');
      const secondaryResponses = await this.generateModeResponses(context, handlers, secondaryModes);

      // Step 5: Combine responses
      const allResponses = [primaryResponse, ...secondaryResponses].filter(
        (r) => r.response && r.response.trim().length > 0
      );

      // Step 6: Compose responses (smart composition)
      const composedResponse = await this.composeResponses(
        context,
        allResponses,
        multiIntent.primary.mode,
        multiIntent.compositionStrategy
      );

      return {
        response: composedResponse,
        segments: [],
        modesUsed: allResponses.map((r) => r.mode),
        primaryMode: multiIntent.primary.mode,
        metadata: {
          compositionTime: Date.now() - startTime,
          segmentCount: allResponses.length,
          transitionsAdded: false,
        },
        stateUpdates: this.mergeStateUpdates(allResponses),
      };
    } catch (error) {
      logger.error({ error }, 'Orchestration failed');
      // Fallback to primary mode
      return this.handleSingleMode(context, handlers, multiIntent.primary.mode);
    }
  }

  /**
   * Generate responses from selected mode handlers
   */
  private async generateModeResponses(
    context: HandlerContext,
    handlers: Map<ConversationMode, IModeHandler>,
    modes: ConversationMode[]
  ): Promise<
    Array<{ mode: ConversationMode; response: string; stateUpdates?: Record<string, unknown> }>
  > {
    if (this.config.parallelExecution) {
      // Generate responses in parallel with timeout
      const responsePromises = modes.map((mode) =>
        this.generateModeResponseWithTimeout(context, handlers.get(mode)!, mode)
      );

      const results = await Promise.allSettled(responsePromises);

      return results
        .filter((result) => result.status === 'fulfilled')
        .map(
          (result) =>
            (
              result as PromiseFulfilledResult<{
                mode: ConversationMode;
                response: string;
                stateUpdates?: Record<string, unknown>;
              }>
            ).value
        );
    } else {
      // Generate responses sequentially
      const responses = [];
      for (const mode of modes) {
        try {
          const response = await this.generateModeResponseWithTimeout(
            context,
            handlers.get(mode)!,
            mode
          );
          responses.push(response);
        } catch (error) {
          logger.warn({ mode, error }, 'Failed to generate response');
        }
      }
      return responses;
    }
  }

  /**
   * Generate response with timeout
   */
  private async generateModeResponseWithTimeout(
    context: HandlerContext,
    handler: IModeHandler,
    mode: ConversationMode
  ): Promise<{ mode: ConversationMode; response: string; stateUpdates?: Record<string, unknown> }> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Handler timeout')), this.config.handlerTimeout)
    );

    const responsePromise = handler.handle(context).then((result) => ({
      mode,
      response: result.response,
      stateUpdates: result.stateUpdates,
    }));

    return Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Smart composition: Use simple concatenation when possible, LLM only when needed
   * Performance optimization: Avoid LLM call for non-conflicting responses
   */
  private async composeResponses(
    context: HandlerContext,
    modeResponses: Array<{ mode: ConversationMode; response: string }>,
    primaryMode: ConversationMode,
    strategy?: 'sequential' | 'blended' | 'prioritized'
  ): Promise<string> {
    // If only one response, return it directly
    if (modeResponses.length === 1) {
      return modeResponses[0].response;
    }

    // Check if responses have potential conflicts
    const hasConflicts = this.detectConflicts(modeResponses);

    if (!hasConflicts && strategy !== 'blended') {
      // SIMPLE CONCATENATION: No LLM needed, just join responses naturally
      logger.debug({ strategy, hasConflicts }, 'Smart composition: Using simple concatenation');

      return modeResponses
        .map((r) => r.response.trim())
        .filter((r) => r.length > 0)
        .join('\n\n');
    }

    // LLM COMPOSITION: Only when there are conflicts or blending is required
    logger.debug({ strategy, hasConflicts }, 'Smart composition: Using LLM composition');
    return this.composeWithLLM(context, modeResponses, primaryMode);
  }

  /**
   * Detect if responses have conflicting content that requires LLM blending
   */
  private detectConflicts(
    responses: Array<{ mode: ConversationMode; response: string }>
  ): boolean {
    // Simple heuristic: Check for overlapping topics or contradictions
    // For now, check if multiple responses are substantial (might overlap)
    const substantialResponses = responses.filter((r) => r.response.length > 100);

    if (substantialResponses.length <= 1) {
      return false; // Only one substantial response, no conflict
    }

    // Check for potential topic overlap by looking at common words
    const responseWords = responses.map((r) =>
      new Set(
        r.response
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 4)
      )
    );

    // If responses share many words, there might be overlap that needs blending
    for (let i = 0; i < responseWords.length; i++) {
      for (let j = i + 1; j < responseWords.length; j++) {
        const intersection = [...responseWords[i]].filter((w) => responseWords[j].has(w));
        if (intersection.length > 5) {
          return true; // Significant word overlap, use LLM
        }
      }
    }

    return false; // No significant overlap, simple concatenation is fine
  }

  /**
   * Use LLM to intelligently compose multiple mode responses
   * Only called when conflicts are detected
   */
  private async composeWithLLM(
    context: HandlerContext,
    modeResponses: Array<{ mode: ConversationMode; response: string }>,
    primaryMode: ConversationMode
  ): Promise<string> {
    const compositionPrompt = `You are an intelligent response composer. Given multiple mode-specific responses to a user's message, create a single, cohesive response.

User's original message: "${context.message}"

Mode responses:
${modeResponses.map((r) => `[${r.mode}]:\n${r.response}`).join('\n\n---\n\n')}

Primary mode: ${primaryMode}

Instructions:
1. Combine the responses naturally without explicitly mentioning the different modes
2. Prioritize content from the primary mode (${primaryMode})
3. Ensure the response flows naturally and doesn't repeat information
4. Keep the combined response concise and focused (under 400 words)
5. If responses conflict, prefer the primary mode's perspective
6. Do NOT use phrases like "In terms of..." or "Regarding..." to separate topics
7. Create a unified, natural response as if it came from a single coherent assistant

Generate the combined response:`;

    try {
      const composedResponse = await llmService.generateFromMessages(
        [
          {
            role: 'system',
            content: compositionPrompt,
          },
        ],
        {
          temperature: 0.3,
          maxTokens: 500, // Reduced for performance
        }
      );

      return composedResponse || modeResponses[0].response;
    } catch (error) {
      logger.error({ error }, 'LLM composition failed, using primary response');
      // Fallback to primary mode response
      const primaryResponse = modeResponses.find((r) => r.mode === primaryMode);
      return primaryResponse?.response || modeResponses[0].response;
    }
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

    return {
      response: result.response,
      segments: [],
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
   * Merge state updates from all responses
   */
  private mergeStateUpdates(
    responses: Array<{ stateUpdates?: Record<string, unknown> }>
  ): Record<string, unknown> | undefined {
    const merged: Record<string, unknown> = {};
    let hasUpdates = false;

    for (const response of responses) {
      if (response.stateUpdates) {
        Object.assign(merged, response.stateUpdates);
        hasUpdates = true;
      }
    }

    return hasUpdates ? merged : undefined;
  }
}

export const responseOrchestrator = new ResponseOrchestrator();
