// Crisis response templates for safety classifier

import { SafetyLevel, type CrisisResource } from '@/types/classifiers.js';

export interface CrisisResponseTemplate {
  level: SafetyLevel;
  template: string;
  includeResources: boolean;
}

/**
 * Crisis response templates based on safety level
 */
export const CRISIS_RESPONSES: Record<SafetyLevel, CrisisResponseTemplate> = {
  [SafetyLevel.SAFE]: {
    level: SafetyLevel.SAFE,
    template: '', // No special template for safe messages
    includeResources: false,
  },

  [SafetyLevel.CONCERN]: {
    level: SafetyLevel.CONCERN,
    template: `I hear that you're going through a tough time right now. It's okay to feel this way, and I'm here to help.

Would you like to talk more about what's going on? Sometimes it helps to share what you're experiencing.`,
    includeResources: false,
  },

  [SafetyLevel.CRISIS]: {
    level: SafetyLevel.CRISIS,
    template: `I'm very concerned about what you're sharing with me. Your safety and well-being are the top priority right now.

**Please reach out to a crisis professional immediately:**

{CRISIS_RESOURCES}

If you're in immediate danger, please call 911 or go to your nearest emergency room.

I'm here to support you, but I'm not equipped to provide the immediate help you need. These trained professionals are available 24/7 and can provide the support and resources that will truly help.

Would you like to talk about what led you here, or would you prefer to focus on connecting with one of these resources first?`,
    includeResources: true,
  },
};

/**
 * Format crisis resources for display
 */
export function formatCrisisResources(resources: CrisisResource[]): string {
  return resources
    .map(
      (resource) => `
**${resource.name}**
- Phone: ${resource.phone}
- Available: ${resource.available}
- ${resource.description}
`
    )
    .join('\n');
}

/**
 * Build crisis response message
 */
export function buildCrisisResponse(
  level: SafetyLevel,
  resources?: CrisisResource[]
): string {
  const template = CRISIS_RESPONSES[level];

  if (!template.includeResources || !resources) {
    return template.template;
  }

  return template.template.replace('{CRISIS_RESOURCES}', formatCrisisResources(resources));
}

/**
 * Tone adjustments for different safety levels
 */
export const TONE_GUIDELINES: Record<
  SafetyLevel,
  {
    instructions: string;
    avoid: string[];
    emphasize: string[];
  }
> = {
  [SafetyLevel.SAFE]: {
    instructions: 'Respond naturally and helpfully to the user\'s message.',
    avoid: [],
    emphasize: ['helpfulness', 'clarity'],
  },

  [SafetyLevel.CONCERN]: {
    instructions:
      'Respond with extra empathy and gentleness. Acknowledge the user\'s feelings and offer support.',
    avoid: ['dismissiveness', 'toxic positivity', 'minimizing feelings'],
    emphasize: ['empathy', 'validation', 'support', 'gentle guidance'],
  },

  [SafetyLevel.CRISIS]: {
    instructions:
      'Prioritize immediate safety. Direct to crisis resources. Be calm, clear, and urgent.',
    avoid: ['casual tone', 'advice-giving', 'problem-solving without resources'],
    emphasize: ['urgency', 'safety', 'professional help', 'crisis resources'],
  },
};
