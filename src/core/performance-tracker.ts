/**
 * Lightweight Performance Tracking Service
 *
 * Provides span-based performance tracking for identifying bottlenecks
 * in LLM calls and processing stages without external dependencies.
 */

import { logger } from './logger.js';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// ============================================================================
// Types
// ============================================================================

export interface Span {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  parentId?: string;
  attributes?: Record<string, any>;
  children: string[];
}

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, any>;
}

export interface PerformanceReport {
  totalDuration: number;
  spans: Span[];
  metrics: Record<string, Metric[]>;
  bottlenecks: BottleneckInfo[];
  breakdown: StageBreakdown[];
}

export interface BottleneckInfo {
  name: string;
  duration: number;
  percentage: number;
  type: 'sequential' | 'parallel';
}

export interface StageBreakdown {
  name: string;
  duration: number;
  percentage: number;
  children?: StageBreakdown[];
  isParallel?: boolean;
}

// ============================================================================
// Performance Tracker Implementation
// ============================================================================

export class PerformanceTracker {
  private spans: Map<string, Span> = new Map();
  private metrics: Map<string, Metric[]> = new Map();
  private spanCounter = 0;
  private rootSpanId?: string;
  private enabled: boolean;
  private perfLogger: pino.Logger;

  constructor(enabled = true) {
    this.enabled = enabled;

    // Create a separate logger for performance metrics
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.perfLogger = pino({
      level: 'info',
      transport: {
        targets: [
          {
            target: 'pino/file',
            options: {
              destination: path.join(logsDir, 'performance.log'),
              mkdir: true,
            },
          },
        ],
      },
    });
  }

  /**
   * Start a new span for tracking an operation
   */
  startSpan(name: string, parentId?: string): string {
    if (!this.enabled) return '';

    const spanId = `span_${++this.spanCounter}_${Date.now()}`;

    const span: Span = {
      id: spanId,
      name,
      startTime: Date.now(),
      parentId,
      children: [],
      attributes: {},
    };

    this.spans.set(spanId, span);

    // Track root span
    if (!parentId && !this.rootSpanId) {
      this.rootSpanId = spanId;
    }

    // Add to parent's children
    if (parentId) {
      const parent = this.spans.get(parentId);
      if (parent) {
        parent.children.push(spanId);
      }
    }

    logger.debug(
      { spanId, name, parentId },
      `Performance: Started span ${name}`
    );

    return spanId;
  }

  /**
   * End a span and calculate its duration
   */
  endSpan(spanId: string, attributes?: Record<string, any>): void {
    if (!this.enabled || !spanId) return;

    const span = this.spans.get(spanId);
    if (!span) {
      logger.warn({ spanId }, 'Performance: Attempted to end non-existent span');
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    logger.debug(
      {
        spanId,
        name: span.name,
        duration: span.duration,
        attributes: span.attributes
      },
      `Performance: Ended span ${span.name} (${span.duration}ms)`
    );

    // Record as metric for aggregation
    this.recordMetric(`span.${span.name}`, span.duration, {
      spanId,
      ...span.attributes,
    });
  }

  /**
   * Set attributes on an existing span
   */
  setSpanAttributes(spanId: string, attributes: Record<string, any>): void {
    if (!this.enabled || !spanId) return;

    const span = this.spans.get(spanId);
    if (span) {
      span.attributes = { ...span.attributes, ...attributes };
    }
  }

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, tags?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(metric);

    logger.debug(
      { name, value, tags },
      `Performance: Recorded metric ${name}=${value}`
    );
  }

  /**
   * Generate a performance report
   */
  getReport(): PerformanceReport {
    if (!this.rootSpanId) {
      return {
        totalDuration: 0,
        spans: [],
        metrics: {},
        bottlenecks: [],
        breakdown: [],
      };
    }

    const rootSpan = this.spans.get(this.rootSpanId);
    if (!rootSpan || !rootSpan.duration) {
      return {
        totalDuration: 0,
        spans: Array.from(this.spans.values()),
        metrics: Object.fromEntries(this.metrics),
        bottlenecks: [],
        breakdown: [],
      };
    }

    const totalDuration = rootSpan.duration;
    const breakdown = this.buildBreakdown(this.rootSpanId);
    const bottlenecks = this.identifyBottlenecks(totalDuration);

    return {
      totalDuration,
      spans: Array.from(this.spans.values()),
      metrics: Object.fromEntries(this.metrics),
      bottlenecks,
      breakdown,
    };
  }

  /**
   * Build hierarchical breakdown of stages
   */
  private buildBreakdown(spanId: string): StageBreakdown[] {
    const span = this.spans.get(spanId);
    if (!span) return [];

    const breakdown: StageBreakdown[] = [];

    // Group children by start time to detect parallel operations
    const childGroups = this.groupParallelSpans(span.children);

    for (const group of childGroups) {
      if (group.length === 1) {
        // Sequential operation
        const childSpan = this.spans.get(group[0]);
        if (childSpan && childSpan.duration) {
          const childBreakdown = this.buildBreakdown(group[0]);
          breakdown.push({
            name: childSpan.name,
            duration: childSpan.duration,
            percentage: (childSpan.duration / (span.duration || 1)) * 100,
            children: childBreakdown.length > 0 ? childBreakdown : undefined,
          });
        }
      } else {
        // Parallel operations
        const parallelSpans = group
          .map(id => this.spans.get(id))
          .filter(s => s && s.duration) as Span[];

        if (parallelSpans.length > 0) {
          const maxDuration = Math.max(...parallelSpans.map(s => s.duration!));
          const parallelBreakdown: StageBreakdown = {
            name: `Parallel: ${parallelSpans.map(s => s.name).join(', ')}`,
            duration: maxDuration,
            percentage: (maxDuration / (span.duration || 1)) * 100,
            isParallel: true,
            children: parallelSpans.map(s => ({
              name: s.name,
              duration: s.duration!,
              percentage: (s.duration! / maxDuration) * 100,
              children: this.buildBreakdown(s.id),
            })),
          };
          breakdown.push(parallelBreakdown);
        }
      }
    }

    return breakdown;
  }

  /**
   * Group spans that started close together (likely parallel)
   */
  private groupParallelSpans(spanIds: string[]): string[][] {
    if (spanIds.length === 0) return [];

    const spans = spanIds
      .map(id => ({ id, span: this.spans.get(id) }))
      .filter(s => s.span)
      .sort((a, b) => a.span!.startTime - b.span!.startTime);

    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let groupStartTime = 0;

    for (const { id, span } of spans) {
      if (currentGroup.length === 0) {
        currentGroup.push(id);
        groupStartTime = span!.startTime;
      } else {
        // If started within 50ms, consider parallel
        if (span!.startTime - groupStartTime < 50) {
          currentGroup.push(id);
        } else {
          groups.push(currentGroup);
          currentGroup = [id];
          groupStartTime = span!.startTime;
        }
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(totalDuration: number): BottleneckInfo[] {
    const bottlenecks: BottleneckInfo[] = [];
    const threshold = totalDuration * 0.1; // Consider >10% as potential bottleneck

    for (const span of this.spans.values()) {
      if (span.duration && span.duration > threshold) {
        bottlenecks.push({
          name: span.name,
          duration: span.duration,
          percentage: (span.duration / totalDuration) * 100,
          type: span.children.length > 1 ? 'parallel' : 'sequential',
        });
      }
    }

    // Sort by duration descending
    bottlenecks.sort((a, b) => b.duration - a.duration);

    // Return top 5 bottlenecks
    return bottlenecks.slice(0, 5);
  }

  /**
   * Log performance report to dedicated performance.log file
   */
  logReport(): void {
    if (!this.enabled) return;

    const report = this.getReport();
    const textReport = this.formatReportAsText();

    // Log structured report to performance.log
    this.perfLogger.info({
      type: 'PERFORMANCE_REPORT',
      totalDuration: report.totalDuration,
      bottlenecks: report.bottlenecks,
      breakdown: report.breakdown,
      metrics: Object.fromEntries(
        Array.from(this.metrics.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            avg: values.reduce((sum, m) => sum + m.value, 0) / values.length,
            min: Math.min(...values.map(m => m.value)),
            max: Math.max(...values.map(m => m.value)),
          },
        ])
      ),
    });

    // Also log human-readable report
    this.perfLogger.info({
      type: 'PERFORMANCE_REPORT_TEXT',
      report: textReport,
    });

    // Print to console if enabled
    if (process.env.PERF_CONSOLE === 'true') {
      // Use chalk for colored output in development
      if (process.env.NODE_ENV === 'development') {
        console.log('\n' + chalk.cyan('═'.repeat(50)));
        console.log(chalk.yellow(textReport));
        console.log(chalk.cyan('═'.repeat(50)) + '\n');
      } else {
        console.log('\n' + textReport);
      }
    }
  }

  /**
   * Format report as text for CLI output
   */
  formatReportAsText(): string {
    const report = this.getReport();

    if (report.totalDuration === 0) {
      return 'No performance data available';
    }

    let output = '\n=== Performance Report ===\n';
    output += `Total: ${report.totalDuration}ms\n\n`;

    // Breakdown
    if (report.breakdown.length > 0) {
      output += 'Pipeline Breakdown:\n';
      output += this.formatBreakdown(report.breakdown, '');
      output += '\n';
    }

    // Bottlenecks
    if (report.bottlenecks.length > 0) {
      output += 'Bottlenecks Identified:\n';
      report.bottlenecks.forEach((b, i) => {
        output += `${i + 1}. ${b.name} (${b.duration}ms) - ${b.percentage.toFixed(1)}% of total\n`;
      });
      output += '\n';
    }

    // LLM metrics
    const llmMetrics = Array.from(this.metrics.entries())
      .filter(([name]) => name.includes('llm') || name.includes('openai'));

    if (llmMetrics.length > 0) {
      output += 'LLM Call Details:\n';
      let totalLLMCalls = 0;
      let totalLLMDuration = 0;

      llmMetrics.forEach(([_name, metrics]) => {
        totalLLMCalls += metrics.length;
        totalLLMDuration += metrics.reduce((sum, m) => sum + m.value, 0);
      });

      output += `- Total calls: ${totalLLMCalls}\n`;
      if (totalLLMCalls > 0) {
        output += `- Avg response time: ${Math.round(totalLLMDuration / totalLLMCalls)}ms\n`;
      }
    }

    return output;
  }

  /**
   * Format breakdown tree
   */
  private formatBreakdown(breakdown: StageBreakdown[], indent: string): string {
    let output = '';

    breakdown.forEach((stage, index) => {
      const isLast = index === breakdown.length - 1;
      const connector = isLast ? '└─' : '├─';
      const extension = isLast ? '   ' : '│  ';

      output += `${indent}${connector} ${stage.name}: ${stage.duration}ms (${stage.percentage.toFixed(1)}%)`;

      if (stage.isParallel) {
        output += ' [parallel]';
      }

      output += '\n';

      if (stage.children && stage.children.length > 0) {
        output += this.formatBreakdown(stage.children, indent + extension);
      }
    });

    return output;
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.spans.clear();
    this.metrics.clear();
    this.spanCounter = 0;
    this.rootSpanId = undefined;

    logger.debug('Performance: Tracker reset');
  }

  /**
   * Enable or disable tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

// Create singleton instance
// Enable based on environment variable
const isEnabled = process.env.PERF_TRACKING === 'true' ||
                  process.env.NODE_ENV === 'development';

export const performanceTracker = new PerformanceTracker(isEnabled);