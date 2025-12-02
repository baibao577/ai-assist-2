# Phase 1: Core Framework Foundation

## Objective
Build the foundational classes, interfaces, and registries for the domain-based framework.

## Duration
Day 1-2 (8-10 hours)

## Prerequisites
- Phase 0 completed successfully
- TypeScript compiling cleanly
- No flow references remaining

## Directory Structure
```
/src/core/domains/
  ├── base/
  │   ├── BaseExtractor.ts
  │   ├── BaseSteeringStrategy.ts
  │   └── index.ts
  ├── registries/
  │   ├── DomainRegistry.ts
  │   ├── ExtractorRegistry.ts
  │   ├── SteeringRegistry.ts
  │   └── index.ts
  ├── storage/
  │   ├── DomainStorage.ts
  │   ├── StorageFactory.ts
  │   ├── TimeSeriesStorage.ts
  │   └── index.ts
  └── types.ts
```

## Implementation Tasks

### 1. Create Domain Types (`/src/core/domains/types.ts`)
```typescript
import { z } from 'zod';

export interface DomainDefinition {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  capabilities: DomainCapabilities;
  config: DomainConfig;
}

export interface DomainCapabilities {
  extraction: boolean;
  steering: boolean;
  summarization: boolean;
}

export interface DomainConfig {
  extractionSchema: z.ZodSchema;
  steeringStrategy: SteeringConfig;
  storageConfig: StorageConfig;
}

export interface ExtractedData {
  domainId: string;
  timestamp: Date;
  data: any;
  confidence: number;
}

export interface SteeringHints {
  type: string;
  suggestions: string[];
  context: any;
  priority: number;
}

export interface ExtractionContext {
  recentMessages: Array<{role: string; content: string}>;
  domainContext: any;
}

export interface SteeringConfig {
  triggers: string[];
  maxSuggestionsPerTurn: number;
}

export interface StorageConfig {
  type: 'timeseries' | 'document' | 'relational';
  table: string;
  retention?: string;
}

export interface DomainContext {
  lastExtraction?: Date;
  extractionCount: number;
  active: boolean;
  [key: string]: any;
}
```

### 2. Implement BaseExtractor
```typescript
// /src/core/domains/base/BaseExtractor.ts
import { z } from 'zod';
import { openai } from '@/core/llm/index.js';
import { zodResponseFormat } from 'openai/helpers/zod';
import { logger } from '@/core/logger.js';
import type { ExtractedData, ExtractionContext } from '../types.js';

export abstract class BaseExtractor {
  abstract domainId: string;
  abstract schema: z.ZodSchema;

  async extract(message: string, context: ExtractionContext): Promise<ExtractedData | null> {
    try {
      const prompt = this.buildExtractionPrompt(message, context);

      // Use structured output with schema
      const result = await openai.beta.chat.completions.parse({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: message }
        ],
        response_format: zodResponseFormat(this.schema, this.domainId),
      });

      if (!result.parsed) {
        logger.warn({ domainId: this.domainId }, 'No data extracted');
        return null;
      }

      return this.validateAndTransform(result.parsed);
    } catch (error) {
      logger.error({ domainId: this.domainId, error }, 'Extraction failed');
      return null;
    }
  }

  protected abstract buildExtractionPrompt(message: string, context: ExtractionContext): string;
  protected abstract validateAndTransform(data: any): ExtractedData;
}
```

### 3. Implement BaseSteeringStrategy
```typescript
// /src/core/domains/base/BaseSteeringStrategy.ts
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '../types.js';

export abstract class BaseSteeringStrategy {
  abstract strategyId: string;
  abstract priority: number;

  abstract shouldApply(state: ConversationState): boolean;
  abstract generateHints(state: ConversationState): Promise<SteeringHints>;

  protected mergeSuggestions(existing: string[], newSuggestions: string[]): string[] {
    // Deduplicate and prioritize
    const combined = [...existing];
    for (const suggestion of newSuggestions) {
      if (!combined.includes(suggestion)) {
        combined.push(suggestion);
      }
    }
    return combined.slice(0, 3); // Max 3 suggestions
  }
}
```

### 4. Create DomainRegistry
```typescript
// /src/core/domains/registries/DomainRegistry.ts
import { logger } from '@/core/logger.js';
import type { DomainDefinition } from '../types.js';

export class DomainRegistry {
  private static instance: DomainRegistry;
  private domains = new Map<string, DomainDefinition>();

  private constructor() {}

  static getInstance(): DomainRegistry {
    if (!DomainRegistry.instance) {
      DomainRegistry.instance = new DomainRegistry();
    }
    return DomainRegistry.instance;
  }

  register(domain: DomainDefinition): void {
    if (this.domains.has(domain.id)) {
      throw new Error(`Domain ${domain.id} already registered`);
    }
    this.domains.set(domain.id, domain);
    logger.info({ domainId: domain.id, name: domain.name }, 'Domain registered');
  }

  unregister(domainId: string): void {
    this.domains.delete(domainId);
  }

  getActiveDomains(): DomainDefinition[] {
    return Array.from(this.domains.values())
      .filter(d => d.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  getDomain(id: string): DomainDefinition | null {
    return this.domains.get(id) || null;
  }

  clear(): void {
    this.domains.clear();
  }
}

export const domainRegistry = DomainRegistry.getInstance();
```

### 5. Create ExtractorRegistry
```typescript
// /src/core/domains/registries/ExtractorRegistry.ts
import { logger } from '@/core/logger.js';
import type { BaseExtractor } from '../base/BaseExtractor.js';

export class ExtractorRegistry {
  private static instance: ExtractorRegistry;
  private extractors = new Map<string, BaseExtractor>();

  private constructor() {}

  static getInstance(): ExtractorRegistry {
    if (!ExtractorRegistry.instance) {
      ExtractorRegistry.instance = new ExtractorRegistry();
    }
    return ExtractorRegistry.instance;
  }

  register(extractor: BaseExtractor): void {
    this.extractors.set(extractor.domainId, extractor);
    logger.info({ domainId: extractor.domainId }, 'Extractor registered');
  }

  getExtractor(domainId: string): BaseExtractor | null {
    return this.extractors.get(domainId) || null;
  }

  getAllExtractors(): BaseExtractor[] {
    return Array.from(this.extractors.values());
  }

  clear(): void {
    this.extractors.clear();
  }
}

export const extractorRegistry = ExtractorRegistry.getInstance();
```

### 6. Create SteeringRegistry
```typescript
// /src/core/domains/registries/SteeringRegistry.ts
import { logger } from '@/core/logger.js';
import type { BaseSteeringStrategy } from '../base/BaseSteeringStrategy.js';

export class SteeringRegistry {
  private static instance: SteeringRegistry;
  private strategies = new Map<string, BaseSteeringStrategy>();

  private constructor() {}

  static getInstance(): SteeringRegistry {
    if (!SteeringRegistry.instance) {
      SteeringRegistry.instance = new SteeringRegistry();
    }
    return SteeringRegistry.instance;
  }

  register(strategy: BaseSteeringStrategy): void {
    this.strategies.set(strategy.strategyId, strategy);
    logger.info({ strategyId: strategy.strategyId }, 'Steering strategy registered');
  }

  getStrategy(strategyId: string): BaseSteeringStrategy | null {
    return this.strategies.get(strategyId) || null;
  }

  getAllStrategies(): BaseSteeringStrategy[] {
    return Array.from(this.strategies.values())
      .sort((a, b) => b.priority - a.priority);
  }

  clear(): void {
    this.strategies.clear();
  }
}

export const steeringRegistry = SteeringRegistry.getInstance();
```

### 7. Create Storage Interfaces
```typescript
// /src/core/domains/storage/DomainStorage.ts
export interface QueryFilters {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  [key: string]: any;
}

export interface AggregationConfig {
  groupBy?: string;
  metrics?: string[];
  interval?: 'hour' | 'day' | 'week' | 'month';
}

export interface DomainStorage<T> {
  store(data: T): Promise<void>;
  query(filters: QueryFilters): Promise<T[]>;
  aggregate(config: AggregationConfig): Promise<any>;
  delete(id: string): Promise<void>;
}
```

### 8. Create StorageFactory
```typescript
// /src/core/domains/storage/StorageFactory.ts
import type { StorageConfig } from '../types.js';
import type { DomainStorage } from './DomainStorage.js';
import { TimeSeriesStorage } from './TimeSeriesStorage.js';

export class StorageFactory {
  static create<T>(domainId: string, config: StorageConfig): DomainStorage<T> {
    switch (config.type) {
      case 'timeseries':
        return new TimeSeriesStorage<T>(domainId, config);
      case 'document':
        throw new Error('Document storage not yet implemented');
      case 'relational':
        throw new Error('Relational storage not yet implemented');
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }
}
```

### 9. Create Index Files
```typescript
// /src/core/domains/base/index.ts
export { BaseExtractor } from './BaseExtractor.js';
export { BaseSteeringStrategy } from './BaseSteeringStrategy.js';

// /src/core/domains/registries/index.ts
export { domainRegistry, DomainRegistry } from './DomainRegistry.js';
export { extractorRegistry, ExtractorRegistry } from './ExtractorRegistry.js';
export { steeringRegistry, SteeringRegistry } from './SteeringRegistry.js';

// /src/core/domains/storage/index.ts
export type { DomainStorage, QueryFilters, AggregationConfig } from './DomainStorage.js';
export { StorageFactory } from './StorageFactory.js';

// /src/core/domains/index.ts
export * from './types.js';
export * from './base/index.js';
export * from './registries/index.js';
export * from './storage/index.js';
```

## Validation Checklist
- [ ] All base classes compile without errors
- [ ] Registries are properly singleton
- [ ] Types are properly exported and imported
- [ ] Storage factory creates appropriate storage
- [ ] No circular dependencies
- [ ] Unit tests for registries pass

## Testing
```typescript
// Test domain registration
import { domainRegistry } from '@/core/domains/registries/index.js';

describe('DomainRegistry', () => {
  it('should register and retrieve domains', () => {
    const testDomain = {
      id: 'test',
      name: 'Test Domain',
      description: 'Test',
      priority: 1,
      enabled: true,
      capabilities: { extraction: true, steering: true, summarization: false },
      config: { /* ... */ }
    };

    domainRegistry.register(testDomain);
    expect(domainRegistry.getDomain('test')).toEqual(testDomain);
  });
});
```

## Next Phase Gate
- Core framework classes ready and tested
- All registries functional
- Types properly defined and exported
- Ready to integrate with pipeline