// Base Mode Handler - Abstract class for all mode handlers
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';
import { ConversationMode } from '@/types/modes.js';
import type { IModeHandler, HandlerContext, HandlerResult, ContextElement } from '@/types/index.js';

/**
 * Response length limits by mode (in tokens)
 * Performance optimization: Shorter responses = faster generation
 */
const MODE_TOKEN_LIMITS: Record<ConversationMode, number> = {
  [ConversationMode.SMALLTALK]: 150, // Brief, conversational
  [ConversationMode.CONSULT]: 400, // Detailed advice
  [ConversationMode.META]: 250, // Feature explanations
  [ConversationMode.TRACK_PROGRESS]: 300, // Goal tracking responses
};

export abstract class BaseModeHandler implements IModeHandler {
  abstract readonly mode: ConversationMode;

  /**
   * Get the token limit for this handler's mode
   */
  protected getMaxTokens(): number {
    return MODE_TOKEN_LIMITS[this.mode] || 300;
  }

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
   * Generate LLM response with mode-specific system prompt and token limits
   */
  protected async generateResponse(systemPrompt: string, context: HandlerContext): Promise<string> {
    // Build context section from state
    const contextSection = this.buildContextSection(context);

    // Inject context BEFORE mode-specific system prompt
    const fullSystemPrompt = contextSection ? `${contextSection}\n\n${systemPrompt}` : systemPrompt;

    // Get mode-specific token limit for faster responses
    const maxTokens = this.getMaxTokens();

    logger.debug(
      {
        mode: this.mode,
        hasContext: !!contextSection,
        contextLength: contextSection?.length || 0,
        systemPromptLength: fullSystemPrompt.length,
        maxTokens,
      },
      'Base handler: Generating response with system prompt'
    );

    // Generate response with context in system prompt and token limit
    const response = await llmService.generateResponse(context.messages as any, context.message, {
      systemPrompt: fullSystemPrompt,
      maxTokens, // Performance optimization: limit response length
    });

    return response;
  }

  /**
   * Build COMPACT context section from conversation state
   * Optimized for token efficiency while preserving key information
   */
  protected buildContextSection(context: HandlerContext): string {
    const state = context.state as {
      contextElements?: ContextElement[];
      steeringHints?: any;
      extractions?: any;
    };

    const parts: string[] = [];

    // 1. Compact memory context (only high-weight items, no verbose guide)
    const elements: ContextElement[] = state?.contextElements || [];
    const strongMemories = elements.filter((el) => el.weight > 0.3);

    if (strongMemories.length > 0) {
      const topics = strongMemories
        .filter((m) => m.key.startsWith('topic:'))
        .map((m) => m.value)
        .slice(0, 3);
      const emotions = strongMemories
        .filter((m) => m.key.startsWith('emotion:'))
        .map((m) => m.value)
        .slice(0, 2);
      const crisis = strongMemories.filter((m) => m.contextType === 'crisis');

      if (topics.length > 0) parts.push(`Topics: ${topics.join(', ')}`);
      if (emotions.length > 0) parts.push(`Mood: ${emotions.join(', ')}`);
      if (crisis.length > 0) parts.push(`⚠️ CRISIS: ${crisis.map((c) => c.value).join(', ')}`);
    }

    // 2. Compact extraction summary (just the data, no timestamps)
    if (state?.extractions) {
      for (const [domain, extr] of Object.entries(state.extractions as any)) {
        if (Array.isArray(extr) && extr.length > 0) {
          const recent = extr[extr.length - 1];
          if (recent?.data && recent.confidence > 0.5) {
            // Just key facts, no full JSON
            const summary = this.compactDataSummary(domain, recent.data);
            if (summary) parts.push(`${domain}: ${summary}`);
          }
        }
      }
    }

    // 3. Minimal steering (just first suggestion if any)
    if (state?.steeringHints?.suggestions?.[0]) {
      parts.push(`Consider: ${state.steeringHints.suggestions[0]}`);
    }

    logger.debug(
      { mode: this.mode, contextParts: parts.length },
      'Base handler: Compact context built'
    );

    return parts.length > 0 ? `Context: ${parts.join(' | ')}` : '';
  }

  /**
   * Create compact data summary for a domain
   */
  private compactDataSummary(domain: string, data: any): string {
    if (!data) return '';

    if (domain === 'health') {
      const parts = [];
      if (data.sleep?.issues?.length) parts.push(`sleep: ${data.sleep.issues[0]}`);
      if (data.mood?.emotion) parts.push(`mood: ${data.mood.emotion}`);
      if (data.symptoms?.length) parts.push(`symptoms: ${data.symptoms[0]?.name}`);
      return parts.join(', ');
    }

    if (domain === 'goal') {
      if (data.action) return `action: ${data.action}`;
      if (data.goalType) return `goal: ${data.goalType}`;
    }

    // Generic: just show first key-value
    const keys = Object.keys(data).slice(0, 2);
    return keys.map((k) => `${k}: ${JSON.stringify(data[k]).substring(0, 30)}`).join(', ');
  }
}
