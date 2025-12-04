/**
 * Response Orchestrator Types
 *
 * MVP v3 - Mode Cooperation
 * Defines structures for multi-mode response composition
 */

import { ConversationMode } from '@/types/modes.js';

/**
 * Represents a segment of response from a single mode handler
 */
export interface ModeSegment {
  /** The mode that generated this segment */
  mode: ConversationMode;

  /** The actual response content */
  content: string;

  /** Priority for ordering (higher = earlier in response) */
  priority: number;

  /** Whether this segment can stand alone as a complete response */
  standalone: boolean;

  /** Type of content for transition selection */
  contentType: 'greeting' | 'information' | 'advice' | 'analytics' | 'acknowledgment' | 'question';

  /** Optional metadata for composition */
  metadata?: {
    /** Confidence score */
    confidence?: number;
    /** Whether segment is essential */
    essential?: boolean;
    /** Suggested transition phrase to next segment */
    suggestedTransition?: string;
    /** Any state updates from this segment */
    stateUpdates?: Record<string, any>;
  };
}

/**
 * Represents a fully orchestrated multi-mode response
 */
export interface OrchestratedResponse {
  /** The composed final response text */
  response: string;

  /** Individual segments that were composed */
  segments: ModeSegment[];

  /** Modes that contributed to the response */
  modesUsed: ConversationMode[];

  /** Primary mode (highest priority/confidence) */
  primaryMode: ConversationMode;

  /** Composition metadata */
  metadata: {
    /** Total composition time in ms */
    compositionTime: number;
    /** Number of segments composed */
    segmentCount: number;
    /** Whether transitions were added */
    transitionsAdded: boolean;
    /** Any composition warnings */
    warnings?: string[];
  };

  /** Combined state updates from all segments */
  stateUpdates?: Record<string, any>;
}

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** Maximum number of modes per response */
  maxModesPerResponse: number;

  /** Whether to add transition phrases */
  enableTransitions: boolean;

  /** Whether to eliminate redundant content */
  enableDeduplication: boolean;

  /** Whether to reorder segments by priority */
  enablePriorityOrdering: boolean;

  /** Timeout for individual mode handlers (ms) */
  handlerTimeout: number;

  /** Whether to run handlers in parallel */
  parallelExecution: boolean;
}

/**
 * Rules for mode cooperation
 */
export interface ModeCooperationRules {
  /** Modes that should not appear together */
  incompatiblePairs: Array<[ConversationMode, ConversationMode]>;

  /** Preferred ordering of modes */
  preferredOrder: ConversationMode[];

  /** Maximum segments per mode */
  maxSegmentsPerMode: Map<ConversationMode, number>;

  /** Modes that must be standalone */
  standaloneModes: ConversationMode[];
}

/**
 * Multi-intent classification result
 */
export interface MultiIntentResult {
  /** Primary intent/mode */
  primary: {
    mode: ConversationMode;
    confidence: number;
  };

  /** Secondary intents/modes */
  secondary: Array<{
    mode: ConversationMode;
    confidence: number;
  }>;

  /** Whether the message requires multi-mode handling */
  requiresOrchestration: boolean;

  /** Suggested composition strategy */
  compositionStrategy?: 'sequential' | 'blended' | 'prioritized';
}

/**
 * Transition phrases between mode segments
 */
export interface TransitionLibrary {
  /** Get transition phrase between two content types */
  getTransition(
    from: ModeSegment['contentType'],
    to: ModeSegment['contentType'],
    fromSegment?: ModeSegment,
    toSegment?: ModeSegment
  ): Promise<string>;

  /** Check if transition is needed */
  needsTransition(from: ModeSegment, to: ModeSegment): Promise<boolean>;
}

/**
 * Interface for mode handlers to support orchestration
 */
export interface OrchestratorAwareModeHandler {
  /** Generate segment instead of full response */
  generateSegment(context: any): Promise<ModeSegment>;

  /** Check if handler can contribute to multi-mode response */
  canContribute(context: any): boolean;

  /** Get handler's priority for this context */
  getPriority(context: any): number;
}
