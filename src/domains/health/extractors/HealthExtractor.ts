// Health Extractor - Extracts health-related information from messages
import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';
import { healthExtractionSchema, type HealthData } from '../schemas/health.schema.js';
import type { ExtractedData, ExtractionContext } from '@/core/domains/types.js';

/**
 * Extractor for health and wellness information
 * Identifies symptoms, mood, sleep, exercise, medications, and more
 */
export class HealthExtractor extends BaseExtractor {
  domainId = 'health';
  schema = healthExtractionSchema;

  /**
   * Build the extraction prompt for health data
   */
  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    const recentContext = context.recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    return `You are a health information extractor. Extract health-related information from the user's message into the EXACT JSON structure below.

Recent conversation context:
${recentContext}

Current message to analyze: "${message}"

Return a JSON object with this EXACT structure (use null for missing fields):
{
  "symptoms": [
    {
      "name": "string - symptom name",
      "severity": "number 1-10",
      "duration": "string like '2 days'",
      "bodyPart": "string - affected body part"
    }
  ],
  "mood": {
    "level": "number 1-10",
    "emotion": "string - primary emotion",
    "triggers": ["array of trigger strings"]
  },
  "sleep": {
    "hours": "number",
    "quality": "poor | fair | good | excellent",
    "issues": ["array of sleep issue strings"]
  },
  "exercise": {
    "type": "string - activity type",
    "duration": "number - minutes",
    "intensity": "light | moderate | vigorous"
  },
  "medications": [
    {
      "name": "string",
      "dosage": "string",
      "frequency": "string",
      "reason": "string"
    }
  ],
  "vitals": {
    "bloodPressure": "string like '120/80'",
    "heartRate": "number",
    "temperature": "number",
    "weight": "number"
  },
  "diet": {
    "meals": ["array of meal strings"],
    "water": "number - glasses",
    "notes": "string"
  }
}

Guidelines:
- Severity: 1-3 mild, 4-6 moderate, 7-9 severe, 10 emergency
- Mood level: 1-3 very low, 4-6 moderate, 7-9 good, 10 excellent
- Only include fields that are explicitly mentioned
- Use null for any unmentioned fields or omit the entire section if nothing is mentioned
- For arrays, use empty array [] if no items, or omit the field
- If NO health information is present, return empty object: {}`;
  }

  /**
   * Validate and transform the extracted health data
   */
  protected validateAndTransform(data: HealthData): ExtractedData {
    // Count how many top-level fields have data
    const fieldsWithData = Object.entries(data).filter(
      ([_, value]) => value !== null && value !== undefined &&
      (Array.isArray(value) ? value.length > 0 : true)
    ).length;

    // Calculate confidence based on data completeness and quality
    let confidence = 0;
    if (fieldsWithData > 0) {
      // Base confidence starts at 0.6 if we have any data
      confidence = 0.6;

      // Add confidence for multiple fields
      confidence += Math.min(0.3, fieldsWithData * 0.1);

      // Add confidence for detailed data
      if (data.symptoms?.some((s) => s.severity && s.duration)) {
        confidence += 0.1;
      }
    }

    // Ensure confidence is between 0 and 1
    confidence = Math.min(1.0, Math.max(0, confidence));

    // Add metadata to symptoms if present
    if (data.symptoms && data.symptoms.length > 0) {
      data.symptoms = data.symptoms.map((symptom) => ({
        ...symptom,
        reportedAt: new Date().toISOString(),
      }));
    }

    return {
      domainId: this.domainId,
      timestamp: new Date(),
      data,
      confidence,
    };
  }
}