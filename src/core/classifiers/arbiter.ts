// Sequential Arbiter - Makes final decisions based on classifier results

import { logger } from '@/core/logger.js';
import { SafetyLevel, type ArbiterInput, type ArbiterDecision } from '@/types/classifiers.js';

export class Arbiter {
  /**
   * Make final decision based on safety and intent classification results
   *
   * Priority rules (sequential, MVP v3):
   * 1. CRISIS safety → Force CONSULT mode + crisis response
   * 2. CONCERN safety → Force CONSULT mode + empathetic tone
   * 3. SAFE → Use intent classifier's suggested mode
   */
  async arbitrate(input: ArbiterInput): Promise<ArbiterDecision> {
    logger.debug(
      {
        safetyLevel: input.safetyResult.level,
        safetyConfidence: input.safetyResult.confidence,
        suggestedMode: input.intentResult.suggestedMode,
        intentConfidence: input.intentResult.confidence,
      },
      'Arbiter: Starting decision process'
    );

    // Rule 1: CRISIS safety - highest priority
    if (input.safetyResult.level === SafetyLevel.CRISIS) {
      const decision: ArbiterDecision = {
        finalMode: input.intentResult.suggestedMode, // Keep suggested mode but flag crisis
        finalIntent: input.intentResult.intent,
        safetyContext: {
          level: SafetyLevel.CRISIS,
          tone: 'urgent',
          isCrisis: true,
          crisisResources: input.safetyResult.crisisResources,
        },
        overrideReason: 'Safety override: Crisis detected - immediate intervention required',
        confidence: 1.0, // High confidence in crisis situations
        timestamp: new Date(),
      };

      logger.warn(
        {
          finalMode: decision.finalMode,
          safetyLevel: SafetyLevel.CRISIS,
          signals: input.safetyResult.signals,
        },
        'Arbiter: CRISIS detected - safety override applied'
      );

      return decision;
    }

    // Rule 2: CONCERN safety - medium priority
    if (input.safetyResult.level === SafetyLevel.CONCERN) {
      const decision: ArbiterDecision = {
        finalMode: input.intentResult.suggestedMode, // Keep suggested mode but adjust tone
        finalIntent: input.intentResult.intent,
        safetyContext: {
          level: SafetyLevel.CONCERN,
          tone: 'empathetic',
          isCrisis: false,
        },
        overrideReason: 'Safety concern: Adjusting tone to be more empathetic',
        confidence: input.intentResult.confidence,
        timestamp: new Date(),
      };

      logger.info(
        {
          finalMode: decision.finalMode,
          safetyLevel: SafetyLevel.CONCERN,
          signals: input.safetyResult.signals,
        },
        'Arbiter: CONCERN detected - empathetic tone applied'
      );

      return decision;
    }

    // Rule 3: SAFE - use intent classifier result
    const decision: ArbiterDecision = {
      finalMode: input.intentResult.suggestedMode,
      finalIntent: input.intentResult.intent,
      safetyContext: {
        level: SafetyLevel.SAFE,
        tone: 'normal',
        isCrisis: false,
      },
      confidence: input.intentResult.confidence,
      timestamp: new Date(),
    };

    logger.info(
      {
        finalMode: decision.finalMode,
        finalIntent: decision.finalIntent,
        confidence: decision.confidence,
      },
      'Arbiter: Normal routing - using intent classification'
    );

    return decision;
  }
}

export const arbiter = new Arbiter();
