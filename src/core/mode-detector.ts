// Mode Detector - LLM-based conversation mode classification
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';
import { ConversationMode, type ModeDetectionResult, type Message } from '@/types/index.js';

export class ModeDetector {
  /**
   * Detect the conversation mode using LLM classification
   */
  async detectMode(
    userMessage: string,
    recentMessages: Message[] = [],
    currentMode?: ConversationMode
  ): Promise<ModeDetectionResult> {
    try {
      const prompt = this.buildDetectionPrompt(userMessage, recentMessages, currentMode);

      logger.debug({ userMessage, currentMode }, 'Detecting conversation mode');

      // Use LLM to classify the mode
      const response = await llmService.generateResponse([], prompt);

      // Parse the LLM response
      const result = this.parseDetectionResponse(response);

      logger.info(
        { mode: result.mode, confidence: result.confidence },
        'Mode detected'
      );

      return result;
    } catch (error) {
      logger.error({ error }, 'Mode detection failed, defaulting to SMALLTALK');

      // Default to SMALLTALK if detection fails
      return {
        mode: currentMode ?? ConversationMode.SMALLTALK,
        confidence: 0.5,
        reasoning: 'Detection failed, using default/current mode',
      };
    }
  }

  /**
   * Build the LLM prompt for mode detection
   */
  private buildDetectionPrompt(
    userMessage: string,
    recentMessages: Message[],
    currentMode?: ConversationMode
  ): string {
    const context =
      recentMessages.length > 0
        ? `\nRecent conversation:\n${recentMessages
            .slice(-3)
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join('\n')}\n`
        : '';

    const currentModeInfo = currentMode ? `\nCurrent mode: ${currentMode}` : '';

    return `You are a conversation mode classifier. Classify the following user message into ONE of these modes:

**CONSULT**: User is seeking advice, help with a problem, asking questions about health, relationships, work, or any topic where they need guidance or information.
Examples:
- "I've been feeling tired lately, what could be the cause?"
- "How do I handle a difficult coworker?"
- "What should I do about my anxiety?"
- "Can you help me understand this topic?"

**SMALLTALK**: Casual conversation, greetings, chitchat, general friendly interaction without seeking specific advice.
Examples:
- "Hello! How are you?"
- "What a nice day today"
- "I just had coffee"
- "How's your day going?"

**META**: Questions about the assistant itself, its capabilities, features, or how it works.
Examples:
- "What can you help me with?"
- "How do you work?"
- "What are your capabilities?"
- "Can you remember our conversations?"
${context}${currentModeInfo}

User message: "${userMessage}"

Respond with ONLY a JSON object in this exact format:
{
  "mode": "CONSULT" | "SMALLTALK" | "META",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;
  }

  /**
   * Parse the LLM response to extract mode detection result
   */
  private parseDetectionResponse(response: string): ModeDetectionResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        mode: string;
        confidence: number;
        reasoning?: string;
      };

      // Validate and normalize mode
      const mode = this.normalizeMode(parsed.mode);

      return {
        mode,
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.7)),
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      logger.warn({ response, error }, 'Failed to parse mode detection response');

      // Try to extract mode from response text as fallback
      const responseLower = response.toLowerCase();
      if (responseLower.includes('consult')) {
        return { mode: ConversationMode.CONSULT, confidence: 0.6 };
      }
      if (responseLower.includes('meta')) {
        return { mode: ConversationMode.META, confidence: 0.6 };
      }

      return { mode: ConversationMode.SMALLTALK, confidence: 0.6 };
    }
  }

  /**
   * Normalize mode string to ConversationMode enum
   */
  private normalizeMode(modeStr: string): ConversationMode {
    const normalized = modeStr.toUpperCase().trim();

    if (normalized === 'CONSULT') return ConversationMode.CONSULT;
    if (normalized === 'META') return ConversationMode.META;
    return ConversationMode.SMALLTALK;
  }
}

export const modeDetector = new ModeDetector();
