import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/assistant.db',
  },
  studio: {
    port: 5002,
  },
} satisfies Config;
