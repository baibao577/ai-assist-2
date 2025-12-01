// Mode types and enums for conversation modes

import type { ClassificationContext } from './classifiers.js';

export enum ConversationMode {
  CONSULT = 'consult', // Seeking advice, help with problems, health questions
  SMALLTALK = 'smalltalk', // Casual chat, greetings, general conversation
  META = 'meta', // Questions about the assistant, capabilities, how it works
}

export interface ModeDetectionResult {
  mode: ConversationMode;
  confidence: number; // 0-1 score
  reasoning?: string; // LLM's reasoning for the classification
}

export interface HandlerContext {
  conversationId: string;
  userId: string;
  message: string;
  messages: Array<{ role: string; content: string }>;
  currentMode: ConversationMode;
  state: Record<string, unknown>; // Will be properly typed when we add ConversationState
  classification?: ClassificationContext; // MVP v3: Safety and intent classification results
}

export interface HandlerResult {
  response: string;
  newMode?: ConversationMode; // If mode should change
  stateUpdates?: Record<string, unknown>; // Updates to conversation state
}

export interface IModeHandler {
  readonly mode: ConversationMode;
  handle(context: HandlerContext): Promise<HandlerResult>;
}
