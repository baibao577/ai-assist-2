// Conversation state types for tracking state across messages

import type { ConversationMode } from './modes.js';

export interface ContextElement {
  key: string; // e.g., "user_health_concern", "topic"
  value: string;
  weight: number; // 0-1, decreases with time
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface ConversationGoal {
  id: string;
  description: string;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: Date;
  completedAt?: Date;
}

export interface ConversationState {
  id: string;
  conversationId: string;
  mode: ConversationMode;
  contextElements: ContextElement[];
  goals: ConversationGoal[];
  lastActivityAt: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

// DTOs for state operations
export interface CreateStateDto {
  id: string;
  conversationId: string;
  mode: ConversationMode;
  contextElements: ContextElement[];
  goals: ConversationGoal[];
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

export interface UpdateStateDto {
  mode?: ConversationMode;
  contextElements?: ContextElement[];
  goals?: ConversationGoal[];
  lastActivityAt?: Date;
  metadata?: Record<string, unknown>;
}

// Decay configuration
export interface DecayConfig {
  contextElementHalfLife: number; // Hours until weight reduced by 50%
  goalExpiryDays: number; // Days until goals marked for review
  staleThresholdMinutes: number; // Minutes before context considered stale
}

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  contextElementHalfLife: 24, // 24 hours
  goalExpiryDays: 7, // 7 days
  staleThresholdMinutes: 30, // 30 minutes
};
