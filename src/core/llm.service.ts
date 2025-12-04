// LLM Service - OpenAI integration
import OpenAI from 'openai';
import { config } from '@/config/index.js';
import { logger } from '@/core/logger.js';
import { performanceTracker } from './performance-tracker.js';
import type { Message } from '@/types/index.js';

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  systemPrompt?: string; // Custom system prompt (overrides default)
  responseFormat?: { type: 'json_object' | 'text' }; // Response format for structured output
}

export class LLMService {
  private client: OpenAI;

  constructor() {
    // Log initialization details
    logger.info(
      {
        hasApiKey: !!config.openai.apiKey,
        apiKeyLength: config.openai.apiKey?.length,
        apiKeyPrefix: config.openai.apiKey?.substring(0, 7) + '...',
        defaultModel: config.openai.model,
        timeout: config.openai.timeout,
      },
      'Initializing OpenAI client'
    );

    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeout,
    });
  }

  async generateResponse(
    messages: Message[],
    userMessage: string,
    options?: LLMOptions
  ): Promise<string> {
    try {
      // Use custom system prompt if provided, otherwise use default
      const systemPrompt =
        options?.systemPrompt ||
        'You are a helpful AI assistant. Provide clear, accurate, and helpful responses.';

      // Convert our message format to OpenAI format
      const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: userMessage,
        },
      ];

      // Verbose logging for debugging
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'LLM_REQUEST',
            model: options?.model || config.openai.model,
            temperature: options?.temperature ?? config.openai.temperature,
            maxTokens: options?.maxTokens || config.openai.maxTokens,
            // Split multi-line strings into arrays for readability in logs
            systemPrompt: systemPrompt.includes('\n') ? systemPrompt.split('\n') : systemPrompt,
            messages: openAIMessages.map((msg) => ({
              role: msg.role,
              content:
                typeof msg.content === 'string' && msg.content.includes('\n')
                  ? msg.content.split('\n')
                  : msg.content,
            })),
            messageCount: openAIMessages.length,
            totalPromptLength: openAIMessages.reduce(
              (acc, msg) => acc + (msg.content?.length || 0),
              0
            ),
          },
          'LLM VERBOSE: Sending request to OpenAI'
        );
      } else {
        logger.debug(
          {
            systemPromptLength: systemPrompt.length,
            systemPromptPreview: systemPrompt.substring(0, 200),
            messageCount: messages.length,
            userMessageLength: userMessage.length,
          },
          'LLM Service: Calling OpenAI API'
        );
      }

      // Performance tracking for handler LLM calls
      const llmSpan = performanceTracker.startSpan('llm.openai_api');
      performanceTracker.setSpanAttributes(llmSpan, {
        model: options?.model || config.openai.model,
        messageCount: openAIMessages.length,
        maxTokens: options?.maxTokens || config.openai.maxTokens,
        temperature: options?.temperature ?? config.openai.temperature,
        method: 'generateResponse',
      });

      const apiCallStart = Date.now();
      const completion = await this.client.chat.completions.create({
        model: options?.model || config.openai.model,
        messages: openAIMessages,
        max_tokens: options?.maxTokens || config.openai.maxTokens,
        temperature: options?.temperature ?? config.openai.temperature,
      });
      const apiDuration = Date.now() - apiCallStart;

      performanceTracker.endSpan(llmSpan, {
        duration: apiDuration,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      });

      const response = completion.choices[0]?.message?.content ?? '';

      if (!response) {
        throw new Error('No response from LLM');
      }

      // Verbose logging of response
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'LLM_RESPONSE',
            model: completion.model,
            usage: completion.usage,
            responseLength: response.length,
            // Split multi-line response for readability
            response: response.includes('\n') ? response.split('\n') : response,
            finishReason: completion.choices[0]?.finish_reason,
          },
          'LLM VERBOSE: Received response from OpenAI'
        );
      }

      return response;
    } catch (error: any) {
      // Log error details before re-throwing
      logger.error(
        {
          errorType: error?.constructor?.name,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          errorCode: error?.code,
          errorStatus: error?.status,
        },
        'LLM Service error in method'
      );

      if (error instanceof Error) {
        throw new Error(`LLM error: ${error.message}`);
      }
      throw new Error('Unknown LLM error');
    }
  }

  /**
   * Generate response from raw OpenAI message array
   * Useful for extractors and other components that need direct control over messages
   */
  async generateFromMessages(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: LLMOptions
  ): Promise<string> {
    try {
      // Verbose logging for debugging
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'LLM_REQUEST',
            model: options?.model || config.openai.model,
            temperature: options?.temperature ?? config.openai.temperature,
            maxTokens: options?.maxTokens || config.openai.maxTokens,
            responseFormat: options?.responseFormat,
            // Split multi-line strings into arrays for readability in logs
            messages: messages.map((msg) => ({
              role: msg.role,
              content:
                typeof msg.content === 'string' && msg.content.includes('\n')
                  ? msg.content.split('\n')
                  : msg.content,
            })),
            messageCount: messages.length,
            totalPromptLength: messages.reduce(
              (acc, msg) => acc + ((msg.content as string)?.length || 0),
              0
            ),
          },
          'LLM VERBOSE: Sending request to OpenAI (raw messages)'
        );
      } else {
        logger.debug(
          {
            messageCount: messages.length,
            responseFormat: options?.responseFormat?.type,
          },
          'LLM Service: Calling OpenAI API with raw messages'
        );
      }

      // Build completion request with optional response format
      const completionRequest: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options?.model || config.openai.model,
        messages,
        max_tokens: options?.maxTokens || config.openai.maxTokens,
        temperature: options?.temperature ?? config.openai.temperature,
      };

      // Add response format if specified
      if (options?.responseFormat) {
        completionRequest.response_format = options.responseFormat;
      }

      // Log request details before API call
      logger.debug(
        {
          requestDetails: {
            model: completionRequest.model,
            hasResponseFormat: !!completionRequest.response_format,
            responseFormatType: completionRequest.response_format?.type,
            messageCount: completionRequest.messages.length,
            temperature: completionRequest.temperature,
            maxTokens: completionRequest.max_tokens,
          },
        },
        'About to call OpenAI API with raw messages'
      );

      let completion;
      try {
        // Start performance tracking for API call
        const llmSpan = performanceTracker.startSpan('llm.openai_api');
        performanceTracker.setSpanAttributes(llmSpan, {
          model: completionRequest.model,
          messageCount: completionRequest.messages.length,
          maxTokens: completionRequest.max_tokens,
          temperature: completionRequest.temperature,
          hasResponseFormat: !!completionRequest.response_format,
        });

        const apiCallStart = Date.now();
        completion = await this.client.chat.completions.create(completionRequest);
        const apiDuration = Date.now() - apiCallStart;

        // End performance span with usage details
        performanceTracker.endSpan(llmSpan, {
          duration: apiDuration,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        });

        logger.debug(
          { duration: apiDuration },
          'OpenAI API call completed successfully'
        );
      } catch (apiError: any) {
        // Comprehensive error logging
        logger.error(
          {
            errorType: apiError?.constructor?.name,
            errorMessage: apiError?.message || String(apiError),
            errorCode: apiError?.code,
            errorStatus: apiError?.status,
            errorStatusText: apiError?.statusText,
            errorResponse: apiError?.response?.data,
            errorHeaders: apiError?.response?.headers,
            fullError: JSON.stringify(apiError, Object.getOwnPropertyNames(apiError)),
            requestModel: completionRequest.model,
            hasResponseFormat: !!completionRequest.response_format,
            responseFormatType: completionRequest.response_format?.type,
          },
          'OpenAI API call failed - detailed error'
        );
        throw apiError;
      }

      const response = completion.choices[0]?.message?.content ?? '';

      if (!response) {
        throw new Error('No response from LLM');
      }

      // Verbose logging of response
      if (config.logging.llmVerbose) {
        logger.info(
          {
            type: 'LLM_RESPONSE',
            model: completion.model,
            usage: completion.usage,
            responseLength: response.length,
            // Split multi-line response for readability
            response: response.includes('\n') ? response.split('\n') : response,
            finishReason: completion.choices[0]?.finish_reason,
          },
          'LLM VERBOSE: Received response from OpenAI (raw messages)'
        );
      }

      return response;
    } catch (error: any) {
      // Log error details before re-throwing
      logger.error(
        {
          errorType: error?.constructor?.name,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          errorCode: error?.code,
          errorStatus: error?.status,
        },
        'LLM Service error in method'
      );

      if (error instanceof Error) {
        throw new Error(`LLM error: ${error.message}`);
      }
      throw new Error('Unknown LLM error');
    }
  }
}

export const llmService = new LLMService();
