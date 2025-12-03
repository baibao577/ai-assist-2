/**
 * Track Progress Mode Handler
 *
 * Thin orchestrator that delegates all business logic to the Goal Domain.
 * Uses GoalService for operations and GoalExtractor for intent detection.
 *
 * MVP v4 - Track Progress feature
 */

import { BaseModeHandler } from './base-handler.js';
import {
  ConversationMode,
  type HandlerContext,
  type HandlerResult,
} from '@/types/index.js';
import { goalService } from '@/domains/goal/services/index.js';
import type { ConversationState } from '@/types/state.js';
import type { GoalData } from '@/domains/goal/schemas/goal.schema.js';
import { logger } from '@/core/logger.js';

export class TrackProgressModeHandler extends BaseModeHandler {
  readonly mode = ConversationMode.TRACK_PROGRESS;

  /**
   * Build the system prompt for Track Progress mode
   */
  protected buildSystemPrompt(context: HandlerContext): string {
    const state = context.state as unknown as ConversationState;
    const goalContext = state?.extractions?.goal;
    const activeGoalsCount = goalContext?.length || 0;

    return `You are a goal and progress tracking assistant helping users set and achieve their goals.

Your responsibilities:
- Help users set SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound)
- Track progress and provide analytics on their goals
- Offer encouragement and insights based on progress trends
- Suggest adjustments when goals need refinement
- Celebrate milestones and achievements appropriately

Current context:
- User has ${activeGoalsCount} active goal(s)
- Focus on making goals actionable and measurable
- Be encouraging but realistic about progress

Guidelines:
1. When setting goals:
   - Help refine vague goals into specific, measurable ones
   - Suggest reasonable timeframes if not provided
   - Recommend breaking large goals into milestones

2. When tracking progress:
   - Acknowledge improvements, no matter how small
   - Provide specific feedback on trends
   - Suggest next steps based on current progress

3. Tone:
   - Supportive and encouraging
   - Data-driven when discussing progress
   - Constructive when suggesting improvements

Remember: You're helping users build sustainable habits and achieve meaningful goals.`;
  }

  /**
   * Handle the message in Track Progress mode
   * Delegates all operations to GoalService based on domain extraction
   */
  async handle(context: HandlerContext): Promise<HandlerResult> {
    try {
      logger.debug(
        { mode: this.mode, userId: context.userId },
        'TrackProgressHandler: Processing message'
      );

      // Get Goal Domain extraction from pipeline
      const goalExtraction = this.getGoalExtraction(context);

      if (!goalExtraction) {
        // No goal-related intent detected, use LLM for general conversation
        logger.debug('TrackProgressHandler: No goal extraction found, using LLM');
        const response = await this.generateResponse(
          this.buildSystemPrompt(context),
          context
        );
        return { response };
      }

      logger.info(
        { action: goalExtraction.action, confidence: goalExtraction.confidence },
        'TrackProgressHandler: Processing goal action'
      );

      // Delegate to GoalService based on action
      const result = await this.processGoalAction(goalExtraction, context);

      return {
        response: result.message,
        stateUpdates: result.data || {},
      };
    } catch (error) {
      logger.error({ error, mode: this.mode }, 'TrackProgressHandler: Error handling message');
      return {
        response: "I encountered an error while processing your goal request. Please try again.",
      };
    }
  }

  /**
   * Process goal action using GoalService
   */
  private async processGoalAction(
    goalData: GoalData,
    context: HandlerContext
  ): Promise<{ message: string; data?: any }> {
    const userId = context.userId;

    switch (goalData.action) {
      case 'set_goal':
        return await goalService.createGoal(userId, goalData);

      case 'log_progress':
        // If we have a specific goal ID, log directly
        if (goalData.goalId) {
          return await goalService.logProgress(
            userId,
            goalData.goalId,
            goalData.progressValue || 0,
            goalData.progressNotes
          );
        }
        // Otherwise, try to select the right goal
        return await goalService.selectGoalForProgress(
          userId,
          context.message,
          goalData.progressValue || 0
        );

      case 'goal_selected':
        // User selected a goal from clarification
        if (goalData.goalId && goalData.progressValue !== undefined) {
          return await goalService.logProgress(
            userId,
            goalData.goalId,
            goalData.progressValue,
            goalData.progressNotes
          );
        }
        return { message: 'Please specify which goal you meant.' };

      case 'view_goals':
        return await goalService.getGoals(userId, 'active');

      case 'check_progress':
        return await goalService.analyzeProgress(userId, goalData.goalId);

      case 'update_goal':
        if (goalData.goalId) {
          const updates: any = {};
          if (goalData.goalTitle) updates.title = goalData.goalTitle;
          if (goalData.targetValue) updates.targetValue = goalData.targetValue;
          if (goalData.targetDate) updates.targetDate = new Date(goalData.targetDate);

          return await goalService.updateGoal(userId, goalData.goalId, updates);
        }
        return { message: 'Please specify which goal you want to update.' };

      case 'clarification_response':
        // This should be handled by domain extractor
        return { message: 'I need more information to help you with that.' };

      default:
        // Use LLM for unrecognized actions
        const response = await this.generateResponse(
          this.buildSystemPrompt(context),
          context
        );
        return { message: response };
    }
  }

  /**
   * Get Goal Domain extraction from context state
   */
  private getGoalExtraction(context: HandlerContext): GoalData | null {
    const state = context.state as unknown as ConversationState;
    if (!state?.extractions?.goal) return null;

    // Get the most recent goal extraction
    const goalExtractions = state.extractions.goal;
    if (goalExtractions.length === 0) return null;

    const latestExtraction = goalExtractions[goalExtractions.length - 1];
    return latestExtraction.data as GoalData;
  }
}

export const trackProgressHandler = new TrackProgressModeHandler();