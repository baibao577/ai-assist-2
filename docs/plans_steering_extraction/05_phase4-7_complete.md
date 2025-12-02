# Phases 4-7: Complete Implementation Plan

## Phase 4: Mode Handler Integration

### Objective
Update all mode handlers to use extraction data and steering hints from the new framework.

### Duration
Day 3-4 (4 hours)

### Tasks

#### 1. Update ConsultHandler
```typescript
// /src/core/modes/consult.handler.ts modifications

private buildSystemPrompt(context: HandlerContext): string {
  let prompt = `You are a supportive AI assistant engaging in consultation mode.
Focus on understanding and helping the user with their concerns.`;

  // Add steering hints if available
  const steeringHints = context.state.steeringHints;
  if (steeringHints && steeringHints.suggestions.length > 0) {
    prompt += `\n\nConversation Guidance:
Consider naturally exploring these topics if relevant:
${steeringHints.suggestions.map(s => `- ${s}`).join('\n')}

Important: Integrate these questions smoothly into the conversation. Don't ask all at once.
Make it feel like a natural dialogue, not an interrogation.`;
  }

  // Add recent extractions for context awareness
  if (context.state.extractions) {
    prompt += `\n\nRecent Information Gathered:`;

    for (const [domain, extractions] of Object.entries(context.state.extractions)) {
      if (extractions.length > 0) {
        const latest = extractions[extractions.length - 1];
        prompt += `\n\n${domain.charAt(0).toUpperCase() + domain.slice(1)} Context:`;

        // Format key information based on domain
        if (domain === 'health' && latest.data) {
          const data = latest.data;
          if (data.symptoms) {
            prompt += `\n- Symptoms: ${data.symptoms.map(s => s.name).join(', ')}`;
          }
          if (data.mood) {
            prompt += `\n- Mood: ${data.mood.emotion} (${data.mood.level}/10)`;
          }
          if (data.sleep) {
            prompt += `\n- Sleep: ${data.sleep.hours} hours (${data.sleep.quality})`;
          }
        }
      }
    }
  }

  // Add conversation goals if any
  const activeGoals = context.state.goals?.filter(g => g.status === 'active') || [];
  if (activeGoals.length > 0) {
    prompt += `\n\nActive Conversation Goals:`;
    activeGoals.forEach(goal => {
      prompt += `\n- ${goal.description}`;
    });
  }

  return prompt;
}

// Update the handle method to use enhanced prompts
async handle(context: HandlerContext): Promise<HandlerResult> {
  const systemPrompt = this.buildSystemPrompt(context);

  // Rest of handle implementation...
}
```

#### 2. Update SmallTalkHandler
```typescript
// /src/core/modes/smalltalk.handler.ts modifications

// Check for domain triggers even in casual conversation
private checkDomainRelevance(context: HandlerContext): boolean {
  const activeDomains = context.state.metadata?.activeDomains || [];
  return activeDomains.length > 0;
}

async handle(context: HandlerContext): Promise<HandlerResult> {
  let systemPrompt = this.baseSmallTalkPrompt;

  // Light steering if domains detected but maintain casual tone
  if (this.checkDomainRelevance(context) && context.state.steeringHints) {
    systemPrompt += `\n\nNote: The user mentioned something that might be worth exploring,
    but keep the conversation light and casual. If it feels natural, you could ask about:
    ${context.state.steeringHints.suggestions[0]}`;
  }

  // Continue with casual response...
}
```

#### 3. Update MetaHandler for Health Summaries
```typescript
// /src/core/modes/meta.handler.ts modifications

async handle(context: HandlerContext): Promise<HandlerResult> {
  // Check if this is a health summary request
  if (this.isHealthSummaryRequest(context.message)) {
    return this.handleHealthSummary(context);
  }

  // Regular meta handling...
}

private async handleHealthSummary(context: HandlerContext): Promise<HandlerResult> {
  // Query health storage for aggregated data
  const healthStorage = new HealthStorage();
  const summary = await healthStorage.aggregate({
    userId: context.userId,
    interval: 'day',
    groupBy: 'date'
  });

  // Format summary for user
  const response = this.formatHealthSummary(summary);

  return { response };
}
```

---

## Phase 5: Second Domain Implementation (Finance)

### Objective
Implement finance domain to validate multi-domain support and parallel extraction.

### Duration
Day 4 (4 hours)

### Implementation

#### 1. Finance Schema
```typescript
// /src/domains/finance/schemas/finance.schema.ts
import { z } from 'zod';

export const financeExtractionSchema = z.object({
  expenses: z.array(z.object({
    category: z.string(),
    amount: z.number(),
    description: z.string().optional(),
    date: z.string().optional()
  })).optional(),

  income: z.object({
    amount: z.number(),
    source: z.string(),
    frequency: z.enum(['monthly', 'biweekly', 'weekly', 'once'])
  }).optional(),

  budget: z.object({
    total: z.number(),
    categories: z.record(z.number()),
    period: z.enum(['monthly', 'weekly', 'yearly'])
  }).optional(),

  goals: z.array(z.object({
    name: z.string(),
    targetAmount: z.number(),
    currentAmount: z.number().optional(),
    deadline: z.string().optional()
  })).optional(),

  concerns: z.array(z.string()).optional()
});
```

#### 2. Finance Extractor
```typescript
// /src/domains/finance/extractors/FinanceExtractor.ts
export class FinanceExtractor extends BaseExtractor {
  domainId = 'finance';
  schema = financeExtractionSchema;

  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    return `Extract financial information from the message.
    Look for: expenses, income, budget, savings goals, financial concerns.
    Only extract explicitly mentioned information.`;
  }

  protected validateAndTransform(data: any): ExtractedData {
    return {
      domainId: this.domainId,
      timestamp: new Date(),
      data,
      confidence: 0.8
    };
  }
}
```

#### 3. Test Multi-Domain Scenario
```typescript
// Test case
describe('Multi-domain extraction', () => {
  it('should extract from multiple domains in parallel', async () => {
    const message = "I'm stressed about money and have a headache from worrying";

    // Should trigger both health and finance extractors
    const state = await pipeline.process({ message });

    expect(state.extractions.health).toBeDefined();
    expect(state.extractions.finance).toBeDefined();
    expect(state.extractions.health[0].data.symptoms).toContainEqual(
      expect.objectContaining({ name: expect.stringContaining('headache') })
    );
    expect(state.extractions.finance[0].data.concerns).toContain('stressed about money');
  });
});
```

---

## Phase 6: Configuration & Testing

### Objective
Add comprehensive configuration system and full test coverage.

### Duration
Day 5 (6 hours)

### Tasks

#### 1. Configuration System
```typescript
// /src/config/domains.config.ts
export const domainsConfig = {
  // Global domain framework settings
  enabled: process.env.ENABLE_DOMAIN_FRAMEWORK === 'true',

  // Individual domain settings
  domains: {
    health: {
      enabled: process.env.ENABLE_HEALTH_DOMAIN !== 'false',
      extractionThreshold: 0.7,
      steeringPriority: 1.0,
      storage: {
        retention: '365d',
        aggregationInterval: '1d'
      }
    },
    finance: {
      enabled: process.env.ENABLE_FINANCE_DOMAIN !== 'false',
      extractionThreshold: 0.8,
      steeringPriority: 0.8,
      storage: {
        retention: '730d',
        aggregationInterval: '1w'
      }
    }
  },

  // Extraction settings
  extraction: {
    maxDomainsPerMessage: parseInt(process.env.MAX_DOMAINS_PER_MESSAGE || '3'),
    parallelProcessing: true,
    cacheResults: true,
    cacheTTL: 300, // 5 minutes
    timeout: 5000  // 5 seconds per extractor
  },

  // Steering settings
  steering: {
    maxSuggestionsPerResponse: 3,
    mergeStrategy: 'priority' as const,
    enabledStrategies: (process.env.ENABLED_STRATEGIES || 'all').split(','),
    contextWindow: 10 // messages to consider
  },

  // Performance settings
  performance: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
    slowQueryThreshold: 1000 // ms
  }
};
```

#### 2. Test Suite Structure
```typescript
// /src/domains/__tests__/health.test.ts
describe('Health Domain', () => {
  describe('HealthExtractor', () => {
    it('should extract symptoms correctly');
    it('should handle multiple symptoms');
    it('should estimate severity from language');
    it('should return null for non-health messages');
  });

  describe('WellnessCheckStrategy', () => {
    it('should trigger after 24 hours');
    it('should ask relevant wellness questions');
    it('should prioritize missing data');
  });

  describe('SymptomExplorationStrategy', () => {
    it('should trigger for high severity symptoms');
    it('should ask follow-up questions');
    it('should suggest medical attention when needed');
  });
});

// /src/core/stages/__tests__/extraction.stage.test.ts
describe('ExtractionStage', () => {
  it('should process relevant domains only');
  it('should handle parallel extraction');
  it('should timeout gracefully');
  it('should cache results');
});

// /tests/e2e/conversation.test.ts
describe('E2E Conversation Flow', () => {
  it('should handle complete health conversation');
  it('should switch between domains smoothly');
  it('should persist data correctly');
  it('should generate appropriate responses with steering');
});
```

#### 3. Performance Benchmarks
```typescript
// /benchmarks/extraction.bench.ts
import { benchmark } from '@/testing/benchmark.js';

benchmark('Domain Extraction Performance', {
  'Single domain extraction': async () => {
    // Test single domain
  },
  'Multi-domain extraction': async () => {
    // Test multiple domains
  },
  'Parallel vs Sequential': async () => {
    // Compare approaches
  }
});
```

---

## Phase 7: Migration & Optimization

### Objective
Complete migration, optimize performance, and prepare for production.

### Duration
Day 5-6 (6 hours)

### Tasks

#### 1. Performance Optimization

##### Add Redis Caching
```typescript
// /src/core/cache/domain.cache.ts
import Redis from 'ioredis';

export class DomainCache {
  private redis: Redis;

  async getCachedClassification(messageHash: string): Promise<string[] | null> {
    const cached = await this.redis.get(`domain:${messageHash}`);
    return cached ? JSON.parse(cached) : null;
  }

  async setCachedClassification(messageHash: string, domains: string[]): Promise<void> {
    await this.redis.setex(`domain:${messageHash}`, 300, JSON.stringify(domains));
  }
}
```

##### Batch Database Writes
```typescript
// /src/core/domains/storage/BatchWriter.ts
export class BatchWriter {
  private queue: any[] = [];
  private timer: NodeJS.Timeout | null = null;

  async add(record: any): Promise<void> {
    this.queue.push(record);

    if (this.queue.length >= 10) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 1000);
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    // Batch insert
    await this.batchInsert(this.queue);
    this.queue = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

#### 2. Migration Scripts
```bash
#!/bin/bash
# /scripts/migrate-to-domains.sh

echo "Starting migration to domain-based system..."

# 1. Backup existing data
pg_dump $DATABASE_URL > backup_before_domains.sql

# 2. Run database migrations
npm run migrate

# 3. Archive flow_instances table
psql $DATABASE_URL -c "ALTER TABLE flow_instances RENAME TO flow_instances_archived;"

# 4. Clear Redis cache
redis-cli FLUSHDB

echo "Migration complete!"
```

#### 3. Monitoring & Metrics
```typescript
// /src/monitoring/domain.metrics.ts
import { metrics } from '@/monitoring/index.js';

export class DomainMetrics {
  recordExtraction(domain: string, duration: number, success: boolean): void {
    metrics.histogram('domain.extraction.duration', duration, { domain });
    metrics.increment('domain.extraction.count', { domain, success });
  }

  recordSteering(strategy: string, suggestionsCount: number): void {
    metrics.gauge('steering.suggestions', suggestionsCount, { strategy });
  }

  recordCacheHit(hit: boolean): void {
    metrics.increment('cache.' + (hit ? 'hits' : 'misses'));
  }
}
```

#### 4. Documentation Updates
```markdown
# Domain Framework Documentation

## Quick Start
1. Register your domain
2. Implement extractor
3. Add steering strategies
4. Configure storage

## API Reference
- BaseExtractor
- BaseSteeringStrategy
- DomainRegistry
- StorageFactory

## Domain Developer Guide
Step-by-step guide to adding new domains...

## Migration Guide
How to migrate from Flow system to Domain framework...
```

### Deployment Checklist

#### Pre-deployment
- [ ] All tests passing (unit, integration, E2E)
- [ ] Performance benchmarks meet targets
- [ ] Documentation complete
- [ ] Migration scripts tested
- [ ] Rollback plan documented

#### Staging Deployment
- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Monitor for 24 hours
- [ ] Check metrics and logs
- [ ] Verify data persistence

#### Production Deployment
- [ ] Enable feature flag (10% rollout)
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] Full deployment after 48 hours stable

#### Post-deployment
- [ ] Remove old Flow code
- [ ] Archive flow_instances table
- [ ] Update documentation
- [ ] Team knowledge transfer
- [ ] Retrospective meeting

## Success Metrics

### Target Performance
- Response time: <500ms (p95)
- Extraction success rate: >90%
- Steering relevance: >80%
- Memory usage: <100MB increase
- LLM calls: ≤3 per message

### Monitoring Dashboard
- Domain extraction latency
- Steering effectiveness
- Cache hit rate
- Storage throughput
- Error rates by domain

## Risk Mitigation

### Rollback Strategy
```bash
# Quick rollback if needed
git checkout backup/flow-system-mvp-v2
npm run deploy:rollback
```

### Feature Flags
```typescript
if (config.domains.enabled) {
  // New domain system
} else {
  // Fallback to basic system (no flows)
}
```

### Gradual Rollout
- Start with internal users
- Monitor closely for 48 hours
- Expand to 10% of users
- Full rollout after validation