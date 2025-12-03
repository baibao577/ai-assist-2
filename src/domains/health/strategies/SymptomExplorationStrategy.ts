// Symptom Exploration Strategy - Deep dive into reported symptoms
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';
import type { HealthData } from '../schemas/health.schema.js';
import { getHealthSeverity } from '../schemas/health.schema.js';

/**
 * Strategy for exploring symptoms in detail
 * Asks follow-up questions about severity, duration, and management
 */
export class SymptomExplorationStrategy extends BaseSteeringStrategy {
  strategyId = 'health_symptom_exploration';
  priority = 1.0; // Highest priority when symptoms are detected

  /**
   * Apply when user reports symptoms or concerning mood
   */
  shouldApply(state: ConversationState): boolean {
    // Check if recent extraction has symptoms
    const recentHealth = state.extractions?.health?.[state.extractions.health.length - 1];
    if (!recentHealth) return false;

    const healthData = recentHealth.data as HealthData;

    // Check for physical symptoms
    const hasSymptoms = healthData.symptoms && healthData.symptoms.length > 0;

    // Check for concerning mood (level 3 or below)
    const hasConcerningMood =
      healthData.mood && healthData.mood.level != null && healthData.mood.level <= 3;

    // Check for poor sleep
    const hasPoorSleep = healthData.sleep && healthData.sleep.quality === 'poor';

    return hasSymptoms || hasConcerningMood || hasPoorSleep || false;
  }

  /**
   * Generate symptom exploration hints
   */
  async generateHints(state: ConversationState): Promise<SteeringHints> {
    this.logActivation(state, 'Symptom exploration triggered');

    const recentHealth = state.extractions?.health?.[state.extractions.health.length - 1];
    const healthData = recentHealth?.data as HealthData;

    const suggestions = this.buildSymptomQuestions(healthData);
    const severity = getHealthSeverity(healthData);

    return {
      type: 'symptom_exploration',
      suggestions: this.prioritizeSuggestions(suggestions).slice(0, 3),
      context: {
        symptoms: healthData.symptoms,
        severity,
        moodLevel: healthData.mood?.level,
        explorationDepth: severity === 'severe' ? 'urgent' : 'detailed',
      },
      priority: this.priority,
    };
  }

  /**
   * Build symptom-specific questions
   */
  private buildSymptomQuestions(healthData: HealthData): string[] {
    const suggestions: string[] = [];

    // Explore physical symptoms
    if (healthData.symptoms && healthData.symptoms.length > 0) {
      for (const symptom of healthData.symptoms) {
        // Ask about duration if not provided
        if (!symptom.duration) {
          suggestions.push(`How long have you been experiencing ${symptom.name}?`);
        }

        // For severe symptoms (7+), suggest medical attention
        if (symptom.severity || 0 >= 7) {
          suggestions.push(
            `Have you considered seeing a healthcare provider about your ${symptom.name}?`
          );
          suggestions.push(`Is there anything that helps relieve your ${symptom.name}?`);
        } else if (symptom.severity || 0 >= 5) {
          // For moderate symptoms, ask about management
          suggestions.push(`What have you tried to manage your ${symptom.name}?`);
        }

        // Ask about location for pain-related symptoms
        if (!symptom.bodyPart && this.needsLocationInfo(symptom.name)) {
          suggestions.push(`Where exactly are you feeling the ${symptom.name}?`);
        }

        // Ask about triggers
        suggestions.push(`Do you know what might have triggered your ${symptom.name}?`);

        // Ask about impact on daily life
        if (symptom.severity || 0 >= 5) {
          suggestions.push(`Is the ${symptom.name} affecting your daily activities?`);
        }
      }
    }

    // Explore concerning mood
    if (healthData.mood && healthData.mood.level != null && healthData.mood.level <= 3) {
      if (!healthData.mood.triggers || healthData.mood.triggers.length === 0) {
        suggestions.push("Is there something specific that's troubling you?");
      }
      suggestions.push("Have you been able to talk to someone about how you're feeling?");
      suggestions.push('What usually helps when you feel this way?');

      // For very low mood (1-2), suggest support
      if (healthData.mood.level <= 2) {
        suggestions.push("Would you like to talk about what's on your mind?");
        suggestions.push('Have you considered reaching out to a mental health professional?');
      }
    }

    // Explore poor sleep
    if (healthData.sleep && healthData.sleep.quality === 'poor') {
      if (!healthData.sleep.issues || healthData.sleep.issues.length === 0) {
        suggestions.push('What seems to be affecting your sleep?');
      }
      suggestions.push('Have you noticed any patterns with your sleep difficulties?');
      suggestions.push("What's your bedtime routine like?");
    }

    // General symptom management questions
    if (healthData.symptoms && healthData.symptoms.length > 0) {
      suggestions.push('Are you currently taking any medication for your symptoms?');
      suggestions.push('Have these symptoms occurred before?');
    }

    return suggestions;
  }

  /**
   * Check if symptom needs location information
   */
  private needsLocationInfo(symptomName: string): boolean {
    const locationSymptoms = [
      'pain',
      'ache',
      'soreness',
      'tenderness',
      'discomfort',
      'cramp',
      'tension',
      'stiffness',
    ];

    const lowerSymptom = symptomName.toLowerCase();
    return locationSymptoms.some((s) => lowerSymptom.includes(s));
  }

  /**
   * Prioritize suggestions based on severity and urgency
   */
  private prioritizeSuggestions(suggestions: string[]): string[] {
    // Sort suggestions by priority:
    // 1. Medical attention questions (highest)
    // 2. Duration and severity questions
    // 3. Management and relief questions
    // 4. General exploration questions

    return suggestions.sort((a, b) => {
      // Medical attention questions first
      if (a.includes('healthcare') || a.includes('doctor') || a.includes('professional')) return -1;
      if (b.includes('healthcare') || b.includes('doctor') || b.includes('professional')) return 1;

      // Duration questions second
      if (a.includes('How long')) return -1;
      if (b.includes('How long')) return 1;

      // Relief and management questions third
      if (a.includes('helps') || a.includes('relieve') || a.includes('manage')) return -1;
      if (b.includes('helps') || b.includes('relieve') || b.includes('manage')) return 1;

      return 0;
    });
  }
}
