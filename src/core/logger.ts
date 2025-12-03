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

// Create file destination for logs
const logFilePath = config.logging.filePath;

// Create Pino logger instance with multistream (console + file)
export const logger = pino(
  {
    level: logLevelMap[config.logging.level] || 'info',
    base: {
      env: process.env.NODE_ENV || 'development',
    },
  },
  pino.multistream([
    // Stream 1: Pretty console output in development
    {
      level: logLevelMap[config.logging.level] || 'info',
      stream: isDevelopment
        ? pino.transport({
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
              singleLine: false,
            },
          })
        : process.stdout,
    },
    // Stream 2: File output (JSON format for parsing)
    {
      level: logLevelMap[config.logging.level] || 'info',
      stream: pino.destination({
        dest: logFilePath,
        sync: true, // Use sync writes to avoid "not ready yet" errors on exit
        mkdir: true, // Create directory if not exists
      }),
    },
  ])
);

// Export convenience methods for common use cases
export default logger;
