// Message Repository
import { eq, desc } from 'drizzle-orm';
import { getDatabase } from '@/database/client.js';
import { messages } from '@/database/schema.js';
import type { Message, CreateMessageDto, MessageMetadata } from '@/types/index.js';
import { DatabaseError, MessageRole } from '@/types/index.js';

export class MessageRepository {
  private db = getDatabase();

  async create(data: CreateMessageDto): Promise<Message> {
    try {
      const newMessage = {
        id: data.id,
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        timestamp: data.timestamp,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        createdAt: new Date(),
      };

      await this.db.insert(messages).values(newMessage);

      return {
        ...newMessage,
        metadata: data.metadata,
      };
    } catch (error) {
      throw new DatabaseError('create message', error as Error);
    }
  }

  async findByConversationId(conversationId: string, limit: number = 50): Promise<Message[]> {
    try {
      const results = await this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.timestamp))
        .limit(limit);

      return results.map((row) => ({
        ...row,
        role: row.role as MessageRole,
        metadata: row.metadata as MessageMetadata | undefined,
      }));
    } catch (error) {
      throw new DatabaseError('find messages by conversation', error as Error);
    }
  }

  async getRecentMessages(conversationId: string, count: number): Promise<Message[]> {
    try {
      const result = await this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.timestamp))
        .limit(count);

      // Return in chronological order with proper typing
      return result
        .map((row) => ({
          ...row,
          role: row.role as MessageRole,
          metadata: row.metadata as MessageMetadata | undefined,
        }))
        .reverse();
    } catch (error) {
      throw new DatabaseError('get recent messages', error as Error);
    }
  }
}

export const messageRepository = new MessageRepository();
