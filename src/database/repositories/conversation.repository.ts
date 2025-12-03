// Conversation Repository
import { eq, and, desc } from 'drizzle-orm';
import { getDatabase } from '@/database/client.js';
import { conversations } from '@/database/schema.js';
import type { Conversation, CreateConversationDto, ConversationStatus } from '@/types/index.js';
import { DatabaseError } from '@/types/index.js';

export class ConversationRepository {
  private db = getDatabase();

  async create(data: CreateConversationDto): Promise<Conversation> {
    try {
      const newConv = {
        id: data.id,
        userId: data.userId,
        startedAt: data.startedAt,
        lastActivityAt: data.lastActivityAt,
        status: data.status,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.db.insert(conversations).values(newConv);

      return {
        ...newConv,
        metadata: undefined,
      };
    } catch (error) {
      throw new DatabaseError('create conversation', error as Error);
    }
  }

  async findById(id: string): Promise<Conversation | null> {
    try {
      const result = await this.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1);

      const row = result[0];
      if (!row) return null;

      return {
        ...row,
        status: row.status as ConversationStatus,
        metadata: row.metadata as Record<string, unknown> | undefined,
      };
    } catch (error) {
      throw new DatabaseError('find conversation by id', error as Error);
    }
  }

  async findActiveByUserId(userId: string): Promise<Conversation[]> {
    try {
      const results = await this.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, userId), eq(conversations.status, 'active')))
        .orderBy(desc(conversations.lastActivityAt));

      return results.map((row) => ({
        ...row,
        status: row.status as ConversationStatus,
        metadata: row.metadata as Record<string, unknown> | undefined,
      }));
    } catch (error) {
      throw new DatabaseError('find active conversations', error as Error);
    }
  }

  async updateActivity(id: string): Promise<void> {
    try {
      await this.db
        .update(conversations)
        .set({
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, id));
    } catch (error) {
      throw new DatabaseError('update conversation activity', error as Error);
    }
  }

  async updateStatus(id: string, status: ConversationStatus): Promise<void> {
    try {
      await this.db
        .update(conversations)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, id));
    } catch (error) {
      throw new DatabaseError('update conversation status', error as Error);
    }
  }
}

export const conversationRepository = new ConversationRepository();
