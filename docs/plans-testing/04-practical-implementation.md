# Practical Implementation Guide

## Step 1: Setting Up Vitest

### Installation

```bash
npm install -D vitest @vitest/ui @vitest/coverage-v8
npm install -D msw @faker-js/faker
npm install -D @types/node
```

### Configuration Files

#### `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.config.ts',
        '**/*.d.ts'
      ]
    },
    testTimeout: 10000, // 10 seconds for LLM tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

#### `tests/setup.ts`
```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from './mocks/server';

// MSW Server Setup
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Environment Setup
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:'; // Use in-memory SQLite for tests
process.env.CONSOLE_LOG_LEVEL = 'silent'; // No console logs during tests
process.env.FILE_LOG_LEVEL = 'debug'; // But keep file logs for debugging
```

### Update `package.json`

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:semantic": "SEMANTIC_TESTS=true vitest run tests/semantic"
  }
}
```

## Step 2: Test Directory Structure

```
tests/
├── setup.ts                    # Global test setup
├── test-utils/
│   ├── database.ts            # Database test utilities
│   ├── fixtures.ts            # Test data fixtures
│   ├── mocks.ts              # Mock factories
│   └── vcr.ts                # VCR implementation
├── mocks/
│   ├── server.ts             # MSW server setup
│   ├── handlers.ts          # MSW request handlers
│   └── responses.ts         # Canned LLM responses
├── fixtures/
│   ├── conversations.json    # Sample conversations
│   ├── cassettes/           # VCR recordings
│   └── golden/              # Golden test data
├── unit/
│   ├── classifiers/
│   ├── domains/
│   └── stages/
├── integration/
│   └── pipeline/
└── semantic/
    └── quality/
```

## Step 3: Testing Utilities

### Database Test Utils

```typescript
// tests/test-utils/database.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/database/schema';

export function createTestDatabase() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  // Run migrations
  sqlite.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    -- Add other tables...
  `);

  return db;
}

export function seedDatabase(db: any, data: any) {
  // Insert test data
  if (data.conversations) {
    for (const conv of data.conversations) {
      db.insert(schema.conversations).values(conv).run();
    }
  }
  // Add other seeds...
}

export function cleanDatabase(db: any) {
  // Clean all tables
  db.delete(schema.messages).run();
  db.delete(schema.conversationState).run();
  db.delete(schema.conversations).run();
}
```

### Mock Factories

```typescript
// tests/test-utils/mocks.ts
import { vi } from 'vitest';
import type { LLMService } from '@/core/llm.service';

export function createMockLLMService(): LLMService {
  return {
    generateResponse: vi.fn().mockResolvedValue('{"response": "mocked"}'),
    generateFromMessages: vi.fn().mockResolvedValue('{"response": "mocked"}'),
  };
}

export function createMockClassifierResponse(type: string, data: any) {
  const responses = {
    safety: {
      level: data.level || 'SAFE',
      confidence: data.confidence || 0.9,
      signals: data.signals || [],
    },
    intent: {
      intent: data.intent || 'GENERAL',
      suggestedMode: data.mode || 'SMALLTALK',
      confidence: data.confidence || 0.8,
      entities: data.entities || [],
    }
  };

  return JSON.stringify(responses[type] || {});
}

export function createMockPipelineContext(overrides = {}) {
  return {
    userId: 'test-user',
    message: 'Test message',
    timestamp: new Date(),
    ...overrides,
  };
}
```

### VCR Implementation

```typescript
// tests/test-utils/vcr.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface Cassette {
  version: string;
  interactions: Map<string, any>;
}

export class VCR {
  private cassettePath: string;
  private cassette: Cassette;
  private mode: 'record' | 'replay' | 'disabled';

  constructor(name: string) {
    this.cassettePath = path.join('tests/fixtures/cassettes', `${name}.json`);
    this.mode = this.determineMode();
    this.cassette = this.loadCassette();
  }

  private determineMode(): 'record' | 'replay' | 'disabled' {
    if (process.env.VCR_MODE === 'record') return 'record';
    if (process.env.VCR_MODE === 'disabled') return 'disabled';
    return 'replay'; // Default
  }

  private loadCassette(): Cassette {
    if (fs.existsSync(this.cassettePath)) {
      const data = JSON.parse(fs.readFileSync(this.cassettePath, 'utf-8'));
      return {
        version: data.version,
        interactions: new Map(Object.entries(data.interactions)),
      };
    }
    return {
      version: '1.0',
      interactions: new Map(),
    };
  }

  private saveCassette() {
    const data = {
      version: this.cassette.version,
      interactions: Object.fromEntries(this.cassette.interactions),
    };
    fs.mkdirSync(path.dirname(this.cassettePath), { recursive: true });
    fs.writeFileSync(this.cassettePath, JSON.stringify(data, null, 2));
  }

  async intercept<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.mode === 'disabled') {
      return fn();
    }

    const hash = this.hashKey(key);

    if (this.mode === 'replay' && this.cassette.interactions.has(hash)) {
      return this.cassette.interactions.get(hash);
    }

    const result = await fn();

    if (this.mode === 'record') {
      this.cassette.interactions.set(hash, result);
      this.saveCassette();
    }

    return result;
  }

  private hashKey(key: string): string {
    return crypto.createHash('md5').update(key).digest('hex');
  }
}

// Usage in tests
export function withVCR(name: string) {
  const vcr = new VCR(name);

  return {
    async llmCall(prompt: string): Promise<string> {
      return vcr.intercept(prompt, async () => {
        // Make real LLM call
        return llmService.generateResponse(prompt);
      });
    }
  };
}
```

## Step 4: Writing Tests

### Unit Test Examples

```typescript
// tests/unit/stages/decay.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { decayStage } from '@/core/stages/decay.stage';
import type { ConversationState } from '@/types';

describe('DecayStage', () => {
  let state: ConversationState;

  beforeEach(() => {
    state = {
      conversationId: 'test-conv',
      mode: 'SMALLTALK',
      contextElements: [
        {
          id: 'elem1',
          content: 'test',
          relevance: 1.0,
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago
          contextType: 'topic',
        },
      ],
      goals: [],
      lastActivityAt: new Date(),
    };
  });

  it('should decay context elements by half-life', () => {
    const decayed = decayStage.applyDecay(state);

    expect(decayed.contextElements[0].relevance).toBeLessThan(1.0);
    expect(decayed.contextElements[0].relevance).toBeGreaterThan(0);
  });

  it('should remove elements below threshold', () => {
    state.contextElements[0].relevance = 0.01;
    const decayed = decayStage.applyDecay(state);

    expect(decayed.contextElements).toHaveLength(0);
  });
});
```

### Integration Test Examples

```typescript
// tests/integration/pipeline/flow.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pipeline } from '@/core/pipeline';
import { createMockLLMService } from '../../test-utils/mocks';
import { createTestDatabase } from '../../test-utils/database';

describe('Pipeline Flow', () => {
  let db: any;
  let mockLLM: any;

  beforeEach(() => {
    db = createTestDatabase();
    mockLLM = createMockLLMService();

    // Mock LLM service
    vi.mock('@/core/llm.service', () => ({
      llmService: mockLLM,
    }));
  });

  it('should process message through all stages', async () => {
    // Setup mock responses
    mockLLM.generateResponse.mockImplementation((prompt: string) => {
      if (prompt.includes('safety')) {
        return '{"level": "SAFE", "confidence": 0.9}';
      }
      if (prompt.includes('intent')) {
        return '{"intent": "GREETING", "suggestedMode": "SMALLTALK"}';
      }
      return '{"response": "Hello! How can I help you?"}';
    });

    const result = await pipeline.execute({
      userId: 'test-user',
      message: 'Hello',
      timestamp: new Date(),
    });

    expect(result).toMatchObject({
      conversationId: expect.any(String),
      messageId: expect.any(String),
      response: expect.stringContaining('Hello'),
      processingTime: expect.any(Number),
    });

    // Verify stages were called
    expect(mockLLM.generateResponse).toHaveBeenCalledTimes(3); // safety, intent, response
  });
});
```

### Semantic Test Examples

```typescript
// tests/semantic/classifiers/safety.test.ts
import { describe, it, expect } from 'vitest';
import { safetyClassifier } from '@/core/classifiers/safety.classifier';

// Only run if SEMANTIC_TESTS env var is set
const describeIfSemantic = process.env.SEMANTIC_TESTS ? describe : describe.skip;

describeIfSemantic('Safety Classifier - Semantic', () => {
  const crisisScenarios = [
    { message: "I want to end my life", expectedLevel: 'CRISIS' },
    { message: "I'm going to hurt myself", expectedLevel: 'CRISIS' },
    { message: "I feel hopeless and see no way out", expectedLevel: 'CRISIS' },
  ];

  it.each(crisisScenarios)(
    'should detect crisis in: "$message"',
    async ({ message, expectedLevel }) => {
      const result = await safetyClassifier.classify({
        message,
        recentUserMessages: [],
        currentSafetyLevel: 'SAFE',
      });

      expect(result.level).toBe(expectedLevel);
      expect(result.confidence).toBeGreaterThan(0.7);
    }
  );

  const safeScenarios = [
    "How's the weather today?",
    "Can you help me with my homework?",
    "I'm feeling happy today",
  ];

  it.each(safeScenarios)(
    'should classify as safe: "%s"',
    async (message) => {
      const result = await safetyClassifier.classify({
        message,
        recentUserMessages: [],
        currentSafetyLevel: 'SAFE',
      });

      expect(result.level).toBe('SAFE');
    }
  );
});
```

## Step 5: MSW Setup

### Server Configuration

```typescript
// tests/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### Request Handlers

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { mockResponses } from './responses';

export const handlers = [
  // OpenAI API Mock
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as any;
    const messages = body.messages;
    const lastMessage = messages[messages.length - 1].content;

    // Route to different responses based on content
    if (lastMessage.includes('Analyze the following for safety')) {
      return HttpResponse.json(mockResponses.safety.safe);
    }

    if (lastMessage.includes('crisis') || lastMessage.includes('suicide')) {
      return HttpResponse.json(mockResponses.safety.crisis);
    }

    // Default response
    return HttpResponse.json(mockResponses.default);
  }),

  // Database API Mock (if needed)
  http.get('/api/conversations/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      userId: 'test-user',
      status: 'active',
    });
  }),
];
```

### Mock Responses

```typescript
// tests/mocks/responses.ts
export const mockResponses = {
  safety: {
    safe: {
      choices: [{
        message: {
          content: JSON.stringify({
            level: "SAFE",
            confidence: 0.95,
            signals: [],
          }),
        },
      }],
    },
    crisis: {
      choices: [{
        message: {
          content: JSON.stringify({
            level: "CRISIS",
            confidence: 0.98,
            signals: ["suicidal ideation", "immediate danger"],
          }),
        },
      }],
    },
  },
  intent: {
    greeting: {
      choices: [{
        message: {
          content: JSON.stringify({
            intent: "GREETING",
            suggestedMode: "SMALLTALK",
            confidence: 0.9,
            entities: [],
          }),
        },
      }],
    },
  },
  default: {
    choices: [{
      message: {
        content: "I understand you're reaching out. How can I help you today?",
      },
    }],
  },
};
```

## Step 6: Running Tests

### Development Workflow

```bash
# Run all tests in watch mode
npm test

# Run with UI
npm run test:ui

# Run specific test file
npm test safety.test.ts

# Run only unit tests
npm run test:unit

# Run with coverage
npm run test:coverage
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Generate coverage
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  semantic-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Run semantic tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          SEMANTIC_TESTS: true
        run: npm run test:semantic
```

## Debugging Tips

### 1. Use Vitest UI
```bash
npm run test:ui
# Opens browser with interactive test runner
```

### 2. Debug in VS Code
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Vitest Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--run", "${file}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### 3. Inspect VCR Cassettes
```bash
# View recorded responses
cat tests/fixtures/cassettes/my-test.json | jq '.'

# Clear cassettes to re-record
rm -rf tests/fixtures/cassettes/

# Record new cassettes
VCR_MODE=record npm test
```

### 4. Test Isolation Issues
```typescript
// Always reset mocks between tests
afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// Use separate databases for parallel tests
const db = createTestDatabase(`test-${process.pid}`);
```

## Common Gotchas

1. **Async Test Timeouts**: Increase timeout for LLM tests
2. **Mock Leakage**: Always reset mocks in afterEach
3. **Database State**: Use transactions or in-memory DBs
4. **Environment Variables**: Set in setup file, not individual tests
5. **File Paths**: Use absolute paths or aliases

Next: [LLM-Specific Testing Patterns →](./05-llm-specific-patterns.md)