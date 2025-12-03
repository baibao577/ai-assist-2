# Track Progress Mode - Technical Design Specifications

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                        Pipeline                           │
├──────────────────────────────────────────────────────────┤
│  Load → Decay → Classify → Enrich → Orchestrate → Save   │
└─────────────────────────────┬────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │Response Orchestrator│
                    └─────────┬─────────┘
                              │
        ┌──────────┬──────────┼──────────┬──────────┐
        │          │          │          │          │
   ┌────▼────┐ ┌──▼───┐ ┌────▼─────┐ ┌─▼───┐ ┌───▼──┐
   │SMALLTALK│ │CONSULT│ │TRACK     │ │META │ │Future│
   │Handler  │ │Handler│ │PROGRESS  │ │     │ │Modes │
   └─────────┘ └───────┘ │Handler   │ └─────┘ └──────┘
                         └──────────┘
```

## Database Schema

> **Note**: This project uses the existing SQLite database with Drizzle ORM. Tables are created via `CREATE TABLE IF NOT EXISTS` in `client.ts` following the MVP v4 pattern (no migration files).

### Goals Table

```typescript
// src/database/schema.ts additions (MVP v4)

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text('user_id').notNull(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }),

  // Goal definition
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'), // 'health', 'finance', 'personal', etc.

  // Progress tracking
  targetValue: real('target_value'),
  currentValue: real('current_value').default(0),
  baselineValue: real('baseline_value'),
  unit: text('unit'), // 'per_week', 'hours', 'times', etc.

  // Status
  status: text('status').default('active'), // 'active', 'paused', 'completed', 'abandoned'

  // Timestamps - using integer with timestamp mode (consistent with existing tables)
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  targetDate: integer('target_date', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  lastProgressAt: integer('last_progress_at', { mode: 'timestamp' }),

  // Metadata - JSON mode for flexible data
  metadata: text('metadata', { mode: 'json' }),
}, (table) => ({
  userIdx: index('idx_goals_user').on(table.userId),
  statusIdx: index('idx_goals_status').on(table.status),
  categoryIdx: index('idx_goals_category').on(table.category),
}));
```

### Progress Entries Table

```typescript
export const progressEntries = sqliteTable('progress_entries', {
  id: text('id').primaryKey().default(sql`lower(hex(randomblob(16)))`),
  goalId: text('goal_id')
    .notNull()
    .references(() => goals.id, { onDelete: 'cascade' }),

  // Progress data
  value: real('value').notNull(),
  notes: text('notes'),

  // Tracking
  loggedAt: integer('logged_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  source: text('source').default('manual'), // 'manual', 'extracted', 'calculated'

  // Context
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }),
  metadata: text('metadata', { mode: 'json' }),
}, (table) => ({
  goalIdx: index('idx_progress_goal').on(table.goalId),
  loggedIdx: index('idx_progress_logged').on(table.loggedAt),
}));
```

### Goal Milestones Table

```typescript
export const goalMilestones = sqliteTable('goal_milestones', {
  id: text('id').primaryKey().default(sql`lower(hex(randomblob(16)))`),
  goalId: text('goal_id')
    .notNull()
    .references(() => goals.id, { onDelete: 'cascade' }),

  // Milestone definition
  title: text('title').notNull(),
  targetValue: real('target_value').notNull(),
  sequence: integer('sequence').notNull(), // Order of milestones

  // Status
  achieved: integer('achieved', { mode: 'boolean' }).default(false),
  achievedAt: integer('achieved_at', { mode: 'timestamp' }),

  // Metadata
  metadata: text('metadata', { mode: 'json' }),
}, (table) => ({
  goalIdx: index('idx_milestones_goal').on(table.goalId),
  sequenceIdx: index('idx_milestones_sequence').on(table.sequence),
}));

// Type exports using Drizzle's inference
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type ProgressEntry = typeof progressEntries.$inferSelect;
export type NewProgressEntry = typeof progressEntries.$inferInsert;
export type GoalMilestone = typeof goalMilestones.$inferSelect;
export type NewGoalMilestone = typeof goalMilestones.$inferInsert;
```

## Database Initialization

```typescript
// src/database/client.ts - Add to initializeDatabase() function
// This follows the existing pattern - no migration files

function initializeDatabase(database: any): void {
  const sqlite = (database as any).session.client as Database.Database;

  // ... existing table creation (conversations, messages, conversation_states, domain_data) ...

  // MVP v4: Track Progress tables
  logger.info('Creating Track Progress tables (MVP v4)...');

  // Goals table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      target_value REAL,
      current_value REAL DEFAULT 0,
      baseline_value REAL,
      unit TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      target_date INTEGER,
      completed_at INTEGER,
      last_progress_at INTEGER,
      metadata TEXT
    )
  `);

  // Progress entries table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS progress_entries (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      value REAL NOT NULL,
      notes TEXT,
      logged_at INTEGER NOT NULL DEFAULT (unixepoch()),
      source TEXT DEFAULT 'manual',
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      metadata TEXT
    )
  `);

  // Goal milestones table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS goal_milestones (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target_value REAL NOT NULL,
      sequence INTEGER NOT NULL,
      achieved INTEGER DEFAULT 0,
      achieved_at INTEGER,
      metadata TEXT
    )
  `);

  // Create indexes for performance
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_goals_category ON goals(category)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_progress_goal ON progress_entries(goal_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_progress_logged ON progress_entries(logged_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_milestones_goal ON goal_milestones(goal_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_milestones_sequence ON goal_milestones(sequence)`);

  logger.info('Track Progress tables created successfully');
}
```

## Type Definitions

### Core Types

```typescript
// src/types/progress.ts

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  targetValue?: number;
  currentValue: number;
  baselineValue?: number;
  unit?: string;
  status: GoalStatus;
  createdAt: Date;
  targetDate?: Date;
  completedAt?: Date;
  lastProgressAt?: Date;
  metadata?: Record<string, any>;
}

export enum GoalStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

export interface ProgressEntry {
  id: string;
  goalId: string;
  value: number;
  notes?: string;
  loggedAt: Date;
  source: ProgressSource;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export enum ProgressSource {
  MANUAL = 'manual',
  EXTRACTED = 'extracted',
  CALCULATED = 'calculated',
}

export interface GoalMilestone {
  id: string;
  goalId: string;
  title: string;
  targetValue: number;
  sequence: number;
  achieved: boolean;
  achievedAt?: Date;
}

export interface ProgressAnalytics {
  goal: Goal;
  trend: ProgressTrend;
  completionPercentage: number;
  estimatedCompletionDate?: Date;
  recentEntries: ProgressEntry[];
  milestones: GoalMilestone[];
  insights: ProgressInsight[];
}

export enum ProgressTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
  INSUFFICIENT_DATA = 'insufficient_data',
}

export interface ProgressInsight {
  type: 'pattern' | 'correlation' | 'prediction' | 'suggestion';
  message: string;
  confidence: number;
  data?: Record<string, any>;
}
```

### Orchestrator Types

```typescript
// src/types/orchestrator.ts

export interface ModeSegment {
  mode: ConversationMode;
  content: string;
  metadata: {
    type: SegmentType;
    priority: number;
    standalone: boolean;
    transitions?: {
      before?: string[];
      after?: string[];
    };
  };
}

export enum SegmentType {
  GREETING = 'greeting',
  ANALYSIS = 'analysis',
  ADVICE = 'advice',
  QUESTION = 'question',
  SUMMARY = 'summary',
  CONFIRMATION = 'confirmation',
}

export interface OrchestratedResponse {
  segments: ModeSegment[];
  composedResponse: string;
  activeModes: ConversationMode[];
  metadata: {
    totalSegments: number;
    compositionTime: number;
    transitionsAdded: number;
  };
}

export interface MultiIntent {
  intents: Intent[];
  primaryIntent: Intent;
  confidence: number;
}

export interface Intent {
  type: string;
  mode: ConversationMode;
  confidence: number;
  entities?: Record<string, any>;
}
```

## Class Implementations

### TrackProgressModeHandler

```typescript
// src/core/modes/track-progress.handler.ts

import { BaseModeHandler } from './base-handler.js';
import { ConversationMode, type HandlerContext } from '@/types/index.js';
import { GoalRepository } from '@/database/repositories/goal.repository.js';
import { ProgressRepository } from '@/database/repositories/progress.repository.js';

export class TrackProgressModeHandler extends BaseModeHandler {
  readonly mode = ConversationMode.TRACK_PROGRESS;

  private goalRepo: GoalRepository;
  private progressRepo: ProgressRepository;

  constructor() {
    super();
    this.goalRepo = new GoalRepository();
    this.progressRepo = new ProgressRepository();
  }

  protected buildSystemPrompt(context: HandlerContext): string {
    return `You are a goal and progress tracking assistant.

Your responsibilities:
- Help users set SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound)
- Track progress and provide analytics
- Offer encouragement and insights based on trends
- Suggest adjustments when needed

Current context:
- User has ${context.activeGoals?.length || 0} active goals
- Most recent progress: ${context.lastProgress || 'None'}

Guidelines:
- Be encouraging but realistic
- Use data to provide insights
- Celebrate milestones appropriately
- Suggest concrete next steps`;
  }

  async handle(context: HandlerContext): Promise<ModeSegment> {
    const intent = this.detectProgressIntent(context);

    switch(intent) {
      case ProgressIntent.SET_GOAL:
        return this.handleGoalSetting(context);
      case ProgressIntent.LOG_PROGRESS:
        return this.handleProgressLogging(context);
      case ProgressIntent.VIEW_PROGRESS:
        return this.handleProgressView(context);
      case ProgressIntent.REVIEW_GOALS:
        return this.handleGoalReview(context);
      default:
        return this.handleGeneralProgress(context);
    }
  }

  private async handleProgressView(context: HandlerContext): Promise<ModeSegment> {
    const goals = await this.goalRepo.getActiveGoals(context.userId);
    const analytics = await this.calculateAnalytics(goals);

    return {
      mode: this.mode,
      content: this.formatProgressReport(analytics),
      metadata: {
        type: SegmentType.ANALYSIS,
        priority: 1,
        standalone: false,
      },
    };
  }

  private formatProgressReport(analytics: ProgressAnalytics[]): string {
    // Format progress data into readable report
    // Include trends, percentages, insights
    // Add text-based visualizations
  }
}
```

### Response Orchestrator

```typescript
// src/core/orchestrator/ResponseOrchestrator.ts

export class ResponseOrchestrator {
  private modeHandlers: Map<ConversationMode, IModeHandler>;
  private multiIntentClassifier: MultiIntentClassifier;
  private composer: ResponseComposer;

  constructor() {
    this.modeHandlers = new Map();
    this.multiIntentClassifier = new MultiIntentClassifier();
    this.composer = new ResponseComposer();
    this.registerHandlers();
  }

  async orchestrate(context: HandlerContext): Promise<string> {
    // 1. Detect multiple intents
    const multiIntent = await this.multiIntentClassifier.classify(context);

    // 2. Determine which modes to activate
    const activeModes = this.selectModes(multiIntent, context);

    // 3. Call handlers in parallel
    const segments = await this.collectSegments(activeModes, context);

    // 4. Compose unified response
    const orchestrated = this.composer.compose(segments, context);

    return orchestrated.composedResponse;
  }

  private selectModes(
    multiIntent: MultiIntent,
    context: HandlerContext
  ): ConversationMode[] {
    // Apply compatibility rules
    // Respect maximum modes per response
    // Consider context and state

    const modes: ConversationMode[] = [];
    const config = getOrchestratorConfig();

    for (const intent of multiIntent.intents) {
      if (modes.length >= config.maxModesPerResponse) break;

      const mode = intent.mode;
      if (this.isCompatible(mode, modes)) {
        modes.push(mode);
      }
    }

    return modes;
  }

  private async collectSegments(
    modes: ConversationMode[],
    context: HandlerContext
  ): Promise<ModeSegment[]> {
    const segmentPromises = modes.map(mode => {
      const handler = this.modeHandlers.get(mode);
      if (!handler) throw new Error(`No handler for mode: ${mode}`);
      return handler.handle(context);
    });

    return Promise.all(segmentPromises);
  }
}
```

### Response Composer

```typescript
// src/core/orchestrator/ResponseComposer.ts

export class ResponseComposer {
  private transitionPhrases: Map<string, string[]>;

  constructor() {
    this.loadTransitionPhrases();
  }

  compose(
    segments: ModeSegment[],
    context: HandlerContext
  ): OrchestratedResponse {
    // 1. Order segments by priority
    const ordered = this.orderSegments(segments);

    // 2. Build response with transitions
    const parts: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
      const segment = ordered[i];
      const prevSegment = ordered[i - 1];
      const nextSegment = ordered[i + 1];

      // Add transition if needed
      if (prevSegment && this.needsTransition(prevSegment, segment)) {
        const transition = this.selectTransition(prevSegment.mode, segment.mode);
        parts.push(transition);
      }

      // Add segment content
      parts.push(segment.content);
    }

    // 3. Clean up and format
    const composed = this.cleanupResponse(parts.join('\n\n'));

    return {
      segments: ordered,
      composedResponse: composed,
      activeModes: segments.map(s => s.mode),
      metadata: {
        totalSegments: segments.length,
        compositionTime: Date.now(),
        transitionsAdded: this.countTransitions(parts),
      },
    };
  }

  private orderSegments(segments: ModeSegment[]): ModeSegment[] {
    return segments.sort((a, b) => {
      // Greeting always first
      if (a.metadata.type === SegmentType.GREETING) return -1;
      if (b.metadata.type === SegmentType.GREETING) return 1;

      // Then by priority
      return a.metadata.priority - b.metadata.priority;
    });
  }

  private needsTransition(from: ModeSegment, to: ModeSegment): boolean {
    // Don't transition between same modes
    if (from.mode === to.mode) return false;

    // Check if segments can stand alone
    if (from.metadata.standalone && to.metadata.standalone) return false;

    // Otherwise, add transition
    return true;
  }

  private selectTransition(from: ConversationMode, to: ConversationMode): string {
    const key = `${from}_TO_${to}`;
    const phrases = this.transitionPhrases.get(key) || [
      'Additionally,',
      'Also,',
      'Furthermore,',
    ];

    return phrases[Math.floor(Math.random() * phrases.length)];
  }
}
```

## Progress Domain Implementation

### Progress Extractor

```typescript
// src/domains/progress/extractors/ProgressExtractor.ts

import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';
import { progressSchema } from '../schemas/progress.schema.js';

export class ProgressExtractor extends BaseExtractor {
  domainId = 'progress';
  schema = progressSchema;

  protected buildExtractionPrompt(
    message: string,
    context: ExtractionContext
  ): string {
    return `Extract goal-setting and progress-tracking information from the user's message.

Message: "${message}"

Look for:
- Goal setting intentions ("I want to...", "My goal is...")
- Progress updates ("I did...", "I achieved...")
- Metric values and measurements
- Time references
- Completion indicators

Return JSON:
{
  "goalIntent": {
    "action": "set" | "update" | "review" | "cancel" | null,
    "title": "goal title if mentioned",
    "target": "target value if mentioned",
    "unit": "unit of measurement",
    "timeframe": "by when"
  },
  "progressUpdate": {
    "value": "numeric value",
    "metric": "what was measured",
    "period": "time period",
    "notes": "any additional context"
  },
  "confidence": 0.0-1.0
}`;
  }
}
```

### Progress Schema

```typescript
// src/domains/progress/schemas/progress.schema.ts

import { z } from 'zod';

export const progressSchema = z.object({
  goalIntent: z.object({
    action: z.enum(['set', 'update', 'review', 'cancel']).nullable(),
    title: z.string().nullable(),
    target: z.number().nullable(),
    unit: z.string().nullable(),
    timeframe: z.string().nullable(),
  }).nullable(),

  progressUpdate: z.object({
    value: z.number().nullable(),
    metric: z.string().nullable(),
    period: z.string().nullable(),
    notes: z.string().nullable(),
  }).nullable(),

  confidence: z.number().min(0).max(1),
});

export type ProgressData = z.infer<typeof progressSchema>;
```

## Configuration

### Orchestrator Configuration

```typescript
// src/config/orchestrator.config.ts

export interface OrchestratorConfig {
  maxModesPerResponse: number;
  modeCompatibility: Record<ConversationMode, ConversationMode[]>;
  transitionPhrases: Record<string, string[]>;
  compositionRules: CompositionRule[];
}

export const orchestratorConfig: OrchestratorConfig = {
  maxModesPerResponse: 3,

  modeCompatibility: {
    [ConversationMode.SMALLTALK]: [
      ConversationMode.TRACK_PROGRESS,
      ConversationMode.CONSULT,
      ConversationMode.META,
    ],
    [ConversationMode.TRACK_PROGRESS]: [
      ConversationMode.CONSULT,
      ConversationMode.SMALLTALK,
    ],
    [ConversationMode.CONSULT]: [
      ConversationMode.TRACK_PROGRESS,
      ConversationMode.SMALLTALK,
    ],
    [ConversationMode.META]: [
      ConversationMode.SMALLTALK,
    ],
  },

  transitionPhrases: {
    'SMALLTALK_TO_TRACK_PROGRESS': [
      "Now, about your progress -",
      "Let me check on your goals.",
      "Speaking of your goals,",
    ],
    'TRACK_PROGRESS_TO_CONSULT': [
      "Based on your progress,",
      "Given these trends,",
      "To help you improve further,",
    ],
    'CONSULT_TO_TRACK_PROGRESS': [
      "This relates to your goal of",
      "To track this improvement,",
      "Let's monitor this by",
    ],
  },

  compositionRules: [
    {
      name: 'greeting_first',
      condition: (segments) => segments.some(s => s.metadata.type === 'greeting'),
      action: (segments) => /* move greeting to front */,
    },
    {
      name: 'summary_last',
      condition: (segments) => segments.some(s => s.metadata.type === 'summary'),
      action: (segments) => /* move summary to end */,
    },
  ],
};
```

## API Contracts

### Goal Repository Implementation

```typescript
// src/database/repositories/goal.repository.ts
// Following the existing repository pattern from conversation/message/state repositories

import { getDatabase } from '../client.js';
import { goals, type Goal, type NewGoal } from '../schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DatabaseError } from '@/types/errors.js';
import { logger } from '@/core/logger.js';

export class GoalRepository {
  private db = getDatabase(); // Singleton database instance

  async create(data: Omit<NewGoal, 'id' | 'createdAt'>): Promise<Goal> {
    try {
      const [goal] = await this.db
        .insert(goals)
        .values({
          ...data,
          createdAt: new Date(),
        })
        .returning();

      logger.info({ goalId: goal.id, userId: goal.userId }, 'Goal created');
      return goal;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create goal');
      throw new DatabaseError('Failed to create goal', error);
    }
  }

  async findById(id: string): Promise<Goal | null> {
    const result = await this.db
      .select()
      .from(goals)
      .where(eq(goals.id, id))
      .limit(1);

    return result[0] || null;
  }

  async getActiveGoals(userId: string): Promise<Goal[]> {
    return await this.db
      .select()
      .from(goals)
      .where(and(
        eq(goals.userId, userId),
        eq(goals.status, 'active')
      ))
      .orderBy(desc(goals.createdAt));
  }

  async updateProgress(goalId: string, value: number): Promise<Goal> {
    const [updated] = await this.db
      .update(goals)
      .set({
        currentValue: value,
        lastProgressAt: new Date(),
      })
      .where(eq(goals.id, goalId))
      .returning();

    if (!updated) {
      throw new DatabaseError('Goal not found');
    }

    return updated;
  }

  async completeGoal(id: string): Promise<Goal> {
    const [completed] = await this.db
      .update(goals)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(goals.id, id))
      .returning();

    return completed;
  }
}

// Singleton export (consistent with existing repositories)
export const goalRepository = new GoalRepository();
```

### Progress Analytics Service

```typescript
// src/services/progress-analytics.service.ts

export interface IProgressAnalyticsService {
  calculateTrend(entries: ProgressEntry[]): ProgressTrend;
  calculateCompletion(goal: Goal): number;
  estimateCompletionDate(goal: Goal, entries: ProgressEntry[]): Date | null;
  generateInsights(goal: Goal, entries: ProgressEntry[]): ProgressInsight[];
  detectPatterns(entries: ProgressEntry[]): Pattern[];
  compareToBaseline(goal: Goal): ComparisonResult;
}
```

## Integration Points

### Pipeline Integration

```typescript
// src/core/pipeline.ts modifications

class Pipeline {
  private orchestrator: ResponseOrchestrator;

  async execute(context: PipelineContext): Promise<PipelineResult> {
    // ... existing stages ...

    // HANDLER STAGE - Now uses orchestrator
    const enrichedContext = {
      ...context,
      activeGoals: await this.loadActiveGoals(context.userId),
      recentProgress: await this.loadRecentProgress(context.userId),
    };

    const response = await this.orchestrator.orchestrate(enrichedContext);

    // ... save stage ...

    return { response };
  }
}
```

### State Enrichment

```typescript
// Additional state properties for progress tracking

interface EnhancedConversationState extends ConversationState {
  // Progress tracking
  activeGoals: Goal[];
  recentProgressEntries: ProgressEntry[];
  progressContext: {
    lastGoalMention: Date | null;
    lastProgressCheck: Date | null;
    primaryGoalDomain: string | null;
    suggestedCheckIn: Date | null;
  };

  // Multi-mode support
  multiModeContext: {
    detectedIntents: Intent[];
    activeModes: ConversationMode[];
    lastOrchestration: Date | null;
  };
}
```

## Error Handling

### Goal Operations

```typescript
class GoalError extends Error {
  constructor(
    message: string,
    public code: GoalErrorCode,
    public goalId?: string
  ) {
    super(message);
    this.name = 'GoalError';
  }
}

enum GoalErrorCode {
  GOAL_NOT_FOUND = 'GOAL_NOT_FOUND',
  INVALID_TARGET = 'INVALID_TARGET',
  ALREADY_COMPLETED = 'ALREADY_COMPLETED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}
```

### Orchestration Errors

```typescript
class OrchestrationError extends Error {
  constructor(
    message: string,
    public failedModes: ConversationMode[],
    public partialResponse?: string
  ) {
    super(message);
    this.name = 'OrchestrationError';
  }
}
```

## Performance Considerations

### Database Indexes
- Goal queries by userId and status
- Progress entries by goalId and loggedAt
- Milestones by goalId and sequence

### Caching Strategy
- Cache active goals for session duration
- Cache recent progress entries (last 30 days)
- Invalidate on updates

### Query Optimization
- Batch load goals and progress in parallel
- Use database aggregations for analytics
- Limit progress history to relevant timeframe

## Testing Strategy

### Unit Tests
- Goal CRUD operations
- Progress calculations
- Trend detection algorithms
- Response composition logic

### Integration Tests
- Multi-mode response generation
- Goal-to-progress linking
- Domain data correlation
- Pipeline flow with orchestrator

### End-to-End Tests
- Complete goal lifecycle
- Progress tracking over time
- Multi-intent conversation flows
- Mode cooperation scenarios

## Security Considerations

- Goals are user-scoped (no cross-user access)
- Validate numeric inputs for progress
- Sanitize goal titles and descriptions
- Rate limit goal creation (prevent spam)
- Audit log for goal modifications

## Deployment Strategy

### Database Changes
- Tables auto-create on application startup via `initializeDatabase()`
- No migration files or commands needed
- Idempotent - safe to restart application multiple times

### Code Deployment
1. Deploy schema changes in `schema.ts`
2. Deploy table creation in `client.ts`
3. Deploy new handlers (backward compatible)
4. Enable orchestrator (with feature flag if needed)
5. Existing conversations continue to work

## Monitoring & Metrics

### Key Metrics
- Goal creation rate
- Progress logging frequency
- Goal completion rate
- Multi-mode response usage
- Orchestration latency
- Mode cooperation success rate

### Logging Points
- Goal lifecycle events
- Progress entry creation
- Orchestration decisions
- Mode selection reasoning
- Composition performance

---

## Related Documents
- [01_overview.md](01_overview.md) - Solution overview
- [02_mvp_phases.md](02_mvp_phases.md) - Phased implementation plan
- [03_implementation_tracker.md](03_implementation_tracker.md) - Implementation checklist

## Important Implementation Notes

### Database Integration
- **Uses existing SQLite database** with Drizzle ORM (no separate database)
- **No migration files** - Tables created via `CREATE TABLE IF NOT EXISTS` in `client.ts`
- **Follows MVP progression**: v1 (conversations) → v2 (states) → v3 (domains) → v4 (track progress)
- **Singleton database instance** from `getDatabase()` function
- **Same ID generation pattern**: `lower(hex(randomblob(16)))` - no UUID library needed

### Timestamp Pattern
- **All timestamps use** `integer({ mode: 'timestamp' })`
- **Stored as Unix timestamps** in SQLite (integers)
- **Automatically converted** to/from Date objects by Drizzle
- **Consistent with** existing tables (conversations, messages, etc.)

### Repository Pattern
- **Follow existing pattern** from conversation/message/state repositories
- **Singleton exports**: `export const goalRepository = new GoalRepository()`
- **Uses Drizzle query builder** for type safety
- **Error handling** via `DatabaseError` class
- **Logging** with structured logging via pino

### JSON Storage
- **Metadata columns** use `text({ mode: 'json' })`
- **Automatic serialization** by Drizzle
- **Flexible for future extensions** without schema changes

### Import Patterns
- **Use @/ aliases** for imports: `@/core/`, `@/types/`, `@/database/`
- **Extension in imports**: Always include `.js` extension
- **Consistent with** existing codebase patterns

### Testing Approach
- **No migration tests needed** (no migrations)
- **Use existing test setup** from package.json
- **Repository tests** follow existing patterns
- **Integration tests** with actual SQLite database

### Key Differences from Standard Drizzle Projects
1. **No drizzle-kit migrations** - Direct SQL execution on startup
2. **MVP-focused approach** - Progressive enhancement
3. **Single database file** - SQLite with WAL mode
4. **Idempotent initialization** - Safe to run multiple times

### File Locations
```
src/
├── database/
│   ├── client.ts          # Add table creation here
│   ├── schema.ts          # Add table definitions here
│   └── repositories/
│       ├── goal.repository.ts     # New file
│       └── progress.repository.ts # New file
├── types/
│   └── progress.ts        # Goal/Progress types (if not using inference)
├── core/
│   ├── modes/
│   │   └── track-progress.handler.ts # New mode handler
│   └── orchestrator/      # New directory for multi-mode
└── domains/
    └── progress/          # New domain for extraction
```

### Development Workflow
1. **Add schema** to `src/database/schema.ts`
2. **Add table creation** to `src/database/client.ts` `initializeDatabase()`
3. **Create repository** in `src/database/repositories/`
4. **Test locally** - Tables auto-create on startup
5. **No migration commands** needed

### Configuration
- **Database path**: Set via `DATABASE_PATH` env variable
- **Default location**: `./data/assistant.db`
- **Drizzle Studio**: Available on port 5002 (`npm run db:studio`)

---

## Related Documents
- [01_overview.md](01_overview.md) - Solution overview
- [02_mvp_phases.md](02_mvp_phases.md) - Phased implementation plan
- [03_implementation_tracker.md](03_implementation_tracker.md) - Implementation checklist
