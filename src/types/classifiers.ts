// Classifier types for MVP v3

import type { ConversationMode } from './modes.js';

// ============================================================================
// Base Classifier Interfaces
// ============================================================================

export interface IClassifier<TInput, TResult> {
  readonly name: string;
  classify(input: TInput): Promise<TResult>;
}

export interface ClassificationResult {
  classifierName: string;
  confidence: number; // 0-1
  timestamp: Date;
}

// ============================================================================
// Safety Classifier
// ============================================================================

export enum SafetyLevel {
  SAFE = 'safe',
  CONCERN = 'concern',
  CRISIS = 'crisis',
}

export interface SafetyInput {
  message: string;
  recentUserMessages: string[]; // Last 3 user messages for context
  currentSafetyLevel: SafetyLevel;
}

export interface SafetyResult extends ClassificationResult {
  classifierName: 'safety';
  level: SafetyLevel;
  signals: string[]; // Keywords/patterns that triggered the classification
  suggestedTone: 'normal' | 'empathetic' | 'urgent' | null;
  requiresHumanEscalation: boolean;
  crisisResources?: CrisisResource[]; // Only present if crisis detected
}

export interface CrisisResource {
  name: string;
  phone: string;
  available: string;
  description: string;
}

// ============================================================================
// Intent Classifier
// ============================================================================

export enum IntentType {
  // Consult Mode Intents
  SEEK_ADVICE = 'seek_advice',
  ASK_QUESTION = 'ask_question',
  SHARE_PROBLEM = 'share_problem',

  // Smalltalk Mode Intents
  GREETING = 'greeting',
  CASUAL_CHAT = 'casual_chat',
  FAREWELL = 'farewell',

  // Meta Mode Intents
  HOW_WORKS = 'how_works',
  ABOUT_SYSTEM = 'about_system',
  HELP = 'help',

  // Unclear
  UNCLEAR = 'unclear',
}

export interface IntentInput {
  message: string;
  recentMessages: Array<{ role: string; content: string }>; // Last few messages
  currentMode: ConversationMode;
}

export interface IntentResult extends ClassificationResult {
  classifierName: 'intent';
  intent: IntentType;
  suggestedMode: ConversationMode;
  entities: ExtractedEntity[]; // Basic entity extraction
  reasoning: string; // Why this intent was chosen
}

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
}

export enum EntityType {
  TOPIC = 'topic',
  EMOTION = 'emotion',
  GOAL = 'goal',
  HEALTH_CONCERN = 'health_concern',
}

// ============================================================================
// Arbiter
// ============================================================================

export interface ArbiterInput {
  safetyResult: SafetyResult;
  intentResult: IntentResult;
  currentMode: ConversationMode;
}

export interface ArbiterDecision {
  finalMode: ConversationMode;
  finalIntent: IntentType;
  safetyContext: {
    level: SafetyLevel;
    tone: 'normal' | 'empathetic' | 'urgent';
    isCrisis: boolean;
    crisisResources?: CrisisResource[];
  };
  overrideReason?: string; // If safety or other rule overrode intent
  confidence: number;
  timestamp: Date;
}

// ============================================================================
// Classification Context (passed to handlers)
// ============================================================================

export interface ClassificationContext {
  decision: ArbiterDecision;
  safetySignals: string[];
  entities: ExtractedEntity[];
}
