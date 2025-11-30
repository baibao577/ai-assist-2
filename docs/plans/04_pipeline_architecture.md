# Pipeline Architecture Implementation Plan

## Overview
The 7-stage pipeline is the core processing engine that handles every message through sequential stages with error recovery and tracing.

## Pipeline Components

### 1. Pipeline Manager
```typescript
class PipelineManager {
  private stages: Map<string, PipelineStage<any, any>>;
  private traceService: TraceService;
  private errorHandler: ErrorHandler;

  async execute(input: PipelineInput): Promise<PipelineOutput> {
    // Sequential execution with error recovery
    // Trace each stage
    // Handle rollbacks if needed
  }
}
```

### 2. Stage Implementations

#### Stage 1: Load Stage
**Purpose**: Load conversation state and recent messages from database
```typescript
class LoadStage implements PipelineStage<LoadStageInput, LoadStageOutput> {
  constructor(
    private conversationRepo: ConversationRepository,
    private messageRepo: MessageRepository,
    private stateRepo: StateRepository
  ) {}

  async execute(input: LoadStageInput): Promise<LoadStageOutput> {
    // 1. Load or create conversation
    // 2. Load recent messages (last 10)
    // 3. Load latest state or initialize
    // 4. Validate state integrity
    // 5. Return consolidated data
  }
}
```

**Database Operations**:
- Query conversation by ID or create new
- Fetch last 10 messages
- Load latest state snapshot
- Start transaction for consistency

#### Stage 2: Decay Stage
**Purpose**: Apply time-based decay to conversation elements
```typescript
class DecayStage implements PipelineStage<DecayStageInput, DecayStageOutput> {
  private decayRules: DecayRule[];

  async execute(input: DecayStageInput): Promise<DecayStageOutput> {
    // 1. Calculate time since last activity
    // 2. Apply decay to context elements
    // 3. Clear expired goals
    // 4. Reset stale flow states
    // 5. Update conversation freshness
  }
}
```

**Decay Rules**:
- Messages older than 24h: reduce weight by 50%
- Goals older than 7 days: mark for review
- Inactive flows > 1 hour: prompt continuation
- Session data > 30 min: clear sensitive info

#### Stage 3: Global Stage
**Purpose**: Extract global insights and update user profile
```typescript
class GlobalStage implements PipelineStage<GlobalStageInput, GlobalStageOutput> {
  private extractors: DataExtractor[];

  async execute(input: GlobalStageInput): Promise<GlobalStageOutput> {
    // 1. Extract user goals from message
    // 2. Identify entities and keywords
    // 3. Update user preferences
    // 4. Detect pattern changes
    // 5. Enrich conversation context
  }
}
```

**Extraction Tasks**:
- Goal extraction using NLP
- Entity recognition (dates, names, locations)
- Preference detection
- Behavioral pattern analysis

#### Stage 4: Classification Stage
**Purpose**: Run parallel classifiers and arbitrate results
```typescript
class ClassificationStage implements PipelineStage<ClassifyStageInput, ClassifyStageOutput> {
  private classifiers: Map<string, Classifier>;
  private arbiter: Arbiter;

  async execute(input: ClassifyStageInput): Promise<ClassifyStageOutput> {
    // 1. Prepare classifier inputs
    // 2. Run 4 classifiers in parallel
    // 3. Wait with timeout (600ms)
    // 4. Collect results
    // 5. Run arbiter for final decision
  }
}
```

**Parallel Execution**:
```typescript
const results = await Promise.allSettled([
  this.runSafetyClassifier(input),
  this.runIntentClassifier(input),
  this.runTopicClassifier(input),
  this.runSentimentClassifier(input)
].map(p => Promise.race([p, timeout(600)])));
```

#### Stage 5: Handle Stage
**Purpose**: Generate response based on classification
```typescript
class HandleStage implements PipelineStage<HandleStageInput, HandleStageOutput> {
  private handlers: Map<ConversationMode, ModeHandler>;

  async execute(input: HandleStageInput): Promise<HandleStageOutput> {
    // 1. Select handler based on mode
    // 2. Check safety flags first
    // 3. Process through mode handler
    // 4. Generate response
    // 5. Update state
  }
}
```

**Mode Routing**:
- Safety check (crisis/escalation)
- Mode-specific handler selection
- Flow continuation if active
- Default fallback handling

#### Stage 6: Post-Process Stage
**Purpose**: Final processing and enrichment
```typescript
class PostProcessStage implements PipelineStage<PostProcessStageInput, PostProcessStageOutput> {
  private processors: PostProcessor[];

  async execute(input: PostProcessStageInput): Promise<PostProcessStageOutput> {
    // 1. Format response
    // 2. Add metadata
    // 3. Apply filters
    // 4. Execute side effects
    // 5. Prepare final output
  }
}
```

**Post-Processing Tasks**:
- Response formatting
- Link/resource injection
- Profanity filtering
- Notification triggers
- Metric collection

#### Stage 7: Save Stage
**Purpose**: Persist all data to database
```typescript
class SaveStage implements PipelineStage<SaveStageInput, SaveStageOutput> {
  constructor(
    private conversationRepo: ConversationRepository,
    private messageRepo: MessageRepository,
    private stateRepo: StateRepository,
    private traceRepo: TraceRepository
  ) {}

  async execute(input: SaveStageInput): Promise<SaveStageOutput> {
    // 1. Begin transaction
    // 2. Save messages
    // 3. Save state snapshot
    // 4. Save classification results
    // 5. Save trace data
    // 6. Commit transaction
  }
}
```

**Persistence Operations**:
- Atomic transaction for consistency
- State versioning
- Trace archival
- Metric aggregation

## Error Handling Strategy

### 1. Stage-Level Recovery
```typescript
interface StageErrorHandler {
  canRecover(error: Error): boolean;
  recover(error: Error, context: PipelineContext): Promise<any>;
  fallback(error: Error): any;
}
```

### 2. Retry Logic
```typescript
class RetryStrategy {
  async execute<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    backoff: number = 1000
  ): Promise<T> {
    // Exponential backoff
    // Circuit breaker pattern
    // Fallback on max retries
  }
}
```

### 3. Rollback Mechanism
```typescript
interface Rollback {
  stage: string;
  execute(): Promise<void>;
}

class RollbackManager {
  private rollbacks: Rollback[] = [];

  register(rollback: Rollback): void {
    this.rollbacks.push(rollback);
  }

  async executeRollbacks(): Promise<void> {
    // Execute in reverse order
    for (const rollback of this.rollbacks.reverse()) {
      await rollback.execute();
    }
  }
}
```

## Tracing System

### 1. Trace Collection
```typescript
class TraceCollector {
  private traces: Map<string, TraceContext> = new Map();

  startTrace(conversationId: string, messageId: string): string {
    // Generate trace ID
    // Initialize trace context
    // Start timing
  }

  addStageTrace(traceId: string, stage: StageTrace): void {
    // Add stage execution details
    // Calculate duration
    // Capture errors
  }

  completeTrace(traceId: string): TraceContext {
    // Finalize trace
    // Calculate total duration
    // Return complete trace
  }
}
```

### 2. Trace Storage
```typescript
interface TraceStorage {
  save(trace: TraceContext): Promise<void>;
  findByConversationId(conversationId: string): Promise<TraceContext[]>;
  findByTraceId(traceId: string): Promise<TraceContext | null>;
  queryTraces(filter: TraceFilter): Promise<TraceContext[]>;
}
```

## Performance Optimization

### 1. Caching Strategy
- Cache conversation states (Redis/in-memory)
- Cache classifier results (5-minute TTL)
- Cache user preferences
- Cache flow definitions

### 2. Parallel Processing
- Classifier parallelization
- Independent stage preparation
- Async side effect execution
- Batch database operations

### 3. Resource Management
```typescript
class ResourcePool {
  private connections: DatabaseConnection[];
  private maxConnections: number = 10;

  async acquire(): Promise<DatabaseConnection> {
    // Connection pooling
    // Wait queue management
    // Health checks
  }

  release(connection: DatabaseConnection): void {
    // Return to pool
    // Reset state
  }
}
```

## Monitoring & Metrics

### 1. Pipeline Metrics
```typescript
interface PipelineMetrics {
  totalExecutions: number;
  averageLatency: number;
  stageLatencies: Map<string, number>;
  errorRate: number;
  throughput: number;
}
```

### 2. Health Checks
```typescript
class PipelineHealthCheck {
  async check(): Promise<HealthStatus> {
    // Check database connectivity
    // Check LLM availability
    // Check memory usage
    // Check queue depth
    // Return health status
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Each stage in isolation
- Mock dependencies
- Error scenarios
- Edge cases

### 2. Integration Tests
- Full pipeline execution
- Database interactions
- LLM integration
- Error recovery

### 3. Performance Tests
- Latency benchmarks
- Throughput testing
- Resource usage
- Concurrent execution

### 4. Test Fixtures
```typescript
class PipelineTestFixtures {
  createMockConversation(): ConversationState {}
  createMockMessage(): Message {}
  createMockClassification(): ParallelClassificationResult {}
  createMockTrace(): TraceContext {}
}
```

## CLI Commands for Pipeline Testing

```bash
# Test individual stages
npm run cli pipeline:test --stage=load
npm run cli pipeline:test --stage=classify

# Run full pipeline test
npm run cli pipeline:run --message="Hello, how are you?"

# View pipeline traces
npm run cli pipeline:trace --conversation-id=xxx

# Benchmark pipeline
npm run cli pipeline:bench --iterations=100

# Debug pipeline execution
npm run cli pipeline:debug --verbose
```

## Implementation Priority
1. **Week 1**: Core pipeline framework and stage interfaces
2. **Week 2**: Load, Decay, and Save stages (data flow)
3. **Week 3**: Classification stage with parallel execution
4. **Week 4**: Handle stage with mode routing
5. **Week 5**: Global and Post-Process stages
6. **Week 6**: Error handling and recovery
7. **Week 7**: Tracing and monitoring
8. **Week 8**: Performance optimization and testing