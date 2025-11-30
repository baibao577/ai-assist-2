// Simple Pipeline for MVP v1
// Stages: Load → LLM Call → Save

import { v4 as uuidv4 } from 'uuid';
import { conversationRepository, messageRepository } from '@/database/repositories/index.js';
import { llmService } from '@/core/llm.service.js';
import {
  PipelineError,
  MessageRole,
  ConversationStatus,
  type PipelineContext,
  type PipelineResult,
  type Conversation,
  type Message,
} from '@/types/index.js';

export class Pipeline {
  /**
   * Execute the full pipeline for a user message
   */
  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Load conversation and messages
      const { conversation, messages } = await this.loadStage(context);

      // Stage 2: Generate LLM response
      const response = await this.llmStage(messages, context.message);

      // Stage 3: Save messages
      const messageId = await this.saveStage(conversation.id, context.message, response);

      const processingTime = Date.now() - startTime;

      return {
        response,
        processingTime,
        messageId,
        conversationId: conversation.id,
      };
    } catch (error) {
      throw new PipelineError('pipeline', error as Error, context);
    }
  }

  /**
   * Load Stage: Load or create conversation and retrieve recent messages
   */
  private async loadStage(
    context: PipelineContext
  ): Promise<{ conversation: Conversation; messages: Message[] }> {
    try {
      let conversation: Conversation | null;

      // Try to find existing conversation
      if (context.conversationId) {
        conversation = await conversationRepository.findById(context.conversationId);
      } else {
        // Find active conversation for user
        const activeConversations = await conversationRepository.findActiveByUserId(context.userId);
        conversation = activeConversations[0] ?? null;
      }

      // Create new conversation if none exists
      if (!conversation) {
        conversation = await conversationRepository.create({
          id: uuidv4(),
          userId: context.userId,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          status: ConversationStatus.ACTIVE,
        });
      } else {
        // Update last activity
        await conversationRepository.updateActivity(conversation.id);
      }

      // Load recent messages (last 10 for context)
      const messages = await messageRepository.getRecentMessages(conversation.id, 10);

      return { conversation, messages };
    } catch (error) {
      throw new PipelineError('load', error as Error, context);
    }
  }

  /**
   * LLM Stage: Generate response using OpenAI
   */
  private async llmStage(messages: Message[], userMessage: string): Promise<string> {
    try {
      return await llmService.generateResponse(messages, userMessage);
    } catch (error) {
      throw new PipelineError('llm', error as Error);
    }
  }

  /**
   * Save Stage: Save user message and assistant response
   */
  private async saveStage(
    conversationId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<string> {
    try {
      const timestamp = new Date();

      // Save user message
      await messageRepository.create({
        id: uuidv4(),
        conversationId,
        role: MessageRole.USER,
        content: userMessage,
        timestamp,
      });

      // Save assistant response
      const assistantMessage = await messageRepository.create({
        id: uuidv4(),
        conversationId,
        role: MessageRole.ASSISTANT,
        content: assistantResponse,
        timestamp: new Date(),
      });

      return assistantMessage.id;
    } catch (error) {
      throw new PipelineError('save', error as Error);
    }
  }
}

export const pipeline = new Pipeline();
