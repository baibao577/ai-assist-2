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
  // Separate log levels for console and file
  CONSOLE_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'silent']).default('error'),
  FILE_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('debug'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),
  LLM_MODEL: z.string().default('gpt-4o'),
  LLM_CLASSIFIER_MODEL: z.string().optional(), // Model for classifiers, falls back to LLM_MODEL
  LLM_EXTRACTOR_MODEL: z.string().optional(), // Model for extractors, falls back to LLM_MODEL
  LLM_MAX_TOKENS: z.string().default('4096'),
  LLM_TEMPERATURE: z.string().default('0.7'),
  LLM_TIMEOUT: z.string().default('30000'),
  CONTEXT_MESSAGE_LIMIT: z.string().default('10'),
  LLM_VERBOSE_LOGGING: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  // Domain History Configuration
  DOMAIN_HISTORY_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((val) => val === 'true'),
  DOMAIN_HISTORY_DAYS: z.string().default('7'),
  DOMAIN_HISTORY_LIMIT: z.string().default('10'),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

// Export typed configuration
export const config: AppConfig = {
  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.LLM_MODEL,
    classifierModel: env.LLM_CLASSIFIER_MODEL || env.LLM_MODEL, // Falls back to LLM_MODEL if not set
    extractorModel: env.LLM_EXTRACTOR_MODEL || env.LLM_MODEL, // Falls back to LLM_MODEL if not set
    maxTokens: parseInt(env.LLM_MAX_TOKENS, 10),
    temperature: parseFloat(env.LLM_TEMPERATURE),
    timeout: parseInt(env.LLM_TIMEOUT, 10),
  },
  database: {
    path: env.DATABASE_PATH,
  },
  logging: {
    consoleLevel: env.CONSOLE_LOG_LEVEL,
    fileLevel: env.FILE_LOG_LEVEL,
    filePath: env.LOG_FILE_PATH,
    llmVerbose: env.LLM_VERBOSE_LOGGING || false,
  },
  context: {
    messageLimit: parseInt(env.CONTEXT_MESSAGE_LIMIT, 10),
  },
  domainHistory: {
    enabled: env.DOMAIN_HISTORY_ENABLED,
    days: parseInt(env.DOMAIN_HISTORY_DAYS, 10),
    limit: parseInt(env.DOMAIN_HISTORY_LIMIT, 10),
  },
};

export default config;
