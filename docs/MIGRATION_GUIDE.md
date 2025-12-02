# Migration Guide: Flow Engine to Domain Framework

This guide helps you migrate from the old Flow Engine system to the new Domain-based Steering & Extraction Framework.

## Overview

The Domain Framework replaces the rigid Flow Engine with a flexible, plugin-based architecture that:
- Extracts domain-specific information from conversations
- Provides intelligent conversation steering
- Scales easily with new domains
- Configures dynamically at runtime

## Key Changes

### 1. Removed Components
- ❌ `/src/core/flows/` - Entire flow engine removed
- ❌ `/src/types/flows.ts` - Flow type definitions removed
- ❌ `USE_FLOW_HINTS` environment variable

### 2. New Components
- ✅ `/src/core/domains/` - Domain framework core
- ✅ `/src/domains/` - Domain implementations (health, finance, etc.)
- ✅ Configuration system with CLI management
- ✅ Time-series storage for domain data

## Migration Steps

### Step 1: Update Environment Variables

Remove old flow-related variables:
```bash
# Remove from .env
USE_FLOW_HINTS=false  # Delete this line
```

Add new configuration (optional):
```bash
# Add to .env (optional - defaults work fine)
DOMAIN_CONFIG_PATH=.domains.config.json
```

### Step 2: Update Dependencies

The new system uses the same dependencies, no package changes needed.

### Step 3: Configure Domains

Use the new CLI command to configure domains:
```bash
# List all domains
npm run cli domains --list

# Enable/disable domains
npm run cli domains --enable health
npm run cli domains --disable finance

# Interactive configuration
npm run cli domains --config
```

### Step 4: Database Migration

The domain data is stored in a new table. Run this SQL to create it:

```sql
-- Already created automatically, but for reference:
CREATE TABLE IF NOT EXISTS domain_data (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  data TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_domain_data_lookup
  ON domain_data(domain_id, user_id, conversation_id);
```

### Step 5: Code Updates

If you have custom mode handlers or pipeline stages:

#### Before (Flow-based):
```typescript
// Old flow hints
if (context.flowHints) {
  // Process flow hints
  const hints = context.flowHints;
  // ...
}
```

#### After (Domain-based):
```typescript
// New steering hints
if (state.steeringHints) {
  const hints = state.steeringHints;
  // hints.suggestions - Array of suggestions
  // hints.type - Type of guidance
  // hints.context - Additional context
}

// Access extracted data
if (state.extractions) {
  const healthData = state.extractions.health;
  const financeData = state.extractions.finance;
}
```

## Creating Custom Domains

To add your own domain:

### 1. Create Domain Structure
```
src/domains/your-domain/
├── schemas/
│   └── your-domain.schema.ts    # Zod schema
├── extractors/
│   └── YourExtractor.ts         # Data extraction
├── strategies/
│   └── YourStrategy.ts          # Steering strategies
└── index.ts                      # Registration
```

### 2. Define Schema
```typescript
import { z } from 'zod';

export const yourDomainSchema = z.object({
  // Define your data structure
  field1: z.string().optional(),
  field2: z.number().optional(),
  // ...
});
```

### 3. Create Extractor
```typescript
import { BaseExtractor } from '@/core/domains/base/BaseExtractor.js';

export class YourExtractor extends BaseExtractor {
  domainId = 'your-domain';
  schema = yourDomainSchema;

  protected buildExtractionPrompt(message: string, context: ExtractionContext): string {
    // Return LLM prompt for extraction
  }

  protected validateAndTransform(data: any): ExtractedData {
    // Calculate confidence and return extracted data
  }
}
```

### 4. Create Steering Strategy
```typescript
import { BaseSteeringStrategy } from '@/core/domains/base/BaseSteeringStrategy.js';

export class YourStrategy extends BaseSteeringStrategy {
  strategyId = 'your_domain_strategy';
  priority = 0.7;

  shouldApply(state: ConversationState): boolean {
    // Determine when to apply this strategy
  }

  async generateHints(state: ConversationState): Promise<SteeringHints> {
    // Generate conversation guidance
  }
}
```

### 5. Register Domain
```typescript
export function registerYourDomain(): void {
  domainRegistry.register({
    id: 'your-domain',
    name: 'Your Domain Name',
    description: 'Description',
    priority: 3,
    enabled: true,
    capabilities: {
      extraction: true,
      steering: true,
      summarization: false,
    },
    config: {
      extractionSchema: yourDomainSchema,
      storageConfig: {
        type: 'timeseries',
        table: 'your_domain_records',
        retention: '90d',
      },
    },
  });

  extractorRegistry.register(new YourExtractor());
  steeringRegistry.register(new YourStrategy());
}
```

### 6. Initialize in Chat Command
```typescript
// In src/cli/commands/chat.command.ts
import { registerYourDomain } from '@/domains/your-domain/index.js';

// Initialize domains on module load
registerHealthDomain();
registerFinanceDomain();
registerYourDomain(); // Add your domain
```

## Performance Optimizations

### 1. Parallel Processing
The framework processes domains in parallel for better performance:
- Multiple extractors run concurrently
- Steering strategies evaluate simultaneously
- Storage operations are async

### 2. Confidence Thresholds
Configure minimum confidence to reduce noise:
```bash
npm run cli domains --config
# Set confidence threshold: 0.6 (higher = fewer but better extractions)
```

### 3. Domain Priorities
Domains are processed in priority order (1 = highest):
- Health: priority 1
- Finance: priority 2
- Custom: priority 3+

### 4. Caching
Domain configurations are cached in memory and only reload on:
- Application restart
- Manual reload via `domainConfig.reloadConfig()`
- Configuration file changes

## Troubleshooting

### Issue: Domains not extracting data
- Check if domain is enabled: `npm run cli domains --list`
- Verify confidence threshold isn't too high
- Check logs for extraction errors

### Issue: Steering hints not appearing
- Ensure steering is globally enabled
- Check if domain has steering strategies
- Verify `shouldApply` conditions in strategies

### Issue: Storage errors
- Check database permissions
- Verify table creation
- Check disk space for SQLite

## Testing

Test your migration:
```bash
# Test health domain
npm run cli chat
> I've been having headaches for 3 days

# Test finance domain
> I spent $500 on groceries this month

# Check domain status
npm run cli domains --list
```

## Rollback

If you need to rollback:
1. Checkout previous commit before domain framework
2. Restore `.env` with `USE_FLOW_HINTS` if needed
3. Remove `.domains.config.json` file
4. Database tables can remain (won't affect old system)

## Support

For issues or questions:
- Check logs in development mode for detailed debugging
- Review domain implementations in `/src/domains/`
- See example domains (health, finance) for patterns