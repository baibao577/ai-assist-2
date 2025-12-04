/**
 * Agent State Repository
 *
 * Manages temporary domain-specific states for handling multi-step interactions,
 * clarifications, and other stateful domain operations.
 */

import { eq, and, gt, lt } from 'drizzle-orm';
import { getDatabase } from '../client.js';
import { agentStates } from '../schema.js';
import type { AgentState, NewAgentState } from '../schema.js';
import { logger } from '@/core/logger.js';

export class AgentStateRepository {
  private db = getDatabase();

  /**
   * Save a new agent state
   */
  async saveState(params: {
    conversationId: string;
    domainId: string;
    stateType: string;
    stateData: any;
    ttlSeconds?: number;
  }): Promise<AgentState> {
    try {
      const ttl = params.ttlSeconds || 300; // Default 5 minutes
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const newState: NewAgentState = {
        conversationId: params.conversationId,
        domainId: params.domainId,
        stateType: params.stateType,
        stateData: JSON.stringify(params.stateData),
        expiresAt,
        resolved: false,
      };

      const [state] = await this.db.insert(agentStates).values(newState).returning();

      logger.debug(
        {
          stateId: state.id,
          domainId: params.domainId,
          stateType: params.stateType,
        },
        'Agent state saved'
      );

      return state;
    } catch (error) {
      logger.error({ error }, 'Failed to save agent state');
      throw new Error(`Failed to save agent state: ${error}`);
    }
  }

  /**
   * Get active state for a conversation and domain
   */
  async getState(
    conversationId: string,
    domainId: string,
    stateType?: string
  ): Promise<AgentState | null> {
    try {
      const now = new Date();

      const conditions = [
        eq(agentStates.conversationId, conversationId),
        eq(agentStates.domainId, domainId),
        eq(agentStates.resolved, false),
        gt(agentStates.expiresAt, now),
      ];

      if (stateType) {
        conditions.push(eq(agentStates.stateType, stateType));
      }

      const states = await this.db
        .select()
        .from(agentStates)
        .where(and(...conditions))
        .orderBy(agentStates.createdAt)
        .limit(1);

      if (states.length === 0) return null;

      const state = states[0];

      // Parse JSON data
      return {
        ...state,
        stateData: JSON.parse(state.stateData),
      } as AgentState;
    } catch (error) {
      logger.error({ error }, 'Failed to get agent state');
      throw new Error(`Failed to get agent state: ${error}`);
    }
  }

  /**
   * Get all active states for a domain
   */
  async getStatesForDomain(domainId: string): Promise<AgentState[]> {
    try {
      const now = new Date();

      const states = await this.db
        .select()
        .from(agentStates)
        .where(
          and(
            eq(agentStates.domainId, domainId),
            eq(agentStates.resolved, false),
            gt(agentStates.expiresAt, now)
          )
        )
        .orderBy(agentStates.createdAt);

      return states.map((state) => ({
        ...state,
        stateData: JSON.parse(state.stateData),
      })) as AgentState[];
    } catch (error) {
      logger.error({ error }, 'Failed to get domain states');
      throw new Error(`Failed to get domain states: ${error}`);
    }
  }

  /**
   * Mark a state as resolved
   */
  async resolveState(stateId: string): Promise<void> {
    try {
      await this.db.update(agentStates).set({ resolved: true }).where(eq(agentStates.id, stateId));

      logger.debug({ stateId }, 'Agent state resolved');
    } catch (error) {
      logger.error({ error, stateId }, 'Failed to resolve agent state');
      throw new Error(`Failed to resolve agent state: ${error}`);
    }
  }

  /**
   * Clean up expired states
   */
  async cleanupExpired(): Promise<number> {
    try {
      const now = new Date();

      const result = await this.db
        .delete(agentStates)
        .where(lt(agentStates.expiresAt, now))
        .returning({ id: agentStates.id });

      const count = result.length;

      if (count > 0) {
        logger.info({ count }, 'Cleaned up expired agent states');
      }

      return count;
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired states');
      throw new Error(`Failed to cleanup expired states: ${error}`);
    }
  }

  /**
   * Delete all states for a conversation
   */
  async clearConversationStates(conversationId: string): Promise<void> {
    try {
      await this.db.delete(agentStates).where(eq(agentStates.conversationId, conversationId));

      logger.debug({ conversationId }, 'Cleared agent states for conversation');
    } catch (error) {
      logger.error({ error }, 'Failed to clear conversation states');
      throw new Error(`Failed to clear conversation states: ${error}`);
    }
  }
}

// Export singleton instance
export const agentStateRepository = new AgentStateRepository();
