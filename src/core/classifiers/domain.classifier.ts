// Domain Relevance Classifier - Determines which domains are relevant to a message
import OpenAI from 'openai';
import { config } from '@/config/index.js';
import { logger } from '@/core/logger.js';
import { domainRegistry } from '@/core/domains/registries/index.js';
import type { ConversationState } from '@/types/state.js';
import type { DomainDefinition } from '@/core/domains/types.js';

/**
 * Classifier that determines which domains are relevant for extraction
 * Uses LLM to analyze message content and conversation context
 */
export class DomainRelevanceClassifier {
  name = 'domain_relevance';
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeout,
    });
  }

  /**
   * Classify which domains are relevant to the current message
   */
  async classify(state: ConversationState): Promise<DomainDefinition[]> {
    const message = state.messages?.[state.messages.length - 1];
    if (!message || message.role !== 'user') {
      return [];
    }

    const domains = domainRegistry.getActiveDomains();
    if (domains.length === 0) {
      return [];
    }

    try {
      const prompt = this.buildPrompt(message.content, domains, state);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a domain classifier. Analyze the message and return only JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 100,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      const response = JSON.parse(content);
      const relevantIds: string[] = response.domains || [];

      logger.debug(
        {
          messagePreview: message.content.substring(0, 50),
          availableDomains: domains.map((d) => d.id),
          relevantDomains: relevantIds,
        },
        'Domain classification complete'
      );

      // Map IDs back to domain definitions
      return relevantIds
        .map((id) => domainRegistry.getDomain(id))
        .filter(Boolean) as DomainDefinition[];
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Domain classification failed'
      );
      return [];
    }
  }

  /**
   * Build the classification prompt
   */
  private buildPrompt(
    message: string,
    domains: DomainDefinition[],
    state: ConversationState
  ): string {
    const domainList = domains.map((d) => `- ${d.id}: ${d.description}`).join('\n');

    return `Given this user message: "${message}"

And these available domains:
${domainList}

Which domains are relevant to extract information from? Consider:
1. The message content and what information it contains
2. Recent conversation context
3. Currently active domains: ${state.metadata?.activeDomains?.join(', ') || 'none'}

Return a JSON object with a "domains" array containing only the IDs of relevant domains.
Be selective - only include domains that have extractable information in this specific message.
If no domains are relevant, return {"domains": []}.

Example response: {"domains": ["health", "finance"]}`;
  }
}

export const domainClassifier = new DomainRelevanceClassifier();
