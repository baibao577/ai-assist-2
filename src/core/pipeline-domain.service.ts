/**
 * Pipeline Domain Service
 * =======================
 * Handles all domain-related operations for the pipeline including:
 * - Data extraction from domains
 * - Domain history management
 * - Steering hint generation
 * - Domain state merging and persistence
 *
 * Note: Domain classification is now handled by the unified classifier.
 * @see unified.classifier.ts
 */

import { logger } from '@/core/logger.js';
import { config } from '@/config/index.js';
import {
  domainRegistry,
  extractorRegistry,
  steeringRegistry,
} from '@/core/domains/registries/index.js';
import { domainConfig } from '@/core/domains/config/DomainConfig.js';
import { StorageFactory } from '@/core/domains/storage/index.js';
import type { ConversationState } from '@/types/index.js';
import type { ExtractedData, DomainDefinition, SteeringHints } from '@/core/domains/types.js';

// Helper types for domain operations
export interface DomainExtractionResult {
  domainId: string;
  extracted: boolean;
  data: ExtractedData | null;
  error?: Error;
}

export interface SteeringResult {
  domainId: string;
  hints: SteeringHints | null;
  error?: Error;
}

export class PipelineDomainService {
  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Extract data for a single domain
   */
  async extractForSingleDomain(
    domain: DomainDefinition,
    state: ConversationState,
    currentMessage: string
  ): Promise<DomainExtractionResult> {
    try {
      const extractor = extractorRegistry.getExtractor(domain.id);
      if (!extractor) {
        logger.warn({ domainId: domain.id }, 'No extractor found for domain');
        return { domainId: domain.id, extracted: false, data: null };
      }

      // Get extraction config for this domain
      const extractionConfig = domainConfig.getExtractionConfig(domain.id);

      const context = {
        recentMessages: (state.messages || []).slice(-5).map((m) => ({
          role: m.role as string,
          content: m.content,
        })),
        domainContext: state.domainContext?.[domain.id] || {},
        conversationId: state.conversationId,
        userId: state.metadata?.userId as string | undefined,
      };

      const extraction = await extractor.extract(currentMessage, context);

      // Check confidence threshold
      if (extraction && extraction.confidence >= (extractionConfig?.confidenceThreshold || 0.5)) {
        logger.debug(
          {
            domainId: domain.id,
            confidence: extraction.confidence,
            fieldsExtracted: Object.keys(extraction.data).length,
          },
          'Domain extraction successful'
        );

        return {
          domainId: domain.id,
          extracted: true,
          data: extraction,
        };
      }

      return { domainId: domain.id, extracted: false, data: null };
    } catch (error) {
      logger.error(
        {
          domainId: domain.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Domain extraction failed'
      );

      return {
        domainId: domain.id,
        extracted: false,
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Merge extraction results into state
   */
  mergeExtractionResults(
    state: ConversationState,
    results: DomainExtractionResult[]
  ): ConversationState {
    const extractions: Record<string, ExtractedData[]> = {};
    const activeDomains: string[] = [];

    for (const result of results) {
      if (result.extracted && result.data) {
        // Initialize array for domain if not exists
        if (!extractions[result.domainId]) {
          extractions[result.domainId] = [];
        }

        // Add extraction to domain array
        extractions[result.domainId].push(result.data);
        activeDomains.push(result.domainId);
      }
    }

    return {
      ...state,
      extractions,
      metadata: {
        ...state.metadata,
        activeDomains,
      },
    };
  }

  /**
   * Store extractions to domain storage
   */
  async storeExtractions(
    results: DomainExtractionResult[],
    state: ConversationState
  ): Promise<void> {
    // Store extractions in parallel
    const storagePromises = results
      .filter((r) => r.extracted && r.data)
      .map(async (result) => {
        try {
          const domain = domainRegistry.getDomain(result.domainId);
          if (domain?.config.storageConfig) {
            const storage = StorageFactory.create(result.domainId, domain.config.storageConfig);

            const dataWithContext = {
              ...result.data!.data,
              userId: state.userId || 'unknown',
              conversationId: state.conversationId,
              confidence: result.data!.confidence,
            };

            await storage.store(dataWithContext);

            logger.debug({ domainId: result.domainId }, 'Domain data stored successfully');
          }
        } catch (error) {
          logger.error(
            {
              domainId: result.domainId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to store domain data'
          );
        }
      });

    await Promise.all(storagePromises);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Load domain history from database
   */
  async loadDomainHistory(
    state: ConversationState,
    conversationId: string,
    userId: string
  ): Promise<ConversationState> {
    try {
      const domainHistory: ConversationState['domainHistory'] = {};
      const enabledDomains = domainRegistry.getActiveDomains();

      // Load history for each enabled domain
      for (const domain of enabledDomains) {
        if (domain?.config.storageConfig) {
          const storage = StorageFactory.create(domain.id, domain.config.storageConfig);

          // Check if storage has loadHistory method (TimeSeriesStorage does)
          if ('loadHistory' in storage && typeof storage.loadHistory === 'function') {
            const history = await storage.loadHistory(
              conversationId,
              userId,
              config.domainHistory.days,
              config.domainHistory.limit
            );

            if (history.length > 0) {
              domainHistory[domain.id] = history;
              logger.debug(
                {
                  domainId: domain.id,
                  entriesLoaded: history.length,
                  oldestEntry: history[history.length - 1].extractedAt,
                  newestEntry: history[0].extractedAt,
                },
                'Domain history loaded'
              );
            }
          }
        }
      }

      if (Object.keys(domainHistory).length > 0) {
        logger.info(
          {
            conversationId,
            domainsWithHistory: Object.keys(domainHistory),
            totalEntries: Object.values(domainHistory).reduce((sum, h) => sum + h.length, 0),
          },
          'Load stage: Domain history loaded'
        );

        return {
          ...state,
          domainHistory,
        };
      }

      return state;
    } catch (error) {
      logger.error(
        {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to load domain history'
      );
      return state; // Continue without history on error
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEERING OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate steering for a single domain
   */
  async generateSteeringForDomain(
    domainId: string,
    state: ConversationState
  ): Promise<SteeringResult> {
    try {
      const strategies = steeringRegistry.getStrategiesForDomain(domainId);

      if (strategies.length === 0) {
        logger.debug({ domainId }, 'No steering strategies found for domain');
        return { domainId, hints: null };
      }

      // Get domain extraction for this domain
      const domainExtraction = state.extractions?.[domainId];
      if (!domainExtraction || domainExtraction.length === 0) {
        return { domainId, hints: null };
      }

      // Generate steering hints from all strategies for this domain
      const allHints: string[] = [];
      let priority = 0.5;

      for (const strategy of strategies) {
        // Generate hints using the strategy (strategy has access to state with extractions)
        const hints = await strategy.generateHints(state);

        if (hints && hints.suggestions.length > 0) {
          allHints.push(...hints.suggestions);
          priority = Math.max(priority, hints.priority || 0.5);
        }
      }

      if (allHints.length > 0) {
        logger.debug(
          {
            domainId,
            suggestionsGenerated: allHints.length,
            strategies: strategies.length,
          },
          'Steering hints generated for domain'
        );

        return {
          domainId,
          hints: {
            type: domainId,
            priority,
            suggestions: allHints,
            context: { domainId },
          },
        };
      }

      return { domainId, hints: null };
    } catch (error) {
      logger.error(
        {
          domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Steering generation failed'
      );

      return {
        domainId,
        hints: null,
        error: error as Error,
      };
    }
  }

  /**
   * Merge steering results into final state
   */
  mergeSteeringResults(state: ConversationState, results: SteeringResult[]): ConversationState {
    const allSuggestions: string[] = [];
    const strategiesApplied: string[] = [];
    let maxPriority = 0.5;

    for (const result of results) {
      if (result.hints && result.hints.suggestions.length > 0) {
        allSuggestions.push(...result.hints.suggestions);
        strategiesApplied.push(result.domainId);
        maxPriority = Math.max(maxPriority, result.hints.priority || 0.5);
      }
    }

    if (allSuggestions.length === 0) {
      return state;
    }

    return {
      ...state,
      steeringHints: {
        type: strategiesApplied.length > 1 ? 'multi-domain' : strategiesApplied[0],
        priority: maxPriority,
        suggestions: allSuggestions,
        context: { domains: strategiesApplied },
      },
      metadata: {
        ...state.metadata,
        steeringApplied: strategiesApplied,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Helper to count context elements by type
   */
  countContextByType(elements: Array<{ contextType?: string }>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const element of elements) {
      const type = element.contextType || 'general';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }
}

export const pipelineDomainService = new PipelineDomainService();
