# Phase 3: First Domain Implementation (Health)

## Objective
Implement the health domain as the first concrete example of the framework, proving the concept works end-to-end.

## Duration
Day 3 (8 hours)

## Prerequisites
- Phase 2 completed
- Pipeline running with new stages
- Registries and base classes working

## Directory Structure
```
/src/domains/health/
  ├── extractors/
  │   ├── HealthExtractor.ts
  │   └── index.ts
  ├── strategies/
  │   ├── SymptomExplorationStrategy.ts
  │   ├── WellnessCheckStrategy.ts
  │   ├── GoalTrackingStrategy.ts
  │   └── index.ts
  ├── schemas/
  │   ├── health.schema.ts
  │   └── index.ts
  ├── storage/
  │   └── HealthStorage.ts
  ├── config/
  │   └── health.config.yaml
  └── index.ts
```

## Implementation Tasks

### 1. Define Health Schema
```typescript
// /src/domains/health/schemas/health.schema.ts
import { z } from 'zod';

export const healthExtractionSchema = z.object({
  symptoms: z.array(z.object({
    name: z.string().describe("Symptom name"),
    severity: z.number().min(1).max(10).describe("Severity 1-10"),
    duration: z.string().optional().describe("How long, e.g., '2 days', '3 hours'"),
    bodyPart: z.string().optional().describe("Affected body part")
  })).optional().describe("Physical symptoms reported"),

  mood: z.object({
    level: z.number().min(1).max(10).describe("Mood level 1-10"),
    emotion: z.string().describe("Primary emotion (happy, sad, anxious, etc.)"),
    triggers: z.array(z.string()).optional().describe("What triggered this mood")
  }).optional().describe("Emotional state"),

  sleep: z.object({
    hours: z.number().describe("Hours slept"),
    quality: z.enum(['poor', 'fair', 'good', 'excellent']),
    issues: z.array(z.string()).optional().describe("Sleep problems (insomnia, waking up, etc.)")
  }).optional().describe("Sleep information"),

  exercise: z.object({
    type: z.string().describe("Type of exercise"),
    duration: z.number().describe("Duration in minutes"),
    intensity: z.enum(['light', 'moderate', 'vigorous'])
  }).optional().describe("Physical activity"),

  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string().optional(),
    frequency: z.string().optional(),
    reason: z.string().optional()
  })).optional().describe("Medications taken"),

  vitals: z.object({
    bloodPressure: z.string().optional().describe("e.g., 120/80"),
    heartRate: z.number().optional().describe("BPM"),
    temperature: z.number().optional().describe("In Fahrenheit or Celsius"),
    weight: z.number().optional().describe("In pounds or kg")
  }).optional().describe("Vital signs"),

  diet: z.object({
    meals: z.array(z.string()).optional(),
    water: z.number().optional().describe("Glasses of water"),
    notes: z.string().optional()
  }).optional().describe("Dietary information")
});

export type HealthData = z.infer<typeof healthExtractionSchema>;
```

### 2. Implement Health Extractor
```typescript
// /src/domains/health/extractors/HealthExtractor.ts
import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';
import { healthExtractionSchema, type HealthData } from '../schemas/health.schema.js';
import type { ExtractedData, ExtractionContext } from '@/core/domains/types.js';

export class HealthExtractor extends BaseExtractor {
  domainId = 'health';
  schema = healthExtractionSchema;

  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    const recentContext = context.recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    return `You are a health information extractor. Extract health-related information from the user's message.

Recent conversation context:
${recentContext}

Current message to analyze: "${message}"

Extract the following information if mentioned:
- Symptoms: name, severity (1-10), duration, body part
- Mood: level (1-10), primary emotion, triggers
- Sleep: hours, quality (poor/fair/good/excellent), issues
- Exercise: type, duration in minutes, intensity
- Medications: name, dosage, frequency, reason
- Vitals: blood pressure, heart rate, temperature, weight
- Diet: meals, water intake, notes

Important:
- Only extract what is explicitly mentioned
- For severity and mood level, estimate based on language used
- Return null for any fields not mentioned
- Be accurate with numbers and measurements`;
  }

  protected validateAndTransform(data: HealthData): ExtractedData {
    // Count how many top-level fields have data
    const fieldsWithData = Object.entries(data)
      .filter(([_, value]) => value !== null && value !== undefined)
      .length;

    // Calculate confidence based on data completeness
    let confidence = 0;
    if (fieldsWithData > 0) {
      confidence = Math.min(0.9, 0.6 + (fieldsWithData * 0.1));
    }

    // Add timestamp to symptoms if present
    if (data.symptoms && data.symptoms.length > 0) {
      data.symptoms = data.symptoms.map(symptom => ({
        ...symptom,
        reportedAt: new Date().toISOString()
      }));
    }

    return {
      domainId: this.domainId,
      timestamp: new Date(),
      data,
      confidence
    };
  }
}
```

### 3. Implement Wellness Check Strategy
```typescript
// /src/domains/health/strategies/WellnessCheckStrategy.ts
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';

export class WellnessCheckStrategy extends BaseSteeringStrategy {
  strategyId = 'wellness_check';
  priority = 0.7;

  shouldApply(state: ConversationState): boolean {
    // Apply if health domain is active or no check in last 24 hours
    const lastCheck = state.domainContext?.health?.lastWellnessCheck;
    if (!lastCheck) return true;

    const hoursSinceCheck = (Date.now() - new Date(lastCheck).getTime()) / (1000 * 60 * 60);
    return hoursSinceCheck > 24;
  }

  async generateHints(state: ConversationState): Promise<SteeringHints> {
    const recentHealth = state.extractions?.health?.[state.extractions.health.length - 1]?.data;
    const suggestions = [];

    // Check what wellness aspects we don't know about recently
    if (!recentHealth?.sleep) {
      suggestions.push("How did you sleep last night?");
    }

    if (!recentHealth?.mood) {
      suggestions.push("How are you feeling emotionally today?");
    }

    if (!recentHealth?.exercise && this.shouldAskAboutExercise(state)) {
      suggestions.push("Have you been able to get any physical activity today?");
    }

    if (!recentHealth?.diet?.water) {
      suggestions.push("How's your water intake been today?");
    }

    // Add contextual follow-ups based on previous data
    const previousMood = this.getPreviousMood(state);
    if (previousMood && previousMood.level <= 4) {
      suggestions.push("How are you feeling compared to yesterday?");
    }

    return {
      type: 'wellness_check',
      suggestions: suggestions.slice(0, 3),
      context: {
        lastCheck: state.domainContext?.health?.lastWellnessCheck,
        missingData: this.identifyMissingData(recentHealth),
        checkType: 'routine'
      },
      priority: this.priority
    };
  }

  private identifyMissingData(health: any): string[] {
    const importantFields = ['sleep', 'mood', 'exercise', 'symptoms'];
    return importantFields.filter(field => !health?.[field]);
  }

  private shouldAskAboutExercise(state: ConversationState): boolean {
    // Only ask about exercise during reasonable hours (6 AM - 9 PM)
    const hour = new Date().getHours();
    return hour >= 6 && hour <= 21;
  }

  private getPreviousMood(state: ConversationState): any {
    const healthExtractions = state.extractions?.health || [];
    if (healthExtractions.length > 1) {
      return healthExtractions[healthExtractions.length - 2]?.data?.mood;
    }
    return null;
  }
}
```

### 4. Implement Symptom Exploration Strategy
```typescript
// /src/domains/health/strategies/SymptomExplorationStrategy.ts
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';

export class SymptomExplorationStrategy extends BaseSteeringStrategy {
  strategyId = 'symptom_exploration';
  priority = 1.0; // High priority when symptoms detected

  shouldApply(state: ConversationState): boolean {
    // Check if recent extraction has symptoms
    const recentHealth = state.extractions?.health?.[state.extractions.health.length - 1];
    const hasSymptoms = recentHealth?.data?.symptoms && recentHealth.data.symptoms.length > 0;

    // Also check for concerning mood levels
    const hasConcerningMood = recentHealth?.data?.mood && recentHealth.data.mood.level <= 3;

    return hasSymptoms || hasConcerningMood;
  }

  async generateHints(state: ConversationState): Promise<SteeringHints> {
    const recentHealth = state.extractions?.health?.[state.extractions.health.length - 1];
    const symptoms = recentHealth?.data?.symptoms || [];
    const mood = recentHealth?.data?.mood;
    const suggestions = [];

    // Explore physical symptoms
    for (const symptom of symptoms) {
      if (!symptom.duration) {
        suggestions.push(`How long have you been experiencing ${symptom.name}?`);
      }

      if (symptom.severity >= 7) {
        suggestions.push(`Have you considered seeing a doctor about your ${symptom.name}?`);
        suggestions.push(`Is there anything that helps relieve your ${symptom.name}?`);
      }

      if (!symptom.bodyPart && this.needsLocationInfo(symptom.name)) {
        suggestions.push(`Where exactly are you feeling the ${symptom.name}?`);
      }
    }

    // Explore concerning mood
    if (mood && mood.level <= 3) {
      if (!mood.triggers || mood.triggers.length === 0) {
        suggestions.push("Is there something specific that's been bothering you?");
      }
      suggestions.push("Have you been able to talk to anyone about how you're feeling?");
    }

    // Add general symptom management questions
    if (symptoms.length > 0) {
      suggestions.push("What have you tried so far to feel better?");
      suggestions.push("Are these symptoms affecting your daily activities?");
    }

    return {
      type: 'symptom_exploration',
      suggestions: this.prioritizeSuggestions(suggestions),
      context: {
        symptoms,
        maxSeverity: Math.max(...symptoms.map(s => s.severity || 0), 0),
        moodLevel: mood?.level,
        explorationDepth: 'detailed'
      },
      priority: this.priority
    };
  }

  private needsLocationInfo(symptomName: string): boolean {
    const locationSymptoms = ['pain', 'ache', 'soreness', 'tenderness', 'discomfort', 'cramp'];
    return locationSymptoms.some(s => symptomName.toLowerCase().includes(s));
  }

  private prioritizeSuggestions(suggestions: string[]): string[] {
    // Prioritize medical attention questions first, then exploration, then management
    const prioritized = suggestions.sort((a, b) => {
      if (a.includes('doctor') || a.includes('medical')) return -1;
      if (b.includes('doctor') || b.includes('medical')) return 1;
      if (a.includes('How long')) return -1;
      if (b.includes('How long')) return 1;
      return 0;
    });

    return prioritized.slice(0, 3);
  }
}
```

### 5. Create Health Storage Migration
```sql
-- /migrations/001_create_health_records_table.sql
CREATE TABLE IF NOT EXISTS health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  domain_id VARCHAR(50) DEFAULT 'health',

  -- Extracted data as JSONB for flexibility
  symptoms JSONB,
  mood JSONB,
  sleep JSONB,
  exercise JSONB,
  medications JSONB,
  vitals JSONB,
  diet JSONB,

  -- Metadata
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for performance
  CONSTRAINT health_records_user_id_idx INDEX (user_id),
  CONSTRAINT health_records_conversation_id_idx INDEX (conversation_id),
  CONSTRAINT health_records_extracted_at_idx INDEX (extracted_at DESC)
);

-- Create view for daily summaries
CREATE OR REPLACE VIEW health_daily_summary AS
SELECT
  user_id,
  DATE(extracted_at) as date,
  jsonb_agg(DISTINCT symptoms) FILTER (WHERE symptoms IS NOT NULL) as all_symptoms,
  jsonb_agg(DISTINCT mood) FILTER (WHERE mood IS NOT NULL) as all_moods,
  AVG((mood->>'level')::float) FILTER (WHERE mood->>'level' IS NOT NULL) as avg_mood,
  AVG((sleep->>'hours')::float) FILTER (WHERE sleep->>'hours' IS NOT NULL) as avg_sleep_hours,
  COUNT(*) as record_count
FROM health_records
WHERE extracted_at > CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id, DATE(extracted_at);

-- Create index for the view
CREATE INDEX health_records_date_user_idx ON health_records(DATE(extracted_at), user_id);
```

### 6. Implement Health Storage
```typescript
// /src/domains/health/storage/HealthStorage.ts
import { pool } from '@/database/index.js';
import type { DomainStorage, QueryFilters, AggregationConfig } from '@/core/domains/storage/index.js';
import type { HealthData } from '../schemas/health.schema.js';

export class HealthStorage implements DomainStorage<HealthData> {
  private tableName = 'health_records';

  async store(data: HealthData & { userId: string; conversationId: string }): Promise<void> {
    const query = `
      INSERT INTO ${this.tableName} (
        user_id, conversation_id, symptoms, mood, sleep,
        exercise, medications, vitals, diet, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await pool.query(query, [
      data.userId,
      data.conversationId,
      JSON.stringify(data.symptoms),
      JSON.stringify(data.mood),
      JSON.stringify(data.sleep),
      JSON.stringify(data.exercise),
      JSON.stringify(data.medications),
      JSON.stringify(data.vitals),
      JSON.stringify(data.diet),
      data.confidence || 0.8
    ]);
  }

  async query(filters: QueryFilters): Promise<HealthData[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }

    if (filters.startDate) {
      query += ` AND extracted_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND extracted_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    query += ` ORDER BY extracted_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    const result = await pool.query(query, params);
    return result.rows.map(this.mapRowToHealthData);
  }

  async aggregate(config: AggregationConfig): Promise<any> {
    // Use the daily summary view for aggregations
    const query = `
      SELECT * FROM health_daily_summary
      WHERE user_id = $1
      ORDER BY date DESC
      LIMIT 30
    `;

    const result = await pool.query(query, [config.userId]);
    return result.rows;
  }

  async delete(id: string): Promise<void> {
    await pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
  }

  private mapRowToHealthData(row: any): HealthData {
    return {
      symptoms: row.symptoms,
      mood: row.mood,
      sleep: row.sleep,
      exercise: row.exercise,
      medications: row.medications,
      vitals: row.vitals,
      diet: row.diet
    };
  }
}
```

### 7. Register Health Domain
```typescript
// /src/domains/health/index.ts
import { domainRegistry, extractorRegistry, steeringRegistry } from '@/core/domains/registries/index.js';
import { HealthExtractor } from './extractors/HealthExtractor.js';
import { WellnessCheckStrategy } from './strategies/WellnessCheckStrategy.js';
import { SymptomExplorationStrategy } from './strategies/SymptomExplorationStrategy.js';
import { healthExtractionSchema } from './schemas/health.schema.js';
import { logger } from '@/core/logger.js';

export function registerHealthDomain(): void {
  // Register domain definition
  domainRegistry.register({
    id: 'health',
    name: 'Health & Wellness',
    description: 'Track physical and mental health, symptoms, mood, sleep, and wellness',
    priority: 1,
    enabled: true,
    capabilities: {
      extraction: true,
      steering: true,
      summarization: true
    },
    config: {
      extractionSchema: healthExtractionSchema,
      steeringStrategy: {
        triggers: ['health', 'symptom', 'pain', 'sick', 'tired', 'sleep', 'mood'],
        maxSuggestionsPerTurn: 2
      },
      storageConfig: {
        type: 'timeseries' as const,
        table: 'health_records',
        retention: '365d'
      }
    }
  });

  // Register extractor
  extractorRegistry.register(new HealthExtractor());

  // Register steering strategies
  steeringRegistry.register(new WellnessCheckStrategy());
  steeringRegistry.register(new SymptomExplorationStrategy());

  logger.info('Health domain registered successfully');
}

// Export for testing
export { HealthExtractor } from './extractors/HealthExtractor.js';
export { WellnessCheckStrategy } from './strategies/WellnessCheckStrategy.js';
export { SymptomExplorationStrategy } from './strategies/SymptomExplorationStrategy.js';
```

### 8. Initialize on Startup
```typescript
// Add to /src/index.ts or app initialization
import { registerHealthDomain } from '@/domains/health/index.js';

// During app initialization, after database connection
export async function initializeDomains(): Promise<void> {
  // Register health domain
  registerHealthDomain();

  // Future: Register other domains
  // registerFinanceDomain();
  // registerEducationDomain();

  logger.info('All domains initialized');
}

// Call during startup
await initializeDomains();
```

## Validation Checklist
- [ ] Health schema compiles without errors
- [ ] HealthExtractor successfully extracts data
- [ ] Steering strategies generate appropriate hints
- [ ] Health records table created in database
- [ ] Domain registered and visible in registry
- [ ] End-to-end health conversation works
- [ ] Data persists to health_records table
- [ ] Steering hints appear in conversation

## Testing Scenarios

### Scenario 1: Basic Symptom Report
```
Input: "I have a headache and feel tired"
Expected:
- Extracts: headache symptom, fatigue/tired as symptom
- Steering: Asks about duration, severity, what helps
- Storage: Saves symptoms to health_records
```

### Scenario 2: Wellness Check
```
Input: "Hello" (after 24h since last check)
Expected:
- Triggers wellness check strategy
- Asks about sleep, mood, or exercise
- Natural conversation flow
```

### Scenario 3: Complex Health Update
```
Input: "Slept only 5 hours, feeling anxious about work, took ibuprofen for my back pain"
Expected:
- Extracts: sleep (5 hours, poor quality), mood (anxious), medication (ibuprofen), symptom (back pain)
- Multiple domain fields populated
- Appropriate follow-up questions about back pain
```

### Scenario 4: Health Summary Request
```
Input: "How has my health been this week?"
Expected:
- Aggregates health data from past 7 days
- Provides summary of mood trends, sleep average, symptoms
- Uses health_daily_summary view
```

## Next Phase Gate
- Health domain fully functional
- Data persisting correctly to database
- Steering working as expected
- Ready to update mode handlers