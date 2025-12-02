// Goal Planning Strategy - Helps users with financial goals and savings
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';
import type { FinanceData } from '../schemas/finance.schema.js';

/**
 * Strategy for helping with financial goals and savings plans
 */
export class GoalPlanningStrategy extends BaseSteeringStrategy {
  strategyId = 'finance_goal_planning';
  priority = 0.7; // Medium-high priority

  /**
   * Apply when user discusses financial goals, savings, or investments
   */
  shouldApply(state: ConversationState): boolean {
    // Check if recent extraction has goals or investment data
    const recentFinance = state.extractions?.finance?.[state.extractions.finance.length - 1];
    if (!recentFinance) return false;

    const financeData = recentFinance.data as FinanceData;

    // Check for goals
    const hasGoals = financeData.goals && financeData.goals.length > 0;

    // Check for investments
    const hasInvestments =
      financeData.investments !== null && financeData.investments !== undefined;

    // Check for savings discussions in income
    const discussingSavings =
      financeData.income &&
      state.messages?.some(
        (m) =>
          m.content.toLowerCase().includes('save') || m.content.toLowerCase().includes('saving')
      );

    return hasGoals || hasInvestments || discussingSavings || false;
  }

  /**
   * Generate goal planning hints
   */
  async generateHints(state: ConversationState): Promise<SteeringHints> {
    this.logActivation(state, 'Goal planning triggered');

    const recentFinance = state.extractions?.finance?.[state.extractions.finance.length - 1];
    const financeData = recentFinance?.data as FinanceData;

    const suggestions = this.buildGoalSuggestions(financeData);

    return {
      type: 'goal_planning',
      suggestions: suggestions.slice(0, 3),
      context: {
        goalsCount: financeData.goals?.length || 0,
        hasInvestments: !!financeData.investments,
        totalGoalAmount: this.calculateTotalGoalAmount(financeData),
      },
      priority: this.priority,
    };
  }

  /**
   * Build goal-specific suggestions
   */
  private buildGoalSuggestions(financeData: FinanceData): string[] {
    const suggestions: string[] = [];

    // Analyze existing goals
    if (financeData.goals && financeData.goals.length > 0) {
      for (const goal of financeData.goals) {
        // Check progress
        if (goal.currentAmount !== null && goal.currentAmount !== undefined) {
          const progress = (goal.currentAmount / goal.targetAmount) * 100;
          if (progress < 25) {
            suggestions.push(
              `You're at ${progress.toFixed(0)}% of your ${goal.name} goal. What's your savings strategy?`
            );
          } else if (progress > 75) {
            suggestions.push(
              `Great progress on ${goal.name}! You're ${(100 - progress).toFixed(0)}% away from your target.`
            );
          }
        } else {
          suggestions.push(`How much have you saved so far for your ${goal.name} goal?`);
        }

        // Check deadlines
        if (goal.deadline) {
          suggestions.push(
            `What's your monthly savings plan to reach your ${goal.name} goal by ${goal.deadline}?`
          );
        } else {
          suggestions.push(`When would you like to achieve your ${goal.name} goal?`);
        }

        // Priority-based suggestions
        if (goal.priority === 'high') {
          suggestions.push(
            `Since ${goal.name} is a high priority, should we create a dedicated savings plan?`
          );
        }
      }
    } else {
      // No goals set yet
      suggestions.push('What financial goals are you working towards?');
      suggestions.push('Would you like help setting up a savings goal?');
    }

    // Investment suggestions
    if (financeData.investments) {
      if (financeData.investments.riskTolerance) {
        suggestions.push(
          `With your ${financeData.investments.riskTolerance} risk tolerance, are you comfortable with your current portfolio?`
        );
      }

      if (financeData.investments.portfolio && financeData.investments.portfolio.length > 0) {
        suggestions.push('How often do you review and rebalance your investment portfolio?');
      } else {
        suggestions.push(
          'Have you considered starting an investment portfolio for long-term goals?'
        );
      }
    }

    // Income vs goals analysis
    if (financeData.income && financeData.goals && financeData.goals.length > 0) {
      suggestions.push('What percentage of your income are you able to save each month?');
      suggestions.push('Would you like help calculating how much to save monthly for your goals?');
    }

    // General goal planning
    suggestions.push('Have you considered setting up automatic transfers for your savings goals?');
    suggestions.push('Would you like tips on increasing your savings rate?');

    return suggestions;
  }

  /**
   * Calculate total amount needed for all goals
   */
  private calculateTotalGoalAmount(data: FinanceData): number {
    if (!data.goals) return 0;

    return data.goals.reduce((total, goal) => {
      const remaining = goal.targetAmount - (goal.currentAmount || 0);
      return total + Math.max(0, remaining);
    }, 0);
  }
}
