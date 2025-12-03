// Base Extractor - Abstract class for domain-specific data extraction
import { z } from 'zod';
import OpenAI from 'openai';
import { config } from '@/config/index.js';
import { logger } from '@/core/logger.js';
import type { ExtractedData, ExtractionContext } from '../types.js';

/**
 * Base class for all domain extractors
 * Handles LLM interaction and schema validation
 */
export abstract class BaseExtractor {
  abstract domainId: string;
  abstract schema: z.ZodSchema;

  protected openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeout,
    });
  }

  /**
   * Extract domain-specific data from a message
   * @param message - The user message to extract from
   * @param context - Additional context for extraction
   * @returns Extracted data or null if nothing relevant found
   */
  async extract(message: string, context: ExtractionContext): Promise<ExtractedData | null> {
    try {
      const startTime = Date.now();
      const prompt = this.buildExtractionPrompt(message, context);

      // Verbose logging for debugging
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'EXTRACTOR_REQUEST',
            domainId: this.domainId,
            prompt,
            message,
            contextMessages: context.recentMessages,
            contextLength: context.recentMessages.length,
          },
          `EXTRACTOR VERBOSE [${this.domainId}]: Preparing extraction request`
        );
      } else {
        logger.debug(
          {
            domainId: this.domainId,
            messagePreview: message.substring(0, 50),
            contextMessages: context.recentMessages.length,
          },
          'Starting extraction'
        );
      }

      // Use OpenAI structured output
      // Note: The parse method with Zod is not available in the current SDK version
      // We'll use regular completions and parse the JSON manually
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              prompt + '\n\nReturn your response as valid JSON matching the expected schema.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent extraction
        max_tokens: 500,
      });

      const content = completion.choices[0]?.message?.content;

      // Verbose logging of raw response
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'EXTRACTOR_RAW_RESPONSE',
            domainId: this.domainId,
            response: content,
            usage: completion.usage,
            model: completion.model,
          },
          `EXTRACTOR VERBOSE [${this.domainId}]: Received raw response`
        );
      }

      if (!content) {
        logger.debug(
          {
            domainId: this.domainId,
          },
          'No data extracted'
        );
        return null;
      }

      // Parse JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        logger.error(
          {
            domainId: this.domainId,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          },
          'Failed to parse extraction response'
        );
        return null;
      }

      // Verbose logging of parsed JSON
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'EXTRACTOR_PARSED_JSON',
            domainId: this.domainId,
            parsedData: parsed,
          },
          `EXTRACTOR VERBOSE [${this.domainId}]: Parsed JSON response`
        );
      }

      // Validate with Zod schema
      const validation = this.schema.safeParse(parsed);
      if (!validation.success) {
        logger.warn(
          {
            domainId: this.domainId,
            errors: validation.error.issues,
          },
          'Extraction validation failed'
        );
        return null;
      }

      // Validate and transform the extracted data
      const extractedData = this.validateAndTransform(validation.data);

      // Verbose logging of transformed data
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'EXTRACTOR_TRANSFORMED',
            domainId: this.domainId,
            extractedData,
          },
          `EXTRACTOR VERBOSE [${this.domainId}]: Transformed extracted data`
        );
      }

      // If confidence is 0, treat as no extraction
      if (extractedData.confidence === 0) {
        logger.debug(
          {
            domainId: this.domainId,
            parsedData: parsed,
            confidence: extractedData.confidence,
          },
          'Extraction confidence too low'
        );
        return null;
      }

      const duration = Date.now() - startTime;
      const dataObj = validation.data as Record<string, any>;

      // Verbose logging of final result
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'EXTRACTOR_FINAL_RESULT',
            domainId: this.domainId,
            extractedData,
            confidence: extractedData.confidence,
            duration,
            fieldsExtracted: Object.keys(dataObj).filter(
              (k) => dataObj[k] !== null && dataObj[k] !== undefined
            ),
          },
          `EXTRACTOR VERBOSE [${this.domainId}]: Extraction complete`
        );
      } else {
        logger.info(
          {
            domainId: this.domainId,
            confidence: extractedData.confidence,
            duration,
            fieldsExtracted: Object.keys(dataObj).filter(
              (k) => dataObj[k] !== null && dataObj[k] !== undefined
            ).length,
          },
          'Extraction complete'
        );
      }

      return extractedData;
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Extraction failed'
      );
      return null;
    }
  }

  /**
   * Build the extraction prompt for the LLM
   * @param message - Current message
   * @param context - Extraction context
   * @returns System prompt for extraction
   */
  protected abstract buildExtractionPrompt(message: string, context: ExtractionContext): string;

  /**
   * Validate and transform extracted data
   * @param data - Raw extracted data from LLM
   * @returns Formatted ExtractedData object
   */
  protected abstract validateAndTransform(data: any): ExtractedData;
}
