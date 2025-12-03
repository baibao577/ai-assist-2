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
        contextElements: data.contextElements, // Let Drizzle handle JSON serialization
        goals: data.goals, // Let Drizzle handle JSON serialization
        lastActivityAt: data.lastActivityAt,
        metadata: data.metadata || null, // Let Drizzle handle JSON serialization
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

  async getLatestByConversationId(conversationId: string): Promise<ConversationState | null> {
    try {
      const result = await this.db
        .select()
        .from(conversationStates)
        .where(eq(conversationStates.conversationId, conversationId))
        .orderBy(desc(conversationStates.createdAt))
        .limit(1);

      const row = result[0];
      if (!row) return null;

      // Convert date strings back to Date objects in context elements
      const contextElements = (row.contextElements as any as ContextElement[]).map((element) => ({
        ...element,
        createdAt: new Date(element.createdAt),
        lastAccessedAt: new Date(element.lastAccessedAt),
      }));

      return {
        id: row.id,
        conversationId: row.conversationId,
        mode: row.mode as ConversationMode,
        contextElements,
        goals: row.goals as any as ConversationGoal[], // Already parsed by Drizzle
        lastActivityAt: row.lastActivityAt,
        metadata: row.metadata as Record<string, unknown> | undefined, // Already parsed by Drizzle
        createdAt: row.createdAt,
      };
    } catch (error) {
      throw new DatabaseError('get latest state', error as Error);
    }
  }

  async getStateHistory(conversationId: string, limit: number = 10): Promise<ConversationState[]> {
    try {
      const results = await this.db
        .select()
        .from(conversationStates)
        .where(eq(conversationStates.conversationId, conversationId))
        .orderBy(desc(conversationStates.createdAt))
        .limit(limit);

      return results.map((row) => {
        // Convert date strings back to Date objects in context elements
        const contextElements = (row.contextElements as any as ContextElement[]).map((element) => ({
          ...element,
          createdAt: new Date(element.createdAt),
          lastAccessedAt: new Date(element.lastAccessedAt),
        }));

        return {
          id: row.id,
          conversationId: row.conversationId,
          mode: row.mode as ConversationMode,
          contextElements,
          goals: row.goals as any as ConversationGoal[], // Already parsed by Drizzle
          lastActivityAt: row.lastActivityAt,
          metadata: row.metadata as Record<string, unknown> | undefined, // Already parsed by Drizzle
          createdAt: row.createdAt,
        };
      });
    } catch (error) {
      throw new DatabaseError('get state history', error as Error);
    }
  }
}

export const stateRepository = new StateRepository();
