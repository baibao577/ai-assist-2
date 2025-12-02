// Performance Monitoring for Domain Framework
import { logger } from '@/core/logger.js';

interface PerformanceMetrics {
  domainId: string;
  operation: 'extraction' | 'steering' | 'storage';
  duration: number;
  success: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface DomainStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  lastOperation?: Date;
}

/**
 * Performance monitor for domain operations
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private maxMetricsSize = 1000; // Keep last 1000 metrics in memory

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Track a domain operation
   */
  async trackOperation<T>(
    domainId: string,
    operation: 'extraction' | 'steering' | 'storage',
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let result: T;

    try {
      result = await fn();
      success = true;
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - startTime;

      const metric: PerformanceMetrics = {
        domainId,
        operation,
        duration,
        success,
        timestamp: new Date(),
        metadata,
      };

      this.addMetric(metric);

      // Log slow operations
      if (duration > 1000) {
        logger.warn(
          {
            domainId,
            operation,
            duration,
            metadata,
          },
          'Slow domain operation detected'
        );
      }
    }
  }

  /**
   * Add a metric to the collection
   */
  private addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Trim metrics if exceeding max size
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics = this.metrics.slice(-this.maxMetricsSize);
    }
  }

  /**
   * Get statistics for a specific domain
   */
  getDomainStats(domainId: string, operation?: string): DomainStats {
    const relevantMetrics = this.metrics.filter(
      (m) => m.domainId === domainId && (!operation || m.operation === operation)
    );

    if (relevantMetrics.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
      };
    }

    const successfulMetrics = relevantMetrics.filter((m) => m.success);
    const failedMetrics = relevantMetrics.filter((m) => !m.success);

    const durations = successfulMetrics.map((m) => m.duration);
    const avgDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      totalOperations: relevantMetrics.length,
      successfulOperations: successfulMetrics.length,
      failedOperations: failedMetrics.length,
      averageDuration: Math.round(avgDuration),
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      lastOperation: relevantMetrics[relevantMetrics.length - 1]?.timestamp,
    };
  }

  /**
   * Get overall system statistics
   */
  getOverallStats(): Record<string, DomainStats> {
    const domainIds = new Set(this.metrics.map((m) => m.domainId));
    const stats: Record<string, DomainStats> = {};

    for (const domainId of domainIds) {
      stats[domainId] = this.getDomainStats(domainId);
    }

    return stats;
  }

  /**
   * Get recent slow operations
   */
  getSlowOperations(thresholdMs = 1000, limit = 10): PerformanceMetrics[] {
    return this.metrics
      .filter((m) => m.duration > thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get recent failures
   */
  getRecentFailures(limit = 10): PerformanceMetrics[] {
    return this.metrics
      .filter((m) => !m.success)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    logger.info('Performance metrics cleared');
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const stats = this.getOverallStats();
    const slowOps = this.getSlowOperations();
    const failures = this.getRecentFailures(5);

    let report = '📊 Domain Performance Report\n';
    report += '='.repeat(60) + '\n\n';

    // Overall stats
    report += '📈 Domain Statistics:\n';
    for (const [domainId, stat] of Object.entries(stats)) {
      const successRate =
        stat.totalOperations > 0
          ? ((stat.successfulOperations / stat.totalOperations) * 100).toFixed(1)
          : '0.0';

      report += `\n${domainId}:\n`;
      report += `  Total Operations: ${stat.totalOperations}\n`;
      report += `  Success Rate: ${successRate}%\n`;
      report += `  Avg Duration: ${stat.averageDuration}ms\n`;
      report += `  Min/Max: ${stat.minDuration}ms / ${stat.maxDuration}ms\n`;
      if (stat.lastOperation) {
        report += `  Last Operation: ${stat.lastOperation.toISOString()}\n`;
      }
    }

    // Slow operations
    if (slowOps.length > 0) {
      report += '\n⚠️  Slow Operations:\n';
      for (const op of slowOps.slice(0, 5)) {
        report += `  - ${op.domainId}/${op.operation}: ${op.duration}ms\n`;
      }
    }

    // Recent failures
    if (failures.length > 0) {
      report += '\n❌ Recent Failures:\n';
      for (const failure of failures) {
        report += `  - ${failure.domainId}/${failure.operation} at ${failure.timestamp.toISOString()}\n`;
      }
    }

    report += '\n' + '='.repeat(60);
    return report;
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();
