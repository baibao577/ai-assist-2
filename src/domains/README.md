# Domain Development Guide

## Overview

Domains are modular components that extract structured information from natural language messages and handle domain-specific business logic. The system uses a pipeline architecture where domains are automatically activated based on message content.

## Core Rules

1. **LLM-Based Detection Only**
   - Use LLM prompts for all detection and extraction
   - NO regex patterns, keyword matching, or rule-based logic
   - Trust the LLM to understand context and nuance

2. **Stateless Architecture**
   - Domains themselves are stateless
   - Use `agent_states` table for multi-step interactions
   - Each request should be independent

3. **Domain Independence**
   - Each domain operates independently
   - No cross-domain dependencies in extractors
   - Shared services (like agentStateService) are allowed

4. **Natural Language First**
   - Design for how users naturally express things
   - Handle variations and ambiguity gracefully
   - Use clarification flows when needed

## Required Directory Structure

```
/src/domains/{domain-name}/
├── extractors/
│   └── {DomainName}Extractor.ts    # Extends BaseExtractor
├── schemas/
│   ├── {domain-name}.schema.ts     # Zod schema definitions
│   └── index.ts                     # Schema exports
├── services/
│   ├── {domain-name}.service.ts    # Business logic
│   └── index.ts                     # Service exports
├── strategies/                      # Optional
│   └── {Strategy}Strategy.ts        # Steering strategies
└── index.ts                         # Domain registration
```

## Implementation Steps

### Step 1: Define Schema
- Create Zod schema in `/schemas/{domain-name}.schema.ts`
- All fields should be nullable/optional for partial extraction
- Include helper functions (has{Domain}Content, etc.)
- Export types for TypeScript support

### Step 2: Create Extractor
- Extend `BaseExtractor` in `/extractors/{DomainName}Extractor.ts`
- Set `domainId` and `schema` properties
- Implement `buildExtractionPrompt()` method
- Override `extract()` if agent state checking needed
- Use structured JSON prompts for LLM

### Step 3: Implement Service Layer
- Create service in `/services/{domain-name}.service.ts`
- Handle business logic and database operations
- Integrate with `agentStateService` for clarifications
- Return consistent result objects with success/message

### Step 4: Add Agent State Support
- Check pending states before new extractions
- Save states when clarification needed:
  ```
  agentStateService.saveState(conversationId, domainId, stateType, data, ttl)
  ```
- Use LLM to detect if response matches pending state
- Resolve states after successful processing

### Step 5: Create Steering Strategies (Optional)
- Extend `BaseSteeringStrategy` in `/strategies/{Strategy}Strategy.ts`
- Implement `shouldApply()` to determine activation
- Implement `generateHints()` to provide conversation guidance
- Set appropriate priority (0.0-2.0, higher = more important)

### Step 6: Register Domain
- Create registration function in `/index.ts`
- Register with `domainRegistry.register()`
- Register extractor with `extractorRegistry.register()`
- Register strategies with `steeringRegistry.register()` if needed

### Step 7: Activate Domain
- Import registration function in `/src/cli/commands/chat.command.ts`
- Call registration function during initialization
- Domain will automatically be detected by pipeline

## Steering Strategies

### What is Steering?
Steering strategies provide contextual hints and suggestions to guide conversations. They analyze the conversation state and generate prompts that help the LLM provide better, more relevant responses.

### Key Concepts
- **Strategies**: Classes extending `BaseSteeringStrategy` that determine when and how to guide
- **Priority**: Higher priority strategies (0.0-2.0) take precedence when multiple apply
- **Hints**: Include suggestions, context, and metadata for the LLM
- **Activation**: Uses `shouldApply()` to determine when strategy is relevant

### SteeringHints Structure
- `type`: Identifies the hint type (e.g., 'goal_selection_pending')
- `suggestions`: Array of proactive suggestions for user
- `context`: Domain-specific context data
- `priority`: Strategy priority level

### When to Use Steering
- **Proactive Assistance**: Suggest next actions based on context
- **Clarification States**: Maintain context during multi-step flows
- **Periodic Checks**: Wellness inquiries or status updates
- **Milestone Events**: Celebrate achievements or suggest adjustments
- **Guidance**: Help users understand available options

### Integration with Agent States
Steering and agent states work together:
1. **Agent State**: Stores persistent data in database
2. **Steering**: Provides transient conversation guidance
3. **Both checked**: During extraction and response generation
4. **Complementary**: State for data, steering for UX

### Implementation Rules
- Use conversation messages to detect when to activate
- Don't rely on keywords - use semantic understanding
- Keep strategies focused on single responsibilities
- Higher priority for time-sensitive or important hints
- Empty suggestions array when waiting for user response

## Agent States Guidelines

### When to Use
- Multiple possible matches requiring user selection
- Multi-step workflows needing context preservation
- Ambiguous inputs needing clarification
- Complex operations requiring confirmation

### State Structure
- `conversationId`: Links to conversation
- `domainId`: Your domain identifier
- `stateType`: Describes state purpose (e.g., 'selection_pending')
- `stateData`: JSON with domain-specific structure
- `ttl`: Time-to-live in seconds (typically 300)

### Implementation Pattern
1. Check for pending states in extractor's `extract()` method
2. Use LLM to determine if message responds to pending state
3. Include conversation context in LLM prompt
4. Return extraction with resolved data
5. Clear state after successful processing

### Clarification Prompts
- Use domain-specific emoji prefixes (📊, 💰, 🏥, etc.)
- Format as numbered lists for selections
- Include context about what's being asked
- Make options clear and distinguishable

## Pipeline Integration

### Automatic Activation
- Domain classifier uses LLM to detect relevance
- No need to configure triggers or keywords
- Domains with pending states are auto-included

### Extraction Flow
1. Pipeline calls domain classifier
2. Relevant domains identified via LLM
3. Extractors run in parallel
4. Results merged into conversation state
5. Handlers process extracted data

### Confidence Scoring
- Extractors return confidence (0-1)
- Higher confidence takes precedence in conflicts
- Use confidence to indicate extraction quality

## Testing Checklist

- [ ] Schema validates all expected data shapes
- [ ] Extractor handles empty/null responses
- [ ] Agent states save and retrieve correctly
- [ ] Clarification flows work end-to-end
- [ ] Service methods handle errors gracefully
- [ ] Domain registers without errors
- [ ] Pipeline detects domain for relevant messages
- [ ] Multi-domain conflicts resolve properly

## Common Pitfalls to Avoid

1. **Using Keywords/Regex**: Always use LLM prompts instead
2. **Forgetting Nullable Fields**: Schema fields must handle partial data
3. **Missing Conversation ID**: Required for agent states
4. **Not Checking Pending States**: Check before new extractions
5. **Hardcoding Selections**: Use LLM to understand user responses
6. **Cross-Domain Dependencies**: Keep domains independent
7. **Skipping Registration**: Must register in chat.command.ts

## Debugging Tips

- Enable verbose logging: `LOG_LLM_VERBOSE=true`
- Check `/logs/app.log` for extraction details
- Verify domain registration in startup logs
- Test extraction independently before full integration
- Use test scripts to simulate multi-domain scenarios