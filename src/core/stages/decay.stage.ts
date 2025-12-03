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
   * Apply decay to individual context elements using type-specific half-lives
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

        // Get type-specific half-life
        const halfLife = this.getHalfLifeForType(element.contextType);

        // Apply exponential decay based on type-specific half-life
        const decayFactor = Math.pow(0.5, elementAge / halfLife);
        const newWeight = element.weight * decayFactor;

        logger.debug(
          {
            key: element.key,
            contextType: element.contextType || 'general',
            halfLife,
            elementAge: elementAge.toFixed(2),
            oldWeight: element.weight.toFixed(3),
            newWeight: newWeight.toFixed(3),
            decayFactor: decayFactor.toFixed(3),
          },
          'Context element decay'
        );

        return {
          ...element,
          weight: newWeight,
        };
      })
      .filter((element) => element.weight > 0.1); // Remove elements with very low weight
  }

  /**
   * Get half-life for specific context type
   */
  private getHalfLifeForType(contextType?: string): number {
    switch (contextType) {
      case 'crisis':
        return this.config.crisisHalfLife;
      case 'emotional':
        return this.config.emotionalHalfLife;
      case 'topic':
        return this.config.topicHalfLife;
      case 'preference':
        return this.config.preferenceHalfLife;
      case 'general':
      default:
        return this.config.generalHalfLife;
    }
  }

  /**
   * Check if context is stale (no activity for a while)
   */
  isStale(lastActivityAt: Date, currentTime: Date = new Date()): boolean {
    const minutesSinceActivity = (currentTime.getTime() - lastActivityAt.getTime()) / (1000 * 60);

    return minutesSinceActivity > this.config.staleThresholdMinutes;
  }
}

export const decayStage = new DecayStage();
