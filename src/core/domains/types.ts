// Domain Framework Types
import { z } from 'zod';

/**
 * Core domain definition that describes a domain's capabilities and configuration
 */
export interface DomainDefinition {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  capabilities: DomainCapabilities;
  config: DomainConfig;
}

/**
 * What a domain can do
 */
export interface DomainCapabilities {
  extraction: boolean;
  steering: boolean;
  summarization: boolean;
}

/**
 * Domain configuration
 */
export interface DomainConfig {
  extractionSchema: z.ZodSchema;
  steeringStrategy: SteeringConfig;
  storageConfig: StorageConfig;
}

/**
 * Data extracted from a message for a specific domain
 */
export interface ExtractedData {
  domainId: string;
  timestamp: Date;
  data: any;
  confidence: number;
}

/**
 * Hints for steering the conversation
 */
export interface SteeringHints {
  type: string;
  suggestions: string[];
  context: any;
  priority: number;
}

/**
 * Context provided to extractors
 */
export interface ExtractionContext {
  recentMessages: Array<{ role: string; content: string }>;
  domainContext: any;
}

/**
 * Configuration for steering strategies
 */
export interface SteeringConfig {
  triggers: string[];
  maxSuggestionsPerTurn: number;
}

/**
 * Storage configuration for domain data
 */
export interface StorageConfig {
  type: 'timeseries' | 'document' | 'relational';
  table: string;
  retention?: string;
}

/**
 * Domain-specific context maintained across conversations
 */
export interface DomainContext {
  lastExtraction?: Date;
  extractionCount: number;
  active: boolean;
  [key: string]: any;
}
