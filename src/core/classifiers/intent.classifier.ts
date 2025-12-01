// Intent Classifier - Identifies user intent and suggests conversation mode

import { BaseClassifier } from './base.classifier.js';
import { logger } from '@/core/logger.js';
import { ConversationMode } from '@/types/modes.js';
import {
  IntentType,
  EntityType,
  type IntentInput,
  type IntentResult,
  type ExtractedEntity,
} from '@/types/classifiers.js';

interface IntentLLMResponse {
  intent: string;
  suggestedMode: string;
  confidence: number;
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  reasoning: string;
}

export class IntentClassifier extends BaseClassifier<IntentInput, IntentResult> {
  readonly name = 'intent';

  async classify(input: IntentInput): Promise<IntentResult> {
    // Log input message for debugging
    logger.debug(
      {
        classifier: this.name,
        message: input.message,
        recentMessages: input.recentMessages.slice(-3), // Last 3 for brevity
        currentMode: input.currentMode,
      },
      'Intent classifier: Analyzing message'
    );

    // Use LLM for intent classification
    return this.callLLM(input, {
      maxTokens: 400,
      temperature: 0.3,
    });
  }

  protected buildPrompt(input: IntentInput): string {
    const messageHistory =
      input.recentMessages.length > 0
        ? input.recentMessages
            .slice(-5)
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n')
        : 'No previous messages';

    return `You are an intent classifier for a men's health wellness assistant.

Analyze the user's message to determine their intent and suggest the appropriate conversation mode.

**Conversation Context:**
${messageHistory}

**Current Mode:** ${input.currentMode}

**Current User Message:** "${input.message}"

**Available Intents:**

CONSULT MODE (advice and problem-solving):
- seek_advice: User asking for guidance or recommendations
- ask_question: User has a specific question to answer
- share_problem: User describing a problem or concern

SMALLTALK MODE (casual conversation):
- greeting: Hi, hello, how are you, etc.
- casual_chat: General chitchat, sharing life updates
- farewell: Goodbye, see you later, etc.

META MODE (questions about the assistant):
- how_works: How does this assistant work?
- about_system: What can you do? What are your features?
- help: I need help using this system

UNCLEAR:
- unclear: Cannot determine clear intent

**Available Modes:**
- CONSULT: For health advice, problems, questions
- SMALLTALK: For greetings and casual conversation
- META: For questions about the assistant itself

**Entity Extraction:**
Extract any relevant entities:
- topic: Main topics mentioned (e.g., "sleep", "exercise", "stress")
- emotion: Emotional states expressed (e.g., "anxious", "happy", "frustrated")
- goal: Goals mentioned (e.g., "lose weight", "improve sleep")
- health_concern: Specific health issues (e.g., "insomnia", "back pain")

**Output ONLY valid JSON in this exact format:**
{
  "intent": "intent_type",
  "suggestedMode": "CONSULT" | "SMALLTALK" | "META",
  "confidence": 0.0-1.0,
  "entities": [
    {
      "type": "topic" | "emotion" | "goal" | "health_concern",
      "value": "extracted value",
      "confidence": 0.0-1.0
    }
  ],
  "reasoning": "Brief explanation of why this intent/mode was chosen"
}`;
  }

  protected parseResponse(response: string): IntentResult {
    const parsed = this.parseJSON<IntentLLMResponse>(response);

    const result: IntentResult = {
      classifierName: 'intent',
      intent: this.mapIntent(parsed.intent),
      suggestedMode: this.mapMode(parsed.suggestedMode),
      confidence: parsed.confidence,
      entities: this.mapEntities(parsed.entities || []),
      reasoning: parsed.reasoning || 'No reasoning provided',
      timestamp: new Date(),
    };

    // Log classification result
    logger.info(
      {
        classifier: this.name,
        intent: result.intent,
        suggestedMode: result.suggestedMode,
        confidence: result.confidence,
        entities: result.entities,
        reasoning: result.reasoning,
      },
      'Intent classifier: Result'
    );

    return result;
  }

  protected getFallback(): IntentResult {
    logger.warn({ classifier: this.name }, 'Intent: Using fallback (default to SMALLTALK)');

    return {
      classifierName: 'intent',
      intent: IntentType.UNCLEAR,
      suggestedMode: ConversationMode.SMALLTALK,
      confidence: 0.0,
      entities: [],
      reasoning: 'Classification failed, defaulting to casual conversation',
      timestamp: new Date(),
    };
  }

  /**
   * Map string intent to enum
   */
  private mapIntent(intent: string): IntentType {
    const intentMap: Record<string, IntentType> = {
      seek_advice: IntentType.SEEK_ADVICE,
      ask_question: IntentType.ASK_QUESTION,
      share_problem: IntentType.SHARE_PROBLEM,
      greeting: IntentType.GREETING,
      casual_chat: IntentType.CASUAL_CHAT,
      farewell: IntentType.FAREWELL,
      how_works: IntentType.HOW_WORKS,
      about_system: IntentType.ABOUT_SYSTEM,
      help: IntentType.HELP,
      unclear: IntentType.UNCLEAR,
    };

    const mapped = intentMap[intent];
    if (!mapped) {
      logger.warn({ intent }, 'Unknown intent type, defaulting to UNCLEAR');
      return IntentType.UNCLEAR;
    }

    return mapped;
  }

  /**
   * Map string mode to enum
   */
  private mapMode(mode: string): ConversationMode {
    const modeMap: Record<string, ConversationMode> = {
      CONSULT: ConversationMode.CONSULT,
      SMALLTALK: ConversationMode.SMALLTALK,
      META: ConversationMode.META,
    };

    const mapped = modeMap[mode];
    if (!mapped) {
      logger.warn({ mode }, 'Unknown mode, defaulting to SMALLTALK');
      return ConversationMode.SMALLTALK;
    }

    return mapped;
  }

  /**
   * Map entity objects to typed entities
   */
  private mapEntities(
    entities: Array<{ type: string; value: string; confidence: number }>
  ): ExtractedEntity[] {
    return entities
      .map((entity) => ({
        type: this.mapEntityType(entity.type),
        value: entity.value,
        confidence: entity.confidence,
      }))
      .filter((entity) => entity.type !== null) as ExtractedEntity[];
  }

  /**
   * Map string entity type to enum
   */
  private mapEntityType(type: string): EntityType | null {
    const typeMap: Record<string, EntityType> = {
      topic: EntityType.TOPIC,
      emotion: EntityType.EMOTION,
      goal: EntityType.GOAL,
      health_concern: EntityType.HEALTH_CONCERN,
    };

    return typeMap[type] || null;
  }
}

export const intentClassifier = new IntentClassifier();
