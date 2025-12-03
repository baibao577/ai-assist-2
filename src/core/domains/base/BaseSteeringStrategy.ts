// Base Steering Strategy - Abstract class for conversation steering
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '../types.js';
import { logger } from '@/core/logger.js';

/**
 * Base class for all steering strategies
 * Determines when to apply and what suggestions to make
 */
export abstract class BaseSteeringStrategy {
  abstract strategyId: string;
  abstract priority: number; // Higher priority strategies take precedence (0.0 - 1.0)

  /**
   * Determine if this strategy should apply to the current state
   * @param state - Current conversation state
   * @returns True if strategy should generate hints
   */
  abstract shouldApply(state: ConversationState): boolean;

  /**
   * Generate steering hints for the conversation
   * @param state - Current conversation state
   * @returns Steering hints with suggestions and context
   */
  abstract generateHints(state: ConversationState): Promise<SteeringHints>;

  /**
   * Utility: Merge two arrays of suggestions, avoiding duplicates
   * @param existing - Existing suggestions
   * @param newSuggestions - New suggestions to add
   * @param maxSuggestions - Maximum number of suggestions to return
   * @returns Merged suggestions
   */
  protected mergeSuggestions(
    existing: string[],
    newSuggestions: string[],
    maxSuggestions = 3
  ): string[] {
    const seen = new Set<string>();
    const combined: string[] = [];

    // Normalize and deduplicate
    for (const suggestion of [...existing, ...newSuggestions]) {
      const normalized = suggestion.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        combined.push(suggestion);
      }
    }

    return combined.slice(0, maxSuggestions);
  }

  /**
   * Utility: Check if enough time has passed since last check
   * @param lastCheckTime - Last check timestamp
   * @param hoursThreshold - Hours that must pass
   * @returns True if threshold exceeded
   */
  protected hasTimeElapsed(
    lastCheckTime: Date | string | undefined,
    hoursThreshold: number
  ): boolean {
    if (!lastCheckTime) return true;

    const lastCheck = typeof lastCheckTime === 'string' ? new Date(lastCheckTime) : lastCheckTime;
    const hoursSince = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60);
    return hoursSince >= hoursThreshold;
  }

  /**
   * Log strategy activation
   * @param state - Current state
   * @param reason - Why strategy is activating
   */
  protected logActivation(state: ConversationState, reason: string): void {
    logger.debug(
      {
        strategyId: this.strategyId,
        priority: this.priority,
        conversationId: state.conversationId,
        reason,
      },
      'Steering strategy activated'
    );
  }
}
