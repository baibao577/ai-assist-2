# Database Schema Design

## Overview
SQLite database with Drizzle ORM for managing conversation state, messages, classifications, and flows.

## Core Tables

### 1. conversations
```typescript
{
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull(), // active, completed, expired
  mode: text('mode'), // current conversation mode
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 2. messages
```typescript
{
  id: text('id').primaryKey(), // UUID
  conversationId: text('conversation_id').notNull().references(conversations.id),
  role: text('role').notNull(), // user, assistant, system
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  metadata: text('metadata', { mode: 'json' }), // tokens, processing time, etc
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 3. conversation_states
```typescript
{
  id: text('id').primaryKey(), // UUID
  conversationId: text('conversation_id').notNull().references(conversations.id),
  version: integer('version').notNull(),
  state: text('state', { mode: 'json' }).notNull(), // Full state object
  previousStateId: text('previous_state_id').references(conversation_states.id),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 4. classification_results
```typescript
{
  id: text('id').primaryKey(), // UUID
  messageId: text('message_id').notNull().references(messages.id),
  classifierName: text('classifier_name').notNull(), // safety, intent, topic, sentiment
  result: text('result', { mode: 'json' }).notNull(),
  confidence: real('confidence').notNull(),
  processingTimeMs: integer('processing_time_ms').notNull(),
  llmModel: text('llm_model'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 5. arbiter_decisions
```typescript
{
  id: text('id').primaryKey(), // UUID
  messageId: text('message_id').notNull().references(messages.id),
  finalClassification: text('final_classification', { mode: 'json' }).notNull(),
  reasoning: text('reasoning'),
  classifierAgreement: real('classifier_agreement').notNull(), // percentage
  overrides: text('overrides', { mode: 'json' }), // manual overrides applied
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 6. flows
```typescript
{
  id: text('id').primaryKey(), // UUID
  conversationId: text('conversation_id').notNull().references(conversations.id),
  flowType: text('flow_type').notNull(), // goal_setting, habit_formation, etc
  currentStep: integer('current_step').notNull(),
  totalSteps: integer('total_steps').notNull(),
  state: text('state', { mode: 'json' }).notNull(), // Flow-specific state
  status: text('status').notNull(), // active, paused, completed, abandoned
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 7. user_goals
```typescript
{
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull(),
  conversationId: text('conversation_id').references(conversations.id),
  goal: text('goal').notNull(),
  category: text('category'), // extracted category
  status: text('status').notNull(), // active, achieved, abandoned
  extractedAt: integer('extracted_at', { mode: 'timestamp' }).notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 8. traces
```typescript
{
  id: text('id').primaryKey(), // UUID
  conversationId: text('conversation_id').notNull().references(conversations.id),
  messageId: text('message_id').references(messages.id),
  stage: text('stage').notNull(), // load, decay, global, classify, handle, post, save
  startTime: integer('start_time', { mode: 'timestamp' }).notNull(),
  endTime: integer('end_time', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'),
  status: text('status').notNull(), // started, completed, failed
  data: text('data', { mode: 'json' }), // Stage-specific debug data
  error: text('error', { mode: 'json' }), // Error details if failed
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

### 9. system_metrics
```typescript
{
  id: text('id').primaryKey(), // UUID
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  metricType: text('metric_type').notNull(), // latency, memory, api_calls, etc
  value: real('value').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
}
```

## Indexes
```typescript
// Performance indexes
createIndex('idx_messages_conversation').on(messages.conversationId)
createIndex('idx_messages_timestamp').on(messages.timestamp)
createIndex('idx_states_conversation').on(conversation_states.conversationId)
createIndex('idx_classification_message').on(classification_results.messageId)
createIndex('idx_flows_conversation').on(flows.conversationId)
createIndex('idx_flows_status').on(flows.status)
createIndex('idx_traces_conversation').on(traces.conversationId)
createIndex('idx_traces_stage').on(traces.stage)
createIndex('idx_goals_user').on(user_goals.userId)
createIndex('idx_goals_status').on(user_goals.status)
```

## Repository Pattern Implementation

### ConversationRepository
- `create(userId: string): Promise<Conversation>`
- `findById(id: string): Promise<Conversation | null>`
- `findActiveByUserId(userId: string): Promise<Conversation[]>`
- `updateActivity(id: string): Promise<void>`
- `expire(id: string): Promise<void>`

### MessageRepository
- `create(data: CreateMessageDto): Promise<Message>`
- `findByConversationId(conversationId: string, limit?: number): Promise<Message[]>`
- `getRecentMessages(conversationId: string, count: number): Promise<Message[]>`

### StateRepository
- `saveState(conversationId: string, state: ConversationState): Promise<void>`
- `getLatestState(conversationId: string): Promise<ConversationState | null>`
- `getStateHistory(conversationId: string, limit?: number): Promise<ConversationState[]>`

### ClassificationRepository
- `saveClassification(data: ClassificationResult): Promise<void>`
- `getClassificationsForMessage(messageId: string): Promise<ClassificationResult[]>`
- `saveArbiterDecision(data: ArbiterDecision): Promise<void>`

### FlowRepository
- `createFlow(data: CreateFlowDto): Promise<Flow>`
- `updateFlowStep(id: string, step: number, state: any): Promise<void>`
- `completeFlow(id: string): Promise<void>`
- `getActiveFlow(conversationId: string): Promise<Flow | null>`

### TraceRepository
- `startTrace(data: StartTraceDto): Promise<string>`
- `completeTrace(id: string, data?: any): Promise<void>`
- `failTrace(id: string, error: any): Promise<void>`
- `getTracesByConversation(conversationId: string): Promise<Trace[]>`

## Migration Strategy
1. Initial schema creation
2. Seed data for testing
3. Indexes for performance
4. Views for common queries
5. Triggers for updated_at timestamps