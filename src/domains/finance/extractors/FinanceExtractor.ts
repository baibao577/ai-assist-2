// Finance Extractor - Extracts finance-related information from messages
import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';
import { financeExtractionSchema, type FinanceData } from '../schemas/finance.schema.js';
import type { ExtractedData, ExtractionContext } from '@/core/domains/types.js';
import { agentStateService } from '@/services/agent-state.service.js';
import { llmService } from '@/core/llm.service.js';
import { logger } from '@/core/logger.js';

/**
 * Extractor for financial information
 * Identifies transactions, budgets, goals, investments, debt, and financial concerns
 */
export class FinanceExtractor extends BaseExtractor {
  domainId = 'finance';
  schema = financeExtractionSchema;

  /**
   * Main extraction method - check for pending states first
   */
  async extract(message: string, context: ExtractionContext): Promise<ExtractedData | null> {
    logger.info({ domainId: this.domainId, message }, 'FinanceExtractor.extract called');

    try {
      // First, check if this is a response to an account clarification
      const clarificationData = await this.checkForAccountSelection(message, context);
      if (clarificationData) {
        logger.info({ domainId: this.domainId }, 'Account selection response detected');
        return clarificationData;
      }

      // Otherwise, extract using base class logic
      return await super.extract(message, context);
    } catch (error) {
      logger.error({ error, domainId: this.domainId }, 'Failed to extract finance data');
      return null;
    }
  }

  /**
   * Check if message is a response to pending account selection
   */
  private async checkForAccountSelection(
    message: string,
    context: ExtractionContext
  ): Promise<ExtractedData | null> {
    const conversationId = context.conversationId || context.userId || 'default';
    const pendingState = await agentStateService.getState(
      conversationId,
      'finance',
      'account_selection_pending'
    );

    if (pendingState) {
      interface PendingAccountState {
        accounts: Array<{
          index: number;
          id: string;
          name: string;
          balance: number;
        }>;
        pendingAmount: number;
        pendingDescription: string;
        userId: string;
      }
      const { accounts, pendingAmount, pendingDescription } = pendingState as PendingAccountState;

      // Use LLM to understand if this is an account selection
      const selectionPrompt = `The user was asked about ACCOUNT SELECTION with this prompt:
"💰 **Account Selection Required**
Which account is this transaction for?
${accounts.map((a) => `${a.index}. ${a.name} (Balance: $${a.balance})`).join('\n')}

Transaction amount: $${pendingAmount}
Please respond with the number or account name."

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

Determine if this response is answering the ACCOUNT SELECTION question above.
Consider:
- Is the response a number/selection that makes sense for these specific accounts?
- Does the context suggest they're answering this finance question vs something else?
- Could this be a response to a different domain's question (e.g., goals, health)?

Return JSON with:
{
  "isSelection": true/false,
  "selectedIndex": 1-based index or null,
  "confidence": 0-1,
  "reasoning": "brief explanation"
}`;

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
          const selectedAccount = accounts.find((a) => a.index === result.selectedIndex);
          if (selectedAccount) {
            logger.info(
              {
                domainId: this.domainId,
                selectedIndex: result.selectedIndex,
                accountId: selectedAccount.id,
                message,
              },
              'Account selection parsed via LLM'
            );

            // Create a transaction with the selected account
            const data: FinanceData = {
              transactions: [
                {
                  type: pendingAmount < 0 ? 'expense' : 'income',
                  amount: Math.abs(pendingAmount),
                  currency: 'USD',
                  description: `${pendingDescription} (${selectedAccount.name})`,
                  category: null,
                  date: new Date().toISOString(),
                },
              ],
              selectedAccountId: selectedAccount.id,
              budget: null,
              goals: null,
              investments: null,
              debt: null,
              concerns: null,
              income: null,
            };

            // Resolve the agent state
            await agentStateService.resolveState(
              conversationId,
              'finance',
              'account_selection_pending'
            );

            return {
              domainId: this.domainId,
              timestamp: new Date(),
              data,
              confidence: result.confidence || 0.9,
            };
          }
        }
      } catch (error) {
        logger.error({ error }, 'Failed to parse account selection via LLM');
      }
    }

    return null;
  }

  /**
   * Build the extraction prompt for finance data
   */
  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    const recentContext = context.recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n');

    return `You are a financial information extractor. Extract finance-related information from the user's message into the EXACT JSON structure below.

Recent conversation context:
${recentContext}

Current message to analyze: "${message}"

Return a JSON object with this EXACT structure (use null for missing fields):
{
  "transactions": [
    {
      "type": "income | expense | transfer",
      "amount": "number",
      "currency": "string (default USD)",
      "description": "string",
      "category": "string (optional)",
      "date": "string (optional)"
    }
  ],
  "budget": {
    "total": "number",
    "period": "daily | weekly | monthly | yearly",
    "categories": [
      {
        "name": "string",
        "amount": "number",
        "spent": "number (optional)"
      }
    ]
  },
  "goals": [
    {
      "name": "string",
      "targetAmount": "number",
      "currentAmount": "number (optional)",
      "deadline": "string (optional)",
      "priority": "low | medium | high"
    }
  ],
  "investments": {
    "portfolio": [
      {
        "type": "string (stocks, bonds, crypto, etc.)",
        "value": "number",
        "change": "number (recent change)"
      }
    ],
    "totalValue": "number",
    "riskTolerance": "conservative | moderate | aggressive"
  },
  "debt": [
    {
      "type": "string (credit card, loan, mortgage)",
      "amount": "number",
      "interestRate": "number (percentage)",
      "minimumPayment": "number"
    }
  ],
  "concerns": [
    {
      "topic": "string",
      "severity": "minor | moderate | major",
      "details": "string (optional)"
    }
  ],
  "income": {
    "amount": "number",
    "frequency": "hourly | weekly | biweekly | monthly | yearly",
    "sources": ["array of income sources"]
  }
}

Guidelines:
- Extract all monetary amounts as numbers (without currency symbols)
- Default to USD if currency not specified
- For transactions: "spent $50 on groceries" = expense, "got paid $2000" = income
- For concerns: minor = small worry, moderate = significant concern, major = serious financial stress
- Only include fields that are explicitly mentioned
- If NO financial information is present, return empty object: {}`;
  }

  /**
   * Validate and transform the extracted finance data
   */
  protected validateAndTransform(data: FinanceData): ExtractedData {
    // Count how many top-level fields have data
    const fieldsWithData = Object.entries(data).filter(
      ([_, value]) =>
        value !== null &&
        value !== undefined &&
        (Array.isArray(value)
          ? value.length > 0
          : typeof value === 'object'
            ? Object.values(value).some((v) => v !== null && v !== undefined)
            : true)
    ).length;

    // Calculate confidence based on data completeness and quality
    let confidence = 0;
    if (fieldsWithData > 0) {
      // Base confidence starts at 0.6 if we have any data
      confidence = 0.6;

      // Add confidence for multiple fields
      confidence += Math.min(0.3, fieldsWithData * 0.1);

      // Add confidence for detailed data
      if (data.transactions?.some((t) => t.category && t.date)) {
        confidence += 0.05;
      }
      if (data.goals?.some((g) => g.currentAmount !== null && g.deadline)) {
        confidence += 0.05;
      }
    }

    // Ensure confidence is between 0 and 1
    confidence = Math.min(1.0, Math.max(0, confidence));

    // Add metadata to transactions if present
    if (data.transactions && data.transactions.length > 0) {
      data.transactions = data.transactions.map((transaction) => ({
        ...transaction,
        recordedAt: new Date().toISOString(),
      }));
    }

    return {
      domainId: this.domainId,
      timestamp: new Date(),
      data,
      confidence,
    };
  }
}
