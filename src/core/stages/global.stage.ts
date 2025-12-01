// Global Stage - Extract context elements from messages
import { logger } from '@/core/logger.js';
import type {
  ConversationState,
  ContextElement,
  SafetyResult,
  IntentResult,
} from '@/types/index.js';

export interface GlobalStageInput {
  message: string;
  state: ConversationState;
  safetyResult: SafetyResult;
  intentResult: IntentResult;
}

export interface GlobalStageOutput {
  state: ConversationState;
  extractedElements: ContextElement[];
}

export class GlobalStage {
  /**
   * Extract context elements from message and classification results
   */
  async execute(input: GlobalStageInput): Promise<GlobalStageOutput> {
    const newElements: ContextElement[] = [];

    // Extract crisis context from safety results
    const crisisElements = this.extractCrisisContext(input.safetyResult);
    newElements.push(...crisisElements);

    // Extract emotional context from safety results
    const emotionalElements = this.extractEmotionalContext(input.safetyResult);
    newElements.push(...emotionalElements);

    // Extract topic context from intent results
    const topicElements = this.extractTopicContext(input.intentResult);
    newElements.push(...topicElements);

    // Merge new elements with existing state
    const updatedState = this.mergeContextElements(input.state, newElements);

    logger.info(
      {
        conversationId: input.state.conversationId,
        newElements: newElements.length,
        totalElements: updatedState.contextElements.length,
        elementTypes: newElements.map((e) => e.contextType),
      },
      'Global stage: Context extraction complete'
    );

    return {
      state: updatedState,
      extractedElements: newElements,
    };
  }

  /**
   * Extract crisis-level context from safety classification
   */
  private extractCrisisContext(safetyResult: SafetyResult): ContextElement[] {
    const elements: ContextElement[] = [];
    const now = new Date();

    if (safetyResult.level === 'crisis') {
      // Add crisis emotional state - uses 72h half-life
      elements.push({
        key: 'emotional_state',
        value: 'crisis',
        contextType: 'crisis',
        weight: 1.0,
        createdAt: now,
        lastAccessedAt: now,
      });

      // Add specific safety signals as crisis context
      if (safetyResult.signals && safetyResult.signals.length > 0) {
        elements.push({
          key: 'safety_signals',
          value: safetyResult.signals.join(', '),
          contextType: 'crisis',
          weight: 1.0,
          createdAt: now,
          lastAccessedAt: now,
        });
      }

      logger.warn(
        {
          safetyLevel: safetyResult.level,
          signals: safetyResult.signals,
        },
        'Global stage: Crisis context extracted'
      );
    }

    return elements;
  }

  /**
   * Extract emotional context from safety classification
   */
  private extractEmotionalContext(safetyResult: SafetyResult): ContextElement[] {
    const elements: ContextElement[] = [];
    const now = new Date();

    // Map safety levels to emotional context (excluding crisis, handled above)
    if (safetyResult.level === 'concern') {
      // First, add general distressed state
      elements.push({
        key: 'emotion:distressed',
        value: 'distressed',
        contextType: 'emotional',
        weight: 0.8,
        createdAt: now,
        lastAccessedAt: now,
      });

      // Extract specific emotions from safety signals if available
      if (safetyResult.signals && safetyResult.signals.length > 0) {
        for (const signal of safetyResult.signals) {
          // Parse common emotional keywords from signals
          const emotionalKeywords = ['stressed', 'anxious', 'worried', 'overwhelmed', 'sad', 'angry', 'frustrated'];

          for (const keyword of emotionalKeywords) {
            if (signal.toLowerCase().includes(keyword)) {
              // Create unique key for each emotion
              const emotionKey = `emotion:${keyword}`;

              // Only add if not already added
              if (!elements.find(e => e.key === emotionKey)) {
                elements.push({
                  key: emotionKey,
                  value: keyword,
                  contextType: 'emotional',
                  weight: 0.8,
                  createdAt: now,
                  lastAccessedAt: now,
                });
              }
            }
          }
        }
      }
    }

    return elements;
  }

  /**
   * Extract topic context from intent classification
   */
  private extractTopicContext(intentResult: IntentResult): ContextElement[] {
    const elements: ContextElement[] = [];
    const now = new Date();

    // Extract topic from entities - each gets a unique key
    if (intentResult.entities && intentResult.entities.length > 0) {
      const topicEntities = intentResult.entities.filter((e) => e.type === 'topic');

      for (const entity of topicEntities) {
        // Create unique key for each topic (e.g., "topic:stress", "topic:time_management")
        const topicKey = `topic:${entity.value.toLowerCase().replace(/\s+/g, '_')}`;

        elements.push({
          key: topicKey,
          value: entity.value,
          contextType: 'topic',
          weight: entity.confidence || 0.8,
          createdAt: now,
          lastAccessedAt: now,
        });
      }
    }

    // Add general topic based on suggested mode
    if (intentResult.suggestedMode) {
      elements.push({
        key: 'conversation_domain',
        value: intentResult.suggestedMode,
        contextType: 'topic',
        weight: 0.7,
        createdAt: now,
        lastAccessedAt: now,
      });
    }

    return elements;
  }

  /**
   * Merge new context elements with existing state
   */
  private mergeContextElements(
    state: ConversationState,
    newElements: ContextElement[]
  ): ConversationState {
    const existingElements = state.contextElements || [];

    // Update lastAccessedAt for matching elements, or add new ones
    const merged: ContextElement[] = [...existingElements];

    for (const newElement of newElements) {
      // Find if element with same key already exists
      const existingIndex = merged.findIndex((e) => e.key === newElement.key);

      if (existingIndex >= 0) {
        // Memory reinforcement: mentioning something again strengthens the memory
        const existingElement = merged[existingIndex];
        const oldWeight = existingElement.weight;

        // Reinforcement formula: boost by 20% but cap at 1.0
        // If it was fading (e.g., 0.3), mentioning it again brings it back up (0.36)
        // This mimics how human memory works - retrieval strengthens memory
        const reinforcedWeight = Math.min(1.0, oldWeight * 1.2);

        merged[existingIndex] = {
          ...existingElement,
          value: newElement.value, // Update value if changed
          weight: reinforcedWeight, // Reinforce the memory
          lastAccessedAt: new Date(), // Reset decay timer
        };

        logger.debug(
          {
            key: newElement.key,
            action: 'reinforced',
            oldWeight: oldWeight.toFixed(3),
            newWeight: reinforcedWeight.toFixed(3),
            boost: ((reinforcedWeight - oldWeight) * 100).toFixed(1) + '%',
          },
          'Global stage: Memory reinforced through retrieval'
        );
      } else {
        // Add new element
        merged.push(newElement);

        logger.debug(
          {
            key: newElement.key,
            contextType: newElement.contextType,
            weight: newElement.weight,
            action: 'added',
          },
          'Global stage: Context element added'
        );
      }
    }

    return {
      ...state,
      contextElements: merged,
    };
  }
}

export const globalStage = new GlobalStage();
