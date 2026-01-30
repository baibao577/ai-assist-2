# AI Assistant CLI

An intelligent command-line conversational AI assistant with state management, domain-specific knowledge, and multi-mode conversation handling.

## What is this?

A personal AI assistant that remembers context across conversations and adapts responses based on life domains (health, finance, goals). Unlike stateless chatbots, it maintains conversation history, tracks your goals, and provides contextually relevant advice.

## How it works

1. **You send a message** via the CLI chat interface
2. **Classification** - A single LLM call analyzes your message for safety, intent (advice/smalltalk/meta/goal-tracking), and relevant domains
3. **Context Loading** - Retrieves conversation history and domain-specific data (recent health logs, financial context, active goals)
4. **Enrichment** - Domain extractors pull structured data from your message (e.g., mood, expenses mentioned)
5. **Response Generation** - Mode-specific handlers craft responses using conversation context + domain knowledge
6. **State Persistence** - Saves conversation, extracted data, and any goal updates to SQLite

The pipeline ensures responses are informed by your history while keeping each interaction fast through parallel domain processing.

## Features

- **Interactive Chat** - Multi-turn conversations with context memory
- **Multi-Mode Handling** - CONSULT (advice), SMALLTALK, META (capabilities), TRACK_PROGRESS (goals)
- **Domain Modules** - Health/Wellness, Finance, Goal tracking with extensible registry
- **Smart Classification** - Safety detection, intent classification, multi-intent support
- **Local Persistence** - SQLite database for conversations, goals, and domain data

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Initialize database
npm run cli -- db init

# Start chatting
npm run cli -- chat
```

## Configuration

Create `.env` from `.env.example`:

```env
OPENAI_API_KEY=your_api_key_here    # Required
DATABASE_PATH=./data/assistant.db    # Default
LLM_MODEL=gpt-4o                     # Default
```

See `.env.example` for all options.

## CLI Commands

```bash
npm run cli -- chat              # Start chat
npm run cli -- chat --new        # New conversation
npm run cli -- chat --debug      # With debug info
npm run cli -- db init           # Init database
npm run cli -- domains           # List domains
```

## Development

```bash
npm run dev          # Watch mode
npm run build        # Type check
npm run lint:fix     # Fix linting
npm run format       # Format code
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PIPELINE STAGES                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐    ┌─────────┐    ┌──────────────┐    ┌────────────┐      │
│  │  LOAD   │───▶│  DECAY  │───▶│ CLASSIFIERS  │───▶│ ENRICHMENT │      │
│  └─────────┘    └─────────┘    └──────────────┘    └────────────┘      │
│       │                              │                    │             │
│       │                              ▼                    ▼             │
│       │                        ┌──────────┐        ┌──────────┐        │
│       │                        │  MODES   │        │ DOMAINS  │        │
│       │                        └──────────┘        └──────────┘        │
│       │                              │                    │             │
│       │                              ▼                    │             │
│       │                        ┌──────────┐              │             │
│       │                        │ HANDLER  │◀─────────────┘             │
│       │                        └──────────┘                            │
│       │                              │                                  │
│       │                              ▼                                  │
│       │                        ┌──────────┐                            │
│       └───────────────────────▶│   SAVE   │                            │
│                                └──────────┘                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Components

**Pipeline Stages** - Sequential processing steps, each transforming state:
- `LOAD` - Hydrate conversation history and domain data from SQLite
- `DECAY` - Apply time-based decay to context elements (older = less relevant)
- `CLASSIFIERS` - Determine safety, intent, mode, and relevant domains
- `ENRICHMENT` - Extract structured data from message via domain extractors
- `HANDLER` - Generate response using mode-specific logic
- `SAVE` - Persist updated state back to database

**Classifiers** - Analyze incoming messages (unified into single LLM call):
- Safety classifier → `SAFE` / `CONCERN` / `CRISIS`
- Intent classifier → Determines conversation mode
- Domain classifier → Identifies relevant life domains
- Multi-intent detector → Handles complex requests touching multiple domains

**Modes** - Conversation handling strategies:
- `CONSULT` - Advice-seeking, problem-solving (uses domain context)
- `SMALLTALK` - Casual conversation, greetings
- `META` - Questions about assistant capabilities
- `TRACK_PROGRESS` - Goal setting it tracking

**Domains** - Pluggable knowledge modules, each providing:
- `Extractor` - Pulls structured data from messages (e.g., mood, expenses)
- `Strategy` - Steering prompts for response generation
- `Storage` - Time-series data persistence with configurable retention

**Orchestrator** - Coordinates multi-intent requests:
- Routes sub-intents to appropriate domains
- Merges responses into coherent output
- Handles domain interactions (e.g., health goal affecting finance)

### Data Flow Example

```
User: "I've been stressed about money and not sleeping well"
                    │
                    ▼
            ┌──────────────┐
            │  CLASSIFIER  │ → Safety: SAFE
            │              │ → Mode: CONSULT
            │              │ → Domains: [health, finance]
            └──────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐        ┌──────────────┐
│   HEALTH     │        │   FINANCE    │
│  Extractor   │        │  Extractor   │
│  → mood:     │        │  → concern:  │
│    stressed  │        │    money     │
│  → sleep:    │        └──────────────┘
│    poor      │                │
└──────────────┘                │
        │                       │
        └───────────┬───────────┘
                    ▼
            ┌──────────────┐
            │  ORCHESTRATOR│ → Combines domain contexts
            │              │ → Generates unified response
            └──────────────┘
                    │
                    ▼
            "I hear you - financial stress often affects sleep..."
```

### Code Execution Trace

When you hit enter in the CLI, here's what executes:

```
src/cli/commands/chat.command.ts:73    ← inquirer.prompt() captures input
            │
            ▼
src/cli/commands/chat.command.ts:114   ← pipeline.execute(context)
            │
            ▼
┌───────────────────────────────────────────────────────────────────┐
│ PIPELINE (src/core/pipeline.ts)                                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ LOAD (pipeline-core.service.ts:39-144)                      │  │
│  │  → Find/create conversation                                 │  │
│  │  → Load messages from DB                                    │  │
│  │  → Load conversation state                                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ DECAY (stages/decay.stage.ts:20-67)                         │  │
│  │  → Apply time-based decay to context elements               │  │
│  │  → Older memories get lower weight                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ CLASSIFY (classifiers/unified.classifier.ts:140+) [LLM #1] │  │
│  │  → Single LLM call returns:                                 │  │
│  │    safety, intent, mode, domains, multi-intent              │  │
│  │  → Arbiter (arbiter.ts:15) decides final mode               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ENRICH (pipeline.ts:397-555) [PARALLEL]                     │  │
│  │  ├─ Global context extraction                               │  │
│  │  ├─ Domain extractions (health, finance, goal...)           │  │
│  │  └─ Steering strategy generation                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ HANDLER (modes/base-handler.ts:31-101) [LLM #2]             │  │
│  │  → Build system prompt with context                         │  │
│  │  → Call OpenAI API (llm.service.ts:113)                     │  │
│  │  → Return response                                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ SAVE (pipeline-core.service.ts:154-209)                     │  │
│  │  → Save user message to DB                                  │  │
│  │  → Save assistant response to DB                            │  │
│  │  → Save state snapshot                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
            │
            ▼
src/cli/commands/chat.command.ts:131   ← console.info(response)
```

**Total LLM calls per message: 2** (1 classification + 1 response generation)

## Tech Stack

TypeScript, OpenAI SDK, Drizzle ORM, SQLite, Commander.js, Zod
