// Safety Classifier - Detects crisis situations and safety concerns

import { BaseClassifier } from './base.classifier.js';
import { logger } from '@/core/logger.js';
import {
  SafetyLevel,
  type SafetyInput,
  type SafetyResult,
  type CrisisResource,
} from '@/types/classifiers.js';

// Crisis keywords for immediate detection
const CRISIS_PATTERNS = {
  suicide: [
    'kill myself',
    'end it all',
    'not worth living',
    'better off dead',
    'want to die',
    'suicide',
    'suicidal',
  ],
  selfHarm: [
    'hurt myself',
    'harm myself',
    'cut myself',
    'cutting myself',
    'self harm',
    'self-harm',
  ],
  violence: [
    'hurt someone',
    'kill someone',
    'attack someone',
    'harm others',
    'violent thoughts',
  ],
  medical: [
    'chest pain',
    "can't breathe",
    'cannot breathe',
    'bleeding heavily',
    'overdose',
    'overdosed',
    'poisoned',
  ],
};

// Crisis resources
const CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: 'National Suicide Prevention Lifeline',
    phone: '988',
    available: '24/7',
    description: 'Free and confidential support for people in distress',
  },
  {
    name: 'Crisis Text Line',
    phone: 'Text HOME to 741741',
    available: '24/7',
    description: 'Free, 24/7 support for those in crisis via text',
  },
  {
    name: 'Emergency Services',
    phone: '911',
    available: '24/7',
    description: 'For immediate medical or safety emergencies',
  },
];

interface SafetyLLMResponse {
  level: 'safe' | 'concern' | 'crisis';
  confidence: number;
  signals: string[];
  suggestedTone: 'normal' | 'empathetic' | 'urgent' | null;
  requiresHumanEscalation: boolean;
}

export class SafetyClassifier extends BaseClassifier<SafetyInput, SafetyResult> {
  readonly name = 'safety';

  async classify(input: SafetyInput): Promise<SafetyResult> {
    // First check crisis keywords for immediate response
    const crisisSignals = this.checkCrisisKeywords(input.message);

    if (crisisSignals.length > 0) {
      logger.warn(
        {
          classifier: this.name,
          signals: crisisSignals,
          message: input.message.substring(0, 100),
        },
        'Safety: Crisis keywords detected'
      );

      return {
        classifierName: 'safety',
        level: SafetyLevel.CRISIS,
        confidence: 1.0,
        signals: crisisSignals,
        suggestedTone: 'urgent',
        requiresHumanEscalation: true,
        crisisResources: CRISIS_RESOURCES,
        timestamp: new Date(),
      };
    }

    // Use LLM for nuanced classification
    return this.callLLM(input, {
      maxTokens: 200,
      temperature: 0.2, // Low temperature for consistency
    });
  }

  protected buildPrompt(input: SafetyInput): string {
    const recentContext =
      input.recentUserMessages.length > 0
        ? `Recent messages: ${JSON.stringify(input.recentUserMessages)}`
        : 'No recent message history';

    return `You are a safety classifier for a men's health wellness assistant.

Analyze this message for safety concerns.

Context:
- ${recentContext}
- Current safety status: ${input.currentSafetyLevel}

Current message: "${input.message}"

Classify into ONE of these levels:

1. SAFE: No safety concerns. Normal conversation about health, fitness, life, etc.
2. CONCERN: Mild signals that need gentle handling. Examples:
   - Frustration, stress, feeling overwhelmed
   - Mild distress or disappointment
   - Vague references to struggle
   - Continue conversation but adjust tone to be more empathetic
3. CRISIS: Clear danger signals requiring immediate intervention. Examples:
   - Self-harm or suicide ideation
   - Violence toward self or others
   - Medical emergency
   - Requires crisis resources

Important guidelines:
- Be sensitive but not paranoid
- Metaphors like "this is killing me" (about stress) are usually NOT crisis
- Direct statements like "I want to end it all" or "I want to hurt myself" ARE crisis
- When in doubt between safe/concern, choose concern
- When in doubt between concern/crisis, choose crisis (be conservative)

Output ONLY valid JSON in this exact format:
{
  "level": "safe" | "concern" | "crisis",
  "confidence": 0.0-1.0,
  "signals": ["list", "of", "signals"],
  "suggestedTone": "normal" | "empathetic" | "urgent" | null,
  "requiresHumanEscalation": true | false
}`;
  }

  protected parseResponse(response: string): SafetyResult {
    const parsed = this.parseJSON<SafetyLLMResponse>(response);

    return {
      classifierName: 'safety',
      level: this.mapLevel(parsed.level),
      confidence: parsed.confidence,
      signals: parsed.signals || [],
      suggestedTone: parsed.suggestedTone || 'normal',
      requiresHumanEscalation: parsed.requiresHumanEscalation,
      crisisResources: parsed.level === 'crisis' ? CRISIS_RESOURCES : undefined,
      timestamp: new Date(),
    };
  }

  protected getFallback(): SafetyResult {
    // Conservative fallback - assume concern level to be safe
    logger.warn(
      { classifier: this.name },
      'Safety: Using fallback (conservative default: concern)'
    );

    return {
      classifierName: 'safety',
      level: SafetyLevel.CONCERN,
      confidence: 0.0,
      signals: ['classification_error'],
      suggestedTone: 'empathetic',
      requiresHumanEscalation: false,
      timestamp: new Date(),
    };
  }

  /**
   * Check for crisis keywords in message
   */
  private checkCrisisKeywords(message: string): string[] {
    const normalized = message.toLowerCase();
    const signals: string[] = [];

    for (const [category, patterns] of Object.entries(CRISIS_PATTERNS)) {
      for (const pattern of patterns) {
        if (normalized.includes(pattern)) {
          signals.push(`${category}:${pattern}`);
        }
      }
    }

    return signals;
  }

  /**
   * Map string level to enum
   */
  private mapLevel(level: string): SafetyLevel {
    switch (level) {
      case 'safe':
        return SafetyLevel.SAFE;
      case 'concern':
        return SafetyLevel.CONCERN;
      case 'crisis':
        return SafetyLevel.CRISIS;
      default:
        logger.warn({ level }, 'Unknown safety level, defaulting to CONCERN');
        return SafetyLevel.CONCERN;
    }
  }
}

export const safetyClassifier = new SafetyClassifier();
