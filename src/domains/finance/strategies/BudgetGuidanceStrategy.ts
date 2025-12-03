// Budget Guidance Strategy - Helps users with budgeting and expense tracking
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';
import type { FinanceData } from '../schemas/finance.schema.js';

/**
 * Strategy for providing budget guidance and expense tracking help
 */
export class BudgetGuidanceStrategy extends BaseSteeringStrategy {
  strategyId = 'finance_budget_guidance';
  priority = 0.8; // High priority for budget discussions

  /**
   * Apply when user discusses expenses, budgeting, or spending
   */
  shouldApply(state: ConversationState): boolean {
    // Check if recent extraction has budget or expense data
    const recentFinance = state.extractions?.finance?.[state.extractions.finance.length - 1];
    if (!recentFinance) return false;

    const financeData = recentFinance.data as FinanceData;

    // Check for budget discussions
    const hasBudgetData = financeData.budget !== null && financeData.budget !== undefined;

    // Check for expense transactions
    const hasExpenses = financeData.transactions?.some((t) => t.type === 'expense');

    // Check for overspending concerns
    const hasSpendingConcerns = financeData.concerns?.some(
      (c) =>
        (c.topic || "").toLowerCase().includes('spend') ||
        (c.topic || "").toLowerCase().includes('budget') ||
        (c.topic || "").toLowerCase().includes('expense')
    );

    return hasBudgetData || hasExpenses || hasSpendingConcerns || false;
  }

  /**
   * Generate budget guidance hints
   */
  async generateHints(state: ConversationState): Promise<SteeringHints> {
    this.logActivation(state, 'Budget guidance triggered');

    const recentFinance = state.extractions?.finance?.[state.extractions.finance.length - 1];
    const financeData = recentFinance?.data as FinanceData;

    const suggestions = this.buildBudgetSuggestions(financeData);

    return {
      type: 'budget_guidance',
      suggestions: this.prioritizeSuggestions(suggestions).slice(0, 3),
      context: {
        hasBudget: !!financeData.budget,
        recentExpenses: financeData.transactions?.filter((t) => t.type === 'expense').length || 0,
        categories: this.extractCategories(financeData),
      },
      priority: this.priority,
    };
  }

  /**
   * Build budget-specific suggestions
   */
  private buildBudgetSuggestions(financeData: FinanceData): string[] {
    const suggestions: string[] = [];

    // If they have expenses but no budget
    if (financeData.transactions?.some((t) => t.type === 'expense') && !financeData.budget) {
      suggestions.push('Would you like help creating a budget based on your expenses?');
      suggestions.push("What's your target monthly spending limit?");
    }

    // If they have a budget, help track it
    if (financeData.budget) {
      if (financeData.budget.categories && financeData.budget.categories.length > 0) {
        // Check which categories might be overspent
        const overspent = financeData.budget.categories.filter(
          (c) => c.spent && c.spent > (c.amount || 0)
        );
        if (overspent.length > 0) {
          suggestions.push(
            `I notice you're over budget in ${overspent[0].name}. Would you like suggestions for cutting back?`
          );
        }
      } else {
        suggestions.push('Would you like to break down your budget into categories?');
      }

      suggestions.push('How are you tracking your daily expenses?');
    }

    // Analyze expense patterns
    if (financeData.transactions && financeData.transactions.length > 0) {
      const expenses = financeData.transactions.filter((t) => t.type === 'expense');

      // Check for categories
      const uncategorized = expenses.filter((e) => !e.category);
      if (uncategorized.length > 0) {
        suggestions.push('Would you like help categorizing your expenses for better tracking?');
      }

      // Large expenses
      const avgAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0) / expenses.length;
      const largeExpenses = expenses.filter((e) => (e.amount || 0) > avgAmount * 2);
      if (largeExpenses.length > 0) {
        suggestions.push(
          `That ${largeExpenses[0].description} was a significant expense. Was it planned?`
        );
      }
    }

    // Financial concerns
    if (financeData.concerns && financeData.concerns.length > 0) {
      for (const concern of financeData.concerns) {
        if (concern.severity === 'major') {
          suggestions.push(
            `You mentioned concerns about ${concern.topic}. What's your biggest challenge with this?`
          );
          suggestions.push(
            'Would you like help creating a plan to address this financial concern?'
          );
        }
      }
    }

    // General budget tips
    suggestions.push('Have you tried the 50/30/20 budgeting rule?');
    suggestions.push('Would you like tips for reducing expenses in any particular area?');
    suggestions.push('Are there any subscriptions or recurring expenses you could cut?');

    return suggestions;
  }

  /**
   * Extract spending categories from finance data
   */
  private extractCategories(data: FinanceData): string[] {
    const categories = new Set<string>();

    if (data.transactions) {
      for (const t of data.transactions) {
        if (t.category) categories.add(t.category);
      }
    }

    if (data.budget?.categories) {
      for (const c of data.budget.categories) {
        if (c.name) {
          categories.add(c.name);
        }
      }
    }

    return Array.from(categories);
  }

  /**
   * Prioritize suggestions based on urgency
   */
  private prioritizeSuggestions(suggestions: string[]): string[] {
    return suggestions.sort((a, b) => {
      // Prioritize creating budgets
      if (a.includes('creating a budget')) return -1;
      if (b.includes('creating a budget')) return 1;

      // Prioritize overspending
      if (a.includes('over budget')) return -1;
      if (b.includes('over budget')) return 1;

      // Prioritize major concerns
      if (a.includes('biggest challenge')) return -1;
      if (b.includes('biggest challenge')) return 1;

      return 0;
    });
  }
}
