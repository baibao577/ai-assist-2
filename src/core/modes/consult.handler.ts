// Consult Mode Handler - Advice and problem-solving conversations
import { BaseModeHandler } from './base-handler.js';
import {
  ConversationMode,
  SafetyLevel,
  type HandlerContext,
  type HandlerResult,
} from '@/types/index.js';
import { buildCrisisResponse, TONE_GUIDELINES } from '@/core/classifiers/index.js';

export class ConsultModeHandler extends BaseModeHandler {
  readonly mode = ConversationMode.CONSULT;

  async handle(context: HandlerContext): Promise<HandlerResult> {
    // Check for crisis situation (MVP v3)
    if (context.classification?.decision.safetyContext.isCrisis) {
      return this.handleCrisis(context);
    }

    // Normal consult mode handling
    return super.handle(context);
  }

  /**
   * Handle crisis situations with immediate resources
   */
  private async handleCrisis(context: HandlerContext): Promise<HandlerResult> {
    const crisisResponse = buildCrisisResponse(
      SafetyLevel.CRISIS,
      context.classification?.decision.safetyContext.crisisResources
    );

    return {
      response: crisisResponse,
    };
  }

  protected buildSystemPrompt(context: HandlerContext): string {
    const safetyLevel = context.classification?.decision.safetyContext.level || SafetyLevel.SAFE;
    const toneGuideline = TONE_GUIDELINES[safetyLevel];

    let basePrompt = `You are a helpful, empathetic AI assistant in CONSULT mode.

Your role:
- Provide thoughtful, well-reasoned advice and information
- Ask clarifying questions when needed
- Be supportive and understanding
- Focus on helping the user solve their problem or answer their question
- Maintain a professional yet warm tone

Current conversation context:
- User is seeking advice or help with a specific concern
- Listen carefully and provide actionable guidance
- Be honest about limitations - suggest professional help when appropriate

Important guidelines:
- For health concerns: Provide general information but always recommend consulting healthcare professionals
- For serious issues: Show empathy and suggest appropriate resources
- Be clear, structured, and helpful in your responses`;

    // Add safety-specific tone adjustments
    if (safetyLevel === SafetyLevel.CONCERN) {
      basePrompt += `\n\n**IMPORTANT TONE ADJUSTMENT:**
${toneGuideline.instructions}
- Emphasize: ${toneGuideline.emphasize.join(', ')}
- Avoid: ${toneGuideline.avoid.join(', ')}
- The user may be going through a difficult time - be extra gentle and validating`;
    }

    return basePrompt;
  }
}

export const consultHandler = new ConsultModeHandler();
