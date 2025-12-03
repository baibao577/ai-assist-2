// Health Domain Schema - Defines the structure of health-related data
import { z } from 'zod';

/**
 * Schema for health-related data extraction
 * Covers physical symptoms, mental health, sleep, exercise, diet, and vitals
 */
export const healthExtractionSchema = z.object({
  // Physical symptoms
  symptoms: z
    .array(
      z.object({
        name: z.string().describe('Symptom name (headache, fever, etc.)'),
        severity: z.number().min(1).max(10).nullable().optional().describe('Severity on scale 1-10'),
        duration: z.string().nullable().optional().describe('How long (e.g., "2 days", "3 hours")'),
        bodyPart: z.string().nullable().optional().describe('Affected body part'),
      })
    )
    .nullable()
    .optional()
    .describe('Physical symptoms reported'),

  // Mental/emotional state
  mood: z
    .object({
      level: z.number().min(1).max(10).nullable().optional().describe('Overall mood level 1-10'),
      emotion: z.string().nullable().optional().describe('Primary emotion (happy, sad, anxious, stressed, etc.)'),
      triggers: z.array(z.string()).nullable().optional().describe('What triggered this mood'),
    })
    .nullable()
    .optional()
    .describe('Emotional and mental state'),

  // Sleep information
  sleep: z
    .object({
      hours: z.number().nullable().optional().describe('Hours of sleep'),
      quality: z.enum(['poor', 'fair', 'good', 'excellent']).nullable().optional().describe('Sleep quality'),
      issues: z
        .array(z.string())
        .nullable()
        .optional()
        .describe('Sleep problems (insomnia, waking up frequently, etc.)'),
    })
    .nullable()
    .optional()
    .describe('Sleep patterns and quality'),

  // Physical activity
  exercise: z
    .object({
      type: z.string().nullable().optional().describe('Type of exercise (running, yoga, gym, etc.)'),
      duration: z.number().nullable().optional().describe('Duration in minutes'),
      intensity: z.enum(['light', 'moderate', 'vigorous']).nullable().optional().describe('Exercise intensity'),
    })
    .nullable()
    .optional()
    .describe('Physical activity and exercise'),

  // Medications
  medications: z
    .array(
      z.object({
        name: z.string().describe('Medication name'),
        dosage: z.string().nullable().optional().describe('Dosage amount'),
        frequency: z.string().nullable().optional().describe('How often taken'),
        reason: z.string().nullable().optional().describe('Why taking this medication'),
      })
    )
    .nullable()
    .optional()
    .describe('Medications being taken'),

  // Vital signs
  vitals: z
    .object({
      bloodPressure: z.string().nullable().optional().describe('Blood pressure (e.g., "120/80")'),
      heartRate: z.number().nullable().optional().describe('Heart rate in BPM'),
      temperature: z.number().nullable().optional().describe('Body temperature'),
      weight: z.number().nullable().optional().describe('Body weight'),
    })
    .nullable()
    .optional()
    .describe('Vital signs measurements'),

  // Diet and nutrition
  diet: z
    .object({
      meals: z.array(z.string()).nullable().optional().describe('Meals eaten'),
      water: z.number().nullable().optional().describe('Glasses of water consumed'),
      notes: z.string().nullable().optional().describe('Any dietary notes or concerns'),
    })
    .nullable()
    .optional()
    .describe('Diet and nutrition information'),
});

/**
 * Type definition for extracted health data
 */
export type HealthData = z.infer<typeof healthExtractionSchema>;

/**
 * Helper to check if health data has meaningful content
 */
export function hasHealthContent(data: HealthData): boolean {
  return !!(
    data.symptoms?.length ||
    data.mood ||
    data.sleep ||
    data.exercise ||
    data.medications?.length ||
    data.vitals ||
    data.diet
  );
}

/**
 * Helper to get severity level from health data
 */
export function getHealthSeverity(data: HealthData): 'normal' | 'moderate' | 'severe' {
  // Check symptom severity
  const severities = data.symptoms?.map((s) => s.severity).filter((s): s is number => s != null) || [];
  const maxSymptomSeverity = severities.length > 0 ? Math.max(...severities) : 0;

  // Check mood level (low mood is concerning)
  const moodConcern = data.mood?.level != null && data.mood.level <= 3;

  if (maxSymptomSeverity >= 8 || moodConcern) {
    return 'severe';
  } else if (maxSymptomSeverity >= 5) {
    return 'moderate';
  }

  return 'normal';
}
