# Project Overview - AI Assistant LLM CLI Boilerplate

## Executive Summary
A TypeScript CLI application implementing a sophisticated 7-stage conversation processing pipeline with parallel LLM classifiers. Built with SQLite/Drizzle for persistence and designed for command-line testing.

## Core Architecture
- **7-Stage Pipeline**: Load → Decay → Global → Classification → Handle → Post-Process → Save
- **Parallel Classification**: 4 concurrent classifiers with rule-based arbiter
- **State Persistence**: SQLite with Drizzle ORM
- **Type Safety**: Full TypeScript with Zod validation
- **CLI Testing**: Interactive conversation testing via command line

## Technology Stack
- **Language**: TypeScript (strict mode)
- **Database**: SQLite with Drizzle ORM
- **Validation**: Zod schemas
- **LLM**: Anthropic Claude / OpenAI API
- **CLI**: Commander.js
- **Build**: TSC + ESBuild
- **Linting**: ESLint + Prettier

## Project Structure
```
/src
  /core
    /pipeline       # 7-stage pipeline implementation
    /classifiers    # Parallel LLM classifiers
    /handlers       # Mode-specific handlers
    /state          # State machine logic
  /database
    /schema         # Drizzle schema definitions
    /repositories   # Data access layer
    /migrations     # Database migrations
  /tools            # Tool implementations
  /flows            # Conversation flow definitions
  /types            # TypeScript type definitions
  /cli              # CLI commands and interface
  /config           # Configuration management
/tests             # Test suites
```

## Key Features
1. **7-Stage Processing Pipeline**
   - Sequential stage execution
   - Error recovery at each stage
   - Trace logging for debugging

2. **Parallel Classification System**
   - 4 specialist classifiers
   - Rule-based arbiter
   - < 600ms latency target

3. **Conversation State Management**
   - Persistent state in SQLite
   - State transitions tracking
   - Time-based decay logic

4. **Multi-Mode Support**
   - Consult mode
   - Commerce mode
   - Profile management
   - Progress tracking
   - Meta conversations
   - Smalltalk

5. **Flow System**
   - Multi-step conversations
   - Flow state persistence
   - Dynamic flow switching

## Database Schema Overview
- `conversations` - Main conversation records
- `messages` - User and assistant messages
- `conversation_states` - State snapshots
- `classification_results` - Classifier outputs
- `flows` - Active flow instances
- `traces` - Execution traces for debugging

## CLI Commands
```bash
# Interactive chat
npm run cli chat

# Database management
npm run cli db:init
npm run cli db:migrate
npm run cli db:seed

# Testing
npm run cli test:pipeline
npm run cli test:classifier
npm run cli test:flow

# Debugging
npm run cli trace:show
npm run cli state:inspect
```

## Success Metrics
- Pipeline execution < 600ms (excluding LLM calls)
- Classifier agreement rate > 85%
- State persistence reliability 100%
- Memory usage < 256MB
- SQLite query time < 10ms

## Development Phases
1. **Phase 1**: Database Schema & Core Types (Week 1)
2. **Phase 2**: Pipeline Framework (Week 1-2)
3. **Phase 3**: Classification System (Week 2)
4. **Phase 4**: State Management (Week 3)
5. **Phase 5**: Mode Handlers (Week 3-4)
6. **Phase 6**: Flow System (Week 4)
7. **Phase 7**: CLI Interface (Week 5)
8. **Phase 8**: Testing & Optimization (Week 5-6)