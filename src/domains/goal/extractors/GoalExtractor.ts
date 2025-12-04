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
import { agentStateService } from '@/services/agent-state.service.js';
import { logger } from '@/core/logger.js';
import { GoalDataSchema, type GoalData, type GoalContext } from '../schemas/goal.schema.js';

export class GoalExtractor extends BaseExtractor {
  domainId = 'goal';
  schema = GoalDataSchema;

  /**
   * Main extraction method
   */
  async extract(message: string, context: ExtractionContext): Promise<ExtractedData | null> {
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
        confidence: validated.confidence || 0.5,
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
    // First check if we have a pending state in agent states
    const conversationId = context.conversationId || context.userId || 'default';
    const pendingState = await agentStateService.getState(
      conversationId,
      'goal',
      'selection_pending'
    );

    if (pendingState) {
      // We have a pending state! Use it to understand the selection
      interface PendingGoalState {
        goals: Array<{
          index: number;
          id: string;
          title: string;
          currentValue?: number | null;
          targetValue?: number | null;
          unit?: string | null;
        }>;
        pendingValue?: number;
        originalMessage: string;
        userId: string;
      }
      const { goals, pendingValue } = pendingState as PendingGoalState;

      // Use LLM to understand if this is a selection and which goal was selected
      const selectionPrompt = `The user was asked about GOAL SELECTION with this prompt:
"📊 **Goal Selection Required**
Which goal is this progress for?
${goals.map((g, i) => `${i + 1}. ${g.title}`).join('\n')}

Progress to log: ${pendingValue}
Please respond with the number or a keyword from the goal."

The user responded: "${message}"

${
  context.recentMessages?.length > 0
    ? `Recent conversation context:
${context.recentMessages
  .slice(-2)
  .map((m) => `${m.role}: ${m.content.substring(0, 100)}`)
  .join('\n')}`
    : ''
}

Determine if this response is answering the GOAL SELECTION question above.
Consider:
- Is the response a number/selection that makes sense for these specific goals?
- Does the context suggest they're answering this goal question vs something else?
- Could this be a response to a different domain's question (e.g., finance, health)?

Return JSON with:
{
  "isSelection": true/false,
  "selectedIndex": 1-based index or null,
  "confidence": 0-1,
  "reasoning": "brief explanation"
}

Examples of selection responses:
- "1" or "2" → selecting by number (IF in context of goal selection)
- "first" or "second" → selecting by position
- "books" or "exercise" → selecting by keyword from goal title
- "the reading one" → selecting by description

If unsure or the message seems unrelated to goal selection, return {"isSelection": false, "reasoning": "why not"}.`;

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

        if (result.isSelection && result.selectedIndex) {
          const selectedGoal = goals[result.selectedIndex - 1];
          if (selectedGoal) {
            logger.info(
              {
                domainId: this.domainId,
                selectedIndex: result.selectedIndex,
                goalId: selectedGoal.id,
                message,
              },
              'Goal selection parsed via LLM with agent state'
            );

            const data: GoalData = {
              action: 'goal_selected',
              goalId: selectedGoal.id,
              selection: String(result.selectedIndex),
              progressValue: pendingValue,
              confidence: result.confidence || 0.9,
            };

            // Resolve the agent state
            await agentStateService.resolveState(conversationId, 'goal', 'selection_pending');

            return {
              domainId: this.domainId,
              timestamp: new Date(),
              data,
              confidence: result.confidence || 0.9,
            };
          }
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
          temperature: 0.3,
          maxTokens: 500,
        }
      );

      if (!content) return null;

      // Parse JSON response
      const parsed = JSON.parse(content);

      // Don't extract if action is null or confidence is too low
      if (!parsed || !parsed.action || parsed.confidence < 0.3) {
        logger.debug({ parsed, message }, 'No goal action detected or low confidence');
        return null;
      }

      return parsed as GoalData;
    } catch (error) {
      // More detailed error logging
      if (error instanceof SyntaxError) {
        logger.error({ error, message }, 'Failed to parse JSON from LLM response');
      } else {
        logger.error({ error, message }, 'Failed to extract goal data using LLM');
      }
      return null;
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
  .map((m) => `${m.role}: ${m.content}`)
  .join('\n')}

${
  goalContext?.activeGoals
    ? `
Active goals:
${goalContext.activeGoals
  .map(
    (g, i) =>
      `${i + 1}. ${g.title} (${g.currentValue || 0}/${g.targetValue || '?'} ${g.unit || ''})`
  )
  .join('\n')}
`
    : ''
}

Determine the action type CAREFULLY:

- set_goal: User EXPLICITLY wants to CREATE a NEW goal. Look for phrases like:
  * "Set a goal to...", "Create a goal...", "I want to set a goal..."
  * "My goal is..." (when clearly stating a new goal)
  * Direct statements like "I want to read 12 books this year" (without asking questions)

- log_progress: User is reporting progress on a goal (e.g., "I finished 3 books", "I exercised 30 minutes")

- view_goals: User wants to see their goals (e.g., "Show my goals", "What are my goals?")

- check_progress: User wants analytics/trends OR asking about tracking (e.g., "How am I doing?", "Check my progress", "How can I track...")

- update_goal: User wants to modify an existing goal (e.g., "Change my reading goal to 15 books")

IMPORTANT RULES:
1. If the user is ASKING A QUESTION about goals/tracking (contains "?", "how", "can you help", "explain"), DO NOT create a goal
2. If the user mentions wanting to track something but asks for help/explanation, return check_progress or null
3. Only use set_goal when the user clearly intends to CREATE a goal right now
4. When in doubt, prefer check_progress or null over set_goal

Extract relevant details:
- For set_goal: goalTitle (required), targetValue, progressUnit, goalCategory, targetDate
- For log_progress: progressValue (required), progressNotes, goalId (if clear which goal)
- For view_goals: no additional fields needed
- For check_progress: goalId (if specific goal mentioned)
- For update_goal: goalId, new values

If the message is NOT related to goals/progress, return: {"action": null, "confidence": 0}

Examples:
- "I want to set a goal to read 12 books this year" → {"action": "set_goal", "goalTitle": "Read 12 books this year", "targetValue": 12, "progressUnit": "books", "confidence": 0.95}
- "I want to track my goal of reading 20 books, how does it work?" → {"action": "check_progress", "confidence": 0.7} (asking about tracking, not setting)
- "Can you help me track my reading progress?" → {"action": null, "confidence": 0} (just asking for help)
- "I finished reading 3 books" → {"action": "log_progress", "progressValue": 3, "progressUnit": "books", "confidence": 0.9}
- "Show me my goals" → {"action": "view_goals", "confidence": 0.95}

If the user is reporting progress but the goal is ambiguous (multiple possible goals), still extract with action="log_progress" but leave goalId empty.`;
  }

  /**
   * Validate and transform extracted data
   * Note: This method is not used as we override the main extract method
   */
  protected validateAndTransform(data: unknown): ExtractedData {
    const validated = this.schema.parse(data);
    return {
      domainId: this.domainId,
      timestamp: new Date(),
      data: validated,
      confidence: (validated as GoalData).confidence || 0.5,
    };
  }
}
