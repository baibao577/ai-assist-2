/**
 * Goal Domain Schema
 *
 * Defines data structures for goal tracking and progress monitoring.
 * This domain extracts goal-related intents, progress updates, and
 * handles clarification for ambiguous goal selections.
 */

import { z } from 'zod';

// ============================================================================
// Helpers - Convert null to undefined for cleaner types
// ============================================================================

/** Accepts null from LLM but converts to undefined for type safety */
const optionalString = z.preprocess((val) => val ?? undefined, z.string().optional());
const optionalNumber = z.preprocess((val) => val ?? undefined, z.number().optional());

// ============================================================================
// Core Goal Data Schema
// ============================================================================

export const GoalDataSchema = z.object({
  // Action type - what the user wants to do (null when no goal action detected)
  action: z
    .enum([
      'set_goal',
      'log_progress',
      'view_goals',
      'check_progress',
      'update_goal',
      'goal_selected', // Special: user selected a goal from list
      'clarification_response', // Special: user provided clarification
    ])
    .nullable(),

  // Goal information (LLM may return null, converted to undefined)
  goalId: optionalString,
  goalTitle: optionalString,
  goalCategory: optionalString,

  // Progress information
  progressValue: optionalNumber,
  progressNotes: optionalString,
  progressUnit: optionalString,

  // For goal creation
  targetValue: optionalNumber,
  targetDate: optionalString,
  baselineValue: optionalNumber,

  // For clarification responses
  selection: z.preprocess(
    (val) => val ?? undefined,
    z.union([z.number(), z.string()]).optional()
  ),

  // Context from previous interactions
  pendingContext: z
    .object({
      originalAction: z.string(),
      goalOptions: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            currentValue: z.number().optional(),
            targetValue: z.number().optional(),
          })
        )
        .optional(),
      pendingValue: z.number().optional(),
    })
    .optional(),

  // Metadata
  confidence: z.number().min(0).max(1).default(0.5),
  extractedFrom: optionalString, // Which part of message
});

export type GoalData = z.infer<typeof GoalDataSchema>;

// ============================================================================
// Goal Option Schema (for selection)
// ============================================================================

export const GoalOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  currentValue: z.number().optional(),
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
});

export type GoalOption = z.infer<typeof GoalOptionSchema>;

// ============================================================================
// Goal Context Schema (maintained across messages)
// ============================================================================

export const GoalContextSchema = z.object({
  // Active goals for the user
  activeGoals: z.array(GoalOptionSchema).optional(),

  // Pending clarification
  pendingClarification: z
    .object({
      type: z.enum(['goal_selection', 'value_confirmation', 'action_confirmation']),
      askedAt: z.string(),
      options: z.array(GoalOptionSchema).optional(),
      pendingValue: z.number().optional(),
      originalMessage: z.string().optional(),
    })
    .optional(),

  // Recent progress entries
  recentProgress: z
    .array(
      z.object({
        goalId: z.string(),
        value: z.number(),
        loggedAt: z.string(),
      })
    )
    .optional(),

  // User preferences learned over time
  preferences: z
    .object({
      defaultUnit: z.string().optional(),
      preferredCategories: z.array(z.string()).optional(),
    })
    .optional(),
});

export type GoalContext = z.infer<typeof GoalContextSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if a message is likely a selection response
 */
export function isSelectionResponse(message: string): boolean {
  const lower = message.toLowerCase().trim();

  // Check for number selections: "1", "2", "first", "second"
  const numberPattern = /^[1-9]$|^(first|second|third|fourth|fifth)$/;
  if (numberPattern.test(lower)) return true;

  // Check for single word responses (likely keywords)
  const words = lower.split(/\s+/);
  if (words.length <= 2) return true;

  // Check for selection phrases
  const selectionPhrases = ['the first', 'the second', 'number', 'option'];
  return selectionPhrases.some((phrase) => lower.includes(phrase));
}

/**
 * Parse a selection from user input
 */
export function parseSelection(
  message: string,
  options: GoalOption[]
): { type: 'index' | 'keyword'; value: number | string; goalId: string } | null {
  const lower = message.toLowerCase().trim();

  // Try to parse as number
  const num = parseInt(lower);
  if (!isNaN(num) && num > 0 && num <= options.length) {
    return {
      type: 'index',
      value: num,
      goalId: options[num - 1].id,
    };
  }

  // Try ordinal words
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
  const ordinalIndex = ordinals.findIndex((o) => lower.includes(o));
  if (ordinalIndex >= 0 && ordinalIndex < options.length) {
    return {
      type: 'index',
      value: ordinalIndex + 1,
      goalId: options[ordinalIndex].id,
    };
  }

  // Try keyword matching
  for (let i = 0; i < options.length; i++) {
    const keywords = options[i].title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const matchingKeyword = keywords.find((k) => lower.includes(k));
    if (matchingKeyword) {
      return {
        type: 'keyword',
        value: matchingKeyword,
        goalId: options[i].id,
      };
    }
  }

  return null;
}

/**
 * Get action description for logging
 */
export function getActionDescription(action: GoalData['action']): string {
  if (action === null) {
    return 'No goal action detected';
  }

  const descriptions: Record<NonNullable<GoalData['action']>, string> = {
    set_goal: 'Setting a new goal',
    log_progress: 'Logging progress',
    view_goals: 'Viewing goals',
    check_progress: 'Checking progress',
    update_goal: 'Updating goal',
    goal_selected: 'Goal selection',
    clarification_response: 'Clarification provided',
  };

  return descriptions[action] || 'Unknown action';
}
