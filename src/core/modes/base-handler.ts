// Base Mode Handler - Abstract class for all mode handlers
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';
import type {
  IModeHandler,
  ConversationMode,
  HandlerContext,
  HandlerResult,
} from '@/types/index.js';

export abstract class BaseModeHandler implements IModeHandler {
  abstract readonly mode: ConversationMode;

  /**
   * Handle the message in this mode
   */
  async handle(context: HandlerContext): Promise<HandlerResult> {
    try {
      logger.debug({ mode: this.mode, conversationId: context.conversationId }, 'Handling message');

      // Build system prompt for this mode
      const systemPrompt = this.buildSystemPrompt(context);

      // Generate response using LLM
      const response = await this.generateResponse(systemPrompt, context);

      // Prepare result
      const result: HandlerResult = {
        response,
        stateUpdates: this.buildStateUpdates(context),
      };

      logger.debug({ mode: this.mode, responseLength: response.length }, 'Message handled');

      return result;
    } catch (error) {
      logger.error({ error, mode: this.mode }, 'Handler error');
      throw error;
    }
  }

  /**
   * Build mode-specific system prompt
   */
  protected abstract buildSystemPrompt(context: HandlerContext): string;

  /**
   * Build state updates based on the interaction
   */
  protected buildStateUpdates(_context: HandlerContext): Record<string, unknown> {
    // Default: no updates
    // Subclasses can override to add mode-specific state updates
    return {};
  }

  /**
   * Generate LLM response with mode-specific system prompt
   */
  protected async generateResponse(
    systemPrompt: string,
    context: HandlerContext
  ): Promise<string> {
    // Generate response (we'll need to update llmService to accept system messages)
    // For now, we'll prepend system prompt to the conversation
    const response = await llmService.generateResponse(
      context.messages as any,
      `${systemPrompt}\n\nUser: ${context.message}`
    );

    return response;
  }
}
