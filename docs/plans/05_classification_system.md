# Classification System Implementation Plan

## Overview
Parallel classification system with 4 specialist LLMs and a rule-based arbiter for final decisions.

## Architecture

### 1. Classifier Manager
```typescript
class ClassifierManager {
  private classifiers: Map<string, IClassifier>;
  private arbiter: Arbiter;
  private cache: ClassificationCache;

  async classify(
    message: string,
    context: ConversationContext
  ): Promise<ParallelClassificationResult> {
    // Run parallel classification
    // Apply timeout constraints
    // Cache results
    // Run arbiter
  }
}
```

## Individual Classifiers

### 1. Safety Classifier
**Purpose**: Detect crisis situations and safety concerns

```typescript
class SafetyClassifier implements IClassifier {
  private llmService: LLMService;
  private patterns: SafetyPattern[];

  async classify(input: ClassificationInput): Promise<SafetyClassification> {
    // 1. Pattern matching for immediate flags
    // 2. LLM classification for nuanced cases
    // 3. Risk scoring
    // 4. Escalation determination
  }
}
```

**Safety Patterns**:
```typescript
const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end it all', 'harm myself',
  'hurt myself', 'not worth living', 'better off dead'
];

const VIOLENCE_KEYWORDS = [
  'hurt someone', 'kill someone', 'attack', 'weapon'
];

const MEDICAL_EMERGENCY = [
  'chest pain', 'can't breathe', 'bleeding heavily',
  'overdose', 'poisoned'
];
```

**LLM Prompt Template**:
```typescript
const SAFETY_PROMPT = `
Analyze this message for safety concerns:
Message: {message}
Context: {context}

Classify into:
1. Risk Level: none/low/medium/high/critical
2. Crisis Indicators: yes/no
3. Requires Escalation: yes/no
4. Specific Concerns: [list]

Response Format:
{
  "riskLevel": "...",
  "isCrisis": boolean,
  "escalate": boolean,
  "concerns": ["..."],
  "confidence": 0.0-1.0
}
`;
```

### 2. Intent Classifier
**Purpose**: Identify user's primary intent and entities

```typescript
class IntentClassifier implements IClassifier {
  private llmService: LLMService;
  private intentPatterns: IntentPattern[];

  async classify(input: ClassificationInput): Promise<IntentClassification> {
    // 1. Pattern-based intent detection
    // 2. LLM for complex intent
    // 3. Entity extraction
    // 4. Intent confidence scoring
  }
}
```

**Intent Categories**:
```typescript
enum IntentType {
  // Consult Mode
  SEEK_ADVICE = 'seek_advice',
  ASK_QUESTION = 'ask_question',
  SHARE_PROBLEM = 'share_problem',

  // Commerce Mode
  BROWSE_PRODUCTS = 'browse_products',
  MAKE_PURCHASE = 'make_purchase',
  CHECK_ORDER = 'check_order',

  // Profile Mode
  UPDATE_PROFILE = 'update_profile',
  VIEW_SETTINGS = 'view_settings',
  MANAGE_PREFERENCES = 'manage_preferences',

  // Track Progress
  LOG_ACTIVITY = 'log_activity',
  VIEW_PROGRESS = 'view_progress',
  SET_GOAL = 'set_goal',

  // Meta
  HOW_WORKS = 'how_works',
  ABOUT_SYSTEM = 'about_system',
  HELP = 'help',

  // Smalltalk
  GREETING = 'greeting',
  CASUAL_CHAT = 'casual_chat',
  FAREWELL = 'farewell'
}
```

**Entity Extraction**:
```typescript
interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  position: [number, number]; // start, end indices
}

enum EntityType {
  DATE = 'date',
  TIME = 'time',
  PERSON = 'person',
  LOCATION = 'location',
  PRODUCT = 'product',
  GOAL = 'goal',
  METRIC = 'metric',
  EMOTION = 'emotion'
}
```

### 3. Topic Classifier
**Purpose**: Categorize conversation topics and keywords

```typescript
class TopicClassifier implements IClassifier {
  private llmService: LLMService;
  private topicTaxonomy: TopicTaxonomy;

  async classify(input: ClassificationInput): Promise<TopicClassification> {
    // 1. Keyword extraction
    // 2. Topic modeling
    // 3. Hierarchical classification
    // 4. Relevance scoring
  }
}
```

**Topic Taxonomy**:
```typescript
const TOPIC_HIERARCHY = {
  'health': {
    'physical': ['exercise', 'nutrition', 'sleep', 'medical'],
    'mental': ['stress', 'anxiety', 'depression', 'mindfulness'],
    'wellness': ['lifestyle', 'habits', 'self-care']
  },
  'relationships': {
    'family': ['parents', 'siblings', 'children'],
    'romantic': ['dating', 'marriage', 'breakup'],
    'social': ['friends', 'colleagues', 'community']
  },
  'career': {
    'job': ['search', 'interview', 'performance'],
    'growth': ['skills', 'promotion', 'education'],
    'change': ['transition', 'pivot', 'entrepreneurship']
  },
  'finance': {
    'budgeting': ['savings', 'expenses', 'planning'],
    'investing': ['stocks', 'retirement', 'assets'],
    'debt': ['loans', 'credit', 'management']
  }
};
```

### 4. Sentiment Classifier
**Purpose**: Analyze emotional tone and intensity

```typescript
class SentimentClassifier implements IClassifier {
  private llmService: LLMService;
  private emotionLexicon: EmotionLexicon;

  async classify(input: ClassificationInput): Promise<SentimentClassification> {
    // 1. Basic sentiment (pos/neg/neu)
    // 2. Emotion detection
    // 3. Intensity measurement
    // 4. Trend analysis
  }
}
```

**Emotion Categories**:
```typescript
const EMOTION_WHEEL = {
  'joy': ['happy', 'excited', 'grateful', 'content'],
  'sadness': ['depressed', 'lonely', 'disappointed', 'grief'],
  'anger': ['frustrated', 'annoyed', 'furious', 'irritated'],
  'fear': ['anxious', 'worried', 'scared', 'nervous'],
  'surprise': ['amazed', 'shocked', 'confused'],
  'disgust': ['repulsed', 'disapproving', 'contempt']
};
```

**Intensity Scoring**:
```typescript
interface IntensityScore {
  overall: number; // 0-1
  indicators: {
    exclamations: number;
    capitals: number;
    emoticons: number;
    intensifiers: number; // very, extremely, totally
    repetition: number;
  };
}
```

## Arbiter System

### 1. Rule-Based Arbiter
```typescript
class Arbiter {
  private rules: ArbiterRule[];
  private conflictResolver: ConflictResolver;

  async arbitrate(
    classifications: Map<string, ClassificationResult>
  ): Promise<ArbiterDecision> {
    // 1. Apply safety overrides
    // 2. Check rule priorities
    // 3. Resolve conflicts
    // 4. Generate reasoning
    // 5. Return final decision
  }
}
```

### 2. Arbiter Rules
```typescript
interface ArbiterRule {
  priority: number;
  condition: (classifications: Map<string, any>) => boolean;
  action: (classifications: Map<string, any>) => Partial<ArbiterDecision>;
}

const ARBITER_RULES: ArbiterRule[] = [
  {
    priority: 1,
    condition: (c) => c.get('safety').riskLevel === 'critical',
    action: (c) => ({
      finalMode: ConversationMode.CONSULT,
      finalIntent: 'crisis_support',
      overrides: [{
        classifier: 'all',
        reason: 'Safety override - critical risk detected'
      }]
    })
  },
  {
    priority: 2,
    condition: (c) => c.get('intent').intent === 'make_purchase',
    action: (c) => ({
      finalMode: ConversationMode.COMMERCE,
      finalIntent: 'purchase_flow'
    })
  },
  // ... more rules
];
```

### 3. Conflict Resolution
```typescript
class ConflictResolver {
  resolve(
    classifications: Map<string, ClassificationResult>
  ): ResolvedClassification {
    // 1. Calculate agreement score
    // 2. Apply weighted voting
    // 3. Consider confidence levels
    // 4. Use tiebreaker rules
  }

  private calculateAgreement(
    classifications: ClassificationResult[]
  ): number {
    // Measure classifier consensus
    // Return 0-1 agreement score
  }

  private weightedVote(
    classifications: Map<string, ClassificationResult>
  ): string {
    const weights = {
      'safety': 2.0,
      'intent': 1.5,
      'topic': 1.0,
      'sentiment': 0.8
    };
    // Apply weights and vote
  }
}
```

## Parallel Execution Strategy

### 1. Timeout Management
```typescript
class ParallelExecutor {
  private timeout: number = 600; // ms

  async executeParallel(
    tasks: Array<() => Promise<any>>
  ): Promise<SettledResult<any>[]> {
    const withTimeout = tasks.map(task =>
      Promise.race([
        task(),
        this.createTimeout(this.timeout)
      ])
    );

    return Promise.allSettled(withTimeout);
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    );
  }
}
```

### 2. Fallback Strategies
```typescript
interface FallbackStrategy {
  classifier: string;
  execute(): ClassificationResult;
}

const FALLBACK_STRATEGIES: FallbackStrategy[] = [
  {
    classifier: 'safety',
    execute: () => ({
      classifierName: 'safety',
      primaryClass: 'unknown',
      confidence: 0,
      isSafe: false, // Conservative default
      riskLevel: 'medium'
    })
  },
  {
    classifier: 'intent',
    execute: () => ({
      classifierName: 'intent',
      primaryClass: 'unclear',
      confidence: 0,
      intent: 'general_query'
    })
  }
];
```

## Caching Strategy

### 1. Classification Cache
```typescript
class ClassificationCache {
  private cache: Map<string, CachedClassification>;
  private ttl: number = 5 * 60 * 1000; // 5 minutes

  async get(
    key: string
  ): Promise<ParallelClassificationResult | null> {
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached)) {
      return cached.result;
    }
    return null;
  }

  async set(
    key: string,
    result: ParallelClassificationResult
  ): Promise<void> {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  private createKey(
    message: string,
    context: ConversationContext
  ): string {
    // Generate cache key from message + context
    return crypto
      .createHash('md5')
      .update(message + JSON.stringify(context))
      .digest('hex');
  }
}
```

## Performance Monitoring

### 1. Classifier Metrics
```typescript
interface ClassifierMetrics {
  classifier: string;
  totalCalls: number;
  averageLatency: number;
  timeoutRate: number;
  errorRate: number;
  confidenceDistribution: number[];
}

class ClassifierMonitor {
  private metrics: Map<string, ClassifierMetrics>;

  recordExecution(
    classifier: string,
    duration: number,
    success: boolean,
    confidence?: number
  ): void {
    // Update metrics
    // Calculate moving averages
    // Track distributions
  }

  getReport(): ClassifierReport {
    // Generate performance report
    // Identify bottlenecks
    // Suggest optimizations
  }
}
```

## Testing Strategy

### 1. Test Data Sets
```typescript
const TEST_CASES = {
  safety: [
    {
      input: "I'm thinking about hurting myself",
      expected: { riskLevel: 'critical', escalate: true }
    },
    {
      input: "I'm feeling a bit down today",
      expected: { riskLevel: 'low', escalate: false }
    }
  ],
  intent: [
    {
      input: "Can you help me set a fitness goal?",
      expected: { intent: 'set_goal' }
    },
    {
      input: "What products do you have?",
      expected: { intent: 'browse_products' }
    }
  ]
};
```

### 2. Mock LLM Responses
```typescript
class MockLLMService implements LLMService {
  private responses: Map<string, any>;

  async classify(prompt: string): Promise<any> {
    // Return predetermined responses
    // Simulate latency
    // Test error scenarios
  }
}
```

## CLI Commands

```bash
# Test individual classifiers
npm run cli classify:safety --message="test message"
npm run cli classify:intent --message="test message"

# Test parallel classification
npm run cli classify:all --message="test message"

# View classification cache
npm run cli classify:cache --list

# Benchmark classifiers
npm run cli classify:bench --iterations=100

# Test with context
npm run cli classify --message="..." --context=file.json
```

## Implementation Timeline
1. **Week 1**: Classifier interfaces and manager
2. **Week 2**: Safety and Intent classifiers
3. **Week 3**: Topic and Sentiment classifiers
4. **Week 4**: Arbiter and conflict resolution
5. **Week 5**: Parallel execution and timeouts
6. **Week 6**: Caching and optimization
7. **Week 7**: Testing and benchmarking