// Time Series Storage - Storage implementation for time-series domain data
import { getDatabase } from '@/database/client.js';
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
      // @ts-ignore - SQLite uses different types
      const sqlite = db.session.client;

      const confidence = (data as any).confidence || 0.8;
      const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp for SQLite

      const stmt = sqlite.prepare(`
        INSERT INTO domain_data (
          domain_id,
          user_id,
          conversation_id,
          data,
          confidence,
          extracted_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        this.domainId,
        data.userId,
        data.conversationId,
        JSON.stringify(data),
        confidence,
        timestamp
      );

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
   * Query stored data with filters
   */
  async query(filters: QueryFilters): Promise<T[]> {
    try {
      const db = getDatabase();
      // @ts-ignore - SQLite uses different types
      const sqlite = db.session.client;

      let query = `
        SELECT data
        FROM domain_data
        WHERE domain_id = ?
      `;
      const params: any[] = [this.domainId];

      // Add filters
      if (filters.userId) {
        query += ` AND user_id = ?`;
        params.push(filters.userId);
      }

      if (filters.conversationId) {
        query += ` AND conversation_id = ?`;
        params.push(filters.conversationId);
      }

      if (filters.startDate) {
        query += ` AND extracted_at >= ?`;
        params.push(Math.floor(filters.startDate.getTime() / 1000));
      }

      if (filters.endDate) {
        query += ` AND extracted_at <= ?`;
        params.push(Math.floor(filters.endDate.getTime() / 1000));
      }

      // Add ordering and limit
      query += ` ORDER BY extracted_at DESC`;

      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }

      if (filters.offset) {
        query += ` OFFSET ?`;
        params.push(filters.offset);
      }

      const stmt = sqlite.prepare(query);
      const result = stmt.all(...params);

      return result.map((row: any) => JSON.parse(row.data) as T);
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
      // @ts-ignore - SQLite uses different types
      const sqlite = db.session.client;

      // Simplified aggregation for SQLite
      // Domain-specific implementations will override this
      const query = `
        SELECT
          date(extracted_at, 'unixepoch') as period,
          COUNT(*) as count
        FROM domain_data
        WHERE domain_id = ?
          AND user_id = ?
          AND extracted_at >= ?
          AND extracted_at <= ?
        GROUP BY period
        ORDER BY period DESC
      `;

      const startDate = config.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = config.endDate || new Date();

      const stmt = sqlite.prepare(query);
      const result = stmt.all(
        this.domainId,
        config.userId,
        Math.floor(startDate.getTime() / 1000),
        Math.floor(endDate.getTime() / 1000)
      );

      return {
        periods: result,
        total: result.reduce((sum: number, row: any) => sum + row.count, 0),
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
      // @ts-ignore - SQLite uses different types
      const sqlite = db.session.client;

      const stmt = sqlite.prepare('DELETE FROM domain_data WHERE id = ? AND domain_id = ?');
      stmt.run(id, this.domainId);
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
      // @ts-ignore - SQLite uses different types
      const sqlite = db.session.client;

      let query = 'DELETE FROM domain_data WHERE domain_id = ?';
      const params: any[] = [this.domainId];

      if (filters.userId) {
        query += ` AND user_id = ?`;
        params.push(filters.userId);
      }

      if (filters.conversationId) {
        query += ` AND conversation_id = ?`;
        params.push(filters.conversationId);
      }

      const stmt = sqlite.prepare(query);
      const result = stmt.run(...params);
      return result.changes || 0;
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
      // @ts-ignore - SQLite uses different types
      const sqlite = db.session.client;

      let query = 'SELECT COUNT(*) as count FROM domain_data WHERE domain_id = ?';
      const params: any[] = [this.domainId];

      if (filters.userId) {
        query += ` AND user_id = ?`;
        params.push(filters.userId);
      }

      if (filters.conversationId) {
        query += ` AND conversation_id = ?`;
        params.push(filters.conversationId);
      }

      const stmt = sqlite.prepare(query);
      const result = stmt.get(...params) as { count: number };
      return result.count;
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