/**
 * Goal Domain Extractor
 *
 * Extracts goal-related intents and progress data from user messages.
 * Handles both explicit actions (set goal, log progress) and implicit
 * follow-ups (goal selection, clarifications).
 */

import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';
import type { ExtractedData, ExtractionContext } from '@/core/domains/types.js';
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';
import {
  GoalDataSchema,
  type GoalData,
  type GoalContext,
} from '../schemas/goal.schema.js';

export class GoalExtractor extends BaseExtractor {
  domainId = 'goal';
  schema = GoalDataSchema;

  /**
   * Extract progress-related data from user message
   */
  async extract(
    message: string,
    context: ExtractionContext
  ): Promise<ExtractedData | null> {
    logger.info({ domainId: this.domainId, message }, 'GoalExtractor.extract called');

    try {
      // First, check if this is a follow-up response to a clarification
      const clarificationData = await this.checkForClarificationResponse(message, context);
      if (clarificationData) {
        logger.info({ domainId: this.domainId }, 'Clarification response detected');
        return clarificationData;
      }

      // Otherwise, extract new progress intent
      const goalData = await this.extractGoalIntent(message, context);
      logger.info({ domainId: this.domainId, goalData }, 'Goal intent extraction result');
      if (!goalData) return null;

      // Validate against schema
      const validated = GoalDataSchema.parse(goalData);

      logger.info(
        {
          domainId: this.domainId,
          action: validated.action,
          confidence: validated.confidence,
        },
        'Goal data extracted'
      );

      return {
        domainId: this.domainId,
        timestamp: new Date(),
        data: validated,
        confidence: validated.confidence,
      };
    } catch (error) {
      logger.error({ error, domainId: this.domainId }, 'Failed to extract progress data');
      return null;
    }
  }

  /**
   * Check if message is a response to a pending clarification
   */
  private async checkForClarificationResponse(
    message: string,
    context: ExtractionContext
  ): Promise<ExtractedData | null> {
    // Check if there's a pending clarification in domain context
    const goalContext = context.domainContext as GoalContext;
    if (!goalContext?.pendingClarification) return null;

    const { type, options, pendingValue } = goalContext.pendingClarification;

    if (type === 'goal_selection' && options) {
      // Use LLM to understand if this is a selection and which goal was selected
      const selectionPrompt = `The user was asked to select from these goals:
${options.map((g, i) => `${i + 1}. ${g.title}`).join('\n')}

The user responded: "${message}"

Determine if this is a selection response and which goal was selected.
Return JSON with:
{
  "isSelection": true/false,
  "selectedIndex": 1-based index or null,
  "selectedGoalId": "goal id" or null,
  "confidence": 0-1
}

Examples of selection responses:
- "1" or "2" → selecting by number
- "first" or "second" → selecting by position
- "books" or "exercise" → selecting by keyword from goal title
- "the reading one" → selecting by description

If the message is not a selection response, return {"isSelection": false}.`;

      try {
        const content = await llmService.generateFromMessages(
          [
            {
              role: 'system',
              content: selectionPrompt,
            },
            {
              role: 'user',
              content: message,
            },
          ],
          {
            responseFormat: { type: 'json_object' },
            temperature: 0.2,
            maxTokens: 200,
          }
        );

        if (!content) return null;

        const result = JSON.parse(content);

        if (result.isSelection && result.selectedGoalId) {
          logger.info(
            {
              domainId: this.domainId,
              selectedIndex: result.selectedIndex,
              goalId: result.selectedGoalId,
            },
            'Goal selection parsed via LLM'
          );

          const data: GoalData = {
            action: 'goal_selected',
            goalId: result.selectedGoalId,
            selection: result.selectedIndex || message,
            pendingContext: {
              originalAction: 'log_progress',
              goalOptions: options,
              pendingValue,
            },
            progressValue: pendingValue,
            confidence: result.confidence || 0.9,
          };

          return {
            domainId: this.domainId,
            timestamp: new Date(),
            data,
            confidence: result.confidence || 0.9,
          };
        }
      } catch (error) {
        logger.error({ error }, 'Failed to parse goal selection via LLM');
      }
    }

    return null;
  }

  /**
   * Extract progress intent from message using LLM
   */
  private async extractGoalIntent(
    message: string,
    context: ExtractionContext
  ): Promise<GoalData | null> {

    const prompt = this.buildExtractionPrompt(message, context);

    try {
      // Use llmService.generateFromMessages like BaseExtractor does
      const content = await llmService.generateFromMessages(
        [
          {
            role: 'system',
            content: prompt + '\n\nReturn your response as valid JSON matching the expected schema.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.3,
          maxTokens: 500,
        }
      );

      if (!content) return null;

      // Parse JSON response
      const parsed = JSON.parse(content);

      // Don't extract if action is null or confidence is too low
      if (!parsed || !parsed.action || parsed.confidence < 0.3) return null;

      return parsed as GoalData;
    } catch (error) {
      logger.error({ error }, 'Failed to extract progress data via LLM');
      return null;
    }
  }

  /**
   * Validate and transform extracted data
   */
  protected validateAndTransform(data: any): ExtractedData {
    try {
      const validated = GoalDataSchema.parse(data);
      return {
        domainId: this.domainId,
        timestamp: new Date(),
        data: validated,
        confidence: validated.confidence || 0.8,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to validate progress data');
      // Return empty extraction with zero confidence
      return {
        domainId: this.domainId,
        timestamp: new Date(),
        data: {},
        confidence: 0,
      };
    }
  }

  /**
   * Build extraction prompt for LLM
   */
  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    const goalContext = context.domainContext as GoalContext;

    return `Extract goal and progress tracking information from this message.

User message: "${message}"

Recent conversation:
${context.recentMessages
  .slice(-3)
  .map(m => `${m.role}: ${m.content}`)
  .join('\n')}

${goalContext?.activeGoals ? `
Active goals:
${goalContext.activeGoals
  .map((g, i) => `${i + 1}. ${g.title} (${g.currentValue || 0}/${g.targetValue || '?'} ${g.unit || ''})`)
  .join('\n')}
` : ''}

Determine the action type:
- set_goal: User wants to create/set a new goal (e.g., "I want to read 12 books", "My goal is to exercise more")
- log_progress: User is reporting progress on a goal (e.g., "I finished 3 books", "I exercised 30 minutes")
- view_goals: User wants to see their goals (e.g., "Show my goals", "What are my goals?")
- check_progress: User wants analytics/trends (e.g., "How am I doing?", "Check my progress")
- update_goal: User wants to modify a goal (e.g., "Change my reading goal to 15 books")

Extract relevant details:
- For set_goal: goalTitle (required), targetValue, progressUnit, goalCategory, targetDate
- For log_progress: progressValue (required), progressNotes, goalId (if clear which goal)
- For view_goals: no additional fields needed
- For check_progress: goalId (if specific goal mentioned)
- For update_goal: goalId, new values

IMPORTANT: If the message IS related to goals/progress, you MUST return a valid JSON with an action field.
If the message is NOT related to goals/progress, return: {"action": null, "confidence": 0}

Examples:
- "I want to read 12 books this year" → {"action": "set_goal", "goalTitle": "Read 12 books this year", "targetValue": 12, "progressUnit": "books", "confidence": 0.95}
- "I finished reading 3 books" → {"action": "log_progress", "progressValue": 3, "progressUnit": "books", "confidence": 0.9}
- "Show me my goals" → {"action": "view_goals", "confidence": 0.95}

If the user is reporting progress but the goal is ambiguous (multiple possible goals), still extract with action="log_progress" but leave goalId empty.`;
  }

}