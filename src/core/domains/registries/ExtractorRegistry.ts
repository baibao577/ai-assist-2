// Extractor Registry - Singleton registry for managing domain extractors
import { logger } from '@/core/logger.js';
import type { BaseExtractor } from '../base/BaseExtractor.js';

/**
 * Singleton registry for managing domain extractors
 * Each domain can have one extractor
 */
export class ExtractorRegistry {
  private static instance: ExtractorRegistry;
  private extractors = new Map<string, BaseExtractor>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ExtractorRegistry {
    if (!ExtractorRegistry.instance) {
      ExtractorRegistry.instance = new ExtractorRegistry();
    }
    return ExtractorRegistry.instance;
  }

  /**
   * Register an extractor for a domain
   * @param extractor - Extractor instance to register
   */
  register(extractor: BaseExtractor): void {
    if (this.extractors.has(extractor.domainId)) {
      logger.warn(
        { domainId: extractor.domainId },
        'Replacing existing extractor for domain'
      );
    }

    this.extractors.set(extractor.domainId, extractor);

    logger.info(
      {
        domainId: extractor.domainId,
        extractorClass: extractor.constructor.name,
      },
      'Extractor registered'
    );
  }

  /**
   * Get extractor for a specific domain
   * @param domainId - Domain ID
   * @returns Extractor instance or null if not found
   */
  getExtractor(domainId: string): BaseExtractor | null {
    return this.extractors.get(domainId) || null;
  }

  /**
   * Get all registered extractors
   * @returns Array of all extractors
   */
  getAllExtractors(): BaseExtractor[] {
    return Array.from(this.extractors.values());
  }

  /**
   * Check if an extractor exists for a domain
   * @param domainId - Domain ID to check
   * @returns True if extractor exists
   */
  hasExtractor(domainId: string): boolean {
    return this.extractors.has(domainId);
  }

  /**
   * Unregister an extractor
   * @param domainId - Domain ID to remove extractor for
   */
  unregister(domainId: string): void {
    if (this.extractors.delete(domainId)) {
      logger.info({ domainId }, 'Extractor unregistered');
    }
  }

  /**
   * Clear all registered extractors
   * Useful for testing
   */
  clear(): void {
    const count = this.extractors.size;
    this.extractors.clear();
    if (count > 0) {
      logger.info({ count }, 'All extractors cleared');
    }
  }

  /**
   * Get list of domain IDs that have extractors
   * @returns Array of domain IDs
   */
  getRegisteredDomainIds(): string[] {
    return Array.from(this.extractors.keys());
  }
}

// Export singleton instance
export const extractorRegistry = ExtractorRegistry.getInstance();