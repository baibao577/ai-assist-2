/**
 * Multi-Intent Classifier
 *
 * MVP v3 - Response Orchestrator
 * Detects multiple intents in a single message and maps to appropriate modes
 * Uses dynamic mode discovery instead of hardcoded values
 */

import { ConversationMode } from '@/types/modes.js';
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';
import type { ConversationState } from '@/types/state.js';
import type { MultiIntentResult } from './types.js';

export class MultiIntentClassifier {
  private modeDescriptions: Map<string, string>;

  constructor() {
    // Initialize mode descriptions - can be moved to config
    this.modeDescriptions = new Map([
      ['SMALLTALK', 'Greetings, casual conversation, personal chat'],
      ['CONSULT', 'Advice seeking, problem-solving, questions needing expertise'],
      ['TRACK_PROGRESS', 'Goal setting, progress logging, checking goals, analytics'],
      ['META', 'Questions about the system, capabilities, how to use features'],
    ]);
  }

  /**
   * Get available conversation modes dynamically
   */
  private getAvailableModes(): Array<{ key: string; value: string; description: string }> {
    const modes: Array<{ key: string; value: string; description: string }> = [];

    // Dynamically get all modes from the enum
    for (const [key, value] of Object.entries(ConversationMode)) {
      modes.push({
        key,
        value: value as string,
        description: this.modeDescriptions.get(key) || 'General conversation mode',
      });
    }

    return modes;
  }

  /**
   * Build mode descriptions for prompt
   */
  private buildModeDescriptions(): string {
    const modes = this.getAvailableModes();
    return modes.map((mode) => `- ${mode.key}: ${mode.description}`).join('\n');
  }

  /**
   * Build dynamic mode mappings
   */
  private buildModeMappings(): Record<string, ConversationMode> {
    const mappings: Record<string, ConversationMode> = {};

    for (const [key, value] of Object.entries(ConversationMode)) {
      mappings[key] = value;
    }

    return mappings;
  }

  /**
   * Classify a message for potential multi-mode handling
   */
  async classify(message: string, state: ConversationState): Promise<MultiIntentResult> {
    try {
      const prompt = this.buildClassificationPrompt(message, state);

      const response = await llmService.generateFromMessages(
        [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.3, // Lower temperature for consistent classification
          maxTokens: 500,
        }
      );

      if (!response) {
        throw new Error('No response from LLM');
      }

      const result = JSON.parse(response);
      return this.mapToMultiIntentResult(result);
    } catch (error) {
      logger.error({ error }, 'Failed to classify multi-intent');

      // Fallback to single mode
      return {
        primary: {
          mode: ConversationMode.CONSULT,
          confidence: 0.5,
        },
        secondary: [],
        requiresOrchestration: false,
      };
    }
  }

  /**
   * Build the classification prompt with dynamic modes
   */
  private buildClassificationPrompt(message: string, state: ConversationState): string {
    const recentMessages = (state.messages || [])
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const modeDescriptions = this.buildModeDescriptions();
    const availableModes = this.getAvailableModes()
      .map((m) => m.key)
      .join('|');

    return `You are a multi-intent classifier for a conversational AI system.
Analyze the user's message to detect ALL intents present and map them to conversation modes.

Available modes and their purposes:
${modeDescriptions}

Recent conversation context:
${recentMessages}

Current message to analyze: "${message}"

Detect ALL intents present in the message. A message may contain multiple intents like:
- Greeting + asking for advice
- Checking progress + seeking recommendations
- Smalltalk + goal setting
- Any combination of the available modes

Return a JSON object with:
{
  "intents": [
    {
      "mode": "one of: ${availableModes}",
      "confidence": 0.0-1.0,
      "trigger": "specific part of message that triggered this",
      "essential": true/false
    }
  ],
  "requiresOrchestration": true/false,
  "compositionStrategy": "sequential|blended|prioritized",
  "reasoning": "brief explanation"
}

Rules:
- Set requiresOrchestration to true if 2+ distinct intents are present
- Sequential: intents should be addressed one after another
- Blended: intents are interrelated and should be woven together
- Prioritized: one intent is clearly more important
- Essential intents must be addressed, non-essential are optional
- Mode must be exactly one of the available mode keys listed above`;
  }

  /**
   * Map LLM response to MultiIntentResult
   */
  private mapToMultiIntentResult(llmResult: any): MultiIntentResult {
    const intents = llmResult.intents || [];

    // Sort by confidence
    const sortedIntents = intents.sort((a: any, b: any) => b.confidence - a.confidence);

    // Build dynamic mappings
    const modeMappings = this.buildModeMappings();

    const primary = sortedIntents[0];
    const secondary = sortedIntents.slice(1);

    return {
      primary: {
        mode: modeMappings[primary?.mode] || ConversationMode.CONSULT,
        confidence: primary?.confidence || 0.5,
      },
      secondary: secondary.map((intent: any) => ({
        mode: modeMappings[intent.mode] || ConversationMode.CONSULT,
        confidence: intent.confidence || 0.3,
      })),
      requiresOrchestration: llmResult.requiresOrchestration || false,
      compositionStrategy: llmResult.compositionStrategy || 'sequential',
    };
  }

  /**
   * Check if multiple significant intents are present
   */
  hasMultipleIntents(result: MultiIntentResult): boolean {
    // Multiple intents if we have secondary intents with reasonable confidence
    return result.secondary.some((intent) => intent.confidence > 0.5);
  }

  /**
   * Filter intents by minimum confidence threshold
   */
  filterByConfidence(result: MultiIntentResult, threshold = 0.4): MultiIntentResult {
    return {
      ...result,
      secondary: result.secondary.filter((intent) => intent.confidence >= threshold),
    };
  }

  /**
   * Check mode compatibility for co-occurrence using LLM
   */
  async areModesCompatibleLLM(mode1: ConversationMode, mode2: ConversationMode): Promise<boolean> {
    try {
      const prompt = `Determine if these two conversation modes can naturally appear together in a single response:
Mode 1: ${mode1}
Mode 2: ${mode2}

Consider:
- Would combining these modes make the response confusing?
- Do they serve conflicting purposes?
- Can they complement each other?

Return JSON: { "compatible": true/false, "reasoning": "brief explanation" }`;

      const response = await llmService.generateFromMessages(
        [{ role: 'system', content: prompt }],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.2,
          maxTokens: 100,
        }
      );

      if (response) {
        const result = JSON.parse(response);
        return result.compatible || false;
      }
    } catch (error) {
      logger.warn({ mode1, mode2, error }, 'Failed to check mode compatibility via LLM');
    }

    // Fallback to simple rules
    return this.areModesCompatible(mode1, mode2);
  }

  /**
   * Check mode compatibility for co-occurrence (fallback rules)
   */
  areModesCompatible(mode1: ConversationMode, mode2: ConversationMode): boolean {
    // Simple fallback rules - most modes are compatible
    // Only META mode typically stands alone
    if (mode1 === ConversationMode.META || mode2 === ConversationMode.META) {
      return false;
    }

    return true;
  }

  /**
   * Get recommended mode combination based on patterns
   */
  getRecommendedCombination(result: MultiIntentResult): ConversationMode[] {
    const modes: ConversationMode[] = [result.primary.mode];

    // Add compatible secondary modes
    for (const secondary of result.secondary) {
      if (modes.every((mode) => this.areModesCompatible(mode, secondary.mode))) {
        modes.push(secondary.mode);
      }

      // Limit to 3 modes maximum
      if (modes.length >= 3) break;
    }

    return modes;
  }

  /**
   * Register a new mode description
   */
  registerModeDescription(mode: string, description: string): void {
    this.modeDescriptions.set(mode, description);
  }
}

export const multiIntentClassifier = new MultiIntentClassifier();
