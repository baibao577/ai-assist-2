// Steering Stage - Generates conversation guidance hints
import { logger } from '@/core/logger.js';
import type { ConversationState } from '@/types/state.js';
import { steeringRegistry } from '@/core/domains/registries/index.js';
import type { SteeringHints } from '@/core/domains/types.js';

/**
 * Stage that generates steering hints to guide conversations
 * Evaluates all registered strategies and merges their suggestions
 */
export class SteeringStage {
  name = 'steering';

  /**
   * Process the conversation state to generate steering hints
   */
  async process(state: ConversationState): Promise<ConversationState> {
    try {
      // Get all registered strategies
      const allStrategies = steeringRegistry.getAllStrategies();

      if (allStrategies.length === 0) {
        logger.debug('Steering stage: No strategies registered');
        return state;
      }

      // Filter strategies that should apply to current state
      const activeStrategies = allStrategies.filter((s) => s.shouldApply(state));

      if (activeStrategies.length === 0) {
        logger.debug('Steering stage: No applicable strategies');
        return state;
      }

      logger.info(
        {
          strategies: activeStrategies.map((s) => s.strategyId),
          count: activeStrategies.length,
        },
        'Steering stage: Generating hints'
      );

      // Generate hints from each strategy in parallel
      const hintPromises = activeStrategies.map((s) => s.generateHints(state));
      const hints = await Promise.all(hintPromises);

      // Merge and prioritize hints
      const mergedHints = this.mergeHints(hints);

      logger.info(
        {
          suggestions: mergedHints.suggestions.length,
          type: mergedHints.type,
        },
        'Steering stage: Hints generated'
      );

      return {
        ...state,
        steeringHints: mergedHints,
        metadata: {
          ...state.metadata,
          steeringApplied: activeStrategies.map((s) => s.strategyId),
        },
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Steering stage failed'
      );
      return state;
    }
  }

  /**
   * Merge multiple hint sets into a single set
   * Prioritizes by strategy priority and deduplicates suggestions
   */
  private mergeHints(hints: SteeringHints[]): SteeringHints {
    if (hints.length === 0) {
      return {
        type: 'none',
        suggestions: [],
        context: {},
        priority: 0,
      };
    }

    // Sort by priority (highest first)
    const sorted = hints.sort((a, b) => b.priority - a.priority);

    // Start with highest priority hint
    const merged: SteeringHints = {
      type: sorted.length > 1 ? 'merged' : sorted[0].type,
      suggestions: [],
      context: {},
      priority: sorted[0].priority,
    };

    // Merge suggestions from top 3 priority hints
    const seen = new Set<string>();
    for (const hint of sorted.slice(0, 3)) {
      for (const suggestion of hint.suggestions) {
        // Deduplicate suggestions by normalized form
        const normalized = suggestion.toLowerCase().trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          merged.suggestions.push(suggestion);
        }
      }
      // Merge context objects
      merged.context = { ...merged.context, ...hint.context };
    }

    // Limit to 3 suggestions total
    merged.suggestions = merged.suggestions.slice(0, 3);

    return merged;
  }
}

export const steeringStage = new SteeringStage();