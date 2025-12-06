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
// Intent Configuration - Single Source of Truth
// ============================================================================

interface IntentConfig {
  mode: ConversationMode;
  type: IntentType;
}

/**
 * Single source of truth for intent → mode/type mapping.
 * - Keys: intent strings used in LLM prompt
 * - Values: mode and IntentType for parsing
 */
const INTENT_CONFIG: Record<string, IntentConfig> = {
  // SMALLTALK mode intents
  greeting: { mode: ConversationMode.SMALLTALK, type: IntentType.GREETING },
  farewell: { mode: ConversationMode.SMALLTALK, type: IntentType.FAREWELL },
  casual_chat: { mode: ConversationMode.SMALLTALK, type: IntentType.CASUAL_CHAT },
  // CONSULT mode intents
  seek_advice: { mode: ConversationMode.CONSULT, type: IntentType.SEEK_ADVICE },
  ask_question: { mode: ConversationMode.CONSULT, type: IntentType.ASK_QUESTION },
  share_problem: { mode: ConversationMode.CONSULT, type: IntentType.SHARE_PROBLEM },
  // META mode intents
  how_works: { mode: ConversationMode.META, type: IntentType.HOW_WORKS },
  about_system: { mode: ConversationMode.META, type: IntentType.ABOUT_SYSTEM },
  help: { mode: ConversationMode.META, type: IntentType.HELP },
  // TRACK_PROGRESS mode intents
  set_goal: { mode: ConversationMode.TRACK_PROGRESS, type: IntentType.SET_GOAL },
  view_goals: { mode: ConversationMode.TRACK_PROGRESS, type: IntentType.VIEW_GOALS },
  log_progress: { mode: ConversationMode.TRACK_PROGRESS, type: IntentType.LOG_PROGRESS },
  check_progress: { mode: ConversationMode.TRACK_PROGRESS, type: IntentType.CHECK_PROGRESS },
  update_goal: { mode: ConversationMode.TRACK_PROGRESS, type: IntentType.UPDATE_GOAL },
  // Fallback
  unclear: { mode: ConversationMode.SMALLTALK, type: IntentType.UNCLEAR },
};

/** Generated from INTENT_CONFIG keys - used in prompt */
const INTENT_LIST = Object.keys(INTENT_CONFIG).join('|');

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
      maxTokens: 300, // Reduced from 800 - compressed prompt needs fewer tokens
      temperature: 0.2,
    });
  }

  protected buildPrompt(input: UnifiedClassificationInput): string {
    // Get last 2 messages only (reduced from 5)
    const context =
      input.recentMessages.length > 0
        ? input.recentMessages
            .slice(-2)
            .map((m) => `${m.role}: ${m.content.substring(0, 100)}`)
            .join(' | ')
        : '';

    // Get domain IDs only (not descriptions)
    const domains = domainRegistry.getActiveDomains();
    const domainIds = domains.map((d) => d.id).join('|');

    // COMPRESSED PROMPT: ~300 tokens instead of ~850
    return `Classify message. Return JSON only.
Mode: ${input.currentMode}${context ? ` | Context: ${context}` : ''}
Message: "${input.message}"

safety: safe|concern|crisis (crisis=self-harm/emergency)
intent: ${INTENT_LIST}
mode: SMALLTALK(casual)|CONSULT(advice)|META(system)|TRACK_PROGRESS(goals)
domains: ${domainIds} (only if extractable data present)
entities: [{type:topic|emotion|goal|health_concern, value, confidence}]
multiIntent: true only if 2+ distinct modes needed

"safety":{"level":"safe","signals":[],"suggestedTone":"normal","requiresHumanEscalation":false},
"intent":{"primary":"seek_advice","secondary":"set_goal","suggestedMode":"TRACK_PROGRESS","entities":[{"type":"goal","value":"reading 20 books","confidence":0.9}],"reasoning":"asking about tracking AND wants to set goal"},
"relevantDomains":["goal"],
"multiIntent":{"isMultiIntent":true,"detectedModes":["CONSULT","TRACK_PROGRESS"],"hasConflictingIntents":false},
"confidence":0.9}`;
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

      // Multi-intent detection - use extracted modes to determine if multi-intent
      multiIntent: (() => {
        const detectedModes = this.extractDetectedModes(parsed);
        const isMultiIntent = detectedModes.length > 1 || (parsed.multiIntent?.isMultiIntent || false);
        return {
          isMultiIntent,
          detectedModes,
          hasConflictingIntents: parsed.multiIntent?.hasConflictingIntents || false,
        };
      })(),
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

  /**
   * Maps intent string to mode for multi-intent detection (uses INTENT_CONFIG)
   */
  private intentToMode(intent: string): ConversationMode | null {
    return INTENT_CONFIG[intent]?.mode || null;
  }

  /**
   * Extracts all detected modes from primary/secondary intents and explicit modes
   */
  private extractDetectedModes(parsed: UnifiedLLMResponse): ConversationMode[] {
    const modes: Set<ConversationMode> = new Set();

    // Add primary intent's mode (already ConversationMode from intentToMode)
    const primaryMode = this.intentToMode(parsed.intent.primary);
    if (primaryMode) modes.add(primaryMode);

    // Add secondary intent's mode (if different)
    const intentWithSecondary = parsed.intent as { secondary?: string };
    if (intentWithSecondary.secondary) {
      const secondaryMode = this.intentToMode(intentWithSecondary.secondary);
      if (secondaryMode && secondaryMode !== primaryMode) {
        modes.add(secondaryMode);
      }
    }

    // Add explicitly listed modes from multiIntent (need to map string → enum)
    if (parsed.multiIntent?.detectedModes) {
      parsed.multiIntent.detectedModes.forEach((m) => modes.add(this.mapMode(m)));
    }

    return [...modes];
  }

  private mapSafetyLevel(level: string): SafetyLevel {
    const levelMap: Record<string, SafetyLevel> = {
      safe: SafetyLevel.SAFE,
      concern: SafetyLevel.CONCERN,
      crisis: SafetyLevel.CRISIS,
    };
    return levelMap[level] || SafetyLevel.SAFE;
  }

  /**
   * Maps intent string to IntentType enum (uses INTENT_CONFIG)
   */
  private mapIntent(intent: string): IntentType {
    return INTENT_CONFIG[intent]?.type || IntentType.UNCLEAR;
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
