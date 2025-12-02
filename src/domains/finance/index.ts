// Finance Domain Registration
import { domainRegistry, extractorRegistry, steeringRegistry } from '@/core/domains/registries/index.js';
import { FinanceExtractor } from './extractors/FinanceExtractor.js';
import { BudgetGuidanceStrategy, GoalPlanningStrategy } from './strategies/index.js';
import { financeExtractionSchema } from './schemas/finance.schema.js';
import { logger } from '@/core/logger.js';

/**
 * Register the finance domain with all its components
 * This includes the domain definition, extractor, and steering strategies
 */
export function registerFinanceDomain(): void {
  try {
    // Register domain definition
    domainRegistry.register({
      id: 'finance',
      name: 'Finance & Money',
      description: 'Track expenses, budgets, financial goals, investments, and money management',
      priority: 2, // Second priority after health
      enabled: true,
      capabilities: {
        extraction: true,
        steering: true,
        summarization: true,
      },
      config: {
        extractionSchema: financeExtractionSchema,
        steeringStrategy: {
          triggers: ['money', 'budget', 'expense', 'save', 'invest', 'debt', 'income', 'spend', 'cost', 'pay'],
          maxSuggestionsPerTurn: 3,
        },
        storageConfig: {
          type: 'timeseries',
          table: 'finance_records',
          retention: '730d', // Keep financial data for 2 years
        },
      },
    });

    // Register extractor
    extractorRegistry.register(new FinanceExtractor());

    // Register steering strategies
    steeringRegistry.register(new BudgetGuidanceStrategy());
    steeringRegistry.register(new GoalPlanningStrategy());

    logger.info(
      {
        domain: 'finance',
        extractors: 1,
        strategies: 2,
      },
      'Finance domain registered successfully'
    );
  } catch (error) {
    logger.error(
      {
        domain: 'finance',
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to register finance domain'
    );
    throw error;
  }
}

// Export components for testing or direct use
export { FinanceExtractor } from './extractors/FinanceExtractor.js';
export { BudgetGuidanceStrategy, GoalPlanningStrategy } from './strategies/index.js';
export { financeExtractionSchema, hasFinanceContent, getFinancialHealthScore } from './schemas/index.js';
export type { FinanceData } from './schemas/index.js';