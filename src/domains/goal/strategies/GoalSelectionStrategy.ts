/**
 * Goal Selection Strategy
 *
 * Handles clarification when the system needs the user to select
 * which goal they're referring to. Maintains pending state and
 * provides context for the extractor to parse follow-up responses.
 */

import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';
import type { GoalOption, GoalContext } from '../schemas/goal.schema.js';
import { goalRepository } from '@/database/repositories/index.js';
import type { Goal } from '@/database/schema.js';
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';

export class GoalSelectionStrategy extends BaseSteeringStrategy {
  strategyId = 'goal_selection';
  priority = 2.0; // High priority when waiting for selection

  /**
   * Apply when we asked for goal clarification in the last message
   */
  shouldApply(state: ConversationState): boolean {
    // Check if the last assistant message asked for goal selection
    const messages = state.messages || [];
    if (messages.length < 2) return false;

    const lastAssistantMessage = this.getLastAssistantMessage(messages);
    if (!lastAssistantMessage) return false;

    // Simple heuristic check - the actual LLM analysis will happen in generateHints
    const selectionKeywords = ['which goal', 'select', 'specify', 'which one', 'please respond'];
    const hasSelectionKeyword = selectionKeywords.some((k) =>
      lastAssistantMessage.toLowerCase().includes(k)
    );

    // Also check if there's a numbered list of goals
    const hasNumberedList = /\d+\.\s+.+/g.test(lastAssistantMessage);

    return hasSelectionKeyword || (hasNumberedList && lastAssistantMessage.includes('goal'));
  }

  /**
   * Generate hints for pending goal selection
   */
  async generateHints(state: ConversationState): Promise<SteeringHints> {
    this.logActivation(state, 'Goal selection pending');

    // Extract goal options from the last message
    const goalOptions = await this.extractGoalOptions(state);

    // Get the pending value if it was mentioned
    const pendingValue = await this.extractPendingValue(state);

    // Build progress context
    const goalContext: GoalContext = {
      activeGoals: goalOptions,
      pendingClarification: {
        type: 'goal_selection',
        askedAt: new Date().toISOString(),
        options: goalOptions,
        pendingValue,
        originalMessage: this.getLastUserMessage(state.messages || []),
      },
    };

    return {
      type: 'goal_selection_pending',
      suggestions: [], // No proactive suggestions - waiting for response
      context: goalContext,
      priority: this.priority,
    };
  }

  /**
   * Extract goal options from conversation or database
   */
  private async extractGoalOptions(state: ConversationState): Promise<GoalOption[]> {
    // First, try to extract from the last assistant message
    const lastMessage = this.getLastAssistantMessage(state.messages || []);
    const extractedOptions = await this.parseGoalsFromMessage(lastMessage);

    if (extractedOptions.length > 0) {
      return extractedOptions;
    }

    // Fallback: get active goals from database
    const userId = state.userId || 'cli-user';
    try {
      const goals = await goalRepository.getActiveGoals(userId);
      return this.goalsToOptions(goals);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch active goals');
      return [];
    }
  }

  /**
   * Parse goal options from a message that lists them using LLM
   */
  private async parseGoalsFromMessage(message: string): Promise<GoalOption[]> {
    if (!message) return [];

    try {
      const prompt = `Extract the list of goals from this message.

Message: "${message}"

Return JSON with an array of goals:
{
  "goals": [
    {
      "id": "temp_1",
      "title": "Goal title",
      "currentValue": current progress or null,
      "targetValue": target value or null,
      "unit": "unit" or null
    }
  ]
}

Look for numbered lists, bullet points, or any enumeration of goals.
If no goals are listed, return {"goals": []}.`;

      const content = await llmService.generateFromMessages(
        [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.2,
          maxTokens: 400,
        }
      );

      if (!content) return [];

      const result = JSON.parse(content);
      return result.goals || [];
    } catch (error) {
      logger.error({ error }, 'Failed to parse goals from message');
      return [];
    }
  }

  /**
   * Convert Goal entities to GoalOptions
   */
  private goalsToOptions(goals: Goal[]): GoalOption[] {
    return goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      currentValue: goal.currentValue ?? undefined,
      targetValue: goal.targetValue ?? undefined,
      unit: goal.unit ?? undefined,
      status: goal.status ?? undefined,
      category: goal.category ?? undefined,
    }));
  }

  /**
   * Extract pending value from conversation using LLM
   */
  private async extractPendingValue(state: ConversationState): Promise<number | undefined> {
    const lastUserMessage = this.getLastUserMessage(state.messages || []);
    if (!lastUserMessage) return undefined;

    try {
      const prompt = `Extract the progress value (number) from this user message about goal progress.

User message: "${lastUserMessage}"

Return JSON with:
{
  "hasValue": true/false,
  "value": number or null,
  "unit": "extracted unit" or null
}

Examples:
- "I read 5 books" → {"hasValue": true, "value": 5, "unit": "books"}
- "I ran 10 miles" → {"hasValue": true, "value": 10, "unit": "miles"}
- "Finished 3" → {"hasValue": true, "value": 3, "unit": null}
- "I want to set a goal" → {"hasValue": false, "value": null}`;

      const content = await llmService.generateFromMessages(
        [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: lastUserMessage,
          },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.2,
          maxTokens: 100,
        }
      );

      if (!content) return undefined;

      const result = JSON.parse(content);
      return result.hasValue ? result.value : undefined;
    } catch (error) {
      logger.error({ error }, 'Failed to extract pending value');
      // Fallback to simple number extraction
      const numbers = lastUserMessage.match(/\d+(?:\.\d+)?/g);
      return numbers && numbers.length > 0 ? parseFloat(numbers[0]) : undefined;
    }
  }

  /**
   * Get the last assistant message
   */
  private getLastAssistantMessage(messages: Array<{ role: string; content: string }>): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i].content;
      }
    }
    return '';
  }

  /**
   * Get the last user message
   */
  private getLastUserMessage(messages: Array<{ role: string; content: string }>): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return '';
  }
}
