// Meta Mode Handler - Questions about the assistant itself
import { BaseModeHandler } from './base-handler.js';
import { ConversationMode, type HandlerContext, type HandlerResult } from '@/types/index.js';
import { logger } from '@/core/logger.js';

export class MetaModeHandler extends BaseModeHandler {
  readonly mode = ConversationMode.META;

  protected buildSystemPrompt(_context: HandlerContext): string {
    return `You are a helpful AI assistant in META mode, explaining your own capabilities.

Your role:
- Explain your features, capabilities, and limitations clearly
- Help users understand how to best interact with you
- Be transparent about what you can and cannot do
- Guide users on how to use different modes effectively

Current capabilities to mention:
- **CONSULT mode**: For advice, problem-solving, questions about health, work, relationships, etc.
- **SMALLTALK mode**: For casual conversation, greetings, and friendly chat
- **META mode**: For questions about the assistant itself (this mode!)

Key features:
- Conversation persistence across sessions
- Context awareness within conversations
- Mode-based responses tailored to user needs
- Empathetic and helpful assistance

Limitations to be honest about:
- You're an AI assistant, not a licensed professional
- Always recommend consulting experts for serious issues
- You don't have access to external information or real-time data
- Conversations are stored locally for context

Be helpful, clear, and encouraging about how users can best use the system!`;
  }

  /**
   * Generate a segment for the orchestrator
   * This method is called when multiple modes need to cooperate
   */
  async generateSegment(context: HandlerContext): Promise<any> {
    try {
      logger.debug(
        { mode: this.mode, userId: context.userId },
        'MetaHandler: Generating segment for orchestrator'
      );

      // Check if user is asking about how tracking/system works
      const message = context.message.toLowerCase();
      if (message.includes('how') && (message.includes('track') || message.includes('work'))) {
        const systemResponse = `I use a SMART goals approach - I'll track your progress with specific metrics and give you analytics to help you stay on track.`;

        return {
          mode: ConversationMode.META,
          content: systemResponse,
          priority: 75,
          standalone: false, // Can combine with track-progress info
          contentType: 'information',
          metadata: {
            confidence: 0.8,
          },
        };
      }

      // Get the handler result
      const result = await this.handle(context);

      // Critical: Check for empty response
      if (!result.response || result.response.trim() === '') {
        logger.warn('Meta handler returned empty response');
        return null;
      }

      // Return segment in the expected format
      return {
        mode: ConversationMode.META,
        content: result.response,
        priority: 75, // Medium priority - system information
        standalone: true, // Meta information often stands alone
        contentType: this.inferContentType(result.response),
        metadata: {
          confidence: 0.9, // High confidence for meta information
          stateUpdates: result.stateUpdates,
        },
      };
    } catch (error) {
      logger.error({ error, mode: this.mode }, 'Failed to generate meta segment');
      return null;
    }
  }

  /**
   * Infer the content type based on the response
   */
  private inferContentType(response: string): string {
    const lowerResponse = response.toLowerCase();

    if (response.includes('?')) {
      return 'question';
    } else if (
      lowerResponse.includes('can') ||
      lowerResponse.includes('able to') ||
      lowerResponse.includes('capability') ||
      lowerResponse.includes('feature')
    ) {
      return 'information';
    } else {
      return 'information';
    }
  }
}

export const metaHandler = new MetaModeHandler();
