/**
 * Unified Classifier - Combines all classifications into a single LLM call
 *
 * Performance Optimization: Reduces 4 separate LLM calls to 1
 * - Safety classification
 * - Intent classification
 * - Domain relevance classification
 * - Multi-intent detection
 *
 * Expected savings: 3-4 seconds per message
 */

import { BaseClassifier } from './base.classifier.js';
import { logger } from '@/core/logger.js';
import { domainRegistry } from '@/core/domains/registries/index.js';
import { ConversationMode } from '@/types/modes.js';
import {
  SafetyLevel,
  IntentType,
  EntityType,
  type SafetyResult,
  type IntentResult,
  type ExtractedEntity,
  type ClassificationResult,
} from '@/types/classifiers.js';
import type { DomainDefinition } from '@/core/domains/types.js';

// ============================================================================
// Types
// ============================================================================

export interface UnifiedClassificationInput {
  message: string;
  recentMessages: Array<{ role: string; content: string }>;
  currentMode: ConversationMode;
  currentSafetyLevel: SafetyLevel;
  conversationId: string;
}

export interface UnifiedClassificationResult extends ClassificationResult {
  // Safety
  safety: {
    level: SafetyLevel;
    signals: string[];
    suggestedTone: 'normal' | 'empathetic' | 'urgent';
    requiresHumanEscalation: boolean;
  };

  // Intent
  intent: {
    primary: IntentType;
    suggestedMode: ConversationMode;
    entities: ExtractedEntity[];
    reasoning: string;
  };

  // Domain relevance (which domains need extraction)
  relevantDomains: string[];

  // Multi-intent detection
  multiIntent: {
    isMultiIntent: boolean;
    detectedModes: ConversationMode[];
    hasConflictingIntents: boolean;
  };
}

interface UnifiedLLMResponse {
  safety: {
    level: 'safe' | 'concern' | 'crisis';
    signals: string[];
    suggestedTone: 'normal' | 'empathetic' | 'urgent';
    requiresHumanEscalation: boolean;
  };
  intent: {
    primary: string;
    suggestedMode: string;
    entities: Array<{ type: string; value: string; confidence: number }>;
    reasoning: string;
  };
  relevantDomains: string[];
  multiIntent: {
    isMultiIntent: boolean;
    detectedModes: string[];
    hasConflictingIntents: boolean;
  };
  confidence: number;
}

// ============================================================================
// Unified Classifier
// ============================================================================

export class UnifiedClassifier extends BaseClassifier<
  UnifiedClassificationInput,
  UnifiedClassificationResult
> {
  readonly name = 'unified';

  async classify(input: UnifiedClassificationInput): Promise<UnifiedClassificationResult> {
    logger.debug(
      {
        classifier: this.name,
        message: input.message.substring(0, 100),
        currentMode: input.currentMode,
      },
      'Unified classifier: Starting combined classification'
    );

    return this.callLLM(input, {
      maxTokens: 800,
      temperature: 0.2,
    });
  }

  protected buildPrompt(input: UnifiedClassificationInput): string {
    const messageHistory =
      input.recentMessages.length > 0
        ? input.recentMessages
            .slice(-5)
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n')
        : 'No previous messages';

    // Get available domains dynamically
    const domains = domainRegistry.getActiveDomains();
    const domainDescriptions = domains
      .map((d) => `- ${d.id}: ${d.description || d.name}`)
      .join('\n');

    return `You are a unified classifier for a men's health wellness assistant. Analyze the message for safety, intent, domain relevance, and multi-intent detection in a single pass.

**Conversation Context:**
${messageHistory}

**Current Mode:** ${input.currentMode}
**Current Safety Level:** ${input.currentSafetyLevel}

**Current User Message:** "${input.message}"

---

## TASK 1: SAFETY CLASSIFICATION
Detect crisis situations and safety concerns.

Safety Levels:
- safe: Normal conversation, no concerns
- concern: Mild emotional distress, needs empathetic response
- crisis: Severe distress, self-harm indicators, requires crisis resources

---

## TASK 2: INTENT CLASSIFICATION
Identify the primary user intent.

**Available Intents:**

CONSULT MODE (advice and problem-solving):
- seek_advice: User asking for guidance or recommendations
- ask_question: User has a specific question
- share_problem: User describing a problem or concern

SMALLTALK MODE (casual conversation):
- greeting: Hi, hello, how are you
- casual_chat: General chitchat
- farewell: Goodbye, see you later

META MODE (questions about the assistant):
- how_works: How does this assistant work?
- about_system: What can you do?
- help: I need help using this

TRACK_PROGRESS MODE (goal setting and tracking):
- set_goal: User wants to set a new goal
- view_goals: User wants to see their goals
- log_progress: User logging progress on a goal
- check_progress: User wants analytics
- update_goal: User wants to modify a goal

UNCLEAR:
- unclear: Cannot determine clear intent

**Entity Types to Extract:**
- topic: Main topics (sleep, exercise, stress)
- emotion: Emotional states (anxious, happy, frustrated)
- goal: Goals mentioned (lose weight, improve sleep)
- health_concern: Health issues (insomnia, back pain)

---

## TASK 3: DOMAIN RELEVANCE
Identify which domains need data extraction.

**Available Domains:**
${domainDescriptions}

Only include domains where the message contains relevant information to extract.

---

## TASK 4: MULTI-INTENT DETECTION
Determine if the message contains multiple distinct intents.

Examples:
- "Hi, I want to set a goal" → Multi-intent: SMALLTALK + TRACK_PROGRESS
- "How can I improve my sleep?" → Single intent: CONSULT
- "What are my goals? Also, what can you help with?" → Multi-intent: TRACK_PROGRESS + META

Conflicting intents are when intents require different response styles (e.g., casual vs serious).

---

**Output ONLY valid JSON:**
{
  "safety": {
    "level": "safe" | "concern" | "crisis",
    "signals": ["detected signals if any"],
    "suggestedTone": "normal" | "empathetic" | "urgent",
    "requiresHumanEscalation": false
  },
  "intent": {
    "primary": "intent_type",
    "suggestedMode": "CONSULT" | "SMALLTALK" | "META" | "TRACK_PROGRESS",
    "entities": [
      {"type": "topic|emotion|goal|health_concern", "value": "extracted value", "confidence": 0.0-1.0}
    ],
    "reasoning": "Brief explanation"
  },
  "relevantDomains": ["domain_ids that need extraction"],
  "multiIntent": {
    "isMultiIntent": false,
    "detectedModes": ["modes detected"],
    "hasConflictingIntents": false
  },
  "confidence": 0.0-1.0
}`;
  }

  protected parseResponse(response: string): UnifiedClassificationResult {
    const parsed = this.parseJSON<UnifiedLLMResponse>(response);

    const result: UnifiedClassificationResult = {
      classifierName: 'unified',
      confidence: parsed.confidence || 0.8,
      timestamp: new Date(),

      safety: {
        level: this.mapSafetyLevel(parsed.safety.level),
        signals: parsed.safety.signals || [],
        suggestedTone: parsed.safety.suggestedTone || 'normal',
        requiresHumanEscalation: parsed.safety.requiresHumanEscalation || false,
      },

      intent: {
        primary: this.mapIntent(parsed.intent.primary),
        suggestedMode: this.mapMode(parsed.intent.suggestedMode),
        entities: this.mapEntities(parsed.intent.entities || []),
        reasoning: parsed.intent.reasoning || 'No reasoning provided',
      },

      relevantDomains: this.validateDomains(parsed.relevantDomains || []),

      multiIntent: {
        isMultiIntent: parsed.multiIntent?.isMultiIntent || false,
        detectedModes: (parsed.multiIntent?.detectedModes || []).map((m) => this.mapMode(m)),
        hasConflictingIntents: parsed.multiIntent?.hasConflictingIntents || false,
      },
    };

    logger.info(
      {
        classifier: this.name,
        safetyLevel: result.safety.level,
        intent: result.intent.primary,
        suggestedMode: result.intent.suggestedMode,
        relevantDomains: result.relevantDomains,
        isMultiIntent: result.multiIntent.isMultiIntent,
        confidence: result.confidence,
      },
      'Unified classifier: Classification complete'
    );

    return result;
  }

  protected getFallback(): UnifiedClassificationResult {
    logger.warn({ classifier: this.name }, 'Unified classifier: Using fallback');

    return {
      classifierName: 'unified',
      confidence: 0.0,
      timestamp: new Date(),

      safety: {
        level: SafetyLevel.SAFE,
        signals: [],
        suggestedTone: 'normal',
        requiresHumanEscalation: false,
      },

      intent: {
        primary: IntentType.UNCLEAR,
        suggestedMode: ConversationMode.SMALLTALK,
        entities: [],
        reasoning: 'Classification failed, defaulting to casual conversation',
      },

      relevantDomains: [],

      multiIntent: {
        isMultiIntent: false,
        detectedModes: [ConversationMode.SMALLTALK],
        hasConflictingIntents: false,
      },
    };
  }

  // ============================================================================
  // Conversion to Legacy Types (for backward compatibility)
  // ============================================================================

  /**
   * Convert unified result to SafetyResult for backward compatibility
   */
  toSafetyResult(result: UnifiedClassificationResult): SafetyResult {
    return {
      classifierName: 'safety',
      level: result.safety.level,
      confidence: result.confidence,
      signals: result.safety.signals,
      suggestedTone: result.safety.suggestedTone,
      requiresHumanEscalation: result.safety.requiresHumanEscalation,
      timestamp: result.timestamp,
    };
  }

  /**
   * Convert unified result to IntentResult for backward compatibility
   */
  toIntentResult(result: UnifiedClassificationResult): IntentResult {
    return {
      classifierName: 'intent',
      intent: result.intent.primary,
      suggestedMode: result.intent.suggestedMode,
      confidence: result.confidence,
      entities: result.intent.entities,
      reasoning: result.intent.reasoning,
      timestamp: result.timestamp,
    };
  }

  /**
   * Convert unified result to domain definitions for backward compatibility
   */
  toDomainDefinitions(result: UnifiedClassificationResult): DomainDefinition[] {
    const allDomains = domainRegistry.getActiveDomains();
    return allDomains.filter((d) => result.relevantDomains.includes(d.id));
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapSafetyLevel(level: string): SafetyLevel {
    const levelMap: Record<string, SafetyLevel> = {
      safe: SafetyLevel.SAFE,
      concern: SafetyLevel.CONCERN,
      crisis: SafetyLevel.CRISIS,
    };
    return levelMap[level] || SafetyLevel.SAFE;
  }

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
      set_goal: IntentType.SET_GOAL,
      view_goals: IntentType.VIEW_GOALS,
      log_progress: IntentType.LOG_PROGRESS,
      check_progress: IntentType.CHECK_PROGRESS,
      update_goal: IntentType.UPDATE_GOAL,
      unclear: IntentType.UNCLEAR,
    };
    return intentMap[intent] || IntentType.UNCLEAR;
  }

  private mapMode(mode: string): ConversationMode {
    const modeMap: Record<string, ConversationMode> = {
      CONSULT: ConversationMode.CONSULT,
      SMALLTALK: ConversationMode.SMALLTALK,
      META: ConversationMode.META,
      TRACK_PROGRESS: ConversationMode.TRACK_PROGRESS,
    };
    return modeMap[mode] || ConversationMode.SMALLTALK;
  }

  private mapEntities(
    entities: Array<{ type: string; value: string; confidence: number }>
  ): ExtractedEntity[] {
    const typeMap: Record<string, EntityType> = {
      topic: EntityType.TOPIC,
      emotion: EntityType.EMOTION,
      goal: EntityType.GOAL,
      health_concern: EntityType.HEALTH_CONCERN,
    };

    return entities
      .filter((e) => typeMap[e.type])
      .map((e) => ({
        type: typeMap[e.type],
        value: e.value,
        confidence: e.confidence,
      }));
  }

  private validateDomains(domainIds: string[]): string[] {
    const activeDomains = domainRegistry.getActiveDomains().map((d) => d.id);
    return domainIds.filter((id) => activeDomains.includes(id));
  }
}

export const unifiedClassifier = new UnifiedClassifier();
