// LLM Service - OpenAI integration
import OpenAI from 'openai';
import { config } from '@/config/index.js';
import { logger } from '@/core/logger.js';
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
            systemPrompt,
            messages: openAIMessages,
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

      const completion = await this.client.chat.completions.create({
        model: options?.model || config.openai.model,
        messages: openAIMessages,
        max_tokens: options?.maxTokens || config.openai.maxTokens,
        temperature: options?.temperature ?? config.openai.temperature,
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
            response,
            finishReason: completion.choices[0]?.finish_reason,
          },
          'LLM VERBOSE: Received response from OpenAI'
        );
      }

      return response;
    } catch (error) {
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
            messages,
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

      const completion = await this.client.chat.completions.create(completionRequest);

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
            response,
            finishReason: completion.choices[0]?.finish_reason,
          },
          'LLM VERBOSE: Received response from OpenAI (raw messages)'
        );
      }

      return response;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LLM error: ${error.message}`);
      }
      throw new Error('Unknown LLM error');
    }
  }
}

export const llmService = new LLMService();
