# Generic Conversation Steering & Extraction Framework

## Overview

A scalable, extensible framework for conversation steering and domain extraction that follows the existing architectural patterns (pipeline, stages, classifiers, handlers). This framework is domain-agnostic and can be configured for any use case.

## Core Architecture Principles

### 1. Separation of Concerns
- **Steering**: Guides conversation direction
- **Extraction**: Captures structured data
- **Storage**: Persists domain-specific records
- **Context**: Maintains conversation state

### 2. Pattern Consistency
Following existing patterns in the codebase:
- Pipeline → Orchestration
- Stages → Processing steps
- Classifiers → Decision making
- Handlers → Domain-specific logic
- Repositories → Data persistence

## Framework Components

### 1. Domain Registry Pattern

```typescript
// Domain definition interface
interface DomainDefinition {
  id: string;                          // 'health', 'finance', 'education'
  name: string;
  description: string;
  priority: number;                    // For extraction ordering
  enabled: boolean;

  // Domain capabilities
  capabilities: {
    extraction: boolean;               // Can extract data
    steering: boolean;                 // Can steer conversations
    summarization: boolean;            // Can provide summaries
  };

  // Domain configuration
  config: {
    extractionSchema: z.ZodSchema;    // What to extract
    steeringStrategy: SteeringConfig; // How to steer
    storageConfig: StorageConfig;     // Where to store
  };
}

// Central registry
class DomainRegistry {
  private domains = new Map<string, DomainDefinition>();

  register(domain: DomainDefinition): void;
  getActiveDomains(): DomainDefinition[];
  getDomain(id: string): DomainDefinition | null;
}
```

### 2. Extraction Stage Pattern

```typescript
// Generic extraction stage that processes all domains
export class ExtractionStage extends BaseStage {
  name = 'extraction';

  async process(state: ConversationState): Promise<ConversationState> {
    // Get relevant domains for this conversation
    const relevantDomains = await this.classifyDomains(state);

    // Extract data for each relevant domain
    const extractions = await Promise.all(
      relevantDomains.map(domain =>
        this.extractForDomain(domain, state)
      )
    );

    // Store extracted data
    await this.storeExtractions(extractions);

    // Update state with extraction results
    return this.updateState(state, extractions);
  }

  private async classifyDomains(state: ConversationState): Promise<DomainDefinition[]> {
    // Use domain classifier to determine relevance
    const classifier = new DomainRelevanceClassifier();
    return classifier.classify(state);
  }
}
```

### 3. Steering Stage Pattern

```typescript
// Generic steering stage that guides conversations
export class SteeringStage extends BaseStage {
  name = 'steering';

  async process(state: ConversationState): Promise<ConversationState> {
    // Determine active steering strategies
    const strategies = await this.getActiveStrategies(state);

    // Generate steering hints for each strategy
    const hints = await Promise.all(
      strategies.map(strategy =>
        strategy.generateHints(state)
      )
    );

    // Merge and prioritize hints
    const mergedHints = this.mergeHints(hints);

    // Update state with steering guidance
    return {
      ...state,
      steeringHints: mergedHints,
    };
  }
}
```

### 4. Domain-Specific Extractors

```typescript
// Base extractor that all domain extractors extend
abstract class BaseExtractor {
  abstract domainId: string;
  abstract schema: z.ZodSchema;

  async extract(message: string, context: ExtractionContext): Promise<ExtractedData> {
    // Common extraction logic
    const prompt = this.buildExtractionPrompt(message, context);
    const result = await this.llm.extract(prompt, this.schema);
    return this.validateAndTransform(result);
  }

  protected abstract buildExtractionPrompt(message: string, context: ExtractionContext): string;
  protected abstract validateAndTransform(data: any): ExtractedData;
}

// Example: Health domain extractor
class HealthExtractor extends BaseExtractor {
  domainId = 'health';
  schema = healthSchema;

  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    return `Extract health-related information...`;
  }
}

// Example: Finance domain extractor
class FinanceExtractor extends BaseExtractor {
  domainId = 'finance';
  schema = financeSchema;

  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    return `Extract financial information...`;
  }
}
```

### 5. Steering Strategies

```typescript
// Base steering strategy
abstract class BaseSteeringStrategy {
  abstract strategyId: string;
  abstract priority: number;

  abstract shouldApply(state: ConversationState): boolean;
  abstract generateHints(state: ConversationState): Promise<SteeringHints>;
}

// Example: Goal-oriented steering
class GoalSteeringStrategy extends BaseSteeringStrategy {
  strategyId = 'goal_steering';
  priority = 1;

  shouldApply(state: ConversationState): boolean {
    return state.goals.some(g => g.status === 'active');
  }

  async generateHints(state: ConversationState): Promise<SteeringHints> {
    const activeGoals = state.goals.filter(g => g.status === 'active');
    return {
      type: 'goal_progress',
      suggestions: this.generateGoalQuestions(activeGoals),
      context: this.buildGoalContext(activeGoals),
    };
  }
}

// Example: Information gathering steering
class InformationGatheringStrategy extends BaseSteeringStrategy {
  strategyId = 'info_gathering';
  priority = 2;

  shouldApply(state: ConversationState): boolean {
    return this.hasMissingInformation(state);
  }

  async generateHints(state: ConversationState): Promise<SteeringHints> {
    const gaps = this.identifyInformationGaps(state);
    return {
      type: 'information_gathering',
      suggestions: this.generateGatheringQuestions(gaps),
      context: this.buildGapContext(gaps),
    };
  }
}
```

### 6. Domain Classifiers

```typescript
// Classifier to determine which domains are relevant
class DomainRelevanceClassifier extends BaseClassifier {
  name = 'domain_relevance';

  async classify(state: ConversationState): Promise<DomainDefinition[]> {
    const message = state.messages[state.messages.length - 1];
    const domains = domainRegistry.getActiveDomains();

    // Use LLM to classify relevance
    const prompt = this.buildClassificationPrompt(message, domains);
    const relevantDomainIds = await this.llm.classify(prompt);

    return relevantDomainIds
      .map(id => domainRegistry.getDomain(id))
      .filter(Boolean) as DomainDefinition[];
  }

  private buildClassificationPrompt(message: Message, domains: DomainDefinition[]): string {
    return `
      Given the message: "${message.content}"

      Which of these domains are relevant?
      ${domains.map(d => `- ${d.id}: ${d.description}`).join('\n')}

      Return array of relevant domain IDs.
    `;
  }
}
```

### 7. Storage Abstraction

```typescript
// Generic storage interface for domain data
interface DomainStorage<T> {
  store(data: T): Promise<void>;
  query(filters: QueryFilters): Promise<T[]>;
  aggregate(aggregation: AggregationConfig): Promise<any>;
}

// Storage factory
class StorageFactory {
  create<T>(domainId: string, config: StorageConfig): DomainStorage<T> {
    switch (config.type) {
      case 'timeseries':
        return new TimeSeriesStorage<T>(domainId, config);
      case 'document':
        return new DocumentStorage<T>(domainId, config);
      case 'relational':
        return new RelationalStorage<T>(domainId, config);
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }
}
```

## Pipeline Integration

### Enhanced Pipeline Configuration

```typescript
// In pipeline.ts
export class ConversationPipeline {
  private stages: Stage[] = [];

  constructor() {
    this.initializeStages();
  }

  private initializeStages() {
    // Core stages
    this.stages.push(new ClassificationStage());    // Existing
    this.stages.push(new DecayStage());             // Existing

    // New generic stages
    this.stages.push(new ExtractionStage());        // NEW: Domain extraction
    this.stages.push(new SteeringStage());          // NEW: Conversation steering

    // Mode handling
    this.stages.push(new ModeHandlerStage());       // Existing
  }

  async process(input: PipelineInput): Promise<PipelineOutput> {
    let state = this.initializeState(input);

    for (const stage of this.stages) {
      state = await stage.process(state);

      // Early exit if stage indicates completion
      if (state.completed) break;
    }

    return this.buildOutput(state);
  }
}
```

### State Enhancement

```typescript
// Enhanced conversation state
interface ConversationState {
  // Existing fields
  conversationId: string;
  messages: Message[];
  mode: ConversationMode;
  goals: ConversationGoal[];
  topics: Topic[];

  // New extraction & steering fields
  extractions: {
    [domainId: string]: ExtractedData[];
  };

  steeringHints: SteeringHints;

  domainContext: {
    [domainId: string]: DomainContext;
  };

  // Metadata
  metadata: {
    extractionTimestamp?: Date;
    steeringApplied?: string[];
    activeDomains?: string[];
  };
}
```

## Configuration System

### Domain Configuration Example

```yaml
# config/domains/health.yaml
domain:
  id: health
  name: Health & Wellness
  description: Physical and mental health tracking
  priority: 1
  enabled: true

  capabilities:
    extraction: true
    steering: true
    summarization: true

  extraction:
    schema:
      symptoms:
        type: array
        items:
          name: string
          severity: number
          duration: string
      mood:
        level: number
        description: string
      sleep:
        hours: number
        quality: string

  steering:
    strategies:
      - symptom_exploration
      - wellness_check
      - preventive_guidance

    triggers:
      - keywords: [tired, pain, sick]
        strategy: symptom_exploration
      - schedule: daily
        strategy: wellness_check

  storage:
    type: timeseries
    table: health_records
    retention: 365d
```

### System Configuration

```typescript
// config/steering.config.ts
export const steeringConfig = {
  // Global steering settings
  enabled: true,
  maxHintsPerResponse: 3,
  priorityThreshold: 0.5,

  // Strategy settings
  strategies: {
    goalSteering: {
      enabled: true,
      weight: 1.0,
    },
    informationGathering: {
      enabled: true,
      weight: 0.8,
    },
    domainSpecific: {
      enabled: true,
      weight: 0.9,
    },
  },

  // Domain settings
  domains: {
    maxActivePerConversation: 3,
    classificationThreshold: 0.7,
    extractionMode: 'selective', // 'all' | 'selective' | 'none'
  },
};
```

## Usage Examples

### 1. Registering a New Domain

```typescript
// Register health domain
domainRegistry.register({
  id: 'health',
  name: 'Health & Wellness',
  description: 'Track physical and mental health',
  priority: 1,
  enabled: true,
  capabilities: {
    extraction: true,
    steering: true,
    summarization: true,
  },
  config: {
    extractionSchema: healthSchema,
    steeringStrategy: healthSteeringConfig,
    storageConfig: {
      type: 'timeseries',
      table: 'health_records',
    },
  },
});

// Register custom extractor
extractorRegistry.register(new HealthExtractor());

// Register custom steering strategy
steeringRegistry.register(new HealthSteeringStrategy());
```

### 2. Adding a New Domain (Education)

```typescript
// 1. Define schema
const educationSchema = z.object({
  subject: z.string(),
  learningGoals: z.array(z.string()),
  progress: z.number(),
  challenges: z.array(z.string()),
});

// 2. Create extractor
class EducationExtractor extends BaseExtractor {
  domainId = 'education';
  schema = educationSchema;

  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    return `Extract education and learning information...`;
  }
}

// 3. Create steering strategy
class EducationSteeringStrategy extends BaseSteeringStrategy {
  strategyId = 'education_steering';

  shouldApply(state: ConversationState): boolean {
    return state.domainContext.education?.active || false;
  }

  async generateHints(state: ConversationState): Promise<SteeringHints> {
    // Generate education-specific steering
    return {
      type: 'learning_progress',
      suggestions: [
        'What topics are you finding challenging?',
        'How much time did you spend studying today?',
      ],
    };
  }
}

// 4. Register everything
domainRegistry.register(educationDomain);
extractorRegistry.register(new EducationExtractor());
steeringRegistry.register(new EducationSteeringStrategy());
```

## Benefits of This Architecture

### 1. Scalability
- Add new domains without modifying core code
- Domains can be enabled/disabled via configuration
- Parallel extraction for performance

### 2. Extensibility
- Plugin-style domain registration
- Custom extractors and strategies per domain
- Flexible storage options

### 3. Maintainability
- Clear separation of concerns
- Consistent patterns across domains
- Centralized configuration

### 4. Performance
- Selective extraction based on relevance
- Caching of domain classifications
- Async processing where appropriate

### 5. Consistency
- Follows existing architectural patterns
- Integrates naturally with pipeline
- Uses familiar stage/classifier concepts

## Migration Path

### Phase 1: Core Framework
1. Implement base classes (BaseExtractor, BaseSteeringStrategy)
2. Create registries (DomainRegistry, ExtractorRegistry)
3. Add ExtractionStage and SteeringStage to pipeline

### Phase 2: Initial Domains
1. Implement health domain as proof of concept
2. Add finance domain to test multi-domain
3. Validate extraction and steering work together

### Phase 3: Advanced Features
1. Add domain interaction (cross-domain insights)
2. Implement summarization capabilities
3. Add analytics and reporting

### Phase 4: Optimization
1. Add caching layer
2. Implement batch extraction
3. Optimize LLM calls

## Testing Strategy

```typescript
// Unit tests for extractors
describe('HealthExtractor', () => {
  it('should extract symptoms from message', async () => {
    const extractor = new HealthExtractor();
    const result = await extractor.extract(
      'I have a headache and feel tired',
      mockContext
    );
    expect(result.symptoms).toHaveLength(2);
  });
});

// Integration tests for pipeline
describe('ExtractionStage', () => {
  it('should process multiple domains', async () => {
    const stage = new ExtractionStage();
    const state = await stage.process(mockState);
    expect(state.extractions).toHaveProperty('health');
    expect(state.extractions).toHaveProperty('finance');
  });
});

// E2E tests
describe('Conversation with steering', () => {
  it('should steer towards missing information', async () => {
    const pipeline = new ConversationPipeline();
    const result = await pipeline.process({
      message: 'I want to improve my health',
    });
    expect(result.steeringHints.suggestions).toContain(
      expect.stringMatching(/sleep|exercise|diet/)
    );
  });
});
```

## Conclusion

This framework provides a generic, scalable solution for conversation steering and extraction that:

1. **Follows existing patterns** - Uses stages, classifiers, and handlers like the rest of the system
2. **Domain-agnostic** - Not specific to health, works for any domain
3. **Highly extensible** - Easy to add new domains, extractors, and strategies
4. **Production-ready** - Includes configuration, testing, and migration path
5. **Performance-conscious** - Selective extraction and parallel processing

The key innovation is treating domains as plugins that can be registered and configured independently, while the core framework handles orchestration through the familiar pipeline/stages pattern.