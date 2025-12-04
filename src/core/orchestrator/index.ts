/**
 * Response Orchestrator Module
 *
 * MVP v3 - Mode Cooperation
 * Exports for multi-mode response orchestration
 */

export { ResponseOrchestrator, responseOrchestrator } from './response-orchestrator.js';
export { MultiIntentClassifier, multiIntentClassifier } from './multi-intent.classifier.js';
export { ResponseComposer, responseComposer } from './response-composer.js';

export type {
  ModeSegment,
  OrchestratedResponse,
  OrchestratorConfig,
  ModeCooperationRules,
  MultiIntentResult,
  TransitionLibrary,
  OrchestratorAwareModeHandler,
} from './types.js';