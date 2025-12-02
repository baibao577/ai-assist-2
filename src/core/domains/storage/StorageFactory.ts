// Storage Factory - Creates appropriate storage implementations based on configuration
import type { StorageConfig } from '../types.js';
import type { DomainStorage } from './DomainStorage.js';
import { TimeSeriesStorage } from './TimeSeriesStorage.js';
import { logger } from '@/core/logger.js';

/**
 * Factory for creating domain storage implementations
 * Supports different storage types based on domain needs
 */
export class StorageFactory {
  /**
   * Create a storage implementation based on configuration
   * @param domainId - Domain ID for logging
   * @param config - Storage configuration
   * @returns Storage implementation
   */
  static create<T>(domainId: string, config: StorageConfig): DomainStorage<T> {
    logger.debug(
      {
        domainId,
        storageType: config.type,
        table: config.table,
      },
      'Creating storage implementation'
    );

    switch (config.type) {
      case 'timeseries':
        return new TimeSeriesStorage<T>(domainId, config);

      case 'document':
        // TODO: Implement document storage
        throw new Error(
          `Document storage not yet implemented for domain ${domainId}. Use 'timeseries' instead.`
        );

      case 'relational':
        // TODO: Implement relational storage
        throw new Error(
          `Relational storage not yet implemented for domain ${domainId}. Use 'timeseries' instead.`
        );

      default:
        throw new Error(
          `Unknown storage type: ${config.type}. Supported types: timeseries, document, relational`
        );
    }
  }

  /**
   * Check if a storage type is supported
   * @param type - Storage type to check
   * @returns True if supported
   */
  static isSupported(type: string): boolean {
    return ['timeseries', 'document', 'relational'].includes(type);
  }

  /**
   * Get list of supported storage types
   * @returns Array of supported types
   */
  static getSupportedTypes(): string[] {
    return ['timeseries', 'document', 'relational'];
  }

  /**
   * Get list of implemented storage types
   * @returns Array of implemented types
   */
  static getImplementedTypes(): string[] {
    return ['timeseries']; // Only timeseries is implemented so far
  }
}