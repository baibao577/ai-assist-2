# Response Orchestrator

Handles single and multi-intent message processing with intelligent response composition.

## Overview

```
Message → Unified Classifier
               ↓
      ┌────────┴────────┐
      │                 │
 Single Intent    Multi-Intent
      ↓                 ↓
 Direct Handler   ResponseOrchestrator
      ↓                 ↓
   Response       Composed Response
```

**Single Intent**: Message routed directly to one mode handler (fast path)

**Multi-Intent**: Multiple handlers coordinated via orchestrator (e.g., "Hi, I want to set a goal")

## Components

### `multi-intent.classifier.ts`

Detects if a message contains multiple intents.

```typescript
const result = await multiIntentClassifier.classify(message, state);
// Returns:
// {
//   primary: { mode: 'CONSULT', confidence: 0.9 },
//   secondary: [{ mode: 'SMALLTALK', confidence: 0.7 }],
//   requiresOrchestration: true,
//   compositionStrategy: 'sequential'
// }
```

### `response-orchestrator.ts`

Coordinates multi-mode responses with performance optimizations:

- **Lazy Initialization**: Generates primary response first
- **Selective Secondary**: Only generates secondary if confidence > 0.6 and primary is short (< 300 chars)
- **Smart Composition**: Simple concatenation for non-conflicting responses, LLM blending only when needed

### `response-composer.ts`

Composes multiple handler responses:

- Detects content conflicts via word overlap analysis
- Uses LLM composition only when responses overlap significantly (> 5 shared words)
- Falls back to simple concatenation for non-conflicting content

### `types.ts`

Type definitions:

| Type | Description |
|------|-------------|
| `MultiIntentResult` | Classification result with primary/secondary modes |
| `OrchestratedResponse` | Final composed response with metadata |
| `ModeSegment` | Individual handler response segment |
| `OrchestratorConfig` | Configuration options |

## Performance Optimizations

1. **Skip orchestration** for low-confidence secondary intents (< 0.6)
2. **Skip secondary handlers** if primary response is comprehensive (> 300 chars)
3. **Simple concatenation** when responses don't conflict
4. **Parallel handler execution** when multiple modes needed

## Usage

The orchestrator is called automatically by the pipeline when `multiIntent.isMultiIntent` is true in the unified classification result.

```typescript
// In pipeline.ts
if (multiIntent.requiresOrchestration) {
  const orchestrated = await responseOrchestrator.orchestrate(
    context,
    handlers,
    multiIntent
  );
  return orchestrated.response;
}
```
