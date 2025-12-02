// Domain Storage - Interfaces and types for domain data storage

/**
 * Query filters for retrieving domain data
 */
export interface QueryFilters {
  userId?: string;
  conversationId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  [key: string]: any; // Allow domain-specific filters
}

/**
 * Configuration for data aggregation
 */
export interface AggregationConfig {
  userId?: string;
  groupBy?: string;
  metrics?: string[];
  interval?: 'hour' | 'day' | 'week' | 'month';
  startDate?: Date;
  endDate?: Date;
}

/**
 * Result of an aggregation query
 */
export interface AggregationResult {
  [key: string]: any;
}

/**
 * Generic interface for domain data storage
 * Implementations can use different storage backends
 */
export interface DomainStorage<T> {
  /**
   * Store domain data
   * @param data - Data to store (must include userId and conversationId)
   */
  store(data: T & { userId: string; conversationId: string }): Promise<void>;

  /**
   * Query stored data with filters
   * @param filters - Query filters
   * @returns Array of matching records
   */
  query(filters: QueryFilters): Promise<T[]>;

  /**
   * Aggregate data for analysis
   * @param config - Aggregation configuration
   * @returns Aggregated results
   */
  aggregate(config: AggregationConfig): Promise<AggregationResult>;

  /**
   * Delete a specific record
   * @param id - Record ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete all records matching filters
   * @param filters - Query filters
   * @returns Number of deleted records
   */
  deleteMany?(filters: QueryFilters): Promise<number>;

  /**
   * Get count of records matching filters
   * @param filters - Query filters
   * @returns Count of matching records
   */
  count?(filters: QueryFilters): Promise<number>;
}