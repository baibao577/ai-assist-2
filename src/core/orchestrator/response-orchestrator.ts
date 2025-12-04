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

      // Step 2: Get selected modes (limit to top modes)
      const allIntents = [multiIntent.primary, ...multiIntent.secondary];
      const selectedModes = allIntents
        .slice(0, this.config.maxModesPerResponse)
        .map((intent) => intent.mode);

      // Step 3: Generate responses from each mode handler in parallel
      const modeResponses = await this.generateModeResponses(context, handlers, selectedModes);

      // Step 4: Filter out empty responses
      const validResponses = modeResponses.filter(
        (r) => r.response && r.response.trim().length > 0
      );

      if (validResponses.length === 0) {
        logger.warn({ selectedModes }, 'No valid responses generated, using fallback');
        return this.handleSingleMode(context, handlers, multiIntent.primary.mode);
      }

      // Step 5: Use LLM to intelligently compose the responses
      const composedResponse = await this.composeWithLLM(
        context,
        validResponses,
        multiIntent.primary.mode
      );

      // Step 6: Build orchestrated response
      return {
        response: composedResponse,
        segments: [], // Simplified - no longer using segments
        modesUsed: validResponses.map((r) => r.mode),
        primaryMode: multiIntent.primary.mode,
        metadata: {
          compositionTime: Date.now() - startTime,
          segmentCount: validResponses.length,
          transitionsAdded: false,
        },
        stateUpdates: this.mergeStateUpdates(validResponses),
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
   * Use LLM to intelligently compose multiple mode responses
   */
  private async composeWithLLM(
    context: HandlerContext,
    modeResponses: Array<{ mode: ConversationMode; response: string }>,
    primaryMode: ConversationMode
  ): Promise<string> {
    // If only one response, return it directly
    if (modeResponses.length === 1) {
      return modeResponses[0].response;
    }

    const compositionPrompt = `You are an intelligent response composer. Given multiple mode-specific responses to a user's message, create a single, cohesive response.

User's original message: "${context.message}"

Mode responses:
${modeResponses.map((r) => `[${r.mode}]:\n${r.response}`).join('\n\n---\n\n')}

Primary mode: ${primaryMode}

Instructions:
1. Combine the responses naturally without explicitly mentioning the different modes
2. Prioritize content from the primary mode (${primaryMode})
3. Ensure the response flows naturally and doesn't repeat information
4. Keep the combined response concise and focused
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
          maxTokens: 800,
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
