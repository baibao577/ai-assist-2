// State Repository - Manage conversation state snapshots
import { eq, desc } from 'drizzle-orm';
import { getDatabase } from '@/database/client.js';
import { conversationStates } from '@/database/schema.js';
import {
  DatabaseError,
  type ConversationState,
  type CreateStateDto,
  type ConversationMode,
  type ContextElement,
  type ConversationGoal,
} from '@/types/index.js';

export class StateRepository {
  private db = getDatabase();

  async create(data: CreateStateDto): Promise<ConversationState> {
    try {
      const newState = {
        id: data.id,
        conversationId: data.conversationId,
        mode: data.mode,
        contextElements: JSON.stringify(data.contextElements),
        goals: JSON.stringify(data.goals),
        lastActivityAt: data.lastActivityAt,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        createdAt: new Date(),
      };

      await this.db.insert(conversationStates).values(newState);

      return {
        ...newState,
        contextElements: data.contextElements,
        goals: data.goals,
        metadata: data.metadata,
      };
    } catch (error) {
      throw new DatabaseError('create state', error as Error);
    }
  }

  async getLatestByConversationId(
    conversationId: string
  ): Promise<ConversationState | null> {
    try {
      const result = await this.db
        .select()
        .from(conversationStates)
        .where(eq(conversationStates.conversationId, conversationId))
        .orderBy(desc(conversationStates.createdAt))
        .limit(1);

      const row = result[0];
      if (!row) return null;

      return {
        id: row.id,
        conversationId: row.conversationId,
        mode: row.mode as ConversationMode,
        contextElements: JSON.parse(row.contextElements as string) as ContextElement[],
        goals: JSON.parse(row.goals as string) as ConversationGoal[],
        lastActivityAt: row.lastActivityAt,
        metadata: row.metadata
          ? (JSON.parse(row.metadata as string) as Record<string, unknown>)
          : undefined,
        createdAt: row.createdAt,
      };
    } catch (error) {
      throw new DatabaseError('get latest state', error as Error);
    }
  }

  async getStateHistory(
    conversationId: string,
    limit: number = 10
  ): Promise<ConversationState[]> {
    try {
      const results = await this.db
        .select()
        .from(conversationStates)
        .where(eq(conversationStates.conversationId, conversationId))
        .orderBy(desc(conversationStates.createdAt))
        .limit(limit);

      return results.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        mode: row.mode as ConversationMode,
        contextElements: JSON.parse(row.contextElements as string) as ContextElement[],
        goals: JSON.parse(row.goals as string) as ConversationGoal[],
        lastActivityAt: row.lastActivityAt,
        metadata: row.metadata
          ? (JSON.parse(row.metadata as string) as Record<string, unknown>)
          : undefined,
        createdAt: row.createdAt,
      }));
    } catch (error) {
      throw new DatabaseError('get state history', error as Error);
    }
  }
}

export const stateRepository = new StateRepository();
