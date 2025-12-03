/**
 * Goal Service
 *
 * Centralizes all business logic for goal management.
 * Handles creation, updates, progress logging, and analytics.
 * This service is used by the TrackProgressHandler to execute
 * goal-related operations based on domain extractions.
 */

import { goalRepository, progressRepository } from '@/database/repositories/index.js';
import type { Goal, ProgressEntry, NewGoal } from '@/database/schema.js';
import type { GoalData } from '../schemas/goal.schema.js';
import { logger } from '@/core/logger.js';

export interface GoalOperationResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface GoalAnalytics {
  goalId: string;
  title: string;
  progress: number;
  progressPercentage: number;
  daysActive: number;
  averageProgressPerDay: number;
  estimatedCompletionDate?: Date;
  recentEntries: ProgressEntry[];
}

export class GoalService {
  /**
   * Create a new goal with duplicate prevention
   */
  async createGoal(
    userId: string,
    goalData: Partial<GoalData>
  ): Promise<GoalOperationResult> {
    try {
      // Check for similar existing goals
      const existingGoals = await goalRepository.getActiveGoals(userId);
      const similarGoal = this.findSimilarGoal(goalData.goalTitle || '', existingGoals);

      if (similarGoal) {
        return {
          success: false,
          message: `You already have a similar goal: "${similarGoal.title}". Would you like to update it instead?`,
          data: { existingGoal: similarGoal }
        };
      }

      // Create new goal - using correct schema fields
      const newGoalData: Omit<NewGoal, 'id' | 'createdAt'> = {
        userId,
        title: goalData.goalTitle || 'Untitled Goal',
        description: null,
        targetValue: goalData.targetValue || null,
        currentValue: goalData.baselineValue || 0,
        unit: goalData.progressUnit || null,
        category: goalData.goalCategory || 'general',
        status: 'active',
        targetDate: goalData.targetDate ? new Date(goalData.targetDate) : null,
        baselineValue: goalData.baselineValue || null,
        conversationId: null,
        completedAt: null,
        lastProgressAt: null,
        metadata: null
      };

      const createdGoal = await goalRepository.create(newGoalData);

      return {
        success: true,
        message: this.formatGoalCreationMessage(createdGoal),
        data: { goal: createdGoal }
      };
    } catch (error) {
      logger.error({ error, userId, goalData }, 'Failed to create goal');
      return {
        success: false,
        message: 'Failed to create goal. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Log progress for a goal
   */
  async logProgress(
    userId: string,
    goalId: string,
    value: number,
    notes?: string
  ): Promise<GoalOperationResult> {
    try {
      // Get the goal
      const goal = await goalRepository.findById(goalId);
      if (!goal || goal.userId !== userId) {
        return {
          success: false,
          message: 'Goal not found or access denied.'
        };
      }

      // Log progress using the repository's logProgress method
      const progressEntry = await progressRepository.logProgress({
        goalId,
        value,
        notes: notes || null,
        source: 'manual',
        conversationId: null,
        metadata: null
      });

      // Update goal's current value
      const newCurrentValue = (goal.currentValue || 0) + value;
      await goalRepository.updateProgress(goalId, newCurrentValue);

      // Check if goal is achieved
      if (goal.targetValue && newCurrentValue >= goal.targetValue) {
        await goalRepository.completeGoal(goalId);

        return {
          success: true,
          message: this.formatGoalAchievedMessage(goal, newCurrentValue),
          data: { goal, progressEntry, achieved: true }
        };
      }

      // Format progress message
      return {
        success: true,
        message: this.formatProgressMessage(goal, value, newCurrentValue),
        data: { goal, progressEntry, newCurrentValue }
      };
    } catch (error) {
      logger.error({ error, userId, goalId, value }, 'Failed to log progress');
      return {
        success: false,
        message: 'Failed to log progress. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Select the most appropriate goal for progress logging
   */
  async selectGoalForProgress(
    userId: string,
    message: string,
    value: number
  ): Promise<GoalOperationResult> {
    try {
      const activeGoals = await goalRepository.getActiveGoals(userId);

      if (activeGoals.length === 0) {
        return {
          success: false,
          message: 'You don\'t have any active goals. Would you like to create one?',
          data: { needsGoalCreation: true }
        };
      }

      // Score goals based on relevance to message
      const scoredGoals = this.scoreGoalsForMessage(message, activeGoals);

      // If multiple goals have the same high score, ask for clarification
      const topScore = Math.max(...scoredGoals.map(g => g.score));
      const topGoals = scoredGoals.filter(g => g.score === topScore);

      if (topGoals.length > 1) {
        return {
          success: false,
          message: this.formatGoalSelectionPrompt(topGoals.map(g => g.goal), value),
          data: {
            needsClarification: true,
            goals: topGoals.map(g => g.goal),
            pendingValue: value
          }
        };
      }

      // Single best match found
      const selectedGoal = topGoals[0].goal;
      return await this.logProgress(userId, selectedGoal.id, value);
    } catch (error) {
      logger.error({ error, userId, message }, 'Failed to select goal for progress');
      return {
        success: false,
        message: 'Failed to process progress. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user's goals with optional filtering
   */
  async getGoals(
    userId: string,
    filter: 'active' | 'completed' | 'all' = 'active'
  ): Promise<GoalOperationResult> {
    try {
      let goals: Goal[];

      switch (filter) {
        case 'active':
          goals = await goalRepository.getActiveGoals(userId);
          break;
        case 'completed':
          goals = await goalRepository.getAllGoals(userId, { status: 'completed' });
          break;
        case 'all':
        default:
          goals = await goalRepository.getAllGoals(userId);
          break;
      }

      if (goals.length === 0) {
        return {
          success: true,
          message: this.formatNoGoalsMessage(filter),
          data: { goals: [] }
        };
      }

      return {
        success: true,
        message: this.formatGoalsList(goals, filter),
        data: { goals }
      };
    } catch (error) {
      logger.error({ error, userId, filter }, 'Failed to get goals');
      return {
        success: false,
        message: 'Failed to retrieve goals. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze progress and provide insights
   */
  async analyzeProgress(userId: string, goalId?: string): Promise<GoalOperationResult> {
    try {
      const goals = goalId
        ? [await goalRepository.findById(goalId)].filter(Boolean) as Goal[]
        : await goalRepository.getActiveGoals(userId);

      if (goals.length === 0) {
        return {
          success: false,
          message: 'No goals found to analyze.'
        };
      }

      const analytics: GoalAnalytics[] = [];

      for (const goal of goals) {
        const entries = await progressRepository.getProgressEntries(goal.id, { limit: 10 });
        const analysis = await this.calculateGoalAnalytics(goal, entries);
        analytics.push(analysis);
      }

      return {
        success: true,
        message: this.formatAnalyticsMessage(analytics),
        data: { analytics }
      };
    } catch (error) {
      logger.error({ error, userId, goalId }, 'Failed to analyze progress');
      return {
        success: false,
        message: 'Failed to analyze progress. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update an existing goal
   */
  async updateGoal(
    userId: string,
    goalId: string,
    updates: Partial<Goal>
  ): Promise<GoalOperationResult> {
    try {
      const goal = await goalRepository.findById(goalId);
      if (!goal || goal.userId !== userId) {
        return {
          success: false,
          message: 'Goal not found or access denied.'
        };
      }

      await goalRepository.update(goalId, updates);

      const updatedGoal = await goalRepository.findById(goalId);

      return {
        success: true,
        message: `Goal "${updatedGoal?.title}" has been updated successfully.`,
        data: { goal: updatedGoal }
      };
    } catch (error) {
      logger.error({ error, userId, goalId, updates }, 'Failed to update goal');
      return {
        success: false,
        message: 'Failed to update goal. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Mark a goal as completed
   */
  async completeGoal(userId: string, goalId: string): Promise<GoalOperationResult> {
    try {
      const goal = await goalRepository.findById(goalId);
      if (!goal || goal.userId !== userId) {
        return {
          success: false,
          message: 'Goal not found or access denied.'
        };
      }

      await goalRepository.completeGoal(goalId);
      const completedGoal = await goalRepository.findById(goalId);

      return {
        success: true,
        message: `Goal "${completedGoal?.title}" has been completed! 🎉`,
        data: { goal: completedGoal }
      };
    } catch (error) {
      logger.error({ error, userId, goalId }, 'Failed to complete goal');
      return {
        success: false,
        message: 'Failed to complete goal. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Find similar goal using fuzzy matching
   */
  private findSimilarGoal(title: string, existingGoals: Goal[]): Goal | null {
    if (!title || existingGoals.length === 0) return null;

    const normalizedTitle = title.toLowerCase().trim();

    // Exact match
    const exactMatch = existingGoals.find(
      goal => goal.title.toLowerCase().trim() === normalizedTitle
    );
    if (exactMatch) return exactMatch;

    // 80% word overlap similarity
    const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
    for (const goal of existingGoals) {
      const goalWords = goal.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const matchingWords = titleWords.filter(word =>
        goalWords.some(gWord => gWord.includes(word) || word.includes(gWord))
      );

      const similarity = matchingWords.length / Math.max(titleWords.length, 1);
      if (similarity >= 0.8) return goal;
    }

    return null;
  }

  /**
   * Score goals based on message relevance
   */
  private scoreGoalsForMessage(
    message: string,
    goals: Goal[]
  ): Array<{ goal: Goal; score: number }> {
    const lowerMessage = message.toLowerCase();

    return goals.map(goal => {
      let score = 0;
      const goalTitle = goal.title.toLowerCase();
      const goalWords = goalTitle.split(/\s+/).filter(w => w.length > 2);

      // Check for keyword matches
      for (const word of goalWords) {
        if (lowerMessage.includes(word)) {
          score += 10;
        }
      }

      // Boost score for recently active goals
      const lastProgressDate = goal.lastProgressAt || goal.createdAt;
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(lastProgressDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceActivity < 7) score += 5;
      if (daysSinceActivity < 3) score += 5;

      // Slightly penalize completed goals
      if (goal.status === 'completed') score -= 3;

      return { goal, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate analytics for a goal
   */
  private async calculateGoalAnalytics(
    goal: Goal,
    entries: ProgressEntry[]
  ): Promise<GoalAnalytics> {
    const now = Date.now();
    const createdAt = new Date(goal.createdAt).getTime();
    const daysActive = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24)) || 1;

    const currentValue = goal.currentValue || 0;
    const targetValue = goal.targetValue || 100;
    const progressPercentage = Math.round((currentValue / targetValue) * 100);
    const averageProgressPerDay = currentValue / daysActive;

    // Estimate completion
    let estimatedCompletionDate: Date | undefined;
    if (averageProgressPerDay > 0 && targetValue > currentValue) {
      const daysToCompletion = (targetValue - currentValue) / averageProgressPerDay;
      estimatedCompletionDate = new Date(now + daysToCompletion * 24 * 60 * 60 * 1000);
    }

    return {
      goalId: goal.id,
      title: goal.title,
      progress: currentValue,
      progressPercentage,
      daysActive,
      averageProgressPerDay,
      estimatedCompletionDate,
      recentEntries: entries
    };
  }

  // ============================================================================
  // Message Formatting Methods
  // ============================================================================

  private formatGoalCreationMessage(goal: Goal): string {
    const parts = [`✅ Goal created: "${goal.title}"`];

    if (goal.targetValue) {
      parts.push(`Target: ${goal.targetValue}${goal.unit ? ' ' + goal.unit : ''}`);
    }
    if (goal.targetDate) {
      parts.push(`Deadline: ${new Date(goal.targetDate).toLocaleDateString()}`);
    }

    parts.push('\nStart logging your progress to track your journey!');
    return parts.join('\n');
  }

  private formatProgressMessage(goal: Goal, value: number, newTotal: number): string {
    const progressBar = this.createProgressBar(newTotal, goal.targetValue || 100);
    const percentage = goal.targetValue
      ? Math.round((newTotal / goal.targetValue) * 100)
      : 0;

    return `📊 Progress logged for "${goal.title}"
Added: ${value}${goal.unit ? ' ' + goal.unit : ''}
Current: ${newTotal}${goal.targetValue ? `/${goal.targetValue}` : ''}${goal.unit ? ' ' + goal.unit : ''}
${progressBar} ${percentage}%`;
  }

  private formatGoalAchievedMessage(goal: Goal, finalValue: number): string {
    return `🎉 Congratulations! You've achieved your goal!
"${goal.title}"
Final: ${finalValue}${goal.unit ? ' ' + goal.unit : ''}
Target: ${goal.targetValue}${goal.unit ? ' ' + goal.unit : ''}

Well done on reaching this milestone! 🏆`;
  }

  private formatGoalSelectionPrompt(goals: Goal[], pendingValue: number): string {
    const lines = ['Which goal is this progress for?'];

    goals.forEach((goal, index) => {
      const current = goal.currentValue || 0;
      const target = goal.targetValue || '?';
      const unit = goal.unit || '';
      lines.push(`${index + 1}. ${goal.title} (${current}/${target} ${unit})`);
    });

    lines.push(`\nProgress to log: ${pendingValue}`);
    lines.push('Please respond with the number or a keyword from the goal.');

    return lines.join('\n');
  }

  private formatGoalsList(goals: Goal[], filter: string): string {
    const header = filter === 'active'
      ? '📋 Your Active Goals:'
      : filter === 'completed'
      ? '✅ Your Completed Goals:'
      : '📊 All Your Goals:';

    const lines = [header, ''];

    goals.forEach((goal, index) => {
      const current = goal.currentValue || 0;
      const target = goal.targetValue || '?';
      const unit = goal.unit || '';
      const status = goal.status === 'completed' ? '✅' : '🎯';

      lines.push(`${status} ${index + 1}. ${goal.title}`);
      lines.push(`   Progress: ${current}/${target} ${unit}`);

      if (goal.targetValue) {
        const percentage = Math.round((current / goal.targetValue) * 100);
        const progressBar = this.createProgressBar(current, goal.targetValue);
        lines.push(`   ${progressBar} ${percentage}%`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  private formatNoGoalsMessage(filter: string): string {
    if (filter === 'active') {
      return 'You don\'t have any active goals yet. Would you like to set one?';
    } else if (filter === 'completed') {
      return 'You haven\'t completed any goals yet. Keep working on your active goals!';
    } else {
      return 'You don\'t have any goals yet. Let\'s create your first goal!';
    }
  }

  private formatAnalyticsMessage(analytics: GoalAnalytics[]): string {
    const lines = ['📈 Progress Analytics:', ''];

    for (const analysis of analytics) {
      lines.push(`🎯 ${analysis.title}`);
      lines.push(`   Progress: ${analysis.progress} (${analysis.progressPercentage}%)`);
      lines.push(`   Active for: ${analysis.daysActive} days`);
      lines.push(`   Average/day: ${analysis.averageProgressPerDay.toFixed(2)}`);

      if (analysis.estimatedCompletionDate) {
        lines.push(`   Est. completion: ${analysis.estimatedCompletionDate.toLocaleDateString()}`);
      }

      if (analysis.recentEntries.length > 0) {
        lines.push('   Recent activity:');
        analysis.recentEntries.slice(0, 3).forEach(entry => {
          const date = new Date(entry.loggedAt).toLocaleDateString();
          lines.push(`     • ${date}: +${entry.value}`);
        });
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private createProgressBar(current: number, target: number): string {
    const percentage = Math.min(100, Math.round((current / target) * 100));
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}

// Export singleton instance
export const goalService = new GoalService();