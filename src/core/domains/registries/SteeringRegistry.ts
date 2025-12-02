// Steering Registry - Singleton registry for managing steering strategies
import { logger } from '@/core/logger.js';
import type { BaseSteeringStrategy } from '../base/BaseSteeringStrategy.js';

/**
 * Singleton registry for managing steering strategies
 * Multiple strategies can be registered and will be evaluated by priority
 */
export class SteeringRegistry {
  private static instance: SteeringRegistry;
  private strategies = new Map<string, BaseSteeringStrategy>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): SteeringRegistry {
    if (!SteeringRegistry.instance) {
      SteeringRegistry.instance = new SteeringRegistry();
    }
    return SteeringRegistry.instance;
  }

  /**
   * Register a steering strategy
   * @param strategy - Strategy instance to register
   */
  register(strategy: BaseSteeringStrategy): void {
    if (this.strategies.has(strategy.strategyId)) {
      logger.warn(
        {
          strategyId: strategy.strategyId,
          priority: strategy.priority,
        },
        'Replacing existing steering strategy'
      );
    }

    this.strategies.set(strategy.strategyId, strategy);

    logger.info(
      {
        strategyId: strategy.strategyId,
        priority: strategy.priority,
        strategyClass: strategy.constructor.name,
      },
      'Steering strategy registered'
    );
  }

  /**
   * Get a specific strategy by ID
   * @param strategyId - Strategy ID
   * @returns Strategy instance or null if not found
   */
  getStrategy(strategyId: string): BaseSteeringStrategy | null {
    return this.strategies.get(strategyId) || null;
  }

  /**
   * Get all strategies sorted by priority (highest first)
   * @returns Array of strategies sorted by priority
   */
  getAllStrategies(): BaseSteeringStrategy[] {
    return Array.from(this.strategies.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get strategies for specific domain
   * @param domainId - Domain ID to filter by
   * @returns Array of strategies for that domain
   */
  getStrategiesForDomain(domainId: string): BaseSteeringStrategy[] {
    // Filter strategies that include the domain in their ID
    // Convention: strategy IDs often include domain (e.g., "health_wellness_check")
    return Array.from(this.strategies.values())
      .filter((s) => s.strategyId.includes(domainId))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if a strategy exists
   * @param strategyId - Strategy ID to check
   * @returns True if strategy exists
   */
  hasStrategy(strategyId: string): boolean {
    return this.strategies.has(strategyId);
  }

  /**
   * Unregister a strategy
   * @param strategyId - Strategy ID to remove
   */
  unregister(strategyId: string): void {
    if (this.strategies.delete(strategyId)) {
      logger.info({ strategyId }, 'Steering strategy unregistered');
    }
  }

  /**
   * Clear all registered strategies
   * Useful for testing
   */
  clear(): void {
    const count = this.strategies.size;
    this.strategies.clear();
    if (count > 0) {
      logger.info({ count }, 'All steering strategies cleared');
    }
  }

  /**
   * Get statistics about registered strategies
   */
  getStats(): {
    total: number;
    byPriority: Record<string, number>;
    strategies: Array<{ id: string; priority: number }>;
  } {
    const strategies = Array.from(this.strategies.values());
    const byPriority: Record<string, number> = {};

    // Group by priority ranges
    strategies.forEach((s) => {
      const range = s.priority >= 0.8 ? 'high' : s.priority >= 0.5 ? 'medium' : 'low';
      byPriority[range] = (byPriority[range] || 0) + 1;
    });

    return {
      total: strategies.length,
      byPriority,
      strategies: strategies.map((s) => ({ id: s.strategyId, priority: s.priority })),
    };
  }
}

// Export singleton instance
export const steeringRegistry = SteeringRegistry.getInstance();
