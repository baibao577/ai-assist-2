// Finance Extractor - Extracts finance-related information from messages
import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';
import { financeExtractionSchema, type FinanceData } from '../schemas/finance.schema.js';
import type { ExtractedData, ExtractionContext } from '@/core/domains/types.js';

/**
 * Extractor for financial information
 * Identifies transactions, budgets, goals, investments, debt, and financial concerns
 */
export class FinanceExtractor extends BaseExtractor {
  domainId = 'finance';
  schema = financeExtractionSchema;

  /**
   * Build the extraction prompt for finance data
   */
  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    const recentContext = context.recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

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
      ([_, value]) => value !== null && value !== undefined &&
      (Array.isArray(value) ? value.length > 0 :
       typeof value === 'object' ? Object.values(value).some(v => v !== null && v !== undefined) : true)
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