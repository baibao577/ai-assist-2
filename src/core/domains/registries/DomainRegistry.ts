// Domain Registry - Singleton registry for managing domain definitions
import { logger } from '@/core/logger.js';
import type { DomainDefinition } from '../types.js';

/**
 * Singleton registry for managing domain definitions
 * Domains can be registered, unregistered, and queried
 */
export class DomainRegistry {
  private static instance: DomainRegistry;
  private domains = new Map<string, DomainDefinition>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DomainRegistry {
    if (!DomainRegistry.instance) {
      DomainRegistry.instance = new DomainRegistry();
    }
    return DomainRegistry.instance;
  }

  /**
   * Register a new domain
   * @param domain - Domain definition to register
   * @throws Error if domain ID already exists
   */
  register(domain: DomainDefinition): void {
    if (this.domains.has(domain.id)) {
      throw new Error(`Domain ${domain.id} is already registered`);
    }

    this.domains.set(domain.id, domain);

    logger.info(
      {
        domainId: domain.id,
        name: domain.name,
        priority: domain.priority,
        capabilities: domain.capabilities,
      },
      'Domain registered'
    );
  }

  /**
   * Unregister a domain
   * @param domainId - ID of domain to remove
   */
  unregister(domainId: string): void {
    if (this.domains.delete(domainId)) {
      logger.info({ domainId }, 'Domain unregistered');
    }
  }

  /**
   * Get all active (enabled) domains sorted by priority
   * @returns Array of enabled domains, highest priority first
   */
  getActiveDomains(): DomainDefinition[] {
    return Array.from(this.domains.values())
      .filter((d) => d.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get a specific domain by ID
   * @param id - Domain ID
   * @returns Domain definition or null if not found
   */
  getDomain(id: string): DomainDefinition | null {
    return this.domains.get(id) || null;
  }

  /**
   * Get all registered domains
   * @returns Array of all domains
   */
  getAllDomains(): DomainDefinition[] {
    return Array.from(this.domains.values());
  }

  /**
   * Check if a domain is registered
   * @param domainId - Domain ID to check
   * @returns True if domain exists
   */
  hasDomain(domainId: string): boolean {
    return this.domains.has(domainId);
  }

  /**
   * Clear all registered domains
   * Useful for testing
   */
  clear(): void {
    const count = this.domains.size;
    this.domains.clear();
    if (count > 0) {
      logger.info({ count }, 'All domains cleared');
    }
  }

  /**
   * Get statistics about registered domains
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byCapability: Record<string, number>;
  } {
    const domains = Array.from(this.domains.values());
    return {
      total: domains.length,
      enabled: domains.filter((d) => d.enabled).length,
      disabled: domains.filter((d) => !d.enabled).length,
      byCapability: {
        extraction: domains.filter((d) => d.capabilities.extraction).length,
        steering: domains.filter((d) => d.capabilities.steering).length,
        summarization: domains.filter((d) => d.capabilities.summarization).length,
      },
    };
  }
}

// Export singleton instance
export const domainRegistry = DomainRegistry.getInstance();
