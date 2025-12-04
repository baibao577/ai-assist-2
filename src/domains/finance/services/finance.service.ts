/**
 * Finance Domain Service
 *
 * Handles financial data operations with support for multi-step interactions
 */

import { logger } from '@/core/logger.js';
import { agentStateService } from '@/services/agent-state.service.js';
import type { FinanceData } from '../schemas/finance.schema.js';

export interface FinanceOperationResult {
  success: boolean;
  message: string;
  needsClarification?: boolean;
  clarificationPrompt?: string;
  data?: any;
}

export class FinanceService {
  /**
   * Add a transaction with account disambiguation
   */
  async addTransaction(
    userId: string,
    amount: number,
    description: string,
    conversationId?: string
  ): Promise<FinanceOperationResult> {
    logger.info({ userId, amount, description }, 'Adding transaction');

    // Simulate multiple accounts that could match
    const possibleAccounts = [
      { id: 'acc_checking_001', name: 'Checking Account', balance: 5000 },
      { id: 'acc_savings_001', name: 'Savings Account', balance: 10000 },
      { id: 'acc_credit_001', name: 'Credit Card', balance: -1500 },
    ];

    // If ambiguous (e.g., user didn't specify account), ask for clarification
    if (!description.toLowerCase().includes('checking') &&
        !description.toLowerCase().includes('savings') &&
        !description.toLowerCase().includes('credit')) {

      if (conversationId) {
        // Save state for later resolution
        const stateData = {
          accounts: possibleAccounts.map((acc, index) => ({
            index: index + 1,
            id: acc.id,
            name: acc.name,
            balance: acc.balance,
          })),
          pendingAmount: amount,
          pendingDescription: description,
          userId,
        };

        await agentStateService.saveState(
          conversationId,
          'finance',
          'account_selection_pending',
          stateData,
          300 // 5 minutes TTL
        );
      }

      return {
        success: false,
        needsClarification: true,
        clarificationPrompt: this.formatAccountSelectionPrompt(possibleAccounts, amount),
        message: 'Please specify which account for this transaction.',
      };
    }

    // Process transaction directly if account is clear
    return {
      success: true,
      message: `Transaction of $${amount} recorded successfully.`,
      data: { amount, description },
    };
  }

  /**
   * Format account selection prompt
   */
  private formatAccountSelectionPrompt(accounts: any[], amount: number): string {
    const lines = ['💰 **Account Selection Required**'];
    lines.push('Which account is this transaction for?');

    accounts.forEach((acc, index) => {
      lines.push(`${index + 1}. ${acc.name} (Balance: $${acc.balance})`);
    });

    lines.push('');
    lines.push(`Transaction amount: $${amount}`);
    lines.push('Please respond with the number or account name.');

    return lines.join('\n');
  }

  /**
   * Process transaction after account selection
   */
  async processSelectedTransaction(
    userId: string,
    accountId: string,
    amount: number,
    description: string
  ): Promise<FinanceOperationResult> {
    logger.info({ userId, accountId, amount }, 'Processing transaction with selected account');

    // Here you would save to database
    return {
      success: true,
      message: `Transaction of $${amount} recorded to account ${accountId}.`,
      data: { accountId, amount, description },
    };
  }
}

export const financeService = new FinanceService();