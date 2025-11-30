# AI Assistant Implementation - Conversation Starter

## 🚀 Quick Start Template for New Sessions

Copy and paste this entire block to start a new conversation:

```markdown
I'm working on the AI Assistant LLM boilerplate project. This is a TypeScript CLI application with SQLite/Drizzle ORM implementing a 7-stage conversation pipeline with parallel classifiers.

PROJECT CONTEXT:
- Tech Stack: TypeScript, SQLite, Drizzle ORM, Anthropic/OpenAI APIs
- Architecture: 7-stage pipeline with parallel classification
- Git-based phase tracking (tags show completed phases)

PHASE DETECTION - Please run these commands:
1. git describe --tags --abbrev=0  # Shows last completed phase
2. git branch --show-current       # Shows current branch
3. git status                      # Shows uncommitted changes
4. git log --oneline -5           # Shows recent commits

PHASE MAPPING:
- No tags = Start MVP v1
- Tag v1.0.0-mvp = v1 complete, work on v2
- Tag v2.0.0-mvp = v2 complete, work on v3
- Tag v3.0.0-mvp = v3 complete, work on v4
- Tag v4.0.0-mvp = v4 complete, work on v5
- Tag v5.0.0-mvp = v5 complete, work on v6
- Tag v6.0.0-mvp = v6 complete, work on v7

FILES TO READ:
- @docs/GIT_STRATEGY.md - Git workflow and tagging
- @docs/plans/00_implementation_phases.md - What each phase contains
- @.claude/AI_ASSISTANT_RULES.md - Development rules

Based on the git tags, tell me:
1. What phase are we on?
2. Are we on the correct branch (mvp-vX)?
3. What needs to be implemented for this phase?
4. Are there any uncommitted changes to handle?

Let's continue building from where Git shows we are.
```

---

## 🎯 For Specific Phase Work

### If Starting MVP v1 (Basic Foundation)
```markdown
I need to implement MVP v1 of the AI Assistant project.

Please read:
- @docs/plans/00_implementation_phases.md (MVP v1 section)
- @docs/plans/02_database_schema.md (conversations and messages tables only)
- @docs/plans/03_type_system.md (basic types only)
- @docs/plans/08_cli_interface.md (chat command only)

Let's build:
1. SQLite database with basic schema
2. Simple chat CLI
3. Basic message processing
4. Direct LLM responses

Success criteria: Can chat and persist messages.
```

### If Starting MVP v2 (State Management)
```markdown
I need to implement MVP v2 of the AI Assistant project. MVP v1 is complete.

Please read:
- @docs/plans/00_progress_tracker.md - Check v1 completion
- @docs/plans/00_implementation_phases.md (MVP v2 section)
- @docs/plans/04_pipeline_architecture.md (Load, Decay, Save stages)
- @docs/plans/06_mode_handlers.md (basic handlers only)

Let's build:
1. Conversation state management
2. State persistence
3. 3 basic modes (consult, smalltalk, meta)
4. Decay logic

Success criteria: Mode switching and state persistence work.
```

### If Starting MVP v3 (Classification)
```markdown
I need to implement MVP v3 of the AI Assistant project. MVP v1-2 are complete.

Please read:
- @docs/plans/00_progress_tracker.md - Check v1-2 completion
- @docs/plans/00_implementation_phases.md (MVP v3 section)
- @docs/plans/11_parallel_classification_architecture.md (Safety classifier and basic arbiter)
- @docs/plans/05_classification_system.md (Safety only)

Let's build:
1. Safety classifier with crisis detection
2. Basic intent classification
3. Simple arbiter (sequential, not parallel yet)

Success criteria: Crisis detection works, correct mode routing.
```

### If Starting MVP v4 (Parallel System)
```markdown
I need to implement MVP v4 of the AI Assistant project. MVP v1-3 are complete.

Please read:
- @docs/plans/00_progress_tracker.md - Check v1-3 completion
- @docs/plans/00_implementation_phases.md (MVP v4 section)
- @docs/plans/11_parallel_classification_architecture.md (FULL document)

Let's build:
1. All 4 parallel classifiers
2. Conditional execution logic
3. Full arbiter with priority rules
4. Performance monitoring

Success criteria: <250ms classification with parallel execution.
```

---

## 📋 Status Check Template

Use this when you need to check project status mid-conversation:

```markdown
Please check the current implementation status:

1. Read @docs/plans/00_progress_tracker.md
2. Run: git status
3. Run: git log --oneline -5
4. Check which test files exist: ls -la tests/
5. If package.json exists, check: npm test

Tell me:
- What phase are we in?
- What's completed?
- What's the next immediate task?
- Are there any failing tests?
```

---

## 🔧 Common Troubleshooting Templates

### If Tests Are Failing
```markdown
Tests are failing. Please:
1. Read the error output carefully
2. Check @docs/plans/09_testing_strategy.md for test structure
3. Run: npm run lint
4. Run: npm run build
5. Fix issues following @.claude/automation.md rules
```

### If Unsure About Implementation
```markdown
I'm unsure about implementing [COMPONENT]. Please:
1. Check the relevant plan document:
   - Database: @docs/plans/02_database_schema.md
   - Types: @docs/plans/03_type_system.md
   - Pipeline: @docs/plans/04_pipeline_architecture.md
   - Classification: @docs/plans/11_parallel_classification_architecture.md
   - Flows: @docs/plans/07_flow_system.md
2. Show me the specific implementation code for this component
3. Explain the key design decisions
```

### If Starting Fresh After Break
```markdown
I'm returning to the AI Assistant project after a break.

Please:
1. Read @docs/plans/00_progress_tracker.md
2. Check git status and recent commits
3. Verify the build: npm run build
4. Run any existing tests: npm test
5. Tell me:
   - Current phase and progress
   - Any uncommitted changes
   - Next logical task to work on
   - Any issues that need fixing

Let's continue from where we left off.
```

---

## 🎯 Phase Transition Template

Use when completing a phase and moving to the next:

```markdown
I believe MVP v[X] is complete. Let's verify and transition to MVP v[X+1].

Please:
1. Check @docs/plans/00_implementation_phases.md success criteria for v[X]
2. Run all tests for v[X] features
3. Verify all v[X] CLI commands work
4. Update @docs/plans/00_progress_tracker.md with completion status
5. Create a git tag for v[X]: git tag -a "mvp-v[X]" -m "MVP v[X] complete"
6. Read requirements for v[X+1] from implementation phases
7. Create a new branch for v[X+1]: git checkout -b mvp-v[X+1]

Let's start implementing MVP v[X+1].
```

---

## 💡 Best Practices for Continuity

1. **Always Update Progress Tracker**
   - After completing significant tasks
   - Before ending a session
   - When encountering blockers

2. **Commit Strategically**
   ```bash
   git add .
   git commit -m "feat(mvp-vX): [what you implemented]"
   ```

3. **Use Descriptive Branch Names**
   ```bash
   git checkout -b mvp-v1-database-setup
   git checkout -b mvp-v2-state-management
   ```

4. **Document Decisions**
   - If you deviate from plans, document why
   - If you find issues in plans, note them
   - If you discover better approaches, record them

5. **Test Frequently**
   ```bash
   npm run cli chat  # After every major change
   npm run lint      # After code changes
   npm run build     # Before commits
   ```

---

## 🚨 Emergency Recovery Template

If something is seriously broken:

```markdown
The project seems broken. Please help recover:

1. Check git status
2. Show me recent commits: git log --oneline -10
3. Check for build errors: npm run build
4. Check for lint errors: npm run lint
5. Review @.claude/AI_ASSISTANT_RULES.md

Options:
- Stash changes and restart: git stash
- Reset to last commit: git reset --hard HEAD
- Checkout last known good tag: git checkout mvp-v[X]

What's the safest recovery path?
```

---

## 📝 Session Ending Template

Before ending a conversation:

```markdown
I need to end this session. Please:

1. Update @docs/plans/00_progress_tracker.md with:
   - What was completed today
   - Current blockers (if any)
   - Next task to start with
   - Any important notes

2. Ensure all changes are committed:
   - Run: git status
   - Commit any pending changes
   - Push to remote if needed

3. Provide a summary of:
   - What was accomplished
   - Current phase status
   - Next session starting point
   - Any issues to be aware of

4. Give me the exact starter text for the next session
```

---

## 🎉 Success Verification Template

After completing each MVP version:

```markdown
Let's verify MVP v[X] is fully complete:

CHECKLIST:
□ All v[X] features implemented (check @docs/plans/00_implementation_phases.md)
□ All v[X] tests passing
□ All v[X] CLI commands working
□ Performance meets v[X] targets
□ No critical bugs
□ Progress tracker updated
□ Git tag created

Please run through this checklist and confirm each item.
If all pass, we're ready for v[X+1]!
```