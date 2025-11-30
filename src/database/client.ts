// Database client setup
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/database/schema.js';
import { config } from '@/config/index.js';
import { logger } from '@/core/logger.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

let db: BetterSQLite3Database<typeof schema> | null = null;

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    // Ensure data directory exists
    const dbPath = config.database.path;
    const dbDir = dirname(dbPath);

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Create SQLite connection
    const sqlite = new Database(dbPath);

    // Enable WAL mode for better concurrency
    sqlite.pragma('journal_mode = WAL');

    // Create Drizzle instance
    db = drizzle(sqlite, { schema });

    logger.info({ dbPath }, 'Database connected');
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    // Close the underlying SQLite connection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sqlite = (db as any).session.client as Database.Database;
    sqlite.close();
    db = null;
    logger.info('Database closed');
  }
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  const database = getDatabase();

  // For MVP v1, we'll create tables directly instead of using migrations
  // This simplifies the initial setup

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlite = (database as any).session.client as Database.Database;

  // Create conversations table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Create messages table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for performance
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp
    ON messages(timestamp);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user
    ON conversations(user_id);
  `);

  logger.info('Database schema initialized');
}

export default getDatabase;
