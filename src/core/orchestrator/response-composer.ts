/**
 * Response Composer
 *
 * MVP v3 - Mode Cooperation
 * Uses LLM to generate natural transitions instead of hardcoded phrases
 */

import type { ModeSegment, TransitionLibrary } from './types.js';
import { logger } from '@/core/logger.js';
import { llmService } from '@/core/llm.service.js';

export class ResponseComposer implements TransitionLibrary {
  private config: {
    enableTransitions: boolean;
    enableDeduplication: boolean;
    useLLMTransitions: boolean;
  };

  constructor(config?: Partial<typeof ResponseComposer.prototype.config>) {
    this.config = {
      enableTransitions: true,
      enableDeduplication: true,
      useLLMTransitions: false, // Disable LLM transitions for performance
      ...config,
    };
  }

  /**
   * Update configuration
   */
  configure(config: Partial<typeof ResponseComposer.prototype.config>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Compose segments into a unified response
   */
  async compose(segments: ModeSegment[]): Promise<string> {
    if (segments.length === 0) {
      return '';
    }

    if (segments.length === 1) {
      return segments[0].content;
    }

    // Step 1: Order segments by priority
    const ordered = this.orderSegments(segments);

    // Step 2: Remove redundancies if enabled
    const deduplicated = this.config.enableDeduplication
      ? this.deduplicateSegments(ordered)
      : ordered;

    // Step 3: Add transitions if enabled
    const composed = this.config.enableTransitions
      ? await this.addTransitions(deduplicated)
      : deduplicated.map((s) => s.content);

    // Step 4: Join with appropriate spacing
    return this.joinSegments(composed);
  }

  /**
   * Order segments by priority and logical flow
   */
  private orderSegments(segments: ModeSegment[]): ModeSegment[] {
    return segments.sort((a, b) => {
      // First sort by priority (higher first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // Then by content type for logical flow
      const typeOrder: ModeSegment['contentType'][] = [
        'greeting',
        'acknowledgment',
        'information',
        'analytics',
        'advice',
        'question',
      ];

      const aIndex = typeOrder.indexOf(a.contentType);
      const bIndex = typeOrder.indexOf(b.contentType);

      return aIndex - bIndex;
    });
  }

  /**
   * Remove redundant content across segments using LLM
   */
  private deduplicateSegments(segments: ModeSegment[]): ModeSegment[] {
    if (!this.config.useLLMTransitions) {
      // Simple deduplication without LLM
      return this.simpleDeduplication(segments);
    }

    // For now, use simple deduplication
    // Advanced LLM deduplication can be added later
    return this.simpleDeduplication(segments);
  }

  /**
   * Simple deduplication without LLM
   */
  private simpleDeduplication(segments: ModeSegment[]): ModeSegment[] {
    const deduplicated: ModeSegment[] = [];
    const seenPhrases = new Set<string>();

    for (const segment of segments) {
      // Extract key phrases from segment
      const phrases = this.extractKeyPhrases(segment.content);

      // Check for significant overlap
      const overlap = phrases.filter((p) => seenPhrases.has(p)).length;
      const overlapRatio = overlap / Math.max(phrases.length, 1);

      // Include segment if overlap is less than 30%
      if (overlapRatio < 0.3) {
        deduplicated.push(segment);
        phrases.forEach((p) => seenPhrases.add(p));
      } else {
        logger.debug(
          { mode: segment.mode, overlap: overlapRatio },
          'Segment excluded due to redundancy'
        );
      }
    }

    return deduplicated;
  }

  /**
   * Extract key phrases for deduplication
   */
  private extractKeyPhrases(content: string): string[] {
    // Simple phrase extraction - split by sentences and normalize
    return content
      .split(/[.!?]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 10); // Only consider substantial phrases
  }

  /**
   * Add transition phrases between segments
   */
  private async addTransitions(segments: ModeSegment[]): Promise<string[]> {
    const result: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Add the segment content
      result.push(segment.content);

      // Add transition to next segment if needed
      if (i < segments.length - 1) {
        const nextSegment = segments[i + 1];

        if (await this.needsTransition(segment, nextSegment)) {
          const transition = await this.getTransition(
            segment.contentType,
            nextSegment.contentType,
            segment,
            nextSegment
          );
          if (transition) {
            result.push(transition);
          }
        }
      }
    }

    return result;
  }

  /**
   * Generate transition using LLM with full context
   */
  private async generateLLMTransition(
    fromSegment: ModeSegment,
    toSegment: ModeSegment
  ): Promise<string> {
    try {
      const prompt = `Generate a natural, brief transition phrase to connect these two response segments.

First segment (${fromSegment.contentType} from ${fromSegment.mode} mode):
"${fromSegment.content.substring(0, 200)}..."

Second segment (${toSegment.contentType} from ${toSegment.mode} mode):
"${toSegment.content.substring(0, 200)}..."

Requirements:
- Create a smooth, natural transition
- Keep it brief (5-10 words maximum)
- Don't repeat information from either segment
- Make it conversational, not formal
- The transition should flow naturally between the topics

Return ONLY the transition phrase, nothing else. Examples of good transitions:
- "Additionally,"
- "On another note,"
- "Speaking of which,"
- "Also worth mentioning,"

Generate a transition that fits the specific content and context above.`;

      const response = await llmService.generateFromMessages(
        [{ role: 'system', content: prompt }],
        {
          temperature: 0.7, // Higher temperature for variety
          maxTokens: 30,
        }
      );

      if (response && response.trim()) {
        // Clean up the response - remove quotes if LLM added them
        return response.trim().replace(/^["']|["']$/g, '');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to generate LLM transition');
    }

    // Fallback to simple transition
    return this.getSimpleTransition();
  }

  /**
   * Get simple fallback transition
   */
  private getSimpleTransition(): string {
    const fallbacks = ['Additionally,', 'Also,', 'Furthermore,', 'Moreover,'];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Get appropriate transition phrase
   */
  async getTransition(
    _from: ModeSegment['contentType'],
    _to: ModeSegment['contentType'],
    fromSegment?: ModeSegment,
    toSegment?: ModeSegment
  ): Promise<string> {
    // Use LLM if enabled and segments provided
    if (this.config.useLLMTransitions && fromSegment && toSegment) {
      return this.generateLLMTransition(fromSegment, toSegment);
    }

    // Fallback to simple transitions
    return this.getSimpleTransition();
  }

  /**
   * Check if transition is needed between segments using LLM
   */
  async needsTransition(from: ModeSegment, to: ModeSegment): Promise<boolean> {
    // No transition if segments are from same mode
    if (from.mode === to.mode) {
      return false;
    }

    // No transition if first segment ends with a question
    if (from.content.trim().endsWith('?')) {
      return false;
    }

    // No transition if second segment starts with a connector
    const connectors = ['however', 'but', 'also', 'additionally', 'furthermore', 'moreover'];
    const toStart = to.content.trim().toLowerCase();
    if (connectors.some((c) => toStart.startsWith(c))) {
      return false;
    }

    // If using LLM, ask it to determine if transition is needed
    if (this.config.useLLMTransitions) {
      try {
        const prompt = `Determine if a transition phrase is needed between these two response segments.

First segment ends with: "${from.content.slice(-100)}"
Second segment starts with: "${to.content.slice(0, 100)}"

Consider:
- Do they flow naturally without a transition?
- Is there an abrupt topic change?
- Would a transition improve readability?

Return JSON: { "needsTransition": true/false }`;

        const response = await llmService.generateFromMessages(
          [{ role: 'system', content: prompt }],
          {
            responseFormat: { type: 'json_object' },
            temperature: 0.3,
            maxTokens: 50,
          }
        );

        if (response) {
          const result = JSON.parse(response);
          return result.needsTransition || false;
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to check transition need via LLM');
      }
    }

    // Default: transitions usually help between different modes
    return true;
  }

  /**
   * Join segments with appropriate spacing
   */
  private joinSegments(segments: string[]): string {
    const joined: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i].trim();

      if (!segment) continue;

      // Check if this is a transition phrase
      const isTransition = segment.length < 30 && (segment.endsWith(',') || segment.endsWith(':'));

      if (isTransition && i > 0) {
        // Append transition to previous segment
        const prev = joined.pop() || '';
        joined.push(`${prev} ${segment}`);
      } else if (joined.length > 0) {
        // Add paragraph break between major segments
        joined.push('\n\n' + segment);
      } else {
        joined.push(segment);
      }
    }

    return joined.join('');
  }

  /**
   * Validate segment compatibility for composition
   */
  validateSegments(segments: ModeSegment[]): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for empty segments
    const emptySegments = segments.filter((s) => !s.content.trim());
    if (emptySegments.length > 0) {
      issues.push(`${emptySegments.length} empty segments found`);
    }

    // Check for excessive length
    const totalLength = segments.reduce((sum, s) => sum + s.content.length, 0);
    if (totalLength > 4000) {
      issues.push('Combined response exceeds recommended length');
    }

    // Check for conflicting content types
    const hasGreeting = segments.some((s) => s.contentType === 'greeting');
    const hasQuestion = segments.some((s) => s.contentType === 'question');
    if (hasGreeting && hasQuestion) {
      issues.push('Response contains both greeting and question - may feel disjointed');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

export const responseComposer = new ResponseComposer();
