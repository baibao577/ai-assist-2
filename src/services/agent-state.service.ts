/**
 * Agent State Service
 *
 * High-level API for managing temporary domain-specific states.
 * Used for handling multi-step interactions, clarifications, and
 * other stateful operations across domains.
 */

import { agentStateRepository } from '@/database/repositories/agent-state.repository.js';
import type { AgentState } from '@/database/schema.js';
import { logger } from '@/core/logger.js';

export interface AgentStateData {
  [key: string]: any;
}

export class AgentStateService {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup job every 5 minutes
    this.startCleanupJob();
  }

  /**
   * Save domain-specific state
   */
  async saveState(
    conversationId: string,
    domainId: string,
    stateType: string,
    data: AgentStateData,
    ttlSeconds = 300 // Default 5 minutes
  ): Promise<string> {
    try {
      const state = await agentStateRepository.saveState({
        conversationId,
        domainId,
        stateType,
        stateData: data,
        ttlSeconds,
      });

      logger.info(
        {
          stateId: state.id,
          domainId,
          stateType,
          ttl: ttlSeconds,
        },
        'Agent state saved'
      );

      return state.id;
    } catch (error) {
      logger.error(
        {
          error,
          conversationId,
          domainId,
          stateType,
        },
        'Failed to save agent state'
      );
      throw error;
    }
  }

  /**
   * Get active state for a domain
   */
  async getState(
    conversationId: string,
    domainId: string,
    stateType?: string
  ): Promise<AgentStateData | null> {
    try {
      const state = await agentStateRepository.getState(conversationId, domainId, stateType);

      if (!state) return null;

      // Return parsed data
      return typeof state.stateData === 'string' ? JSON.parse(state.stateData) : state.stateData;
    } catch (error) {
      logger.error(
        {
          error,
          conversationId,
          domainId,
          stateType,
        },
        'Failed to get agent state'
      );
      return null;
    }
  }

  /**
   * Get state with metadata
   */
  async getStateWithMetadata(
    conversationId: string,
    domainId: string,
    stateType?: string
  ): Promise<{ data: AgentStateData; metadata: Partial<AgentState> } | null> {
    try {
      const state = await agentStateRepository.getState(conversationId, domainId, stateType);

      if (!state) return null;

      const data =
        typeof state.stateData === 'string' ? JSON.parse(state.stateData) : state.stateData;

      return {
        data,
        metadata: {
          id: state.id,
          createdAt: state.createdAt,
          expiresAt: state.expiresAt,
          stateType: state.stateType,
        },
      };
    } catch (error) {
      logger.error(
        {
          error,
          conversationId,
          domainId,
        },
        'Failed to get state with metadata'
      );
      return null;
    }
  }

  /**
   * Resolve a state (mark as completed)
   */
  async resolveState(
    conversationId: string,
    domainId: string,
    stateType?: string
  ): Promise<boolean> {
    try {
      const state = await agentStateRepository.getState(conversationId, domainId, stateType);

      if (!state) return false;

      await agentStateRepository.resolveState(state.id);

      logger.info(
        {
          stateId: state.id,
          domainId,
          stateType: state.stateType,
        },
        'Agent state resolved'
      );

      return true;
    } catch (error) {
      logger.error(
        {
          error,
          conversationId,
          domainId,
        },
        'Failed to resolve agent state'
      );
      return false;
    }
  }

  /**
   * Update existing state data
   */
  async updateState(
    conversationId: string,
    domainId: string,
    stateType: string,
    updates: Partial<AgentStateData>
  ): Promise<boolean> {
    try {
      const existing = await this.getState(conversationId, domainId, stateType);
      if (!existing) return false;

      const updatedData = { ...existing, ...updates };

      // Save new state (will replace old one due to same conversation/domain/type)
      await this.saveState(conversationId, domainId, stateType, updatedData);

      return true;
    } catch (error) {
      logger.error(
        {
          error,
          conversationId,
          domainId,
        },
        'Failed to update agent state'
      );
      return false;
    }
  }

  /**
   * Clear all states for a conversation
   */
  async clearConversationStates(conversationId: string): Promise<void> {
    try {
      await agentStateRepository.clearConversationStates(conversationId);
    } catch (error) {
      logger.error(
        {
          error,
          conversationId,
        },
        'Failed to clear conversation states'
      );
    }
  }

  /**
   * Start cleanup job for expired states
   */
  private startCleanupJob(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      async () => {
        try {
          const count = await agentStateRepository.cleanupExpired();
          if (count > 0) {
            logger.debug({ count }, 'Cleaned up expired agent states');
          }
        } catch (error) {
          logger.error({ error }, 'Agent state cleanup job failed');
        }
      },
      5 * 60 * 1000 // 5 minutes
    );
  }

  /**
   * Stop cleanup job
   */
  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const agentStateService = new AgentStateService();
