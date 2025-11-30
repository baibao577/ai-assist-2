# Deployment and Monitoring Plan

## Overview
Production deployment strategy with comprehensive monitoring, logging, and observability for the CLI-based AI assistant.

## Development to Production Pipeline

### 1. Environment Configuration
```typescript
// src/config/environments.ts
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

export interface EnvironmentConfig {
  name: Environment;
  database: DatabaseConfig;
  llm: LLMConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
  features: FeatureFlags;
}

// .env.development
DATABASE_PATH=./data/dev.db
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-haiku
LOG_LEVEL=debug
ENABLE_TRACING=true

// .env.production
DATABASE_PATH=/var/data/assistant.db
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-sonnet
LOG_LEVEL=info
ENABLE_TRACING=false
ENABLE_METRICS=true
```

### 2. Configuration Validation
```typescript
// src/config/validator.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  database: z.object({
    path: z.string(),
    maxConnections: z.number().min(1).max(100),
    busyTimeout: z.number().min(1000)
  }),
  llm: z.object({
    provider: z.enum(['anthropic', 'openai']),
    apiKey: z.string().min(1),
    model: z.string(),
    maxTokens: z.number().min(1).max(100000),
    temperature: z.number().min(0).max(2)
  }),
  features: z.object({
    enableFlows: z.boolean(),
    enableParallelClassification: z.boolean(),
    enableMetrics: z.boolean(),
    debugMode: z.boolean()
  })
});

export function validateConfig(config: unknown): void {
  try {
    ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
  }
}
```

## Logging System

### 1. Structured Logging
```typescript
// src/logging/logger.ts
import winston from 'winston';
import { LogEntry } from 'winston';

export class Logger {
  private winston: winston.Logger;

  constructor(config: LoggingConfig) {
    this.winston = winston.createLogger({
      level: config.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'ai-assistant',
        environment: config.environment,
        version: process.env.npm_package_version
      },
      transports: this.createTransports(config)
    });
  }

  private createTransports(config: LoggingConfig): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport
    if (config.console) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    // File transport
    if (config.file) {
      transports.push(new winston.transports.File({
        filename: config.file.path,
        maxsize: config.file.maxSize,
        maxFiles: config.file.maxFiles
      }));
    }

    // Error file transport
    transports.push(new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }));

    return transports;
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  error(message: string, error?: Error, meta?: any): void {
    this.winston.error(message, {
      ...meta,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }
}
```

### 2. Request Logging
```typescript
// src/logging/request-logger.ts
export class RequestLogger {
  private logger: Logger;

  logPipelineExecution(
    conversationId: string,
    messageId: string,
    stages: StageResult[]
  ): void {
    this.logger.info('Pipeline execution completed', {
      conversationId,
      messageId,
      totalDuration: stages.reduce((sum, s) => sum + s.duration, 0),
      stages: stages.map(s => ({
        name: s.name,
        duration: s.duration,
        success: s.success,
        error: s.error?.message
      }))
    });
  }

  logClassification(
    messageId: string,
    classifications: Map<string, ClassificationResult>
  ): void {
    this.logger.debug('Classification completed', {
      messageId,
      results: Array.from(classifications.entries()).map(([name, result]) => ({
        classifier: name,
        primaryClass: result.primaryClass,
        confidence: result.confidence
      }))
    });
  }

  logError(
    context: string,
    error: Error,
    metadata?: any
  ): void {
    this.logger.error(`Error in ${context}`, error, metadata);
  }
}
```

## Metrics Collection

### 1. Metrics System
```typescript
// src/monitoring/metrics.ts
export class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();

  // Counter metrics
  incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    const metric = this.metrics.get(key) || { type: 'counter', value: 0 };
    metric.value++;
    this.metrics.set(key, metric);
  }

  // Gauge metrics
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    this.metrics.set(key, { type: 'gauge', value });
  }

  // Histogram metrics
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.createKey(name, labels);
    const metric = this.metrics.get(key) || {
      type: 'histogram',
      values: [],
      sum: 0,
      count: 0
    };

    metric.values.push(value);
    metric.sum += value;
    metric.count++;
    this.metrics.set(key, metric);
  }

  // Export metrics
  export(): MetricExport[] {
    return Array.from(this.metrics.entries()).map(([key, metric]) => ({
      name: key,
      ...metric,
      timestamp: Date.now()
    }));
  }

  private createKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}
```

### 2. Application Metrics
```typescript
// src/monitoring/app-metrics.ts
export class ApplicationMetrics {
  private collector: MetricsCollector;

  // Pipeline metrics
  recordPipelineExecution(duration: number, success: boolean): void {
    this.collector.recordHistogram('pipeline_duration_ms', duration);
    this.collector.incrementCounter('pipeline_executions', {
      status: success ? 'success' : 'failure'
    });
  }

  recordStageExecution(stage: string, duration: number, success: boolean): void {
    this.collector.recordHistogram(`stage_duration_ms`, duration, { stage });
    this.collector.incrementCounter('stage_executions', {
      stage,
      status: success ? 'success' : 'failure'
    });
  }

  // Classification metrics
  recordClassification(
    classifier: string,
    duration: number,
    confidence: number
  ): void {
    this.collector.recordHistogram('classification_duration_ms', duration, {
      classifier
    });
    this.collector.recordHistogram('classification_confidence', confidence, {
      classifier
    });
  }

  // Database metrics
  recordDatabaseQuery(operation: string, duration: number): void {
    this.collector.recordHistogram('db_query_duration_ms', duration, {
      operation
    });
    this.collector.incrementCounter('db_queries', { operation });
  }

  // LLM metrics
  recordLLMCall(
    provider: string,
    model: string,
    tokens: number,
    duration: number
  ): void {
    this.collector.recordHistogram('llm_call_duration_ms', duration, {
      provider,
      model
    });
    this.collector.incrementCounter('llm_tokens_used', { provider, model });
    this.collector.setGauge('llm_tokens_total', tokens);
  }

  // System metrics
  recordMemoryUsage(): void {
    const usage = process.memoryUsage();
    this.collector.setGauge('memory_heap_used_bytes', usage.heapUsed);
    this.collector.setGauge('memory_heap_total_bytes', usage.heapTotal);
    this.collector.setGauge('memory_rss_bytes', usage.rss);
  }

  recordCPUUsage(): void {
    const usage = process.cpuUsage();
    this.collector.setGauge('cpu_user_microseconds', usage.user);
    this.collector.setGauge('cpu_system_microseconds', usage.system);
  }
}
```

## Health Checks

### 1. Health Check System
```typescript
// src/monitoring/health.ts
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

export interface HealthCheck {
  name: string;
  check(): Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
  metadata?: Record<string, any>;
}

export class HealthMonitor {
  private checks: HealthCheck[] = [];

  registerCheck(check: HealthCheck): void {
    this.checks.push(check);
  }

  async checkHealth(): Promise<OverallHealth> {
    const results = await Promise.all(
      this.checks.map(async (check) => {
        try {
          const result = await check.check();
          return {
            name: check.name,
            ...result,
            timestamp: new Date()
          };
        } catch (error) {
          return {
            name: check.name,
            status: HealthStatus.UNHEALTHY,
            message: error.message,
            timestamp: new Date()
          };
        }
      })
    );

    const overallStatus = this.determineOverallStatus(results);

    return {
      status: overallStatus,
      checks: results,
      timestamp: new Date()
    };
  }

  private determineOverallStatus(results: any[]): HealthStatus {
    if (results.every(r => r.status === HealthStatus.HEALTHY)) {
      return HealthStatus.HEALTHY;
    }
    if (results.some(r => r.status === HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }
    return HealthStatus.DEGRADED;
  }
}
```

### 2. Specific Health Checks
```typescript
// src/monitoring/checks/database-check.ts
export class DatabaseHealthCheck implements HealthCheck {
  name = 'database';

  async check(): Promise<HealthCheckResult> {
    try {
      const start = Date.now();
      await db.raw('SELECT 1');
      const duration = Date.now() - start;

      if (duration > 100) {
        return {
          status: HealthStatus.DEGRADED,
          message: 'Database response slow',
          metadata: { responseTime: duration }
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        metadata: { responseTime: duration }
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Database connection failed',
        metadata: { error: error.message }
      };
    }
  }
}

// src/monitoring/checks/llm-check.ts
export class LLMHealthCheck implements HealthCheck {
  name = 'llm';

  async check(): Promise<HealthCheckResult> {
    try {
      const start = Date.now();
      await llmService.ping();
      const duration = Date.now() - start;

      if (duration > 5000) {
        return {
          status: HealthStatus.DEGRADED,
          message: 'LLM API response slow',
          metadata: { responseTime: duration }
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        metadata: { responseTime: duration }
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'LLM API unavailable',
        metadata: { error: error.message }
      };
    }
  }
}

// src/monitoring/checks/memory-check.ts
export class MemoryHealthCheck implements HealthCheck {
  name = 'memory';

  async check(): Promise<HealthCheckResult> {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    if (heapUsedPercent > 90) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Memory usage critical',
        metadata: {
          heapUsedPercent,
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal
        }
      };
    }

    if (heapUsedPercent > 75) {
      return {
        status: HealthStatus.DEGRADED,
        message: 'Memory usage high',
        metadata: {
          heapUsedPercent,
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal
        }
      };
    }

    return {
      status: HealthStatus.HEALTHY,
      metadata: {
        heapUsedPercent,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal
      }
    };
  }
}
```

## Error Handling and Recovery

### 1. Global Error Handler
```typescript
// src/errors/handler.ts
export class GlobalErrorHandler {
  private logger: Logger;
  private metrics: ApplicationMetrics;

  handleError(error: Error, context?: ErrorContext): void {
    // Log error
    this.logger.error('Unhandled error', error, context);

    // Record metric
    this.metrics.incrementCounter('errors', {
      type: error.constructor.name,
      context: context?.operation
    });

    // Determine severity
    const severity = this.determineSeverity(error);

    // Take action based on severity
    switch (severity) {
      case 'critical':
        this.handleCriticalError(error, context);
        break;
      case 'high':
        this.handleHighError(error, context);
        break;
      case 'medium':
        this.handleMediumError(error, context);
        break;
      case 'low':
        // Just log, already done
        break;
    }
  }

  private handleCriticalError(error: Error, context?: ErrorContext): void {
    // Send alert
    this.sendAlert({
      level: 'critical',
      message: `Critical error: ${error.message}`,
      context
    });

    // Circuit breaker
    if (context?.service) {
      this.circuitBreaker.open(context.service);
    }

    // Graceful shutdown if necessary
    if (this.shouldShutdown(error)) {
      this.gracefulShutdown();
    }
  }

  private gracefulShutdown(): void {
    this.logger.info('Initiating graceful shutdown');

    // Stop accepting new requests
    // Complete in-flight requests
    // Close database connections
    // Flush metrics and logs

    setTimeout(() => {
      process.exit(1);
    }, 30000); // 30 second timeout
  }
}
```

### 2. Circuit Breaker
```typescript
// src/errors/circuit-breaker.ts
export class CircuitBreaker {
  private states: Map<string, CircuitState> = new Map();

  async execute<T>(
    service: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const state = this.getState(service);

    if (state.status === 'open') {
      if (Date.now() - state.openedAt > state.timeout) {
        state.status = 'half-open';
      } else {
        throw new Error(`Circuit breaker open for ${service}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess(service);
      return result;
    } catch (error) {
      this.onFailure(service);
      throw error;
    }
  }

  private onSuccess(service: string): void {
    const state = this.getState(service);
    state.failures = 0;
    if (state.status === 'half-open') {
      state.status = 'closed';
    }
  }

  private onFailure(service: string): void {
    const state = this.getState(service);
    state.failures++;

    if (state.failures >= state.threshold) {
      state.status = 'open';
      state.openedAt = Date.now();
    }
  }

  private getState(service: string): CircuitState {
    if (!this.states.has(service)) {
      this.states.set(service, {
        status: 'closed',
        failures: 0,
        threshold: 5,
        timeout: 60000,
        openedAt: 0
      });
    }
    return this.states.get(service)!;
  }
}
```

## Deployment Scripts

### 1. Build Script
```bash
#!/bin/bash
# scripts/build.sh

echo "Building AI Assistant..."

# Clean previous build
rm -rf dist/

# Type checking
echo "Running type checks..."
npx tsc --noEmit

# Linting
echo "Running linter..."
npm run lint

# Build
echo "Building application..."
npx tsc

# Copy assets
cp -r src/assets dist/

# Create version file
echo "{\"version\": \"$(git rev-parse --short HEAD)\", \"buildDate\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > dist/version.json

echo "Build complete!"
```

### 2. Deploy Script
```bash
#!/bin/bash
# scripts/deploy.sh

ENV=${1:-production}

echo "Deploying to $ENV..."

# Load environment
source .env.$ENV

# Run migrations
echo "Running database migrations..."
npm run db:migrate

# Health check
echo "Running health checks..."
npm run health:check

if [ $? -ne 0 ]; then
  echo "Health checks failed, aborting deployment"
  exit 1
fi

# Start application
echo "Starting application..."
pm2 start ecosystem.config.js --env $ENV

echo "Deployment complete!"
```

## Monitoring Dashboard

### 1. CLI Monitoring Commands
```typescript
// src/cli/commands/monitor.ts
export class MonitorCommand {
  constructor(program: Command) {
    const monitorCmd = program
      .command('monitor')
      .description('System monitoring commands');

    monitorCmd
      .command('health')
      .description('Check system health')
      .action(this.checkHealth.bind(this));

    monitorCmd
      .command('metrics')
      .description('View system metrics')
      .option('-p, --period <period>', 'Time period', '1h')
      .action(this.viewMetrics.bind(this));

    monitorCmd
      .command('logs')
      .description('View logs')
      .option('-l, --level <level>', 'Log level', 'info')
      .option('-n, --lines <n>', 'Number of lines', '100')
      .action(this.viewLogs.bind(this));

    monitorCmd
      .command('dashboard')
      .description('Open monitoring dashboard')
      .action(this.dashboard.bind(this));
  }

  private async checkHealth(): Promise<void> {
    const health = await healthMonitor.checkHealth();

    console.log(chalk.cyan('\n=== System Health ===\n'));
    console.log('Overall Status:', this.colorizeStatus(health.status));

    console.log('\nComponent Checks:');
    health.checks.forEach(check => {
      console.log(`  ${check.name}: ${this.colorizeStatus(check.status)}`);
      if (check.message) {
        console.log(`    ${chalk.gray(check.message)}`);
      }
    });
  }

  private async viewMetrics(): Promise<void> {
    const metrics = await metricsCollector.export();

    console.log(chalk.cyan('\n=== System Metrics ===\n'));

    // Group metrics by type
    const grouped = this.groupMetrics(metrics);

    // Display each group
    Object.entries(grouped).forEach(([type, metrics]) => {
      console.log(chalk.blue(`\n${type}:`));
      metrics.forEach(m => {
        console.log(`  ${m.name}: ${this.formatValue(m)}`);
      });
    });
  }

  private dashboard(): void {
    // Launch dashboard in browser
    const dashboardUrl = 'http://localhost:3000/dashboard';
    console.log(chalk.cyan(`Opening dashboard at ${dashboardUrl}`));
    open(dashboardUrl);
  }
}
```

## Implementation Timeline
1. **Week 1**: Environment configuration and validation
2. **Week 2**: Logging system implementation
3. **Week 3**: Metrics collection and export
4. **Week 4**: Health checks and monitoring
5. **Week 5**: Error handling and recovery
6. **Week 6**: Deployment scripts and dashboard