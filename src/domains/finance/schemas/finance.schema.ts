// Finance Domain Schema - Defines the structure of finance-related data
import { z } from 'zod';

/**
 * Schema for finance-related data extraction
 * Covers transactions, budgets, goals, investments, and financial concerns
 */
export const financeExtractionSchema = z.object({
  // Transactions
  transactions: z
    .array(
      z.object({
        type: z.enum(['income', 'expense', 'transfer']).describe('Transaction type'),
        amount: z.number().describe('Transaction amount'),
        currency: z.string().default('USD').describe('Currency code'),
        description: z.string().describe('What the transaction was for'),
        category: z.string().nullable().optional().describe('Category (food, transport, etc.)'),
        date: z.string().nullable().optional().describe('Transaction date'),
      })
    )
    .nullable()
    .optional()
    .describe('Financial transactions mentioned'),

  // Budget information
  budget: z
    .object({
      total: z.number().nullable().optional().describe('Total budget amount'),
      period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable().optional(),
      categories: z
        .array(
          z.object({
            name: z.string(),
            amount: z.number(),
            spent: z.number().nullable().optional(),
          })
        )
        .nullable()
        .optional(),
    })
    .nullable()
    .optional()
    .describe('Budget information'),

  // Financial goals
  goals: z
    .array(
      z.object({
        name: z.string().describe('Goal name'),
        targetAmount: z.number().describe('Target amount to save'),
        currentAmount: z.number().nullable().optional().describe('Current progress'),
        deadline: z.string().nullable().optional().describe('Target date'),
        priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
      })
    )
    .nullable()
    .optional()
    .describe('Financial goals'),

  // Investment information
  investments: z
    .object({
      portfolio: z
        .array(
          z.object({
            type: z.string().describe('Investment type (stocks, bonds, crypto, etc.)'),
            value: z.number().nullable().optional(),
            change: z.number().nullable().optional().describe('Recent change in value'),
          })
        )
        .nullable()
        .optional(),
      totalValue: z.number().nullable().optional(),
      riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).nullable().optional(),
    })
    .nullable()
    .optional()
    .describe('Investment portfolio information'),

  // Debt information
  debt: z
    .array(
      z.object({
        type: z.string().describe('Type of debt (credit card, loan, mortgage)'),
        amount: z.number().describe('Total debt amount'),
        interestRate: z.number().nullable().optional().describe('Interest rate percentage'),
        minimumPayment: z.number().nullable().optional(),
      })
    )
    .nullable()
    .optional()
    .describe('Debt obligations'),

  // Financial concerns
  concerns: z
    .array(
      z.object({
        topic: z.string().describe('What the concern is about'),
        severity: z.enum(['minor', 'moderate', 'major']).describe('How serious'),
        details: z.string().nullable().optional(),
      })
    )
    .nullable()
    .optional()
    .describe('Financial worries or concerns'),

  // Income information
  income: z
    .object({
      amount: z.number().nullable().optional().describe('Income amount'),
      frequency: z
        .enum(['hourly', 'weekly', 'biweekly', 'monthly', 'yearly'])
        .nullable()
        .optional(),
      sources: z.array(z.string()).nullable().optional().describe('Income sources'),
    })
    .nullable()
    .optional()
    .describe('Income information'),
});

/**
 * Type definition for extracted finance data
 */
export type FinanceData = z.infer<typeof financeExtractionSchema>;

/**
 * Helper to check if finance data has meaningful content
 */
export function hasFinanceContent(data: FinanceData): boolean {
  return !!(
    data.transactions?.length ||
    data.budget ||
    data.goals?.length ||
    data.investments ||
    data.debt?.length ||
    data.concerns?.length ||
    data.income
  );
}

/**
 * Helper to calculate financial health score
 */
export function getFinancialHealthScore(data: FinanceData): 'healthy' | 'moderate' | 'concerning' {
  let score = 0;
  let factors = 0;

  // Check debt to income ratio
  if (data.income?.amount && data.debt?.length) {
    const totalDebt = data.debt.reduce((sum, d) => sum + d.amount, 0);
    const annualIncome =
      data.income.frequency === 'yearly'
        ? data.income.amount
        : data.income.frequency === 'monthly'
          ? data.income.amount * 12
          : data.income.frequency === 'biweekly'
            ? data.income.amount * 26
            : data.income.frequency === 'weekly'
              ? data.income.amount * 52
              : data.income.amount * 2080; // hourly * 40 * 52

    const debtRatio = totalDebt / annualIncome;
    if (debtRatio < 0.3) score += 3;
    else if (debtRatio < 0.5) score += 2;
    else score += 1;
    factors++;
  }

  // Check for major concerns
  if (data.concerns?.length) {
    const majorConcerns = data.concerns.filter((c) => c.severity === 'major').length;
    if (majorConcerns === 0) score += 3;
    else if (majorConcerns === 1) score += 2;
    else score += 1;
    factors++;
  }

  // Check if has goals (positive indicator)
  if (data.goals?.length) {
    score += 2;
    factors++;
  }

  // Calculate average score
  const avgScore = factors > 0 ? score / factors : 2;

  if (avgScore >= 2.5) return 'healthy';
  if (avgScore >= 1.5) return 'moderate';
  return 'concerning';
}
