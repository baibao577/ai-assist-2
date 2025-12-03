// Time Series Storage - Storage implementation for time-series domain data
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { getDatabase } from '@/database/client.js';
import { domainData } from '@/database/schema.js';
import { logger } from '@/core/logger.js';
import type { StorageConfig } from '../types.js';
import type {
  DomainStorage,
  QueryFilters,
  AggregationConfig,
  AggregationResult,
} from './DomainStorage.js';

/**
 * Time-series storage implementation using PostgreSQL
 * Suitable for domains that track data over time (health, finance, etc.)
 */
export class TimeSeriesStorage<T> implements DomainStorage<T> {
  private domainId: string;
  private tableName: string;
  private retention?: string;

  constructor(domainId: string, config: StorageConfig) {
    this.domainId = domainId;
    this.tableName = config.table;
    this.retention = config.retention;

    logger.debug(
      {
        domainId,
        table: this.tableName,
        retention: this.retention,
      },
      'TimeSeriesStorage initialized'
    );
  }

  /**
   * Store domain data with timestamp
   */
  async store(data: T & { userId: string; conversationId: string }): Promise<void> {
    try {
      const db = getDatabase();
      const confidence = (data as any).confidence || 0.8;

      await db.insert(domainData).values({
        domainId: this.domainId,
        userId: data.userId,
        conversationId: data.conversationId,
        data: data as any, // Will be JSON-stringified by Drizzle
        confidence,
        extractedAt: new Date(),
      });

      logger.debug(
        {
          domainId: this.domainId,
          userId: data.userId,
          conversationId: data.conversationId,
        },
        'Data stored successfully'
      );
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to store data'
      );
      throw error;
    }
  }

  /**
   * Load recent history for a conversation
   * Used to provide historical context to AI
   */
  async loadHistory(
    conversationId: string,
    userId: string,
    days: number = 7,
    limit: number = 10
  ): Promise<Array<{ data: T; confidence: number; extractedAt: Date }>> {
    try {
      const db = getDatabase();
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const results = await db
        .select({
          data: domainData.data,
          confidence: domainData.confidence,
          extractedAt: domainData.extractedAt,
        })
        .from(domainData)
        .where(
          and(
            eq(domainData.domainId, this.domainId),
            eq(domainData.conversationId, conversationId),
            eq(domainData.userId, userId),
            gte(domainData.extractedAt, cutoffDate)
          )
        )
        .orderBy(desc(domainData.extractedAt))
        .limit(limit);

      return results.map((row) => ({
        data: row.data as T,
        confidence: row.confidence ?? 0.8,
        extractedAt: row.extractedAt,
      }));
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to load domain history'
      );
      return [];
    }
  }

  /**
   * Query stored data with filters
   */
  async query(filters: QueryFilters): Promise<T[]> {
    try {
      const db = getDatabase();

      // Build where conditions
      const conditions = [eq(domainData.domainId, this.domainId)];

      if (filters.userId) {
        conditions.push(eq(domainData.userId, filters.userId));
      }

      if (filters.conversationId) {
        conditions.push(eq(domainData.conversationId, filters.conversationId));
      }

      if (filters.startDate) {
        conditions.push(gte(domainData.extractedAt, filters.startDate));
      }

      if (filters.endDate) {
        conditions.push(sql`${domainData.extractedAt} <= ${filters.endDate}`);
      }

      // Build and execute query
      let query = db
        .select({ data: domainData.data })
        .from(domainData)
        .where(and(...conditions))
        .orderBy(desc(domainData.extractedAt))
        .$dynamic();

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.offset(filters.offset);
      }

      const result = await query;

      return result.map((row) => row.data as T);
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to query data'
      );
      throw error;
    }
  }

  /**
   * Aggregate data for analysis
   */
  async aggregate(config: AggregationConfig): Promise<AggregationResult> {
    try {
      const db = getDatabase();

      const startDate = config.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = config.endDate || new Date();

      // Use raw SQL for aggregation as Drizzle's support for GROUP BY is limited in SQLite
      const result = await db.all(
        sql`
          SELECT
            date(extracted_at, 'unixepoch') as period,
            COUNT(*) as count
          FROM domain_data
          WHERE domain_id = ${this.domainId}
            AND user_id = ${config.userId}
            AND extracted_at >= ${startDate}
            AND extracted_at <= ${endDate}
          GROUP BY period
          ORDER BY period DESC
        `
      );

      return {
        periods: result,
        total: result.reduce((sum: number, row: any) => sum + (row.count as number), 0),
      };
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to aggregate data'
      );
      throw error;
    }
  }

  /**
   * Delete a specific record
   */
  async delete(id: string): Promise<void> {
    try {
      const db = getDatabase();

      await db
        .delete(domainData)
        .where(and(eq(domainData.id, id), eq(domainData.domainId, this.domainId)));
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          recordId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete record'
      );
      throw error;
    }
  }

  /**
   * Delete multiple records matching filters
   */
  async deleteMany(filters: QueryFilters): Promise<number> {
    try {
      const db = getDatabase();

      // Build where conditions
      const conditions = [eq(domainData.domainId, this.domainId)];

      if (filters.userId) {
        conditions.push(eq(domainData.userId, filters.userId));
      }

      if (filters.conversationId) {
        conditions.push(eq(domainData.conversationId, filters.conversationId));
      }

      // Execute delete
      await db.delete(domainData).where(and(...conditions));

      // Drizzle doesn't provide row count for deletes in SQLite, so we return 0
      // This is a limitation but keeps the code clean
      return 0;
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete records'
      );
      throw error;
    }
  }

  /**
   * Count records matching filters
   */
  async count(filters: QueryFilters): Promise<number> {
    try {
      const db = getDatabase();

      // Build where conditions
      const conditions = [eq(domainData.domainId, this.domainId)];

      if (filters.userId) {
        conditions.push(eq(domainData.userId, filters.userId));
      }

      if (filters.conversationId) {
        conditions.push(eq(domainData.conversationId, filters.conversationId));
      }

      // Get count using raw SQL as Drizzle doesn't have a count method for SQLite
      const result = await db.get(
        sql`
          SELECT COUNT(*) as count
          FROM domain_data
          WHERE ${and(...conditions)}
        `
      );

      return (result as any)?.count ?? 0;
    } catch (error) {
      logger.error(
        {
          domainId: this.domainId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to count records'
      );
      throw error;
    }
  }
}
