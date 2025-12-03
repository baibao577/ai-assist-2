/**
 * Goal Domain Configuration
 *
 * Registers the Goal domain with its extractor and strategies.
 * This domain handles goal tracking, progress monitoring, and
 * clarification for ambiguous goal selections.
 */

import { GoalDataSchema } from './schemas/goal.schema.js';
import { GoalExtractor } from './extractors/GoalExtractor.js';
import { GoalSelectionStrategy } from './strategies/GoalSelectionStrategy.js';
import {
  domainRegistry,
  extractorRegistry,
  steeringRegistry,
} from '@/core/domains/registries/index.js';
import { logger } from '@/core/logger.js';

// Register the domain and its components
export function registerGoalDomain(): void {
  try {
    // Register domain definition
    domainRegistry.register({
      id: 'goal',
      name: 'Goal Management',
      description: 'Tracks goals, progress updates, and handles goal selection clarifications',
      priority: 1.5, // Higher than health/finance for goal-related messages
      enabled: true,
      capabilities: {
        extraction: true,
        steering: true,
        summarization: true,
      },
      config: {
        extractionSchema: GoalDataSchema,
        steeringStrategy: {
          triggers: ['goal_selection', 'clarification_needed'],
          maxSuggestionsPerTurn: 0, // No proactive suggestions when waiting for selection
        },
        // No storageConfig - we use goalRepository and progressRepository directly
      },
    });

    // Register extractor
    extractorRegistry.register(new GoalExtractor());

    // Register steering strategy
    steeringRegistry.register(new GoalSelectionStrategy());

    logger.info('Goal domain registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register goal domain');
    throw error;
  }
}

// Export components for direct use
export { GoalExtractor } from './extractors/index.js';
export { GoalSelectionStrategy } from './strategies/index.js';
export * from './schemas/index.js';