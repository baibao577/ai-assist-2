// Logger Service - Pino-based structured logging
import pino from 'pino';
import { config } from '@/config/index.js';

// Map our log levels to Pino levels (silent is handled specially)
const logLevelMap: Record<string, pino.Level | 'silent'> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  silent: 'silent' as any, // Pino supports silent but TypeScript types don't include it
};

// Determine if we should use pretty printing
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create file destination for logs
const logFilePath = config.logging.filePath;

// Create Pino logger instance with multistream (console + file)
export const logger = pino(
  {
    level: 'debug', // Set base level to most verbose (will be filtered by streams)
    base: {
      env: process.env.NODE_ENV || 'development',
    },
  },
  pino.multistream([
    // Stream 1: Console output (respects consoleLevel)
    {
      level: logLevelMap[config.logging.consoleLevel] as pino.Level,
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
    // Stream 2: File output (respects fileLevel)
    {
      level: logLevelMap[config.logging.fileLevel] as pino.Level,
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
