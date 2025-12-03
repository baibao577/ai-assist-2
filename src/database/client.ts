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

  // Create conversation_states table (MVP v2)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversation_states (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      context_elements TEXT NOT NULL,
      goals TEXT NOT NULL,
      last_activity_at INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for conversation_states
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_states_conversation
    ON conversation_states(conversation_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_states_created
    ON conversation_states(created_at DESC);
  `);

  // Create domain_data table for generic domain storage (MVP v3 - Domains Framework)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS domain_data (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      domain_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      data TEXT NOT NULL,
      confidence REAL DEFAULT 0.8,
      extracted_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for domain_data
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_domain_data_domain
    ON domain_data(domain_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_domain_data_user
    ON domain_data(user_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_domain_data_conversation
    ON domain_data(conversation_id);
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_domain_data_extracted
    ON domain_data(extracted_at DESC);
  `);

  // Create goals table (MVP v4 - Track Progress)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      target_value REAL,
      current_value REAL DEFAULT 0,
      baseline_value REAL,
      unit TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      target_date INTEGER,
      completed_at INTEGER,
      last_progress_at INTEGER,
      metadata TEXT
    );
  `);

  // Create progress_entries table (MVP v4 - Track Progress)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS progress_entries (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      goal_id TEXT NOT NULL,
      value REAL NOT NULL,
      notes TEXT,
      logged_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      source TEXT DEFAULT 'manual',
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      metadata TEXT,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );
  `);

  // Create goal_milestones table (MVP v4 - Track Progress)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS goal_milestones (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      target_value REAL NOT NULL,
      sequence INTEGER NOT NULL,
      achieved INTEGER DEFAULT 0,
      achieved_at INTEGER,
      metadata TEXT,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for Track Progress tables
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goals_category ON goals(category);
    CREATE INDEX IF NOT EXISTS idx_progress_goal ON progress_entries(goal_id);
    CREATE INDEX IF NOT EXISTS idx_progress_logged ON progress_entries(logged_at);
    CREATE INDEX IF NOT EXISTS idx_milestones_goal ON goal_milestones(goal_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_sequence ON goal_milestones(sequence);
  `);

  logger.info('Database schema initialized (MVP v4 - Track Progress)');
}

export default getDatabase;
