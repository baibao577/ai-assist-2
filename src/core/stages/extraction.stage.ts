// Extraction Stage - Extracts domain-specific data from messages
import { logger } from '@/core/logger.js';
import type { ConversationState } from '@/types/state.js';
import { domainRegistry, extractorRegistry } from '@/core/domains/registries/index.js';
import { DomainRelevanceClassifier } from '@/core/classifiers/domain.classifier.js';
import { StorageFactory } from '@/core/domains/storage/index.js';
import { domainConfig } from '@/core/domains/config/DomainConfig.js';
import type { ExtractedData } from '@/core/domains/types.js';

/**
 * Stage that extracts domain-specific information from messages
 * Uses domain classifiers to determine relevance and extractors to get data
 */
export class ExtractionStage {
  name = 'extraction';
  private classifier = new DomainRelevanceClassifier();

  /**
   * Process the conversation state to extract domain data
   */
  async process(state: ConversationState): Promise<ConversationState> {
    // Check if domain system is enabled
    if (!domainConfig.isEnabled()) {
      logger.debug('Extraction stage: Domain system disabled');
      return state;
    }

    // Get last user message
    const lastMessage = state.messages?.[state.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      logger.debug('Extraction stage: No user message to extract from');
      return state;
    }

    try {
      // Classify which domains are relevant for this message
      const relevantDomains = await this.classifier.classify(state);

      if (relevantDomains.length === 0) {
        logger.debug('Extraction stage: No relevant domains found');
        return state;
      }

      logger.info(
        {
          domains: relevantDomains.map((d) => d.id),
          messagePreview: lastMessage.content.substring(0, 50),
        },
        'Extraction stage: Processing domains'
      );

      // Filter domains based on configuration
      const enabledDomains = relevantDomains.filter((d) =>
        domainConfig.isDomainEnabled(d.id)
      );

      if (enabledDomains.length === 0) {
        logger.debug('Extraction stage: No enabled domains found');
        return state;
      }

      // Extract data for each relevant domain in parallel
      const extractionPromises = enabledDomains.map(async (domain) => {
        const extractor = extractorRegistry.getExtractor(domain.id);
        if (!extractor) {
          logger.warn({ domainId: domain.id }, 'No extractor found for domain');
          return null;
        }

        // Get extraction config for this domain
        const extractionConfig = domainConfig.getExtractionConfig(domain.id);

        const context = {
          recentMessages: (state.messages || []).slice(-5).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          domainContext: state.domainContext?.[domain.id] || {},
        };

        const extraction = await extractor.extract(lastMessage.content, context);

        // Check if extraction meets confidence threshold
        if (extraction && extraction.confidence >= (extractionConfig.confidenceThreshold || 0.5)) {
          extraction.domainId = domain.id;
          return extraction;
        }

        logger.debug({
          domainId: domain.id,
          confidence: extraction?.confidence || 0,
          threshold: extractionConfig.confidenceThreshold
        }, 'Extraction below confidence threshold');

        return null;
      });

      const extractions = (await Promise.all(extractionPromises)).filter(
        Boolean
      ) as ExtractedData[];

      // Store extractions in domain-specific storage
      for (const extraction of extractions) {
        await this.storeExtraction(extraction, state);
      }

      // Update state with extractions
      const updatedExtractions = { ...(state.extractions || {}) };
      for (const extraction of extractions) {
        if (!updatedExtractions[extraction.domainId]) {
          updatedExtractions[extraction.domainId] = [];
        }
        updatedExtractions[extraction.domainId].push(extraction);
      }

      // Update domain context
      const updatedDomainContext = { ...(state.domainContext || {}) };
      for (const domain of relevantDomains) {
        updatedDomainContext[domain.id] = {
          ...updatedDomainContext[domain.id],
          lastExtraction: new Date(),
          extractionCount: (updatedDomainContext[domain.id]?.extractionCount || 0) + 1,
          active: true,
        };
      }

      logger.info(
        {
          extractionCount: extractions.length,
          domains: extractions.map((e) => e.domainId),
        },
        'Extraction stage: Complete'
      );

      return {
        ...state,
        extractions: updatedExtractions,
        domainContext: updatedDomainContext,
        metadata: {
          ...state.metadata,
          extractionTimestamp: new Date(),
          activeDomains: relevantDomains.map((d) => d.id),
        },
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Extraction stage failed'
      );
      return state;
    }
  }

  /**
   * Store extraction in domain-specific storage
   */
  private async storeExtraction(extraction: ExtractedData, state: ConversationState): Promise<void> {
    try {
      const domain = domainRegistry.getDomain(extraction.domainId);
      if (domain?.config.storageConfig) {
        const storage = StorageFactory.create(extraction.domainId, domain.config.storageConfig);

        // Add userId and conversationId from state
        const dataWithContext = {
          ...extraction.data,
          userId: state.userId || 'unknown',
          conversationId: state.conversationId,
          confidence: extraction.confidence,
        };

        await storage.store(dataWithContext);

        logger.debug(
          {
            domainId: extraction.domainId,
            conversationId: state.conversationId,
          },
          'Extraction stored'
        );
      }
    } catch (error) {
      logger.error(
        {
          domainId: extraction.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to store extraction'
      );
    }
  }
}

export const extractionStage = new ExtractionStage();