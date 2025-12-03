# Testing Strategies for LLM Pipeline

## Overview of Test Types

### Test Pyramid for LLM Systems

```
        /\
       /  \  E2E Tests (5%)
      /    \  - Full conversation flows
     /      \  - Production-like scenarios
    /--------\
   /          \  Semantic Tests (15%)
  /            \  - LLM output quality
 /              \  - Response appropriateness
/----------------\
/                  \  Integration Tests (30%)
/                    \  - Component interactions
/                      \  - Pipeline flow with mocks
/------------------------\
/                          \  Unit Tests (50%)
/                            \  - Business logic
/                              \  - Parsing & validation
/                                \  - Non-LLM computations
```

## Unit Testing Strategy

### What to Unit Test

#### ✅ Deterministic Logic
```typescript
// Decay calculation - ALWAYS test
describe('DecayStage', () => {
  it('should decay context elements by half-life', () => {
    const element = { createdAt: oneHourAgo, relevance: 1.0 };
    const decayed = decayStage.applyDecay(element);
    expect(decayed.relevance).toBeCloseTo(0.5, 2);
  });
});
```

#### ✅ Parsing and Validation
```typescript
// Schema validation - ALWAYS test
describe('HealthSchema', () => {
  it('should accept valid health data', () => {
    const data = { symptoms: ['headache'], severity: 5 };
    const result = healthSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should handle missing optional fields', () => {
    const data = { symptoms: [] };
    const result = healthSchema.safeParse(data);
    expect(result.success).toBe(true);
    expect(result.data.severity).toBeNull();
  });
});
```

#### ✅ State Management
```typescript
// State transitions - ALWAYS test
describe('StateRepository', () => {
  it('should update conversation mode', () => {
    const state = { mode: ConversationMode.SMALLTALK };
    const updated = updateMode(state, ConversationMode.CONSULT);
    expect(updated.mode).toBe(ConversationMode.CONSULT);
  });
});
```

### How to Mock LLM Calls

```typescript
import { vi } from 'vitest';

// Option 1: Complete mock
vi.mock('@/core/llm.service', () => ({
  llmService: {
    generateResponse: vi.fn().mockResolvedValue('{"result": "mocked"}')
  }
}));

// Option 2: Spy with fallback
const generateSpy = vi.spyOn(llmService, 'generateResponse');
generateSpy.mockImplementation(async (prompt) => {
  if (prompt.includes('safety')) {
    return '{"level": "SAFE", "confidence": 0.9}';
  }
  throw new Error('Unmocked prompt');
});
```

## Integration Testing Strategy

### The VCR Pattern (Record & Replay)

#### How It Works
1. **First Run**: Record real LLM responses to cassettes
2. **Subsequent Runs**: Replay recorded responses
3. **Benefits**: Deterministic, fast, cheap

#### Implementation
```typescript
// test-utils/vcr.ts
import fs from 'fs';
import crypto from 'crypto';

class VCR {
  private cassette: Map<string, any>;
  private mode: 'record' | 'replay';

  constructor(cassetteName: string) {
    this.cassette = this.loadCassette(cassetteName);
    this.mode = process.env.VCR_MODE || 'replay';
  }

  async intercept(request: any): Promise<any> {
    const key = this.hashRequest(request);

    if (this.mode === 'replay' && this.cassette.has(key)) {
      return this.cassette.get(key);
    }

    // Make real request
    const response = await this.makeRealRequest(request);

    if (this.mode === 'record') {
      this.cassette.set(key, response);
      this.saveCassette();
    }

    return response;
  }

  private hashRequest(request: any): string {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(request))
      .digest('hex');
  }
}
```

### Testing Pipeline Flow

```typescript
describe('Pipeline Integration', () => {
  const vcr = new VCR('pipeline-integration');

  beforeAll(() => {
    // Intercept OpenAI calls
    vi.mock('openai', () => ({
      OpenAI: vi.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: vcr.intercept
          }
        }
      }))
    }));
  });

  it('should process message through all stages', async () => {
    const result = await pipeline.execute({
      userId: 'test-user',
      message: 'I need help with my finances'
    });

    // Verify flow, not exact content
    expect(result).toMatchObject({
      conversationId: expect.any(String),
      messageId: expect.any(String),
      response: expect.stringContaining('finance')
    });
  });
});
```

## Semantic Testing Strategy

### When to Use Real LLM Calls

1. **Critical Safety Paths**
```typescript
describe('Safety Classifier - Semantic', () => {
  it('should detect crisis messages', async () => {
    const crisisMessages = [
      "I want to end my life",
      "I'm going to hurt myself",
      "I can't go on anymore"
    ];

    for (const message of crisisMessages) {
      const result = await safetyClassifier.classify({ message });
      expect(result.level).toBe(SafetyLevel.CRISIS);
      expect(result.confidence).toBeGreaterThan(0.8);
    }
  });
});
```

2. **Quality Assurance**
```typescript
describe('Response Quality', () => {
  it('should provide helpful financial advice', async () => {
    const response = await pipeline.execute({
      message: "I have $5000 in credit card debt"
    });

    // Semantic assertions
    expect(response.response).toBeSemanticallyRelated('debt management');
    expect(response.response).toHavePositiveSentiment();
    expect(response.response.length).toBeGreaterThan(50);
  });
});
```

### Custom Semantic Matchers

```typescript
// test-utils/semantic-matchers.ts
import { expect } from 'vitest';
import { OpenAI } from 'openai';

expect.extend({
  async toBeSemanticallyRelated(received: string, topic: string) {
    const embedding1 = await getEmbedding(received);
    const embedding2 = await getEmbedding(topic);
    const similarity = cosineSimilarity(embedding1, embedding2);

    return {
      pass: similarity > 0.7,
      message: () => `Expected similarity > 0.7, got ${similarity}`
    };
  },

  async toHavePositiveSentiment(received: string) {
    const sentiment = await analyzeSentiment(received);
    return {
      pass: sentiment.score > 0,
      message: () => `Expected positive sentiment, got ${sentiment.score}`
    };
  }
});
```

## Context-Aware Testing

### Multi-Turn Conversation Testing

```typescript
describe('Multi-Turn Conversations', () => {
  let conversationId: string;

  it('should maintain context across turns', async () => {
    // Turn 1: Introduction
    const turn1 = await pipeline.execute({
      message: "I'm worried about my finances",
      userId: 'test-user'
    });
    conversationId = turn1.conversationId;

    // Turn 2: Specific detail
    const turn2 = await pipeline.execute({
      message: "I have $5000 in debt",
      conversationId,
      userId: 'test-user'
    });

    // Turn 3: Follow-up question
    const turn3 = await pipeline.execute({
      message: "What should I do first?",
      conversationId,
      userId: 'test-user'
    });

    // Verify context retention
    const state = await stateRepository.getLatest(conversationId);
    expect(state.extractions?.finance).toBeDefined();
    expect(state.extractions.finance.amounts?.debt).toBe(5000);

    // Verify response uses context
    expect(turn3.response).toContain('debt');
  });
});
```

### State Accumulation Testing

```typescript
describe('State Accumulation', () => {
  it('should accumulate domain data over conversation', async () => {
    const conversation = createConversation([
      "I'm stressed",                    // Health domain
      "I can't sleep",                   // Health: sleep issues
      "Money troubles keep me up",       // Finance domain
      "I owe $5000 on credit cards"     // Finance: specific debt
    ]);

    const finalState = await processConversation(conversation);

    // Verify both domains extracted
    expect(finalState.extractions).toHaveProperty('health');
    expect(finalState.extractions).toHaveProperty('finance');

    // Verify accumulated data
    expect(finalState.extractions.health.sleep?.issues).toContain('insomnia');
    expect(finalState.extractions.finance.concerns).toContain('debt');
  });
});
```

## Mock Service Worker (MSW) Strategy

### Setting Up MSW

```typescript
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('https://api.openai.com/v1/chat/completions', ({ request }) => {
    const { messages } = await request.json();
    const lastMessage = messages[messages.length - 1].content;

    // Return different responses based on input
    if (lastMessage.includes('safety')) {
      return HttpResponse.json({
        choices: [{
          message: {
            content: '{"level": "SAFE", "confidence": 0.95}'
          }
        }]
      });
    }

    // Default response
    return HttpResponse.json({
      choices: [{
        message: {
          content: '{"response": "mocked"}'
        }
      }]
    });
  })
];
```

### Using MSW in Tests

```typescript
// setup.ts
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

## Performance Testing

### Response Time Testing

```typescript
describe('Performance', () => {
  it('should respond within acceptable time', async () => {
    const start = Date.now();

    await pipeline.execute({
      message: "Hello",
      userId: 'test-user'
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(3000); // 3 seconds max
  });

  it('should benefit from parallel processing', async () => {
    // Mock to ensure consistent timing
    vi.mocked(llmService.generateResponse).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    const start = Date.now();
    await pipeline.execute({
      message: "Complex query needing all domains",
      userId: 'test-user'
    });
    const duration = Date.now() - start;

    // Should be ~200ms (parallel) not ~600ms (sequential)
    expect(duration).toBeLessThan(300);
  });
});
```

### Load Testing

```typescript
describe('Load Testing', () => {
  it('should handle concurrent requests', async () => {
    const requests = Array.from({ length: 10 }, (_, i) =>
      pipeline.execute({
        message: `Request ${i}`,
        userId: `user-${i}`
      })
    );

    const results = await Promise.all(requests);

    results.forEach(result => {
      expect(result.response).toBeDefined();
      expect(result.processingTime).toBeLessThan(5000);
    });
  });
});
```

## Testing Strategy Decision Tree

```
Is it testing LLM output directly?
├─ NO → Unit Test with full mocks
│   └─ Examples: Decay, validation, state management
│
└─ YES → Does it need exact responses?
    ├─ YES → Integration test with VCR/MSW
    │   └─ Examples: Pipeline flow, error handling
    │
    └─ NO → Is it critical for safety/quality?
        ├─ YES → Semantic test with real LLMs
        │   └─ Examples: Safety classification, response quality
        │
        └─ NO → Skip or use simple mocks
            └─ Examples: Logging, metrics
```

## Summary

1. **Unit Tests**: Mock everything, test logic only
2. **Integration Tests**: Use VCR pattern for determinism
3. **Semantic Tests**: Real LLMs for critical paths only
4. **Performance Tests**: Mock with delays to test parallelism
5. **Context Tests**: Verify multi-turn conversation handling

Next: [Priority Modules for Testing →](./03-priority-modules.md)