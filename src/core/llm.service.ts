// LLM Service - OpenAI integration
import OpenAI from 'openai';
import { config } from '@/config/index.js';
import type { Message } from '@/types/index.js';

export class LLMService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeout,
    });
  }

  async generateResponse(messages: Message[], userMessage: string): Promise<string> {
    try {
      // Convert our message format to OpenAI format
      const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content:
            'You are a helpful AI assistant. Provide clear, accurate, and helpful responses.',
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

      const completion = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: openAIMessages,
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });

      const response = completion.choices[0]?.message?.content ?? '';

      if (!response) {
        throw new Error('No response from LLM');
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
