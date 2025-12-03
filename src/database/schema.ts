// Database schema using Drizzle ORM
// MVP v1: Basic conversations and messages tables
// MVP v2: Added conversation_states table for state management
// MVP v3: Added domain_data table for domains framework
// MVP v4: Added goals, progress_entries, and goal_milestones tables for Track Progress

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Conversations table
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull(), // active, completed, expired
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Messages table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user, assistant, system
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Conversation states table (MVP v2)
export const conversationStates = sqliteTable('conversation_states', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(), // consult, smalltalk, meta
  contextElements: text('context_elements', { mode: 'json' }).notNull(), // JSON array of ContextElement[]
  goals: text('goals', { mode: 'json' }).notNull(), // JSON array of ConversationGoal[]
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }).notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Domain data table (MVP v3)
export const domainData = sqliteTable(
  'domain_data',
  {
    id: text('id')
      .primaryKey()
      .default(sql`lower(hex(randomblob(16)))`),
    domainId: text('domain_id').notNull(),
    userId: text('user_id').notNull(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    data: text('data', { mode: 'json' }).notNull(),
    confidence: real('confidence').default(0.8),
    extractedAt: integer('extracted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => {
    return {
      domainIdx: index('idx_domain_data_domain').on(table.domainId),
      userIdx: index('idx_domain_data_user').on(table.userId),
      conversationIdx: index('idx_domain_data_conversation').on(table.conversationId),
      extractedIdx: index('idx_domain_data_extracted').on(table.extractedAt),
    };
  }
);

// Goals table (MVP v4) - Stores user goals with progress tracking
export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),

    // Goal definition
    title: text('title').notNull(),
    description: text('description'),
    category: text('category'), // 'health', 'finance', 'personal', etc.

    // Progress tracking
    targetValue: real('target_value'),
    currentValue: real('current_value').default(0),
    baselineValue: real('baseline_value'),
    unit: text('unit'), // 'per_week', 'hours', 'times', etc.

    // Status tracking
    status: text('status').default('active'), // 'active', 'paused', 'completed', 'abandoned'

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    targetDate: integer('target_date', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    lastProgressAt: integer('last_progress_at', { mode: 'timestamp' }),

    // Flexible metadata for future extensions
    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => ({
    userIdx: index('idx_goals_user').on(table.userId),
    statusIdx: index('idx_goals_status').on(table.status),
    categoryIdx: index('idx_goals_category').on(table.category),
  })
);

// Progress entries table (MVP v4) - Logs progress updates over time
export const progressEntries = sqliteTable(
  'progress_entries',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),

    // Progress data
    value: real('value').notNull(),
    notes: text('notes'),

    // Tracking information
    loggedAt: integer('logged_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    source: text('source').default('manual'), // 'manual', 'extracted', 'calculated'

    // Link to conversation context
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => ({
    goalIdx: index('idx_progress_goal').on(table.goalId),
    loggedIdx: index('idx_progress_logged').on(table.loggedAt),
  })
);

// Goal milestones table (MVP v4) - Optional intermediate targets
export const goalMilestones = sqliteTable(
  'goal_milestones',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),

    // Milestone definition
    title: text('title').notNull(),
    targetValue: real('target_value').notNull(),
    sequence: integer('sequence').notNull(), // Order of milestones

    // Achievement tracking
    achieved: integer('achieved').default(0), // 0 = false, 1 = true
    achievedAt: integer('achieved_at', { mode: 'timestamp' }),

    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => ({
    goalIdx: index('idx_milestones_goal').on(table.goalId),
    sequenceIdx: index('idx_milestones_sequence').on(table.sequence),
  })
);

// Type exports for insert and select
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ConversationStateRow = typeof conversationStates.$inferSelect;
export type NewConversationState = typeof conversationStates.$inferInsert;
export type DomainDataRow = typeof domainData.$inferSelect;
export type NewDomainData = typeof domainData.$inferInsert;

// MVP v4: Goal-related type exports
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type ProgressEntry = typeof progressEntries.$inferSelect;
export type NewProgressEntry = typeof progressEntries.$inferInsert;
export type GoalMilestone = typeof goalMilestones.$inferSelect;
export type NewGoalMilestone = typeof goalMilestones.$inferInsert;
