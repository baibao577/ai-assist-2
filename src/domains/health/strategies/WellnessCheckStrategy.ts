// Wellness Check Strategy - Proactive health check-ins
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';
import type { ConversationState } from '@/types/state.js';
import type { SteeringHints } from '@/core/domains/types.js';
import type { HealthData } from '../schemas/health.schema.js';

/**
 * Strategy for proactive wellness check-ins
 * Asks about general health, sleep, mood, and activity
 */
export class WellnessCheckStrategy extends BaseSteeringStrategy {
  strategyId = 'health_wellness_check';
  priority = 0.7; // Medium-high priority for regular check-ins

  /**
   * Apply when it's been a while since last health check or when appropriate
   */
  shouldApply(state: ConversationState): boolean {
    // Check if health domain is active
    const healthActive = state.metadata?.activeDomains?.includes('health');

    // Check last wellness check time
    const lastCheck = state.domainContext?.health?.lastWellnessCheck;
    if (!lastCheck) {
      // No previous check, apply if conversation is established
      return state.messages?.length ? state.messages.length > 2 : false;
    }

    // Apply if more than 24 hours since last check
    const hoursSinceCheck = this.hasTimeElapsed(lastCheck, 24);

    // Also check if user mentioned feeling unwell recently
    const recentHealthConcern = state.extractions?.health?.some((e) => {
      const data = e.data as HealthData;
      return data.symptoms?.length || (data.mood && data.mood?.level || 5 <= 4);
    });

    return hoursSinceCheck || healthActive || recentHealthConcern || false;
  }

  /**
   * Generate wellness check suggestions
   */
  async generateHints(state: ConversationState): Promise<SteeringHints> {
    this.logActivation(state, 'Wellness check triggered');

    const recentHealth = state.extractions?.health?.[state.extractions.health.length - 1];
    const healthData = recentHealth?.data as HealthData | undefined;

    const suggestions = this.buildWellnessQuestions(healthData, state);

    return {
      type: 'wellness_check',
      suggestions: suggestions.slice(0, 3),
      context: {
        lastCheck: state.domainContext?.health?.lastWellnessCheck,
        missingData: this.identifyMissingData(healthData),
        checkType: 'routine',
      },
      priority: this.priority,
    };
  }

  /**
   * Build appropriate wellness questions based on context
   */
  private buildWellnessQuestions(
    recentHealth: HealthData | undefined,
    state: ConversationState
  ): string[] {
    const suggestions: string[] = [];
    const hour = new Date().getHours();

    // Time-appropriate questions
    if (hour >= 6 && hour <= 10) {
      // Morning
      if (!recentHealth?.sleep) {
        suggestions.push('How did you sleep last night?');
      }
      suggestions.push('How are you feeling this morning?');
    } else if (hour >= 11 && hour <= 14) {
      // Midday
      suggestions.push('How has your day been so far?');
      if (!recentHealth?.diet?.water) {
        suggestions.push('Have you been staying hydrated today?');
      }
    } else if (hour >= 15 && hour <= 18) {
      // Afternoon
      if (!recentHealth?.exercise) {
        suggestions.push('Have you had a chance to be active today?');
      }
      suggestions.push('How are your energy levels this afternoon?');
    } else if (hour >= 19 && hour <= 23) {
      // Evening
      suggestions.push('How was your day overall?');
      if (!recentHealth?.mood) {
        suggestions.push('How are you feeling emotionally?');
      }
    }

    // Add questions based on missing data
    if (!recentHealth?.mood) {
      suggestions.push('How would you rate your mood today?');
    }

    if (!recentHealth?.symptoms) {
      suggestions.push('Any physical discomfort or symptoms today?');
    }

    // Check on previous concerns
    const previousMood = this.getPreviousMood(state);
    if (previousMood && previousMood.level <= 4) {
      suggestions.push(`Are you feeling better than ${this.getTimeReference(state)}?`);
    }

    const previousSymptoms = this.getPreviousSymptoms(state);
    if (previousSymptoms && previousSymptoms.length > 0) {
      const symptomName = previousSymptoms[0].name;
      suggestions.push(`How is your ${symptomName} now?`);
    }

    return suggestions;
  }

  /**
   * Identify what health data is missing
   */
  private identifyMissingData(health: HealthData | undefined): string[] {
    if (!health) {
      return ['sleep', 'mood', 'exercise', 'symptoms'];
    }

    const missing: string[] = [];
    if (!health.sleep) missing.push('sleep');
    if (!health.mood) missing.push('mood');
    if (!health.exercise) missing.push('exercise');
    if (!health.symptoms || health.symptoms.length === 0) missing.push('symptoms');

    return missing;
  }

  /**
   * Get previous mood data from state
   */
  private getPreviousMood(state: ConversationState): any {
    const healthExtractions = state.extractions?.health || [];
    if (healthExtractions.length > 1) {
      const previous = healthExtractions[healthExtractions.length - 2];
      return (previous.data as HealthData).mood;
    }
    return null;
  }

  /**
   * Get previous symptoms from state
   */
  private getPreviousSymptoms(state: ConversationState): any[] {
    const healthExtractions = state.extractions?.health || [];
    if (healthExtractions.length > 1) {
      const previous = healthExtractions[healthExtractions.length - 2];
      return (previous.data as HealthData).symptoms || [];
    }
    return [];
  }

  /**
   * Get appropriate time reference
   */
  private getTimeReference(state: ConversationState): string {
    const healthExtractions = state.extractions?.health || [];
    if (healthExtractions.length > 1) {
      const previous = healthExtractions[healthExtractions.length - 2];
      const hoursSince = (Date.now() - new Date(previous.timestamp).getTime()) / (1000 * 60 * 60);

      if (hoursSince < 1) return 'earlier';
      if (hoursSince < 24) return 'earlier today';
      if (hoursSince < 48) return 'yesterday';
      return 'before';
    }
    return 'before';
  }
}
