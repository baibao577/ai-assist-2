// Decay Stage - Apply time-based decay to conversation state
import { logger } from '@/core/logger.js';
import {
  DEFAULT_DECAY_CONFIG,
  type ConversationState,
  type ContextElement,
  type DecayConfig,
} from '@/types/index.js';

export class DecayStage {
  private config: DecayConfig;

  constructor(config: DecayConfig = DEFAULT_DECAY_CONFIG) {
    this.config = config;
  }

  /**
   * Apply decay to conversation state based on time elapsed
   */
  applyDecay(state: ConversationState, currentTime: Date = new Date()): ConversationState {
    const timeSinceActivity = currentTime.getTime() - state.lastActivityAt.getTime();
    const hoursSinceActivity = timeSinceActivity / (1000 * 60 * 60);

    logger.debug(
      {
        conversationId: state.conversationId,
        hoursSinceActivity: hoursSinceActivity.toFixed(2),
      },
      'Applying decay to conversation state'
    );

    // Apply decay to context elements
    const decayedContextElements = this.decayContextElements(
      state.contextElements,
      hoursSinceActivity,
      currentTime
    );

    // Filter out goals that have expired
    const activeGoals = state.goals.filter((goal) => {
      if (goal.status !== 'active') return true;

      const goalAgeDays =
        (currentTime.getTime() - goal.createdAt.getTime()) / (1000 * 60 * 60 * 24);

      return goalAgeDays < this.config.goalExpiryDays;
    });

    const numDecayedElements = state.contextElements.length - decayedContextElements.length;
    const numExpiredGoals = state.goals.length - activeGoals.length;

    if (numDecayedElements > 0 || numExpiredGoals > 0) {
      logger.info(
        {
          decayedElements: numDecayedElements,
          expiredGoals: numExpiredGoals,
        },
        'Decay applied'
      );
    }

    return {
      ...state,
      contextElements: decayedContextElements,
      goals: activeGoals,
    };
  }

  /**
   * Apply decay to individual context elements
   */
  private decayContextElements(
    elements: ContextElement[],
    _hoursSinceActivity: number,
    currentTime: Date
  ): ContextElement[] {
    return elements
      .map((element) => {
        // Calculate hours since this element was last accessed
        const elementAge =
          (currentTime.getTime() - element.lastAccessedAt.getTime()) / (1000 * 60 * 60);

        // Apply exponential decay based on half-life
        const decayFactor = Math.pow(0.5, elementAge / this.config.contextElementHalfLife);
        const newWeight = element.weight * decayFactor;

        return {
          ...element,
          weight: newWeight,
        };
      })
      .filter((element) => element.weight > 0.1); // Remove elements with very low weight
  }

  /**
   * Check if context is stale (no activity for a while)
   */
  isStale(lastActivityAt: Date, currentTime: Date = new Date()): boolean {
    const minutesSinceActivity =
      (currentTime.getTime() - lastActivityAt.getTime()) / (1000 * 60);

    return minutesSinceActivity > this.config.staleThresholdMinutes;
  }
}

export const decayStage = new DecayStage();
