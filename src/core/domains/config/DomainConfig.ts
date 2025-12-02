// Domain Configuration System
import { logger } from '@/core/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Configuration for individual domains
 */
export interface DomainConfigItem {
  domainId: string;
  enabled: boolean;
  priority?: number;
  extractionConfig?: {
    confidenceThreshold?: number; // Minimum confidence to accept extraction
    maxTokens?: number; // Max tokens for extraction
    temperature?: number; // LLM temperature for extraction
  };
  steeringConfig?: {
    enabled?: boolean;
    maxSuggestions?: number;
    priorityThreshold?: number; // Minimum priority to apply steering
  };
  storageConfig?: {
    enabled?: boolean;
    retentionDays?: number;
  };
}

/**
 * Global configuration for the domain system
 */
export interface GlobalDomainConfig {
  enabled: boolean; // Global on/off switch
  maxConcurrentExtractions?: number; // Max parallel extractions
  extractionTimeout?: number; // Timeout in ms
  steeringEnabled?: boolean; // Global steering on/off
  domains: DomainConfigItem[];
}

/**
 * Domain configuration manager
 */
export class DomainConfigManager {
  private static instance: DomainConfigManager;
  private config: GlobalDomainConfig;
  private configPath: string;

  private constructor() {
    // Load config from environment or file
    this.configPath =
      process.env.DOMAIN_CONFIG_PATH || path.join(process.cwd(), '.domains.config.json');
    this.config = this.loadConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DomainConfigManager {
    if (!DomainConfigManager.instance) {
      DomainConfigManager.instance = new DomainConfigManager();
    }
    return DomainConfigManager.instance;
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): GlobalDomainConfig {
    try {
      // Check if config file exists
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData) as GlobalDomainConfig;

        logger.info(
          {
            configPath: this.configPath,
            domainsCount: loadedConfig.domains.length,
          },
          'Domain configuration loaded from file'
        );

        return loadedConfig;
      }
    } catch (error) {
      logger.warn(
        {
          configPath: this.configPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to load domain configuration, using defaults'
      );
    }

    // Return default configuration
    return this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): GlobalDomainConfig {
    return {
      enabled: true,
      maxConcurrentExtractions: 3,
      extractionTimeout: 10000, // 10 seconds
      steeringEnabled: true,
      domains: [
        {
          domainId: 'health',
          enabled: true,
          priority: 1,
          extractionConfig: {
            confidenceThreshold: 0.5,
            maxTokens: 500,
            temperature: 0.3,
          },
          steeringConfig: {
            enabled: true,
            maxSuggestions: 3,
            priorityThreshold: 0.5,
          },
          storageConfig: {
            enabled: true,
            retentionDays: 365,
          },
        },
        {
          domainId: 'finance',
          enabled: true,
          priority: 2,
          extractionConfig: {
            confidenceThreshold: 0.5,
            maxTokens: 500,
            temperature: 0.3,
          },
          steeringConfig: {
            enabled: true,
            maxSuggestions: 3,
            priorityThreshold: 0.5,
          },
          storageConfig: {
            enabled: true,
            retentionDays: 730, // 2 years for financial data
          },
        },
      ],
    };
  }

  /**
   * Save current configuration to file
   */
  saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');

      logger.info({ configPath: this.configPath }, 'Domain configuration saved');
    } catch (error) {
      logger.error(
        {
          configPath: this.configPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to save domain configuration'
      );
    }
  }

  /**
   * Get global configuration
   */
  getGlobalConfig(): GlobalDomainConfig {
    return { ...this.config };
  }

  /**
   * Get configuration for a specific domain
   */
  getDomainConfig(domainId: string): DomainConfigItem | null {
    const domainConfig = this.config.domains.find((d) => d.domainId === domainId);
    return domainConfig ? { ...domainConfig } : null;
  }

  /**
   * Update domain configuration
   */
  updateDomainConfig(domainId: string, updates: Partial<DomainConfigItem>): void {
    const index = this.config.domains.findIndex((d) => d.domainId === domainId);

    if (index >= 0) {
      this.config.domains[index] = {
        ...this.config.domains[index],
        ...updates,
        domainId, // Ensure domainId doesn't change
      };
    } else {
      // Add new domain config
      this.config.domains.push({
        domainId,
        enabled: true,
        ...updates,
      });
    }

    // Auto-save on update
    this.saveConfig();
  }

  /**
   * Update global configuration
   */
  updateGlobalConfig(updates: Partial<GlobalDomainConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      domains: this.config.domains, // Preserve domains array
    };

    // Auto-save on update
    this.saveConfig();
  }

  /**
   * Check if domain system is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if a specific domain is enabled
   */
  isDomainEnabled(domainId: string): boolean {
    if (!this.config.enabled) return false;

    const domainConfig = this.getDomainConfig(domainId);
    return domainConfig?.enabled ?? false;
  }

  /**
   * Check if steering is enabled for a domain
   */
  isSteeringEnabled(domainId: string): boolean {
    if (!this.config.enabled || !this.config.steeringEnabled) return false;

    const domainConfig = this.getDomainConfig(domainId);
    return domainConfig?.steeringConfig?.enabled ?? true;
  }

  /**
   * Get extraction configuration for a domain
   */
  getExtractionConfig(domainId: string): NonNullable<DomainConfigItem['extractionConfig']> {
    const domainConfig = this.getDomainConfig(domainId);
    return {
      confidenceThreshold: 0.5,
      maxTokens: 500,
      temperature: 0.3,
      ...domainConfig?.extractionConfig,
    };
  }

  /**
   * Reload configuration from file
   */
  reloadConfig(): void {
    this.config = this.loadConfig();
    logger.info('Domain configuration reloaded');
  }
}

// Export singleton instance
export const domainConfig = DomainConfigManager.getInstance();
