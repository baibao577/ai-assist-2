// Logger Service - Pino-based structured logging
import pino from 'pino';
import { config } from '@/config/index.js';

// Map our log levels to Pino levels
const logLevelMap: Record<string, pino.Level> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
};

// Determine if we should use pretty printing
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create Pino logger instance
export const logger = pino({
  level: logLevelMap[config.logging.level] || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined, // Use default JSON transport in production
  base: {
    env: process.env.NODE_ENV || 'development',
  },
});

// Export convenience methods for common use cases
export default logger;
