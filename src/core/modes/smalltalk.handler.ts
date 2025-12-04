// Smalltalk Mode Handler - Casual conversation
import { BaseModeHandler } from './base-handler.js';
import { ConversationMode, type HandlerContext, type HandlerResult } from '@/types/index.js';
import { logger } from '@/core/logger.js';

export class SmalltalkModeHandler extends BaseModeHandler {
  readonly mode = ConversationMode.SMALLTALK;

  protected buildSystemPrompt(_context: HandlerContext): string {
    return `You are a friendly, conversational AI assistant in SMALLTALK mode.

Your role:
- Engage in casual, friendly conversation
- Be warm, personable, and relatable
- Keep responses natural and conversational
- Show genuine interest in what the user shares
- Keep the conversation light and enjoyable

Current conversation context:
- This is casual chitchat, not advice-seeking
- Be friendly and engaging
- Ask follow-up questions to keep conversation flowing
- Share appropriate enthusiasm and empathy

Tone guidelines:
- Friendly and approachable
- Brief and natural (like texting a friend)
- Positive and upbeat
- Genuine and authentic`;
  }

  /**
   * Generate a segment for the orchestrator
   * This method is called when multiple modes need to cooperate
   */
  async generateSegment(context: HandlerContext): Promise<any> {
    try {
      logger.debug(
        { mode: this.mode, userId: context.userId },
        'SmalltalkHandler: Generating segment for orchestrator'
      );

      // Get the handler result
      const result = await this.handle(context);

      // Critical: Check for empty response
      if (!result.response || result.response.trim() === '') {
        logger.warn('Smalltalk handler returned empty response');
        return null;
      }

      // Return segment in the expected format
      return {
        mode: ConversationMode.SMALLTALK,
        content: result.response,
        priority: 70, // Lower priority - usually comes first for greetings
        standalone: false, // Can be combined with other modes
        contentType: this.inferContentType(result.response),
        metadata: {
          confidence: 0.8, // Default confidence
          stateUpdates: result.stateUpdates,
        },
      };
    } catch (error) {
      logger.error({ error, mode: this.mode }, 'Failed to generate smalltalk segment');
      return null;
    }
  }

  /**
   * Infer the content type based on the response
   */
  private inferContentType(response: string): string {
    const lowerResponse = response.toLowerCase();

    if (
      lowerResponse.includes('hello') ||
      lowerResponse.includes('hi ') ||
      lowerResponse.includes('hey ') ||
      lowerResponse.includes('good morning') ||
      lowerResponse.includes('good afternoon') ||
      lowerResponse.includes('good evening')
    ) {
      return 'greeting';
    } else if (response.includes('?')) {
      return 'question';
    } else if (
      lowerResponse.includes('great') ||
      lowerResponse.includes('nice') ||
      lowerResponse.includes('cool') ||
      lowerResponse.includes('awesome')
    ) {
      return 'acknowledgment';
    } else {
      return 'information';
    }
  }
}

export const smalltalkHandler = new SmalltalkModeHandler();
