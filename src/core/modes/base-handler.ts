// Base Mode Handler - Abstract class for all mode handlers
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';
import type {
  IModeHandler,
  ConversationMode,
  HandlerContext,
  HandlerResult,
  ContextElement,
} from '@/types/index.js';

export abstract class BaseModeHandler implements IModeHandler {
  abstract readonly mode: ConversationMode;

  /**
   * Handle the message in this mode
   */
  async handle(context: HandlerContext): Promise<HandlerResult> {
    try {
      logger.debug({ mode: this.mode, conversationId: context.conversationId }, 'Handling message');

      // Build system prompt for this mode
      const systemPrompt = this.buildSystemPrompt(context);

      // Generate response using LLM
      const response = await this.generateResponse(systemPrompt, context);

      // Prepare result
      const result: HandlerResult = {
        response,
        stateUpdates: this.buildStateUpdates(context),
      };

      logger.debug({ mode: this.mode, responseLength: response.length }, 'Message handled');

      return result;
    } catch (error) {
      logger.error({ error, mode: this.mode }, 'Handler error');
      throw error;
    }
  }

  /**
   * Build mode-specific system prompt
   */
  protected abstract buildSystemPrompt(context: HandlerContext): string;

  /**
   * Build state updates based on the interaction
   */
  protected buildStateUpdates(_context: HandlerContext): Record<string, unknown> {
    // Default: no updates
    // Subclasses can override to add mode-specific state updates
    return {};
  }

  /**
   * Generate LLM response with mode-specific system prompt
   */
  protected async generateResponse(systemPrompt: string, context: HandlerContext): Promise<string> {
    // Build context section from state
    const contextSection = this.buildContextSection(context);

    // Inject context BEFORE mode-specific system prompt
    const fullSystemPrompt = contextSection ? `${contextSection}\n\n${systemPrompt}` : systemPrompt;

    logger.debug(
      {
        mode: this.mode,
        hasContext: !!contextSection,
        contextLength: contextSection?.length || 0,
        systemPromptLength: fullSystemPrompt.length,
      },
      'Base handler: Generating response with system prompt'
    );

    // Generate response with context in system prompt
    const response = await llmService.generateResponse(context.messages as any, context.message, {
      systemPrompt: fullSystemPrompt,
    });

    return response;
  }

  /**
   * Build context section from conversation state
   * Provides raw memory data for LLM to interpret naturally
   */
  protected buildContextSection(context: HandlerContext): string {
    // Cast state to access contextElements and steering (state is typed as Record<string, unknown>)
    const state = context.state as {
      contextElements?: ContextElement[];
      steeringHints?: any;
      extractions?: any;
      domainHistory?: {
        [domainId: string]: Array<{
          data: any;
          confidence: number;
          extractedAt: Date;
        }>;
      };
    };
    const elements: ContextElement[] = state?.contextElements || [];

    logger.debug(
      {
        mode: this.mode,
        hasState: !!context.state,
        totalElements: elements.length,
        elementKeys: elements.map((el: ContextElement) => el.key),
      },
      'Base handler: Building context section'
    );

    // Lower threshold - let LLM see more memories and decide relevance
    const memories = elements.filter((el: ContextElement) => el.weight > 0.05);

    logger.debug(
      {
        mode: this.mode,
        totalElements: elements.length,
        memoriesIncluded: memories.length,
        filteredOut: elements.length - memories.length,
      },
      'Base handler: Filtered memories'
    );

    if (memories.length === 0) {
      logger.debug(
        { mode: this.mode },
        'Base handler: No memories above threshold, returning empty'
      );
      return '';
    }

    // Group memories by type for cleaner organization
    const groupedMemories = {
      emotions: memories.filter((m) => m.key.startsWith('emotion:')),
      topics: memories.filter((m) => m.key.startsWith('topic:')),
      crisis: memories.filter((m) => m.contextType === 'crisis'),
      preferences: memories.filter((m) => m.contextType === 'preference'),
      other: memories.filter(
        (m) =>
          !m.key.startsWith('emotion:') &&
          !m.key.startsWith('topic:') &&
          m.contextType !== 'crisis' &&
          m.contextType !== 'preference'
      ),
    };

    // Build organized memory display
    interface MemoryItem {
      [key: string]: string | number;
    }
    const memoryDisplay: Record<string, MemoryItem[]> = {};

    // Add emotional states if present
    if (groupedMemories.emotions.length > 0) {
      memoryDisplay.emotional_states = groupedMemories.emotions
        .sort((a, b) => b.weight - a.weight)
        .map((m) => ({
          feeling: m.value,
          strength: parseFloat(m.weight.toFixed(2)),
          age: this.getHumanReadableAge(m.lastAccessedAt),
        }));
    }

    // Add conversation topics if present
    if (groupedMemories.topics.length > 0) {
      memoryDisplay.conversation_topics = groupedMemories.topics
        .sort((a, b) => b.weight - a.weight)
        .map((m) => ({
          topic: m.value,
          strength: parseFloat(m.weight.toFixed(2)),
          age: this.getHumanReadableAge(m.lastAccessedAt),
        }));
    }

    // Add crisis signals if present
    if (groupedMemories.crisis.length > 0) {
      memoryDisplay.crisis_signals = groupedMemories.crisis.map((m) => ({
        signal: m.value,
        strength: parseFloat(m.weight.toFixed(2)),
        age: this.getHumanReadableAge(m.lastAccessedAt),
        importance: 'critical',
      }));
    }

    // Add preferences if present
    if (groupedMemories.preferences.length > 0) {
      memoryDisplay.preferences = groupedMemories.preferences.map((m) => ({
        preference: m.value,
        strength: parseFloat(m.weight.toFixed(2)),
      }));
    }

    // Add other context if present
    if (groupedMemories.other.length > 0) {
      memoryDisplay.other_context = groupedMemories.other.map((m) => ({
        key: m.key,
        value: m.value,
        strength: parseFloat(m.weight.toFixed(2)),
        age: this.getHumanReadableAge(m.lastAccessedAt),
      }));
    }

    // Build the context sections
    let contextSections = [];

    // Add memory context if present
    if (Object.keys(memoryDisplay).length > 0) {
      contextSections.push(`CONVERSATION MEMORY (from previous interactions):
${JSON.stringify(memoryDisplay, null, 2)}

Memory Guide:
- Strength (0-1): How recent/important this memory is
  * 0.8-1.0: Very recent or critical, likely worth acknowledging
  * 0.4-0.7: Moderately relevant, reference if appropriate
  * 0.1-0.3: Fading memory, only mention if directly relevant
  * <0.1: Nearly forgotten
- Age: When this was last mentioned or relevant
- Importance: Critical memories (like crisis) remain important even when fading`);
    }

    // Add steering hints if present
    if (state?.steeringHints) {
      const hints = state.steeringHints;
      contextSections.push(`CONVERSATION GUIDANCE:
Type: ${hints.type || 'general'}
Priority: ${hints.priority || 0.5}
${
  hints.suggestions && hints.suggestions.length > 0
    ? `
Suggested questions or topics to explore:
${hints.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
    : ''
}
${
  hints.context
    ? `
Additional context: ${JSON.stringify(hints.context, null, 2)}`
    : ''
}

Use these suggestions naturally in your response if appropriate. Don't force them if they don't fit the conversation flow.`);
    }

    // Add recent extractions summary if present
    if (state?.extractions && Object.keys(state.extractions).length > 0) {
      const extractionSummary: any = {};
      for (const [domainId, extractions] of Object.entries(state.extractions as any)) {
        if (Array.isArray(extractions) && extractions.length > 0) {
          // Get the most recent extraction for each domain
          const recent = extractions[extractions.length - 1];
          if (recent.confidence > 0.5) {
            extractionSummary[domainId] = {
              data: recent.data,
              confidence: recent.confidence,
              timestamp: recent.timestamp,
            };
          }
        }
      }

      if (Object.keys(extractionSummary).length > 0) {
        contextSections.push(`EXTRACTED INFORMATION:
${JSON.stringify(extractionSummary, null, 2)}

This information was automatically extracted from the conversation. Use it to provide more personalized and relevant responses.`);
      }
    }

    // Add historical domain data if present
    if (state?.domainHistory && Object.keys(state.domainHistory).length > 0) {
      const historySummary: any = {};

      for (const [domainId, history] of Object.entries(state.domainHistory)) {
        if (Array.isArray(history) && history.length > 0) {
          // Format history entries for each domain
          historySummary[domainId] = history.slice(0, 5).map((entry) => ({
            data: this.summarizeDomainData(domainId, entry.data),
            daysAgo: Math.round((Date.now() - new Date(entry.extractedAt).getTime()) / (1000 * 60 * 60 * 24)),
            confidence: entry.confidence,
          }));
        }
      }

      if (Object.keys(historySummary).length > 0) {
        contextSections.push(`DOMAIN HISTORY (Recent Patterns):
${JSON.stringify(historySummary, null, 2)}

This historical data shows patterns over time. Use it to:
- Track progress (e.g., "Your headaches seem less severe than last week")
- Provide continuity (e.g., "You mentioned stress about money 3 days ago")
- Offer personalized insights based on trends`);
      }
    }

    const contextSection = contextSections.join('\n\n');

    logger.debug(
      {
        mode: this.mode,
        memoriesProvided: memories.length,
        strongMemories: memories.filter((m) => m.weight > 0.7).length,
        moderateMemories: memories.filter((m) => m.weight > 0.3 && m.weight <= 0.7).length,
        weakMemories: memories.filter((m) => m.weight <= 0.3).length,
      },
      'Base handler: Memory context built'
    );

    return contextSection;
  }

  /**
   * Summarize domain data to only include key information
   */
  private summarizeDomainData(domainId: string, data: any): any {
    // Extract only key fields based on domain type
    if (domainId === 'health') {
      return {
        symptoms: data.symptoms?.map((s: any) => ({
          name: s.name,
          severity: s.severity
        })).filter(Boolean),
        mood: data.mood ? {
          emotion: data.mood.emotion,
          level: data.mood.level
        } : undefined,
        sleep: data.sleep ? {
          quality: data.sleep.quality,
          hours: data.sleep.hours
        } : undefined,
      };
    } else if (domainId === 'finance') {
      return {
        concerns: data.concerns,
        transactions: data.transactions?.slice(0, 3), // Limit to recent 3
        budget: data.budget?.total ? { total: data.budget.total } : undefined,
      };
    }

    // For unknown domains, return minimal summary
    return Object.keys(data).slice(0, 3).reduce((acc: any, key: string) => {
      acc[key] = data[key];
      return acc;
    }, {});
  }

  /**
   * Convert timestamp to human-readable age
   */
  private getHumanReadableAge(date: Date): string {
    const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);

    if (hours < 0.5) return 'just now';
    if (hours < 1) return 'within the hour';
    if (hours < 2) return '1 hour ago';
    if (hours < 24) return `${Math.round(hours)} hours ago`;
    if (hours < 48) return 'yesterday';
    if (hours < 72) return '2 days ago';
    if (hours < 168) return `${Math.round(hours / 24)} days ago`;
    if (hours < 336) return 'last week';
    return 'over 2 weeks ago';
  }
}
