# TypeScript Type System Design

## Core Type Definitions

### 1. Conversation Types
```typescript
// Base conversation state
interface ConversationState {
  conversationId: string;
  userId: string;
  mode: ConversationMode;
  context: ConversationContext;
  metadata: ConversationMetadata;
  timestamp: Date;
}

enum ConversationMode {
  CONSULT = 'consult',
  COMMERCE = 'commerce',
  PROFILE = 'profile',
  TRACK_PROGRESS = 'track_progress',
  META = 'meta',
  SMALLTALK = 'smalltalk'
}

interface ConversationContext {
  recentMessages: Message[];
  currentFlow: FlowContext | null;
  userGoals: string[];
  sessionData: Record<string, any>;
}

interface ConversationMetadata {
  startTime: Date;
  lastActivityTime: Date;
  messageCount: number;
  totalTokensUsed: number;
  averageResponseTime: number;
}
```

### 2. Message Types
```typescript
interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

interface MessageMetadata {
  tokensUsed?: number;
  processingTimeMs?: number;
  classificationResults?: ClassificationResult[];
  traceId?: string;
}
```

### 3. Classification Types
```typescript
interface ClassificationRequest {
  message: string;
  context: ConversationContext;
  previousClassification?: ClassificationResult;
}

interface ClassificationResult {
  classifierName: string;
  primaryClass: string;
  confidence: number;
  secondaryClasses?: Array<{
    class: string;
    confidence: number;
  }>;
  metadata?: Record<string, any>;
}

interface ParallelClassificationResult {
  safety: SafetyClassification;
  intent: IntentClassification;
  topic: TopicClassification;
  sentiment: SentimentClassification;
  arbiterDecision: ArbiterDecision;
}

interface SafetyClassification extends ClassificationResult {
  isSafe: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
}

interface IntentClassification extends ClassificationResult {
  intent: string;
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
}

interface TopicClassification extends ClassificationResult {
  mainTopic: string;
  subTopics: string[];
  keywords: string[];
}

interface SentimentClassification extends ClassificationResult {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  emotionalTone: string[];
  intensity: number; // 0-1
}

interface ArbiterDecision {
  finalMode: ConversationMode;
  finalIntent: string;
  confidence: number;
  reasoning: string;
  overrides: Array<{
    classifier: string;
    originalValue: any;
    overriddenValue: any;
    reason: string;
  }>;
}
```

### 4. Pipeline Types
```typescript
interface PipelineStage<TInput, TOutput> {
  name: string;
  execute(input: TInput): Promise<TOutput>;
  rollback?(input: TInput): Promise<void>;
}

interface PipelineContext {
  conversationId: string;
  message: Message;
  state: ConversationState;
  trace: TraceContext;
}

interface StageResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  duration: number;
  metadata?: Record<string, any>;
}

// Stage-specific types
interface LoadStageInput {
  conversationId: string;
  userId: string;
}

interface LoadStageOutput {
  state: ConversationState;
  messages: Message[];
}

interface DecayStageInput {
  state: ConversationState;
  currentTime: Date;
}

interface DecayStageOutput {
  state: ConversationState;
  decayedElements: string[];
}

interface GlobalStageInput {
  state: ConversationState;
  message: Message;
}

interface GlobalStageOutput {
  state: ConversationState;
  extractedData: {
    goals?: string[];
    preferences?: Record<string, any>;
    entities?: Array<{ type: string; value: string }>;
  };
}

interface ClassifyStageInput {
  message: Message;
  state: ConversationState;
}

interface ClassifyStageOutput {
  classification: ParallelClassificationResult;
}

interface HandleStageInput {
  message: Message;
  state: ConversationState;
  classification: ParallelClassificationResult;
}

interface HandleStageOutput {
  response: Message;
  updatedState: ConversationState;
  sideEffects?: SideEffect[];
}

interface PostProcessStageInput {
  response: Message;
  state: ConversationState;
  sideEffects?: SideEffect[];
}

interface PostProcessStageOutput {
  finalResponse: Message;
  processedEffects: SideEffect[];
}

interface SaveStageInput {
  state: ConversationState;
  message: Message;
  response: Message;
  trace: TraceContext;
}

interface SaveStageOutput {
  saved: boolean;
  stateVersion: number;
}
```

### 5. Flow Types
```typescript
interface Flow {
  id: string;
  type: FlowType;
  steps: FlowStep[];
  currentStep: number;
  state: FlowState;
  metadata: FlowMetadata;
}

enum FlowType {
  GOAL_SETTING = 'goal_setting',
  HABIT_FORMATION = 'habit_formation',
  PROGRESS_CHECK = 'progress_check',
  CRISIS_SUPPORT = 'crisis_support',
  ONBOARDING = 'onboarding',
  COMMERCE_CHECKOUT = 'commerce_checkout'
}

interface FlowStep {
  id: string;
  name: string;
  prompt: string;
  validation: FlowValidation;
  nextStep: string | null;
  alternativePaths?: Array<{
    condition: string;
    nextStep: string;
  }>;
}

interface FlowState {
  started: boolean;
  completed: boolean;
  abandoned: boolean;
  data: Record<string, any>;
  history: FlowHistoryEntry[];
}

interface FlowValidation {
  required: boolean;
  type: 'text' | 'number' | 'boolean' | 'choice' | 'custom';
  validator?: (value: any) => boolean;
  errorMessage?: string;
}

interface FlowContext {
  flowId: string;
  currentStep: FlowStep;
  state: FlowState;
  startedAt: Date;
}

interface FlowHistoryEntry {
  stepId: string;
  timestamp: Date;
  input: any;
  output: any;
  valid: boolean;
}

interface FlowMetadata {
  totalSteps: number;
  estimatedTime: number; // minutes
  category: string;
  tags: string[];
}
```

### 6. Handler Types
```typescript
interface ModeHandler {
  mode: ConversationMode;
  canHandle(classification: ParallelClassificationResult): boolean;
  handle(context: HandlerContext): Promise<HandlerResult>;
}

interface HandlerContext {
  message: Message;
  state: ConversationState;
  classification: ParallelClassificationResult;
  services: HandlerServices;
}

interface HandlerServices {
  llm: LLMService;
  database: DatabaseService;
  cache: CacheService;
  logger: Logger;
}

interface HandlerResult {
  response: string;
  updatedState?: Partial<ConversationState>;
  startFlow?: FlowType;
  endFlow?: boolean;
  sideEffects?: SideEffect[];
}

interface SideEffect {
  type: 'notification' | 'email' | 'webhook' | 'log' | 'metric';
  data: any;
  priority: 'low' | 'medium' | 'high';
  async: boolean;
}
```

### 7. Trace & Debug Types
```typescript
interface TraceContext {
  traceId: string;
  conversationId: string;
  messageId: string;
  stages: StageTrace[];
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
}

interface StageTrace {
  stage: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  input?: any;
  output?: any;
  error?: Error;
  metadata?: Record<string, any>;
}

interface DebugInfo {
  level: 'verbose' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  timestamp: Date;
  stage?: string;
  traceId?: string;
}
```

### 8. Configuration Types
```typescript
interface AppConfig {
  llm: LLMConfig;
  database: DatabaseConfig;
  pipeline: PipelineConfig;
  features: FeatureFlags;
}

interface LLMConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

interface DatabaseConfig {
  path: string;
  maxConnections: number;
  enableWAL: boolean;
  busyTimeout: number;
}

interface PipelineConfig {
  maxRetries: number;
  stageTimeout: number;
  parallelClassifiers: boolean;
  tracingEnabled: boolean;
}

interface FeatureFlags {
  enableFlows: boolean;
  enableParallelClassification: boolean;
  enableTracing: boolean;
  enableMetrics: boolean;
  debugMode: boolean;
}
```

### 9. Error Types
```typescript
class PipelineError extends Error {
  constructor(
    public stage: string,
    public originalError: Error,
    public context: any
  ) {
    super(`Pipeline error at stage ${stage}: ${originalError.message}`);
  }
}

class ClassificationError extends Error {
  constructor(
    public classifier: string,
    public reason: string
  ) {
    super(`Classification failed for ${classifier}: ${reason}`);
  }
}

class FlowError extends Error {
  constructor(
    public flowId: string,
    public stepId: string,
    public reason: string
  ) {
    super(`Flow error at ${flowId}:${stepId}: ${reason}`);
  }
}

class StateError extends Error {
  constructor(
    public conversationId: string,
    public reason: string
  ) {
    super(`State error for conversation ${conversationId}: ${reason}`);
  }
}
```

## Zod Schemas for Runtime Validation

```typescript
import { z } from 'zod';

// Message validation
export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  timestamp: z.date(),
  metadata: z.record(z.any()).optional()
});

// Classification validation
export const ClassificationResultSchema = z.object({
  classifierName: z.string(),
  primaryClass: z.string(),
  confidence: z.number().min(0).max(1),
  secondaryClasses: z.array(z.object({
    class: z.string(),
    confidence: z.number()
  })).optional(),
  metadata: z.record(z.any()).optional()
});

// State validation
export const ConversationStateSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string(),
  mode: z.enum(['consult', 'commerce', 'profile', 'track_progress', 'meta', 'smalltalk']),
  context: z.object({
    recentMessages: z.array(MessageSchema),
    currentFlow: z.any().nullable(),
    userGoals: z.array(z.string()),
    sessionData: z.record(z.any())
  }),
  metadata: z.object({
    startTime: z.date(),
    lastActivityTime: z.date(),
    messageCount: z.number(),
    totalTokensUsed: z.number(),
    averageResponseTime: z.number()
  }),
  timestamp: z.date()
});
```

## Type Guards

```typescript
// Type guard functions for runtime checks
export const isUserMessage = (msg: Message): msg is Message =>
  msg.role === MessageRole.USER;

export const isSafeClassification = (result: ClassificationResult): result is SafetyClassification =>
  result.classifierName === 'safety' && 'isSafe' in result;

export const hasActiveFlow = (state: ConversationState): boolean =>
  state.context.currentFlow !== null && !state.context.currentFlow.state.completed;

export const isHighRiskSafety = (safety: SafetyClassification): boolean =>
  safety.riskLevel === 'high' || safety.riskLevel === 'critical';
```