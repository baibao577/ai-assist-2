# Domain Framework Optimization Guide

This guide provides optimization strategies and best practices for the Domain-based Steering & Extraction Framework.

## Performance Optimizations

### 1. Parallel Processing

The framework leverages parallel processing at multiple levels:

#### Extraction Stage
```typescript
// Domains are processed in parallel
const extractionPromises = enabledDomains.map(async (domain) => {
  // Each domain extraction runs concurrently
  return extractor.extract(message, context);
});
const extractions = await Promise.all(extractionPromises);
```

#### Steering Stage
```typescript
// All strategies evaluated simultaneously
const hintPromises = activeStrategies.map((s) => s.generateHints(state));
const hints = await Promise.all(hintPromises);
```

### 2. Confidence Thresholds

Optimize extraction quality vs quantity:

```bash
# Configure per-domain thresholds
npm run cli domains --config

# Recommended settings:
# - High-precision needs: 0.7-0.9
# - Balanced: 0.5-0.7 (default)
# - High-recall needs: 0.3-0.5
```

### 3. Caching Strategies

#### Domain Configuration Caching
- Configurations cached in memory
- Auto-reload on file changes
- No repeated disk I/O

#### Extraction Result Caching
```typescript
// Results stored in state for reuse
state.extractions = {
  health: [/* previous extractions */],
  finance: [/* previous extractions */]
};
```

### 4. LLM Optimization

#### Token Usage
```typescript
// Configure max tokens per domain
extractionConfig: {
  maxTokens: 500,  // Limit response size
  temperature: 0.3, // Lower = more consistent
}
```

#### Prompt Engineering
- Structured JSON output reduces tokens
- Clear schema definitions improve accuracy
- Examples in prompts guide extraction

## Memory Management

### 1. State Pruning

Limit extraction history:
```typescript
// Keep only recent extractions
const MAX_EXTRACTIONS = 10;
if (extractions[domainId].length > MAX_EXTRACTIONS) {
  extractions[domainId] = extractions[domainId].slice(-MAX_EXTRACTIONS);
}
```

### 2. Storage Retention

Configure data retention policies:
```typescript
storageConfig: {
  type: 'timeseries',
  retention: '90d', // Auto-cleanup old data
}
```

### 3. Memory Monitoring

Use the performance monitor:
```typescript
import { performanceMonitor } from '@/core/domains/utils/PerformanceMonitor.js';

// Track operations
await performanceMonitor.trackOperation(
  'health',
  'extraction',
  async () => extractor.extract(message, context)
);

// Generate report
console.log(performanceMonitor.generateReport());
```

## Database Optimizations

### 1. Indexing

Ensure proper indexes exist:
```sql
-- Already created, but verify:
CREATE INDEX IF NOT EXISTS idx_domain_data_lookup
  ON domain_data(domain_id, user_id, conversation_id);

-- Add timestamp index for time-based queries
CREATE INDEX IF NOT EXISTS idx_domain_data_timestamp
  ON domain_data(domain_id, timestamp);
```

### 2. Query Optimization

Batch operations when possible:
```typescript
// Instead of multiple inserts
for (const data of dataArray) {
  await storage.store(data); // ❌ Slow
}

// Use batch insert
await storage.storeBatch(dataArray); // ✅ Fast
```

### 3. Connection Pooling

SQLite handles this automatically, but ensure:
- Single database connection per process
- WAL mode enabled for concurrent reads

## Scaling Strategies

### 1. Selective Domain Loading

Only load needed domains:
```typescript
// Conditional domain registration
if (config.features.health) {
  registerHealthDomain();
}
if (config.features.finance) {
  registerFinanceDomain();
}
```

### 2. Lazy Loading

Load domains on demand:
```typescript
// Dynamic import
async function loadDomain(domainId: string) {
  const module = await import(`@/domains/${domainId}/index.js`);
  module.register();
}
```

### 3. Priority-based Processing

Process high-priority domains first:
```typescript
// Domains sorted by priority
const sortedDomains = domains.sort((a, b) => a.priority - b.priority);
```

## Monitoring & Debugging

### 1. Performance Metrics

Track key metrics:
```typescript
// Log slow operations
if (duration > 1000) {
  logger.warn('Slow operation', { domain, duration });
}

// Monitor success rates
const stats = performanceMonitor.getDomainStats('health');
console.log(`Success rate: ${stats.successRate}%`);
```

### 2. Debug Mode

Enable detailed logging:
```bash
# Set log level
export LOG_LEVEL=debug

# Run with debug output
npm run cli chat --debug
```

### 3. Profiling

Use Node.js profiling tools:
```bash
# CPU profiling
node --prof npm run cli chat

# Memory profiling
node --inspect npm run cli chat
```

## Best Practices

### 1. Schema Design

Keep schemas focused:
```typescript
// ✅ Good: Focused schema
const schema = z.object({
  symptoms: z.array(...).optional(),
  mood: z.object(...).optional(),
});

// ❌ Bad: Everything in one object
const schema = z.object({
  // 50+ fields...
});
```

### 2. Extraction Prompts

Optimize prompts for accuracy:
```typescript
// ✅ Good: Structured with examples
return `Extract into this JSON structure:
{
  "field": "type description",
  ...
}
Example: {"field": "value"}`;

// ❌ Bad: Vague instructions
return "Extract health information";
```

### 3. Strategy Conditions

Make `shouldApply` efficient:
```typescript
// ✅ Good: Quick checks
shouldApply(state): boolean {
  return state.extractions?.health?.length > 0;
}

// ❌ Bad: Heavy computation
shouldApply(state): boolean {
  // Complex analysis...
  return result;
}
```

## Troubleshooting Performance

### Issue: Slow Extractions

**Diagnosis:**
```typescript
const stats = performanceMonitor.getDomainStats('health', 'extraction');
console.log(`Avg duration: ${stats.averageDuration}ms`);
```

**Solutions:**
- Reduce `maxTokens` in config
- Simplify extraction prompts
- Increase confidence threshold
- Use GPT-3.5 instead of GPT-4 for simple extractions

### Issue: High Memory Usage

**Diagnosis:**
```bash
# Check process memory
ps aux | grep node
```

**Solutions:**
- Reduce extraction history size
- Implement state pruning
- Clear old performance metrics
- Reduce cache sizes

### Issue: Database Bottlenecks

**Diagnosis:**
```sql
-- Check database size
SELECT page_count * page_size / 1024 / 1024 as size_mb
FROM pragma_page_count(), pragma_page_size();
```

**Solutions:**
- Implement data retention policies
- Add appropriate indexes
- Use batch operations
- Consider partitioning by date

## Benchmarks

Expected performance metrics:

| Operation | Target | Acceptable | Slow |
|-----------|--------|------------|------|
| Extraction | <500ms | <1000ms | >1000ms |
| Steering | <200ms | <500ms | >500ms |
| Storage | <50ms | <100ms | >100ms |
| Total Pipeline | <2000ms | <3000ms | >3000ms |

## Future Optimizations

### Planned Improvements

1. **Result Caching**
   - Cache extraction results for identical messages
   - TTL-based cache expiration

2. **Smart Batching**
   - Batch multiple messages for extraction
   - Combine storage operations

3. **Adaptive Thresholds**
   - Auto-adjust confidence based on accuracy
   - Learn from user feedback

4. **Compression**
   - Compress stored domain data
   - Reduce memory footprint

5. **Distributed Processing**
   - Support for worker processes
   - Redis-based job queue

## Conclusion

The Domain Framework is designed for performance and scalability. Key takeaways:

1. Use parallel processing where possible
2. Configure appropriate thresholds
3. Monitor performance metrics
4. Optimize schemas and prompts
5. Implement caching strategies
6. Prune old data regularly

For additional optimization help, check:
- `/docs/MIGRATION_GUIDE.md` - Migration from Flow Engine
- `/src/core/domains/utils/PerformanceMonitor.ts` - Performance tracking
- `/src/core/domains/config/DomainConfig.ts` - Configuration options