// Conversation state types for tracking state across messages

import type { ConversationMode } from './modes.js';

export type ContextType = 'crisis' | 'emotional' | 'topic' | 'preference' | 'general';

export interface ContextElement {
  key: string; // e.g., "user_health_concern", "topic", "emotional_state"
  value: string;
  weight: number; // 0-1, decreases with time
  contextType?: ContextType; // Type determines decay rate
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
  // Context type-specific half-lives (hours until weight reduced by 50%)
  crisisHalfLife: number; // Crisis/safety contexts - should last longest
  emotionalHalfLife: number; // Emotional states - moderate duration
  topicHalfLife: number; // Discussion topics - normal duration
  preferenceHalfLife: number; // User preferences - long retention
  generalHalfLife: number; // Everything else - default duration

  // Existing configs
  goalExpiryDays: number; // Days until goals marked for review
  staleThresholdMinutes: number; // Minutes before context considered stale
}

export const DEFAULT_DECAY_CONFIG = {
  // Type-specific half-lives
  crisisHalfLife: 72, // 72 hours (3 days) - crisis awareness should linger
  emotionalHalfLife: 48, // 48 hours (2 days) - emotional states moderate
  topicHalfLife: 24, // 24 hours - normal conversation topics
  preferenceHalfLife: 168, // 168 hours (7 days) - preferences long-lasting
  generalHalfLife: 24, // 24 hours - default for untyped elements

  // Existing defaults
  goalExpiryDays: 7, // 7 days
  staleThresholdMinutes: 30, // 30 minutes
} as const satisfies DecayConfig;
