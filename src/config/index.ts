// Configuration management
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import type { AppConfig } from '@/types/index.js';

// Load environment variables
loadEnv();

// Environment variable schema
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  DATABASE_PATH: z.string().default('./data/assistant.db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),
  LLM_MODEL: z.string().default('gpt-4o'),
  LLM_MAX_TOKENS: z.string().default('4096'),
  LLM_TEMPERATURE: z.string().default('0.7'),
  LLM_TIMEOUT: z.string().default('30000'),
  CONTEXT_MESSAGE_LIMIT: z.string().default('10'),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

// Export typed configuration
export const config: AppConfig = {
  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.LLM_MODEL,
    maxTokens: parseInt(env.LLM_MAX_TOKENS, 10),
    temperature: parseFloat(env.LLM_TEMPERATURE),
    timeout: parseInt(env.LLM_TIMEOUT, 10),
  },
  database: {
    path: env.DATABASE_PATH,
  },
  logging: {
    level: env.LOG_LEVEL,
    filePath: env.LOG_FILE_PATH,
  },
  context: {
    messageLimit: parseInt(env.CONTEXT_MESSAGE_LIMIT, 10),
  },
};

export default config;
