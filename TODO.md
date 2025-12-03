# Track Progress Mode - Implementation TODO

## MVP v1: Basic Goal CRUD (Current Phase)

### Database & Types
- [ ] Add TRACK_PROGRESS to ConversationMode enum in `src/types/modes.ts`
- [ ] Add goals table to `src/database/schema.ts`
- [ ] Add progress_entries table to `src/database/schema.ts`
- [ ] Add goal_milestones table to `src/database/schema.ts`
- [ ] Add table creation SQL to `src/database/client.ts` initializeDatabase()
- [ ] Create type exports using Drizzle inference

### Repository Implementation
- [ ] Create `src/database/repositories/goal.repository.ts`
- [ ] Create `src/database/repositories/progress.repository.ts`
- [ ] Add repository exports to `src/database/repositories/index.ts`

### Mode Handler
- [ ] Create `src/core/modes/track-progress.handler.ts`
- [ ] Implement SET_GOAL intent handling
- [ ] Implement VIEW_GOALS intent handling
- [ ] Register handler in pipeline

### Intent Classification
- [ ] Update IntentType enum with goal-related intents
- [ ] Modify intent classifier prompt to detect goal intents
- [ ] Test intent detection

## MVP v2: Progress Tracking & Analytics

### Progress Domain
- [ ] Create `src/domains/progress/` directory structure
- [ ] Implement `schemas/progress.schema.ts` with Zod
- [ ] Create `extractors/ProgressExtractor.ts`
- [ ] Create strategies for steering
- [ ] Register domain in registry

### Enhanced Mode Handler
- [ ] Implement LOG_PROGRESS intent
- [ ] Implement CHECK_PROGRESS intent
- [ ] Add progress calculation methods
- [ ] Create text-based visualizations

### Analytics
- [ ] Implement trend detection
- [ ] Add completion percentage calculation
- [ ] Create progress prediction logic

## MVP v3: Mode Cooperation (Response Orchestrator)

### Orchestrator Core
- [ ] Create `src/core/orchestrator/` directory
- [ ] Implement ResponseOrchestrator class
- [ ] Create ResponseComposer class
- [ ] Add MultiIntentClassifier

### Mode Handler Updates
- [ ] Update all handlers to return ModeSegment
- [ ] Add segment metadata
- [ ] Test multi-mode responses

## MVP v4: Advanced Features

### Cross-Domain Analytics
- [ ] Implement domain correlation
- [ ] Add pattern detection
- [ ] Create insight generation

### Proactive Features
- [ ] Add check-in scheduler
- [ ] Implement reminders
- [ ] Create achievement system

## Testing & Documentation
- [ ] Unit tests for each component
- [ ] Integration tests
- [ ] Update API documentation
- [ ] Performance optimization

---

## Current Status
**Phase**: MVP v1 - Basic Goal CRUD
**Started**: December 2024
**Branch**: feature/track-progress-mode