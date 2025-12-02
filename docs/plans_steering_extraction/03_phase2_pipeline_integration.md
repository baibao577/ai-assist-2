# Phase 2: Pipeline Integration

## Objective
Integrate ExtractionStage and SteeringStage into the existing pipeline architecture.

## Duration
Day 2 (6-8 hours)

## Prerequisites
- Phase 1 completed
- Base classes and registries working
- Types properly defined

## Implementation Tasks

### 1. Create ExtractionStage
```typescript
// /src/core/stages/extraction.stage.ts
import { logger } from '@/core/logger.js';
import type { ConversationState } from '@/types/state.js';
import { domainRegistry, extractorRegistry } from '@/core/domains/registries/index.js';
import { DomainRelevanceClassifier } from '@/core/classifiers/domain.classifier.js';
import { StorageFactory } from '@/core/domains/storage/index.js';
import type { ExtractedData, DomainDefinition } from '@/core/domains/types.js';

export class ExtractionStage {
  name = 'extraction';
  private classifier = new DomainRelevanceClassifier();

  async process(state: ConversationState): Promise<ConversationState> {
    // Get last user message
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return state;
    }

    try {
      // Classify which domains are relevant
      const relevantDomains = await this.classifier.classify(state);

      if (relevantDomains.length === 0) {
        logger.debug('Extraction stage: No relevant domains found');
        return state;
      }

      logger.info(
        {
          domains: relevantDomains.map(d => d.id),
          messagePreview: lastMessage.content.substring(0, 50)
        },
        'Extraction stage: Processing domains'
      );

      // Extract data for each relevant domain in parallel
      const extractionPromises = relevantDomains.map(async (domain) => {
        const extractor = extractorRegistry.getExtractor(domain.id);
        if (!extractor) {
          logger.warn({ domainId: domain.id }, 'No extractor found for domain');
          return null;
        }

        const context = {
          recentMessages: state.messages.slice(-5).map(m => ({
            role: m.role,
            content: m.content
          })),
          domainContext: state.domainContext?.[domain.id] || {}
        };

        const extraction = await extractor.extract(lastMessage.content, context);
        if (extraction) {
          extraction.domainId = domain.id;
        }
        return extraction;
      });

      const extractions = (await Promise.all(extractionPromises)).filter(Boolean) as ExtractedData[];

      // Store extractions in domain-specific storage
      for (const extraction of extractions) {
        await this.storeExtraction(extraction);
      }

      // Update state with extractions
      const updatedExtractions = { ...(state.extractions || {}) };
      for (const extraction of extractions) {
        if (!updatedExtractions[extraction.domainId]) {
          updatedExtractions[extraction.domainId] = [];
        }
        updatedExtractions[extraction.domainId].push(extraction);
      }

      // Update domain context
      const updatedDomainContext = { ...(state.domainContext || {}) };
      for (const domain of relevantDomains) {
        updatedDomainContext[domain.id] = {
          ...updatedDomainContext[domain.id],
          lastExtraction: new Date(),
          extractionCount: (updatedDomainContext[domain.id]?.extractionCount || 0) + 1,
          active: true
        };
      }

      logger.info(
        {
          extractionCount: extractions.length,
          domains: extractions.map(e => e.domainId)
        },
        'Extraction stage: Complete'
      );

      return {
        ...state,
        extractions: updatedExtractions,
        domainContext: updatedDomainContext,
        metadata: {
          ...state.metadata,
          extractionTimestamp: new Date(),
          activeDomains: relevantDomains.map(d => d.id)
        }
      };
    } catch (error) {
      logger.error({ error }, 'Extraction stage failed');
      return state;
    }
  }

  private async storeExtraction(extraction: ExtractedData): Promise<void> {
    try {
      const domain = domainRegistry.getDomain(extraction.domainId);
      if (domain?.config.storageConfig) {
        const storage = StorageFactory.create(
          extraction.domainId,
          domain.config.storageConfig
        );
        await storage.store(extraction.data);
      }
    } catch (error) {
      logger.error(
        { domainId: extraction.domainId, error },
        'Failed to store extraction'
      );
    }
  }
}

export const extractionStage = new ExtractionStage();
```

### 2. Create SteeringStage
```typescript
// /src/core/stages/steering.stage.ts
import { logger } from '@/core/logger.js';
import type { ConversationState } from '@/types/state.js';
import { steeringRegistry } from '@/core/domains/registries/index.js';
import type { SteeringHints } from '@/core/domains/types.js';

export class SteeringStage {
  name = 'steering';

  async process(state: ConversationState): Promise<ConversationState> {
    try {
      // Get all registered strategies
      const allStrategies = steeringRegistry.getAllStrategies();

      if (allStrategies.length === 0) {
        logger.debug('Steering stage: No strategies registered');
        return state;
      }

      // Filter strategies that should apply to current state
      const activeStrategies = allStrategies.filter(s => s.shouldApply(state));

      if (activeStrategies.length === 0) {
        logger.debug('Steering stage: No applicable strategies');
        return state;
      }

      logger.info(
        {
          strategies: activeStrategies.map(s => s.strategyId),
          count: activeStrategies.length
        },
        'Steering stage: Generating hints'
      );

      // Generate hints from each strategy in parallel
      const hintPromises = activeStrategies.map(s => s.generateHints(state));
      const hints = await Promise.all(hintPromises);

      // Merge and prioritize hints
      const mergedHints = this.mergeHints(hints);

      logger.info(
        {
          suggestions: mergedHints.suggestions.length,
          type: mergedHints.type
        },
        'Steering stage: Hints generated'
      );

      return {
        ...state,
        steeringHints: mergedHints,
        metadata: {
          ...state.metadata,
          steeringApplied: activeStrategies.map(s => s.strategyId)
        }
      };
    } catch (error) {
      logger.error({ error }, 'Steering stage failed');
      return state;
    }
  }

  private mergeHints(hints: SteeringHints[]): SteeringHints {
    if (hints.length === 0) {
      return {
        type: 'none',
        suggestions: [],
        context: {},
        priority: 0
      };
    }

    // Sort by priority (highest first)
    const sorted = hints.sort((a, b) => b.priority - a.priority);

    // Start with highest priority hint
    const merged: SteeringHints = {
      type: sorted.length > 1 ? 'merged' : sorted[0].type,
      suggestions: [],
      context: {},
      priority: sorted[0].priority
    };

    // Merge suggestions from top 3 priority hints
    const seen = new Set<string>();
    for (const hint of sorted.slice(0, 3)) {
      for (const suggestion of hint.suggestions) {
        // Deduplicate suggestions
        const normalized = suggestion.toLowerCase().trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          merged.suggestions.push(suggestion);
        }
      }
      // Merge context objects
      merged.context = { ...merged.context, ...hint.context };
    }

    // Limit to 3 suggestions total
    merged.suggestions = merged.suggestions.slice(0, 3);

    return merged;
  }
}

export const steeringStage = new SteeringStage();
```

### 3. Create Domain Classifier
```typescript
// /src/core/classifiers/domain.classifier.ts
import { openai } from '@/core/llm/index.js';
import { logger } from '@/core/logger.js';
import { BaseClassifier } from './base.classifier.js';
import { domainRegistry } from '@/core/domains/registries/index.js';
import type { ConversationState } from '@/types/state.js';
import type { DomainDefinition } from '@/core/domains/types.js';

export class DomainRelevanceClassifier extends BaseClassifier {
  name = 'domain_relevance';

  async classify(state: ConversationState): Promise<DomainDefinition[]> {
    const message = state.messages[state.messages.length - 1];
    if (!message || message.role !== 'user') {
      return [];
    }

    const domains = domainRegistry.getActiveDomains();
    if (domains.length === 0) {
      return [];
    }

    try {
      const prompt = this.buildPrompt(message.content, domains, state);

      const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a domain classifier. Return only JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 100
      });

      const response = JSON.parse(result.choices[0].message.content || '{}');
      const relevantIds: string[] = response.domains || [];

      logger.debug(
        {
          messagePreview: message.content.substring(0, 50),
          relevantDomains: relevantIds
        },
        'Domain classification complete'
      );

      // Map IDs back to domain definitions
      return relevantIds
        .map(id => domainRegistry.getDomain(id))
        .filter(Boolean) as DomainDefinition[];

    } catch (error) {
      logger.error({ error }, 'Domain classification failed');
      return [];
    }
  }

  private buildPrompt(message: string, domains: DomainDefinition[], state: ConversationState): string {
    const domainList = domains.map(d => `- ${d.id}: ${d.description}`).join('\n');

    return `Given this user message: "${message}"

And these available domains:
${domainList}

Which domains are relevant to extract information from? Consider:
1. The message content and what information it contains
2. Recent conversation context
3. Currently active domains: ${state.metadata?.activeDomains?.join(', ') || 'none'}

Return a JSON object with a "domains" array containing only the IDs of relevant domains.
Be selective - only include domains that have extractable information in this specific message.

Example response: {"domains": ["health", "finance"]}`;
  }
}

export const domainClassifier = new DomainRelevanceClassifier();
```

### 4. Update Pipeline.ts
```typescript
// Modifications to /src/core/pipeline.ts

// Add new imports at the top
import { extractionStage } from '@/core/stages/extraction.stage.js';
import { steeringStage } from '@/core/stages/steering.stage.js';

// In the execute method, after Global stage (around line 104):

// Stage 4.5: Domain Extraction (NEW)
const stateWithExtractions = await extractionStage.process(stateWithContext);

logger.info(
  {
    conversationId: conversation.id,
    extractedDomains: stateWithExtractions.metadata?.activeDomains || [],
    extractionCount: Object.keys(stateWithExtractions.extractions || {}).length,
  },
  'Extraction stage: Domain data extracted'
);

// Stage 4.6: Conversation Steering (NEW)
const stateWithSteering = await steeringStage.process(stateWithExtractions);

logger.info(
  {
    conversationId: conversation.id,
    steeringStrategies: stateWithSteering.metadata?.steeringApplied || [],
    suggestionCount: stateWithSteering.steeringHints?.suggestions.length || 0,
  },
  'Steering stage: Conversation guidance generated'
);

// Update the handler call (around line 270) to pass the enhanced state:
handlerResult = await handler.handle({
  conversationId: conversation.id,
  userId: context.userId,
  message: context.message,
  messages: messages.map((m) => ({ role: m.role, content: m.content })),
  currentMode: decision.finalMode,
  state: stateWithSteering, // Use state with extractions and steering
  classification: classificationContext,
});

// Update save stage call (around line 285):
const messageId = await this.saveStage(
  conversation.id,
  context.message,
  handlerResult.response,
  stateWithSteering, // Use enhanced state
  decision.finalMode
);
```

### 5. Update ConversationState Type
```typescript
// Update /src/types/state.ts
import type { ExtractedData, SteeringHints, DomainContext } from '@/core/domains/types.js';

export interface ConversationState {
  // ... existing fields ...
  conversationId: string;
  mode: ConversationMode;
  contextElements: ContextElement[];
  goals: ConversationGoal[];
  lastActivityAt: Date;

  // New fields for extraction and steering
  extractions?: {
    [domainId: string]: ExtractedData[];
  };

  steeringHints?: SteeringHints;

  domainContext?: {
    [domainId: string]: DomainContext;
  };

  metadata?: {
    extractionTimestamp?: Date;
    steeringApplied?: string[];
    activeDomains?: string[];
    // Remove: activeFlowId?: string;
  };

  // ... rest of existing fields ...
  messages: Array<{
    role: string;
    content: string;
  }>;
}
```

### 6. Update Handler Context Type
```typescript
// Update /src/types/handlers.ts (or wherever HandlerContext is defined)
import type { SteeringHints } from '@/core/domains/types.js';

export interface HandlerContext {
  conversationId: string;
  userId: string;
  message: string;
  messages: Array<{ role: string; content: string }>;
  currentMode: ConversationMode;
  state: ConversationState;
  classification: ClassificationContext;
  // Remove if exists: steeringHints?: SteeringHints;
  // Steering hints are now in state.steeringHints
}
```

### 7. Update Classifier Exports
```typescript
// Update /src/core/classifiers/index.ts
export { safetyClassifier } from './safety.classifier.js';
export { intentClassifier } from './intent.classifier.js';
export { pendingClassifier } from './pending.classifier.js';
export { arbiter } from './arbiter.js';
export { domainClassifier } from './domain.classifier.js'; // NEW
// Remove: export { flowClassifier } from './flow.classifier.js';
```

## Validation Checklist
- [ ] ExtractionStage compiles and runs without errors
- [ ] SteeringStage compiles and runs without errors
- [ ] Domain classifier properly classifies messages
- [ ] Pipeline integrates new stages smoothly
- [ ] State type properly updated with new fields
- [ ] No TypeScript compilation errors
- [ ] Basic conversation flow still works
- [ ] Logs show extraction and steering stages running

## Testing
```typescript
// Test extraction stage
describe('ExtractionStage', () => {
  it('should extract data for relevant domains', async () => {
    // Register test domain and extractor
    const mockState: ConversationState = {
      messages: [
        { role: 'user', content: 'I have a headache' }
      ],
      // ... other required fields
    };

    const result = await extractionStage.process(mockState);
    expect(result.extractions).toBeDefined();
  });
});

// Test steering stage
describe('SteeringStage', () => {
  it('should generate steering hints', async () => {
    // Register test strategy
    const mockState: ConversationState = {
      // ... state with extractions
    };

    const result = await steeringStage.process(mockState);
    expect(result.steeringHints).toBeDefined();
    expect(result.steeringHints.suggestions).toBeInstanceOf(Array);
  });
});
```

## Next Phase Gate
- Pipeline successfully runs with new stages
- Domain classification working correctly
- Extraction and steering stages integrated
- State properly enhanced with new fields
- Ready for first domain implementation