# Testing Strategy Implementation Plan

## Overview
Comprehensive testing approach covering unit, integration, and end-to-end tests using Jest and TypeScript.

## Testing Architecture

### 1. Test Structure
```
/tests
  /unit
    /core
      /pipeline       # Pipeline stage tests
      /classifiers    # Classifier tests
      /handlers       # Mode handler tests
    /database
      /repositories   # Repository tests
      /schema        # Schema validation tests
    /flows          # Flow system tests
    /utils          # Utility function tests
  /integration
    /scenarios      # End-to-end scenarios
    /api           # API integration tests
    /database      # Database integration tests
  /fixtures       # Test data and mocks
  /helpers        # Test utilities
  /mocks          # Mock implementations
```

### 2. Test Configuration
```typescript
// jest.config.ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/cli/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1'
  }
};
```

## Unit Tests

### 1. Pipeline Stage Tests
```typescript
// tests/unit/core/pipeline/load-stage.test.ts
import { LoadStage } from '@/core/pipeline/stages/load-stage';
import { ConversationRepository } from '@/database/repositories/conversation';
import { createMockRepository } from '@tests/mocks/repository';

describe('LoadStage', () => {
  let loadStage: LoadStage;
  let mockConversationRepo: jest.Mocked<ConversationRepository>;

  beforeEach(() => {
    mockConversationRepo = createMockRepository<ConversationRepository>();
    loadStage = new LoadStage(mockConversationRepo);
  });

  describe('execute', () => {
    it('should load existing conversation', async () => {
      // Arrange
      const input = {
        conversationId: 'test-123',
        userId: 'user-456'
      };

      const mockConversation = {
        id: 'test-123',
        userId: 'user-456',
        status: 'active',
        mode: 'consult'
      };

      mockConversationRepo.findById.mockResolvedValue(mockConversation);

      // Act
      const result = await loadStage.execute(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.state.conversationId).toBe('test-123');
      expect(mockConversationRepo.findById).toHaveBeenCalledWith('test-123');
    });

    it('should create new conversation if not exists', async () => {
      // Arrange
      const input = {
        conversationId: null,
        userId: 'user-456'
      };

      mockConversationRepo.findById.mockResolvedValue(null);
      mockConversationRepo.create.mockResolvedValue({
        id: 'new-123',
        userId: 'user-456'
      });

      // Act
      const result = await loadStage.execute(input);

      // Assert
      expect(result.state.conversationId).toBe('new-123');
      expect(mockConversationRepo.create).toHaveBeenCalledWith('user-456');
    });

    it('should handle database errors', async () => {
      // Arrange
      const input = { conversationId: 'test-123', userId: 'user-456' };
      mockConversationRepo.findById.mockRejectedValue(new Error('DB Error'));

      // Act & Assert
      await expect(loadStage.execute(input)).rejects.toThrow('DB Error');
    });
  });
});
```

### 2. Classifier Tests
```typescript
// tests/unit/core/classifiers/safety-classifier.test.ts
import { SafetyClassifier } from '@/core/classifiers/safety-classifier';
import { createMockLLMService } from '@tests/mocks/llm-service';

describe('SafetyClassifier', () => {
  let classifier: SafetyClassifier;
  let mockLLMService: jest.Mocked<LLMService>;

  beforeEach(() => {
    mockLLMService = createMockLLMService();
    classifier = new SafetyClassifier(mockLLMService);
  });

  describe('classify', () => {
    it('should detect crisis keywords immediately', async () => {
      // Arrange
      const input = {
        message: 'I want to hurt myself',
        context: createMockContext()
      };

      // Act
      const result = await classifier.classify(input);

      // Assert
      expect(result.riskLevel).toBe('critical');
      expect(result.isSafe).toBe(false);
      expect(result.escalate).toBe(true);
      expect(mockLLMService.classify).not.toHaveBeenCalled(); // Pattern match only
    });

    it('should use LLM for nuanced cases', async () => {
      // Arrange
      const input = {
        message: 'I feel a bit down today',
        context: createMockContext()
      };

      mockLLMService.classify.mockResolvedValue({
        riskLevel: 'low',
        isSafe: true,
        escalate: false,
        confidence: 0.85
      });

      // Act
      const result = await classifier.classify(input);

      // Assert
      expect(result.riskLevel).toBe('low');
      expect(result.isSafe).toBe(true);
      expect(mockLLMService.classify).toHaveBeenCalled();
    });

    it('should handle LLM timeouts', async () => {
      // Arrange
      const input = {
        message: 'Test message',
        context: createMockContext()
      };

      mockLLMService.classify.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 1000)
        )
      );

      // Act
      const result = await classifier.classify(input);

      // Assert
      expect(result.riskLevel).toBe('medium'); // Conservative default
      expect(result.confidence).toBe(0);
    });
  });
});
```

### 3. Handler Tests
```typescript
// tests/unit/core/handlers/consult-handler.test.ts
import { ConsultModeHandler } from '@/core/handlers/consult-handler';
import { HandlerContext } from '@/types';

describe('ConsultModeHandler', () => {
  let handler: ConsultModeHandler;

  beforeEach(() => {
    handler = new ConsultModeHandler(
      createMockLLMService(),
      createMockFlowService(),
      createMockStateService()
    );
  });

  describe('canHandle', () => {
    it('should handle advice-seeking intents', () => {
      const classification = {
        intent: { primaryClass: 'seek_advice' }
      };

      expect(handler.canHandle(classification)).toBe(true);
    });

    it('should handle crisis support intents', () => {
      const classification = {
        intent: { primaryClass: 'crisis_support' }
      };

      expect(handler.canHandle(classification)).toBe(true);
    });

    it('should not handle commerce intents', () => {
      const classification = {
        intent: { primaryClass: 'make_purchase' }
      };

      expect(handler.canHandle(classification)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should generate appropriate response', async () => {
      // Arrange
      const context: HandlerContext = {
        message: createMockMessage('I need advice'),
        state: createMockState(),
        classification: {
          intent: { primaryClass: 'seek_advice' },
          safety: { riskLevel: 'none', isSafe: true }
        }
      };

      // Act
      const result = await handler.handle(context);

      // Assert
      expect(result.response).toBeDefined();
      expect(result.updatedState.mode).toBe('consult');
    });

    it('should handle crisis immediately', async () => {
      // Arrange
      const context: HandlerContext = {
        message: createMockMessage('Crisis message'),
        state: createMockState(),
        classification: {
          safety: { riskLevel: 'critical', isSafe: false }
        }
      };

      // Act
      const result = await handler.handle(context);

      // Assert
      expect(result.response).toContain('support');
      expect(result.sideEffects).toContainEqual(
        expect.objectContaining({ type: 'notification' })
      );
    });
  });
});
```

### 4. Database Repository Tests
```typescript
// tests/unit/database/repositories/conversation.test.ts
import { ConversationRepository } from '@/database/repositories/conversation';
import { db } from '@/database/client';

describe('ConversationRepository', () => {
  let repository: ConversationRepository;

  beforeEach(async () => {
    await db.migrate.latest();
    repository = new ConversationRepository(db);
  });

  afterEach(async () => {
    await db('conversations').delete();
  });

  describe('create', () => {
    it('should create new conversation', async () => {
      // Act
      const conversation = await repository.create('user-123');

      // Assert
      expect(conversation.id).toBeDefined();
      expect(conversation.userId).toBe('user-123');
      expect(conversation.status).toBe('active');
    });
  });

  describe('findActiveByUserId', () => {
    it('should find active conversations', async () => {
      // Arrange
      await repository.create('user-123');
      await repository.create('user-123');
      const expired = await repository.create('user-123');
      await repository.expire(expired.id);

      // Act
      const active = await repository.findActiveByUserId('user-123');

      // Assert
      expect(active).toHaveLength(2);
      expect(active.every(c => c.status === 'active')).toBe(true);
    });
  });

  describe('updateActivity', () => {
    it('should update last activity timestamp', async () => {
      // Arrange
      const conversation = await repository.create('user-123');
      const originalTime = conversation.lastActivityAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Act
      await repository.updateActivity(conversation.id);
      const updated = await repository.findById(conversation.id);

      // Assert
      expect(updated.lastActivityAt).not.toEqual(originalTime);
    });
  });
});
```

## Integration Tests

### 1. End-to-End Scenarios
```typescript
// tests/integration/scenarios/goal-setting.test.ts
import { PipelineManager } from '@/core/pipeline/manager';
import { FlowEngine } from '@/flows/engine';
import { setupTestDatabase } from '@tests/helpers/database';

describe('Goal Setting Scenario', () => {
  let pipeline: PipelineManager;
  let flowEngine: FlowEngine;

  beforeAll(async () => {
    await setupTestDatabase();
    pipeline = new PipelineManager();
    flowEngine = new FlowEngine();
  });

  it('should complete full goal setting flow', async () => {
    // Step 1: Initial message
    const result1 = await pipeline.execute({
      message: 'I want to set a fitness goal',
      userId: 'test-user'
    });

    expect(result1.response).toContain('goal');
    expect(result1.startFlow).toBe('goal_setting');

    // Step 2: Goal type selection
    const flow = await flowEngine.continueFlow(
      result1.flowId,
      'health'
    );

    expect(flow.nextStep).toBe('goal_description');

    // Step 3: Goal description
    const result3 = await flowEngine.continueFlow(
      result1.flowId,
      'I want to lose 10 pounds'
    );

    expect(result3.nextStep).toBe('goal_specific');

    // Continue through flow...

    // Final step: Confirmation
    const finalResult = await flowEngine.continueFlow(
      result1.flowId,
      'yes'
    );

    expect(finalResult.completed).toBe(true);

    // Verify goal was saved
    const goals = await goalRepository.findByUserId('test-user');
    expect(goals).toHaveLength(1);
    expect(goals[0].description).toContain('10 pounds');
  });
});
```

### 2. Parallel Classification Test
```typescript
// tests/integration/classification-parallel.test.ts
describe('Parallel Classification', () => {
  it('should complete within timeout', async () => {
    const classifier = new ClassificationStage();

    const start = Date.now();
    const result = await classifier.execute({
      message: 'I need help with my anxiety about work',
      context: createMockContext()
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(600);
    expect(result.classification.safety).toBeDefined();
    expect(result.classification.intent).toBeDefined();
    expect(result.classification.topic).toBeDefined();
    expect(result.classification.sentiment).toBeDefined();
  });

  it('should handle partial classifier failures', async () => {
    // Mock one classifier to fail
    jest.spyOn(topicClassifier, 'classify').mockRejectedValue(
      new Error('Classifier error')
    );

    const result = await classifier.execute({
      message: 'Test message',
      context: createMockContext()
    });

    // Should still have results from other classifiers
    expect(result.classification.safety).toBeDefined();
    expect(result.classification.intent).toBeDefined();
    expect(result.classification.sentiment).toBeDefined();
    // Topic should have fallback
    expect(result.classification.topic.confidence).toBe(0);
  });
});
```

## Test Fixtures and Mocks

### 1. Mock Factories
```typescript
// tests/mocks/factories.ts
export class TestDataFactory {
  static createMessage(overrides?: Partial<Message>): Message {
    return {
      id: faker.datatype.uuid(),
      conversationId: faker.datatype.uuid(),
      role: 'user',
      content: faker.lorem.sentence(),
      timestamp: new Date(),
      ...overrides
    };
  }

  static createConversationState(
    overrides?: Partial<ConversationState>
  ): ConversationState {
    return {
      conversationId: faker.datatype.uuid(),
      userId: faker.datatype.uuid(),
      mode: 'consult',
      context: {
        recentMessages: [],
        currentFlow: null,
        userGoals: [],
        sessionData: {}
      },
      metadata: {
        startTime: new Date(),
        lastActivityTime: new Date(),
        messageCount: 0,
        totalTokensUsed: 0,
        averageResponseTime: 0
      },
      timestamp: new Date(),
      ...overrides
    };
  }

  static createClassificationResult(
    type: string,
    overrides?: any
  ): ClassificationResult {
    const base = {
      classifierName: type,
      primaryClass: faker.random.word(),
      confidence: faker.datatype.float({ min: 0, max: 1 }),
      ...overrides
    };

    switch (type) {
      case 'safety':
        return {
          ...base,
          isSafe: true,
          riskLevel: 'none',
          flags: []
        };
      case 'intent':
        return {
          ...base,
          intent: 'general_query',
          entities: []
        };
      default:
        return base;
    }
  }
}
```

### 2. Mock Services
```typescript
// tests/mocks/services.ts
export function createMockLLMService(): jest.Mocked<LLMService> {
  return {
    generate: jest.fn().mockResolvedValue('Mock response'),
    classify: jest.fn().mockResolvedValue({
      class: 'mock_class',
      confidence: 0.9
    }),
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
  };
}

export function createMockDatabaseService(): jest.Mocked<DatabaseService> {
  return {
    transaction: jest.fn().mockImplementation(async (fn) => fn()),
    query: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue({ id: 'new-id' }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 })
  };
}

export function createMockCacheService(): jest.Mocked<CacheService> {
  const cache = new Map();
  return {
    get: jest.fn().mockImplementation((key) => cache.get(key)),
    set: jest.fn().mockImplementation((key, value) => {
      cache.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn().mockImplementation((key) => {
      cache.delete(key);
      return Promise.resolve();
    }),
    clear: jest.fn().mockImplementation(() => {
      cache.clear();
      return Promise.resolve();
    })
  };
}
```

## Performance Testing

### 1. Load Testing
```typescript
// tests/performance/load-test.ts
import { performance } from 'perf_hooks';

describe('Load Testing', () => {
  it('should handle 100 concurrent requests', async () => {
    const concurrentUsers = 100;
    const pipeline = new PipelineManager();

    const promises = Array.from({ length: concurrentUsers }, (_, i) =>
      pipeline.execute({
        message: `Test message ${i}`,
        userId: `user-${i}`
      })
    );

    const start = performance.now();
    const results = await Promise.allSettled(promises);
    const duration = performance.now() - start;

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    expect(successful).toBeGreaterThan(95); // 95% success rate
    expect(duration).toBeLessThan(10000); // Complete within 10s
  });
});
```

### 2. Memory Testing
```typescript
// tests/performance/memory-test.ts
describe('Memory Usage', () => {
  it('should not leak memory during extended operation', async () => {
    const iterations = 1000;
    const pipeline = new PipelineManager();

    // Get initial memory
    global.gc(); // Force garbage collection
    const initialMemory = process.memoryUsage().heapUsed;

    // Run iterations
    for (let i = 0; i < iterations; i++) {
      await pipeline.execute({
        message: `Test ${i}`,
        userId: 'test-user'
      });

      if (i % 100 === 0) {
        global.gc();
      }
    }

    // Check final memory
    global.gc();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Should not increase by more than 50MB
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });
});
```

## Test Coverage Goals

### Coverage Targets
- **Overall**: 80% minimum
- **Core Pipeline**: 95% minimum
- **Classifiers**: 90% minimum
- **Handlers**: 85% minimum
- **Database**: 85% minimum
- **Utilities**: 75% minimum

### Critical Paths (100% coverage required)
- Safety classification
- Crisis handling
- Payment processing
- Data persistence
- Error recovery

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linting
        run: npm run lint

      - name: Run type checking
        run: npm run type-check

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v2
        with:
          files: ./coverage/lcov.info
```

## Testing Commands

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:debug": "node --inspect-brk ./node_modules/.bin/jest --runInBand"
  }
}
```

## Implementation Timeline
1. **Week 1**: Test infrastructure and helpers
2. **Week 2**: Unit tests for core components
3. **Week 3**: Integration test scenarios
4. **Week 4**: Performance and load tests
5. **Week 5**: Mock services and fixtures
6. **Week 6**: CI/CD integration and coverage