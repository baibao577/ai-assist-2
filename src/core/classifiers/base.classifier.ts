// Base classifier with common LLM logic

import { logger } from '@/core/logger.js';
import { llmService } from '@/core/llm.service.js';
import type { IClassifier, ClassificationResult } from '@/types/classifiers.js';

export abstract class BaseClassifier<TInput, TResult extends ClassificationResult>
  implements IClassifier<TInput, TResult>
{
  abstract readonly name: string;

  /**
   * Main classification method - must be implemented by subclasses
   */
  abstract classify(input: TInput): Promise<TResult>;

  /**
   * Build LLM prompt for classification
   */
  protected abstract buildPrompt(input: TInput): string;

  /**
   * Parse LLM response into result type
   */
  protected abstract parseResponse(response: string): TResult;

  /**
   * Get fallback result when classification fails
   */
  protected abstract getFallback(): TResult;

  /**
   * Call LLM for classification
   */
  protected async callLLM(
    input: TInput,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<TResult> {
    const startTime = Date.now();

    try {
      const prompt = this.buildPrompt(input);

      logger.debug(
        {
          classifier: this.name,
          promptLength: prompt.length,
        },
        `${this.name}: Calling LLM`
      );

      const response = await llmService.generateResponse([], prompt, {
        maxTokens: options.maxTokens ?? 300,
        temperature: options.temperature ?? 0.3,
      });

      const result = this.parseResponse(response);
      const duration = Date.now() - startTime;

      logger.info(
        {
          classifier: this.name,
          duration,
          confidence: result.confidence,
        },
        `${this.name}: Classification complete`
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(
        {
          classifier: this.name,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `${this.name}: Classification failed, using fallback`
      );

      return this.getFallback();
    }
  }

  /**
   * Parse JSON response from LLM
   */
  protected parseJSON<T>(response: string): T {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try to extract JSON from plain text
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(response.substring(jsonStart, jsonEnd + 1));
      }

      // Try parsing entire response
      return JSON.parse(response);
    } catch (error) {
      logger.error(
        {
          classifier: this.name,
          response: response.substring(0, 200),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `${this.name}: Failed to parse JSON response`
      );

      throw new Error(`Failed to parse JSON response: ${error}`);
    }
  }
}
