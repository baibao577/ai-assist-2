# Parallel Classification Architecture - Detailed Implementation

## Overview
This document provides the detailed implementation specification for the parallel classifier system with rule-based arbiter, based on the architectural design.

## Core Architecture

### System Flow
```
MESSAGE → Load/Decay → Global Commands → Parallel Classification → Arbiter → Mode Handler → Post-Process → Save
```

### Parallel Execution Model
- **4 Classifiers run simultaneously**
- **Target latency: ~190ms** (dominated by slowest classifier)
- **Conditional execution** to minimize LLM calls
- **Rule-based arbiter** for deterministic decisions

## Detailed Classifier Implementations

### 1. Safety Classifier (Small LLM - Always Runs)

```typescript
// src/core/classifiers/safety-classifier.ts
import { z } from 'zod';

export const SafetyInputSchema = z.object({
  message: z.string(),
  recentUserMessages: z.array(z.string()).max(3),
  currentSafetyLevel: z.enum(['ok', 'elevated', 'restricted'])
});

export const SafetyResultSchema = z.object({
  level: z.enum(['safe', 'concern', 'crisis']),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  suggestedTone: z.string().nullable(),
  requiresHumanEscalation: z.boolean()
});

export type SafetyInput = z.infer<typeof SafetyInputSchema>;
export type SafetyResult = z.infer<typeof SafetyResultSchema>;

export class SafetyClassifier {
  private llmService: LLMService;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
  }

  async classify(input: SafetyInput): Promise<SafetyResult> {
    // First check crisis keywords for immediate response
    const crisisSignals = this.checkCrisisKeywords(input.message);
    if (crisisSignals.length > 0) {
      return {
        level: 'crisis',
        confidence: 1.0,
        signals: crisisSignals,
        suggestedTone: 'urgent',
        requiresHumanEscalation: true
      };
    }

    // Use LLM for nuanced classification
    const prompt = this.buildPrompt(input);

    try {
      const result = await this.llmService.classify(prompt, {
        model: 'claude-3-haiku', // Fast model
        maxTokens: 200,
        temperature: 0.3 // Low temperature for consistency
      });

      return SafetyResultSchema.parse(result);
    } catch (error) {
      // Conservative fallback on error
      return {
        level: 'concern',
        confidence: 0.0,
        signals: ['classification_error'],
        suggestedTone: 'empathetic',
        requiresHumanEscalation: false
      };
    }
  }

  private checkCrisisKeywords(message: string): string[] {
    const normalized = message.toLowerCase();
    const signals: string[] = [];

    const CRISIS_PATTERNS = {
      suicide: ['kill myself', 'end it all', 'not worth living'],
      selfHarm: ['hurt myself', 'harm myself', 'cut myself'],
      violence: ['hurt someone', 'kill someone', 'attack'],
      medical: ['chest pain', 'can\'t breathe', 'overdose']
    };

    for (const [category, patterns] of Object.entries(CRISIS_PATTERNS)) {
      for (const pattern of patterns) {
        if (normalized.includes(pattern)) {
          signals.push(`${category}:${pattern}`);
        }
      }
    }

    return signals;
  }

  private buildPrompt(input: SafetyInput): string {
    return `You are a safety classifier for a men's health wellness assistant.

Analyze this message for safety concerns.

Context:
- Recent messages: ${JSON.stringify(input.recentUserMessages)}
- Current safety status: ${input.currentSafetyLevel}

Current message: "${input.message}"

Classify into:
- SAFE: No safety concerns. Normal conversation.
- CONCERN: Mild signals that need gentle handling (frustration, mild distress, vague references to struggle). Continue conversation but adjust tone.
- CRISIS: Clear danger signals (self-harm, suicide ideation, violence, medical emergency). Requires immediate intervention.

Output JSON:
{
  "level": "safe" | "concern" | "crisis",
  "confidence": 0.0-1.0,
  "signals": ["signal1", "signal2"],
  "suggestedTone": "empathetic" | "calm" | "urgent" | null,
  "requiresHumanEscalation": true | false
}

Be sensitive but not paranoid. "This is killing me" in context of stress is usually metaphor. "I want to end it all" is crisis.`;
  }
}
```

### 2. Pending Resolver (Small LLM - Conditional)

```typescript
// src/core/classifiers/pending-resolver.ts
export const PendingInputSchema = z.object({
  message: z.string(),
  pendingQueue: z.array(z.object({
    id: z.string(),
    kind: z.enum(['question', 'confirmation']),
    subKind: z.string(),
    prompt: z.string(),
    options: z.array(z.string()).optional()
  }))
});

export const PendingResultSchema = z.object({
  resolved: z.boolean(),
  matchedPendingId: z.string().nullable(),
  extractedValue: z.any(),
  confidence: z.number(),
  interpretation: z.string()
});

export class PendingResolver {
  private llmService: LLMService;

  async resolve(input: PendingInput): Promise<PendingResult | null> {
    // Skip if no pending items
    if (input.pendingQueue.length === 0) {
      return null;
    }

    // Try pattern matching first for simple cases
    const directMatch = this.tryDirectMatch(input);
    if (directMatch) {
      return directMatch;
    }

    // Use LLM for complex resolution
    const prompt = this.buildPrompt(input);

    try {
      const result = await this.llmService.classify(prompt, {
        model: 'claude-3-haiku',
        maxTokens: 150,
        temperature: 0.2
      });

      return PendingResultSchema.parse(result);
    } catch (error) {
      return {
        resolved: false,
        matchedPendingId: null,
        extractedValue: null,
        confidence: 0,
        interpretation: 'Failed to resolve'
      };
    }
  }

  private tryDirectMatch(input: PendingInput): PendingResult | null {
    const message = input.message.toLowerCase().trim();

    // Check each pending item
    for (const pending of input.pendingQueue) {
      if (pending.subKind === 'yes_no') {
        if (['yes', 'yeah', 'yep', 'sure', 'ok', 'okay'].includes(message)) {
          return {
            resolved: true,
            matchedPendingId: pending.id,
            extractedValue: true,
            confidence: 0.95,
            interpretation: 'Affirmative response'
          };
        }
        if (['no', 'nope', 'nah', 'not really'].includes(message)) {
          return {
            resolved: true,
            matchedPendingId: pending.id,
            extractedValue: false,
            confidence: 0.95,
            interpretation: 'Negative response'
          };
        }
      }

      if (pending.subKind === 'scale_0_10') {
        const match = message.match(/\b([0-9]|10)\b/);
        if (match) {
          return {
            resolved: true,
            matchedPendingId: pending.id,
            extractedValue: parseInt(match[1]),
            confidence: 0.9,
            interpretation: `Scale value: ${match[1]}`
          };
        }
      }
    }

    return null;
  }
}
```

### 3. Flow Classifier (Small LLM - Conditional)

```typescript
// src/core/classifiers/flow-classifier.ts
export const FlowResultSchema = z.object({
  action: z.enum(['continue', 'elaborate', 'pivot_within', 'pivot_outside', 'abandon', 'pause']),
  confidence: z.number(),
  pivotTopic: z.string().nullable(),
  pivotDomain: z.enum(['same', 'different']).nullable(),
  additionalContext: z.string().nullable(),
  reasoning: z.string()
});

export class FlowClassifier {
  private llmService: LLMService;

  async classify(input: FlowInput): Promise<FlowResult | null> {
    // Skip if no active flow
    if (!input.flowKind) {
      return null;
    }

    // Check for explicit abandon keywords
    if (this.checkAbandonSignals(input.message)) {
      return {
        action: 'abandon',
        confidence: 0.95,
        pivotTopic: null,
        pivotDomain: null,
        additionalContext: null,
        reasoning: 'User explicitly requested to stop'
      };
    }

    const prompt = this.buildPrompt(input);

    try {
      const result = await this.llmService.classify(prompt, {
        model: 'claude-3-haiku',
        maxTokens: 200,
        temperature: 0.3
      });

      return FlowResultSchema.parse(result);
    } catch (error) {
      // Default to continue on error
      return {
        action: 'continue',
        confidence: 0,
        pivotTopic: null,
        pivotDomain: null,
        additionalContext: null,
        reasoning: 'Classification failed, defaulting to continue'
      };
    }
  }

  private checkAbandonSignals(message: string): boolean {
    const normalized = message.toLowerCase();
    const abandonPhrases = [
      'never mind', 'forget it', 'stop', 'cancel',
      'let\'s stop', 'don\'t want to', 'skip this'
    ];

    return abandonPhrases.some(phrase => normalized.includes(phrase));
  }
}
```

### 4. Mode Router (Main LLM - Always Runs)

```typescript
// src/core/classifiers/mode-router.ts
export const ModeRouterResultSchema = z.object({
  targetMode: z.enum(['consult', 'commerce', 'profile', 'track_progress', 'meta', 'smalltalk']),
  intent: z.string(),
  confidence: z.number(),
  suggestedFlow: z.string().nullable(),
  isExplicitModeSwitch: z.boolean(),
  emotion: z.enum(['neutral', 'stressed', 'anxious', 'frustrated', 'hopeful', 'curious']),
  urgency: z.enum(['none', 'mild', 'strong']),
  reasoning: z.string()
});

export class ModeRouter {
  private llmService: LLMService;

  async route(input: ModeRouterInput): Promise<ModeRouterResult> {
    const prompt = this.buildPrompt(input);

    try {
      const result = await this.llmService.classify(prompt, {
        model: 'claude-3-sonnet', // More capable model for routing
        maxTokens: 250,
        temperature: 0.4
      });

      return ModeRouterResultSchema.parse(result);
    } catch (error) {
      // Fallback to smalltalk on error
      return {
        targetMode: 'smalltalk',
        intent: 'unknown',
        confidence: 0,
        suggestedFlow: null,
        isExplicitModeSwitch: false,
        emotion: 'neutral',
        urgency: 'none',
        reasoning: 'Classification failed, defaulting to smalltalk'
      };
    }
  }
}
```

## Arbiter Implementation

```typescript
// src/core/arbiter/arbiter.ts
export class Arbiter {
  arbitrate(input: ArbiterInput): ArbiterDecision {
    const { safetyResult, pendingResult, flowResult, modeResult, state } = input;

    // PRIORITY 1: Safety always wins if crisis
    if (safetyResult.level === 'crisis') {
      return this.handleCrisis(safetyResult, input);
    }

    // Apply safety concern policies
    const policyTags = this.extractPolicyTags(safetyResult);

    // PRIORITY 2: Flow abandon (explicit user request)
    if (flowResult?.action === 'abandon' && flowResult.confidence > 0.7) {
      return this.handleFlowAbandon(flowResult, modeResult, policyTags, input);
    }

    // PRIORITY 3: Pending resolution
    if (pendingResult?.resolved && pendingResult.confidence > 0.6) {
      const isFlowPivot = flowResult?.action === 'pivot_within' ||
                         flowResult?.action === 'pivot_outside';

      // Check conflict between pending and flow pivot
      if (!isFlowPivot || pendingResult.confidence > flowResult!.confidence) {
        return this.handlePendingResolution(pendingResult, state, modeResult, policyTags, input);
      }
    }

    // PRIORITY 4: Flow actions
    if (state.flow.status === 'active' && flowResult) {
      const flowDecision = this.handleFlowAction(flowResult, state, modeResult, policyTags, input);
      if (flowDecision) return flowDecision;
    }

    // PRIORITY 5: Mode routing
    return this.handleModeRouting(modeResult, state, policyTags, input);
  }

  private handleCrisis(
    safetyResult: SafetyResult,
    input: ArbiterInput
  ): ArbiterDecision {
    return {
      action: safetyResult.requiresHumanEscalation ? 'safety_escalate' : 'safety_block',
      targetMode: input.state.context.currentMode ?? 'consult',
      flowAction: 'suspend',
      flowToStart: null,
      pendingToResolve: null,
      pendingValue: null,
      emotion: 'distressed',
      urgency: 'strong',
      policyTags: ['crisis_response', 'no_sales', 'empathetic'],
      reasoning: `Safety crisis detected: ${safetyResult.signals.join(', ')}`,
      classifierContributions: this.buildContributions(input)
    };
  }

  private applyStickyMode(
    currentMode: Mode | null,
    suggestedMode: Mode,
    confidence: number,
    isExplicitSwitch: boolean,
    flowStatus: 'active' | 'suspended' | 'none'
  ): Mode {
    // No current mode → accept suggestion
    if (currentMode === null) return suggestedMode;

    // Same mode → keep it
    if (currentMode === suggestedMode) return currentMode;

    // Explicit switch → always allow
    if (isExplicitSwitch) return suggestedMode;

    // Stickiness thresholds
    const thresholds: Record<string, number> = {
      'smalltalk': 0.5,
      'meta': 0.5,
      'consult': 0.75,
      'commerce': 0.75,
      'profile': 0.7,
      'track_progress': 0.7
    };

    // Active flow adds extra stickiness
    const threshold = flowStatus === 'active'
      ? Math.min(thresholds[currentMode] + 0.15, 0.95)
      : thresholds[currentMode];

    // Apply threshold
    return confidence >= threshold ? suggestedMode : currentMode;
  }

  private buildContributions(input: ArbiterInput): Record<string, string> {
    return {
      safety: input.safetyResult ? `Level: ${input.safetyResult.level}` : 'N/A',
      pending: input.pendingResult ? `Resolved: ${input.pendingResult.resolved}` : 'N/A',
      flow: input.flowResult ? `Action: ${input.flowResult.action}` : 'N/A',
      mode: `Target: ${input.modeResult.targetMode}`
    };
  }
}
```

## Parallel Execution Manager

```typescript
// src/core/pipeline/classification-stage.ts
export class ClassificationStage implements PipelineStage<ClassifyStageInput, ClassifyStageOutput> {
  private safetyClassifier: SafetyClassifier;
  private pendingResolver: PendingResolver;
  private flowClassifier: FlowClassifier;
  private modeRouter: ModeRouter;
  private arbiter: Arbiter;

  async execute(input: ClassifyStageInput): Promise<ClassifyStageOutput> {
    const { message, state } = input;

    // Build inputs for each classifier
    const safetyInput = this.buildSafetyInput(message, state);
    const pendingInput = state.pendingQueue.length > 0
      ? this.buildPendingInput(message, state.pendingQueue)
      : null;
    const flowInput = state.flow.status === 'active'
      ? this.buildFlowInput(message, state.flow)
      : null;
    const modeInput = this.buildModeRouterInput(message, state);

    // Track start time
    const startTime = Date.now();

    // Run all classifiers in parallel
    const [safetyResult, pendingResult, flowResult, modeResult] = await Promise.all([
      // Always run
      this.safetyClassifier.classify(safetyInput),

      // Conditional - returns null if not needed
      pendingInput
        ? this.pendingResolver.resolve(pendingInput)
        : Promise.resolve(null),

      // Conditional - returns null if not needed
      flowInput
        ? this.flowClassifier.classify(flowInput)
        : Promise.resolve(null),

      // Always run
      this.modeRouter.route(modeInput)
    ]);

    // Calculate latency
    const totalLatency = Date.now() - startTime;

    // Arbiter makes final decision
    const decision = this.arbiter.arbitrate({
      message,
      state,
      safetyResult,
      pendingResult,
      flowResult,
      modeResult
    });

    return {
      classification: {
        safety: safetyResult,
        pending: pendingResult,
        flow: flowResult,
        mode: modeResult,
        arbiterDecision: decision
      },
      latencyMs: totalLatency,
      llmCalls: this.countLLMCalls(pendingResult, flowResult)
    };
  }

  private countLLMCalls(
    pendingResult: PendingResult | null,
    flowResult: FlowResult | null
  ): number {
    let count = 2; // Safety + Mode always run
    if (pendingResult) count++;
    if (flowResult) count++;
    return count;
  }
}
```

## Performance Characteristics

### Latency Analysis
```
Best Case (new user, no pending, no flow):
- Safety: ~120ms
- Mode Router: ~190ms
- Total: ~190ms (parallel)
- LLM Calls: 2

Typical Case (active flow, some pending):
- Safety: ~120ms
- Pending: ~100ms
- Flow: ~130ms
- Mode Router: ~190ms
- Total: ~190ms (parallel, dominated by mode router)
- LLM Calls: 4

Worst Case (all classifiers, network delays):
- Total: ~250ms (with retries)
- LLM Calls: 4
```

### Optimization Opportunities
1. **Cache frequently asked questions** in pending resolver
2. **Use smaller models** for safety/pending/flow (Haiku)
3. **Pre-warm connections** to LLM providers
4. **Batch similar classifications** when possible
5. **Skip mode router** if flow classifier has high confidence

## Database Schema Updates

Add tables to track classification performance:

```sql
-- Classification results tracking
CREATE TABLE classification_results (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  classifier_name TEXT NOT NULL,
  result JSON NOT NULL,
  confidence REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  llm_model TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Arbiter decisions tracking
CREATE TABLE arbiter_decisions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  action TEXT NOT NULL,
  target_mode TEXT NOT NULL,
  flow_action TEXT,
  reasoning TEXT,
  classifier_contributions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance metrics
CREATE TABLE classifier_metrics (
  id TEXT PRIMARY KEY,
  classifier TEXT NOT NULL,
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  timeout_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  avg_confidence REAL,
  UNIQUE(classifier, date)
);
```

## Testing Strategy

### Unit Tests for Each Classifier
```typescript
// tests/unit/classifiers/safety-classifier.test.ts
describe('SafetyClassifier', () => {
  it('should detect crisis keywords immediately', async () => {
    const input = {
      message: 'I want to hurt myself',
      recentUserMessages: [],
      currentSafetyLevel: 'ok'
    };

    const result = await classifier.classify(input);

    expect(result.level).toBe('crisis');
    expect(result.requiresHumanEscalation).toBe(true);
    expect(result.confidence).toBe(1.0);
  });

  it('should handle LLM timeout gracefully', async () => {
    // Mock timeout
    jest.spyOn(llmService, 'classify').mockRejectedValue(new Error('Timeout'));

    const result = await classifier.classify(testInput);

    expect(result.level).toBe('concern'); // Conservative default
    expect(result.confidence).toBe(0);
  });
});
```

### Integration Tests for Parallel Execution
```typescript
describe('Parallel Classification', () => {
  it('should complete within 250ms', async () => {
    const start = Date.now();

    const result = await classificationStage.execute({
      message: 'I need help with anxiety',
      state: mockState
    });

    const duration = Date.now() - start;

    expect(duration).toBeLessThan(250);
    expect(result.classification.arbiterDecision).toBeDefined();
  });

  it('should handle partial classifier failures', async () => {
    // Mock one classifier to fail
    jest.spyOn(flowClassifier, 'classify').mockRejectedValue(new Error('Failed'));

    const result = await classificationStage.execute(input);

    // Should still have valid decision
    expect(result.classification.arbiterDecision.action).toBeDefined();
  });
});
```

## CLI Commands for Testing

```bash
# Test individual classifiers
npm run cli test:classifier --type=safety --message="test message"
npm run cli test:classifier --type=pending --message="yes" --pending="rate 0-10"

# Test parallel execution
npm run cli test:parallel --message="I need help"

# Benchmark classifiers
npm run cli bench:classifiers --iterations=100

# View classifier metrics
npm run cli metrics:classifiers --period=24h
```

## Implementation Priority

1. **Week 1**: Safety classifier with crisis detection
2. **Week 2**: Arbiter with priority rules
3. **Week 3**: Pending and Flow classifiers
4. **Week 4**: Mode router with intent classification
5. **Week 5**: Parallel execution manager
6. **Week 6**: Performance optimization and metrics