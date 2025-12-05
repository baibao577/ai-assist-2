/**
 * @deprecated This classifier is no longer used.
 * The unified classifier (unified.classifier.ts) now handles domain classification
 * in a single LLM call for better performance.
 *
 * Kept as reference for the original domain classification logic and prompts.
 *
 * @see unified.classifier.ts - Current implementation
 */

// Domain Relevance Classifier - Determines which domains are relevant to a message
import { BaseClassifier } from './base.classifier.js';
import { logger } from '@/core/logger.js';
import { domainRegistry } from '@/core/domains/registries/index.js';
import { agentStateRepository } from '@/database/repositories/index.js';
import type { ConversationState } from '@/types/state.js';
import type { DomainDefinition } from '@/core/domains/types.js';
import type { ClassificationResult } from '@/types/classifiers.js';

/**
 * Result from domain classification
 */
interface DomainClassificationResult extends ClassificationResult {
  domains: string[]; // Array of relevant domain IDs
  confidence: number;
}

/**
 * LLM response structure for domain classification
 */
interface DomainLLMResponse {
  domains: string[];
  reasoning?: string;
}

/**
 * Classifier that determines which domains are relevant for extraction
 * Uses LLM to analyze message content and conversation context
 */
export class DomainRelevanceClassifier extends BaseClassifier<
  ConversationState,
  DomainClassificationResult
> {
  readonly name = 'domain_relevance';

  /**
   * Required classify method from BaseClassifier
   */
  async classify(state: ConversationState): Promise<DomainClassificationResult> {
    const message = state.messages?.[state.messages.length - 1];
    if (!message || message.role !== 'user') {
      return this.getFallback();
    }

    const domains = domainRegistry.getActiveDomains();
    if (domains.length === 0) {
      return this.getFallback();
    }

    // Use the base class LLM call
    return this.callLLM(state, {
      maxTokens: 100,
      temperature: 0.3,
    });
  }

  /**
   * Convenience method that returns DomainDefinition[] for backward compatibility
   * Used by extraction stage
   */
  async classifyDomains(state: ConversationState): Promise<DomainDefinition[]> {
    const result = await this.classify(state);
    const domainIds = [...result.domains];

    // Check for pending agent states and add their domains
    try {
      const availableDomains = domainRegistry.getActiveDomains();
      for (const domain of availableDomains) {
        const pendingState = await agentStateRepository.getState(
          state.conversationId,
          domain.id,
          'selection_pending'
        );

        if (pendingState && !domainIds.includes(domain.id)) {
          logger.debug(
            { domainId: domain.id, conversationId: state.conversationId },
            'Adding domain due to pending agent state'
          );
          domainIds.push(domain.id);
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to check agent states');
    }

    logger.debug(
      {
        messagePreview: state.messages?.[state.messages.length - 1]?.content.substring(0, 50),
        availableDomains: domainRegistry.getActiveDomains().map((d) => d.id),
        relevantDomains: domainIds,
      },
      'Domain classification complete'
    );

    // Map IDs back to domain definitions
    return domainIds
      .map((id) => domainRegistry.getDomain(id))
      .filter(Boolean) as DomainDefinition[];
  }

  /**
   * Build the classification prompt
   */
  protected buildPrompt(state: ConversationState): string {
    const message = state.messages?.[state.messages.length - 1];
    if (!message) {
      return 'No message to classify';
    }

    const domains = domainRegistry.getActiveDomains();
    const domainList = domains.map((d) => `- ${d.id}: ${d.description}`).join('\n');

    return `You are a domain classifier. Analyze the message and determine which domains are relevant for information extraction.

Given this user message: "${message.content}"

Available domains:
${domainList}

Consider:
1. The message content and what information it contains
2. Recent conversation context
3. Currently active domains: ${state.metadata?.activeDomains?.join(', ') || 'none'}

Return a JSON object with:
- "domains": array of relevant domain IDs (only include domains with extractable information)
- "reasoning": brief explanation (optional)

Be selective - only include domains that have extractable information in this specific message.
If no domains are relevant, return {"domains": []}.

Examples:
- "I have a headache" → {"domains": ["health"]}
- "I spent $50 on lunch" → {"domains": ["finance"]}
- "I'm stressed about money and can't sleep" → {"domains": ["health", "finance"]}
- "Hello there" → {"domains": []}`;
  }

  /**
   * Parse the LLM response into a DomainClassificationResult
   */
  protected parseResponse(response: string): DomainClassificationResult {
    try {
      const parsed = this.parseJSON<DomainLLMResponse>(response);

      // Validate that domains is an array
      if (!Array.isArray(parsed.domains)) {
        logger.warn('Domain classifier returned non-array domains, using empty array');
        return {
          domains: [],
          confidence: 0.5,
          classifierName: this.name,
          timestamp: new Date(),
        };
      }

      // Filter to only valid domain IDs
      const validDomains = parsed.domains.filter(
        (id) => typeof id === 'string' && domainRegistry.getDomain(id)
      );

      // Calculate confidence based on response
      const confidence = validDomains.length > 0 ? 0.8 : 0.5;

      return {
        domains: validDomains,
        confidence,
        classifierName: this.name,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          response: response.substring(0, 100),
        },
        'Failed to parse domain classification response'
      );
      return this.getFallback();
    }
  }

  /**
   * Return fallback result when classification fails
   */
  protected getFallback(): DomainClassificationResult {
    return {
      domains: [],
      confidence: 0,
      classifierName: this.name,
      timestamp: new Date(),
    };
  }
}

export const domainClassifier = new DomainRelevanceClassifier();
