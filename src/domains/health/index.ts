// Health Domain Registration
import {
  domainRegistry,
  extractorRegistry,
  steeringRegistry,
} from '@/core/domains/registries/index.js';
import { HealthExtractor } from './extractors/HealthExtractor.js';
import { WellnessCheckStrategy, SymptomExplorationStrategy } from './strategies/index.js';
import { healthExtractionSchema } from './schemas/health.schema.js';
import { logger } from '@/core/logger.js';

/**
 * Register the health domain with all its components
 * This includes the domain definition, extractor, and steering strategies
 */
export function registerHealthDomain(): void {
  try {
    // Register domain definition
    domainRegistry.register({
      id: 'health',
      name: 'Health & Wellness',
      description:
        'Track physical and mental health, symptoms, mood, sleep, exercise, and wellness',
      priority: 1, // Highest priority domain
      enabled: true,
      capabilities: {
        extraction: true,
        steering: true,
        summarization: true,
      },
      config: {
        extractionSchema: healthExtractionSchema,
        steeringStrategy: {
          triggers: [
            'health',
            'symptom',
            'pain',
            'sick',
            'tired',
            'sleep',
            'mood',
            'stressed',
            'anxious',
          ],
          maxSuggestionsPerTurn: 2,
        },
        storageConfig: {
          type: 'timeseries',
          table: 'health_records',
          retention: '365d', // Keep health data for 1 year
        },
      },
    });

    // Register extractor
    extractorRegistry.register(new HealthExtractor());

    // Register steering strategies
    steeringRegistry.register(new WellnessCheckStrategy());
    steeringRegistry.register(new SymptomExplorationStrategy());

    logger.info(
      {
        domain: 'health',
        extractors: 1,
        strategies: 2,
      },
      'Health domain registered successfully'
    );
  } catch (error) {
    logger.error(
      {
        domain: 'health',
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to register health domain'
    );
    throw error;
  }
}

// Export components for testing or direct use
export { HealthExtractor } from './extractors/HealthExtractor.js';
export { WellnessCheckStrategy, SymptomExplorationStrategy } from './strategies/index.js';
export { healthExtractionSchema, hasHealthContent, getHealthSeverity } from './schemas/index.js';
export type { HealthData } from './schemas/index.js';
