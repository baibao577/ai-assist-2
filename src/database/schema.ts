// Database schema using Drizzle ORM
// MVP v1: Basic conversations and messages tables
// MVP v2: Added conversation_states table for state management
// MVP v3: Added domain_data table for domains framework

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

// Type exports for insert and select
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ConversationStateRow = typeof conversationStates.$inferSelect;
export type NewConversationState = typeof conversationStates.$inferInsert;
export type DomainDataRow = typeof domainData.$inferSelect;
export type NewDomainData = typeof domainData.$inferInsert;
