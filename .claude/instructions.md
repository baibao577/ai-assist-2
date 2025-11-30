# Claude AI Assistant Instructions

## 🎯 Primary Directive

You are working on a TypeScript AI Assistant boilerplate implementing a 7-stage conversation pipeline with parallel classifiers. This project uses Git tags to track implementation phases and has strict development rules.

## 🚀 FIRST: Check Implementation Phase

**ALWAYS start by checking the current phase using Git:**

```bash
git describe --tags --abbrev=0  # Shows last completed phase (e.g., v2.0.0-mvp)
git branch --show-current       # Should be on mvp-vX branch
git status                      # Check for uncommitted changes
git log --oneline -5            # Recent commits show work pattern
```

**Quick Phase Reference:**
| Phase | Focus | Key Features | Success Test |
|-------|-------|--------------|--------------|
| MVP v1 | Foundation | SQLite, basic chat, LLM responses | `npm run cli chat` works |
| MVP v2 | State | State persistence, 3 modes, decay | Mode switching works |
| MVP v3 | Safety | Safety classifier, crisis detection | Crisis triggers safety response |
| MVP v4 | Parallel | 4 parallel classifiers, arbiter | <250ms classification |
| MVP v5 | Flows | Goal setting, multi-step flows | Flow completes end-to-end |
| MVP v6 | Complete | All 6 modes, commerce, pending | All modes functional |
| Prod v7 | Production | Monitoring, testing, optimization | 80% test coverage |

**Phase Mapping:**
- No tags → Start MVP v1
- `v1.0.0-mvp` → MVP v1 complete, work on v2
- `v2.0.0-mvp` → MVP v2 complete, work on v3
- `v3.0.0-mvp` → MVP v3 complete, work on v4
- `v4.0.0-mvp` → MVP v4 complete, work on v5
- `v5.0.0-mvp` → MVP v5 complete, work on v6
- `v6.0.0-mvp` → MVP v6 complete, work on v7

## 📋 MANDATORY: Read These Documents Based on Phase

1. **Always Read:**
   - **[AI_ASSISTANT_RULES.md](AI_ASSISTANT_RULES.md)** - Development rules
   - **[docs/GIT_STRATEGY.md](../docs/GIT_STRATEGY.md)** - Git workflow
   - **[docs/plans/00_implementation_phases.md](../docs/plans/00_implementation_phases.md)** - Phase requirements

2. **Phase-Specific Plans:**
   - MVP v1: Read plans 02 (database), 03 (types), 08 (CLI)
   - MVP v2: Read plans 04 (pipeline), 06 (handlers)
   - MVP v3: Read plans 05 (classification), 11 (safety)
   - MVP v4: Read plan 11 (parallel classification) - complete
   - MVP v5: Read plan 07 (flows)
   - MVP v6: Read plan 06 (all handlers)
   - Prod v7: Read plans 09 (testing), 10 (monitoring)

## ⚠️ Critical Rules

### The #1 Rule: ALWAYS Run Format, Lint & Type Checks

```bash
npm run format && npm run lint && npm run build
```

**This must be run after EVERY code modification. No exceptions.**
(This ensures Prettier formatting, ESLint rules, and TypeScript compilation)

### Quick Reference Commands

- `npm run format` - Auto-format code with Prettier (RUN FIRST)
- `npm run format:check` - Check Prettier formatting without fixing
- `npm run lint` - Check ESLint rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run build` - TypeScript compilation check
- `npm run check` - Type-check + lint (legacy, prefer separate commands)
- `npm run cli` - Test functionality with CLI
- `npm run db:push` - Apply database changes

## 🏗️ Architecture Overview

This is a **TypeScript-first** project with:

- **Drizzle ORM** for database operations (SQLite)
- **Zod** for runtime validation and type inference
- **Anthropic Claude API** for AI capabilities
- **Tool System** for structured AI function calls
- **Intent Classification** for routing user queries
- **Repository Pattern** for data access

## 🔧 Working with This Codebase

### Before Making Changes

1. Read the existing code in the relevant directory
2. Understand the established patterns
3. Check similar implementations for consistency
4. Use TodoWrite tool to plan your work

### While Coding

1. Follow TypeScript strict mode rules
2. Use proper typing (avoid `any`)
3. Prefix unused parameters with `_` (e.g., `_userId`)
4. Handle errors with try-catch blocks
5. Use the repository pattern for database access
6. Keep lines under 100 characters (Prettier limit)
7. Use `console.info()` instead of `console.log()` in CLI files

### After Making Changes

1. Run `npm run format` to auto-format code
2. Run `npm run lint` and fix all errors
3. Run `npm run build` to check TypeScript compilation
4. Test with CLI: `npm run cli`
5. Clean up test files
6. Update documentation if needed

## 🚫 Never Do These Things

1. **NEVER** skip running format, lint, and build checks
2. **NEVER** use raw SQL - use Drizzle ORM
3. **NEVER** ignore TypeScript errors
4. **NEVER** use `console.log` - use `console.info/warn/error`
5. **NEVER** commit without formatting and linting
6. **NEVER** use `var` - use `const` or `let`
7. **NEVER** expose secrets in code
8. **NEVER** leave unused parameters without `_` prefix

## 📁 Key Directories

- `src/core/` - Core business logic and AI agent
- `src/tools/` - Tool implementations (extend Tool class)
- `src/database/` - Database schema and repositories
- `src/types/` - TypeScript type definitions
- `src/cli/` - Modular CLI implementation (see CLI_DOCUMENTATION.md)
- `src/cli.ts` - CLI entry point (thin wrapper)

## 🧪 Testing New Features

Always test new features using the CLI first:

```bash
# Interactive chat
npm run cli chat

# Database operations
npm run cli db init
npm run cli db seed

# Quick tests
npm run cli test
```

## 📝 Creating New Tools

Tools must follow this pattern:

1. Extend the base `Tool` class (or `OrchestratorTool` for delegation)
2. Define Zod schema for parameters
3. Implement `execute()` method
4. Prefix unused parameters with `_` (e.g., `_userId`, `_context`)
5. Return `ToolResult` format
6. Register in `tools/registry.ts`
7. Mark as `internal = true` if not for LLM exposure
8. **Run `npm run format && npm run lint && npm run build` after creating**

## 🐛 Debugging

- Check logs with appropriate levels (error, warn, info)
- Use CLI for testing: `npm run cli`
- Verify database with: `npm run db:studio`
- Always check lint errors first: `npm run lint`

## 💡 Pro Tips

1. The project uses absolute imports with `@/` prefix
2. All async operations should have error handling
3. Database operations should use transactions for multi-step processes
4. The AI model is configured in `src/config.ts`
5. Environment variables are validated with Zod

## 🔄 Workflow Summary

1. **Plan** → Use TodoWrite tool
2. **Code** → Follow existing patterns
3. **Format** → Run `npm run format` (auto-fixes formatting)
4. **Lint** → Run `npm run lint` (check for errors)
5. **Build** → Run `npm run build` (TypeScript check)
6. **Test** → Use CLI to verify
7. **Clean** → Remove test files
8. **Document** → Update if needed

### Quick Validation Command

```bash
# Run all checks in sequence
npm run format && npm run lint && npm run build
```

## 🔄 Phase Implementation Workflow

### Starting Work on a Phase:
1. Check current phase with Git tags
2. Verify on correct branch (`mvp-vX`)
3. Read phase-specific plan documents
4. Check success criteria in `00_implementation_phases.md`
5. Begin implementation following the plan

### During Implementation:
- Make atomic commits with prefix: `feat(mvp-vX): Description`
- Test frequently with CLI commands
- Run format/lint/build after each file change
- Don't move to next phase until current is complete

### Completing a Phase:
```bash
# Test all phase features
npm test  # if tests exist
npm run cli [phase-specific-commands]

# Verify success criteria met
# Then tag the phase
git add .
git commit -m "feat(mvp-vX): Complete MVP vX implementation"
git tag -a "vX.0.0-mvp" -m "MVP vX: [Description] complete"
git push origin mvp-vX --tags
```

### Phase Transition:
```bash
# After tagging completion
git checkout -b mvp-v[NEXT]
echo "Starting MVP v[NEXT]" > .phase-marker
git add .phase-marker
git commit -m "chore(mvp-v[NEXT]): Start phase"
```

## 📊 Progress Tracking

### Update Progress Tracker (Optional but Recommended):
While Git tags are the source of truth, update `/docs/plans/00_progress_tracker.md` for:
- **Session handoff notes**: What specific task to continue
- **Known issues**: Bugs or blockers encountered
- **Implementation decisions**: Why you deviated from plans
- **Performance metrics**: Actual measurements vs targets

### When to Update Progress Tracker:
1. **After completing significant features** - Note what works
2. **When encountering blockers** - Document issues for next session
3. **Before ending session** - Add handoff notes
4. **After phase completion** - Record metrics and learnings

### Progress Tracker Update Template:
```markdown
## 🔄 Current Sprint (Update This Section)

### Active Version: MVP vX (from git tag)
**Sprint Goal**: [Current phase goal]
**Git Branch**: mvp-vX
**Last Updated**: [Date]

### Completed in This Session
- ✅ [Specific feature/file]
- ✅ [Test that now passes]

### Known Issues/Blockers
- ⚠️ [Issue description and potential solution]

### Next Session Should Start With
- Continue implementing [specific component]
- Fix [specific issue]
- Test [specific feature]

### Performance Metrics (if measured)
- Response time: Xms
- Memory usage: XMB
- Test coverage: X%
```

## 📝 Git Commit Guidelines

### Phase-Based Commits:
- **Format**: `type(mvp-vX): description`
- **Types**: feat, fix, test, docs, chore
- **Examples**:
  - `feat(mvp-v1): Add SQLite database connection`
  - `fix(mvp-v2): Correct state persistence`
  - `test(mvp-v3): Add safety classifier tests`

### Rules:
- Write clear, concise commit messages
- One feature per commit (atomic commits)
- **DO NOT** add Claude co-author attribution
- **DO NOT** add "Generated with Claude Code" signatures
- **DO NOT** use emojis unless requested
- Keep commits professional and clean

---

## 🎯 Session Workflow Summary

### Every Session Starts With:
1. **Check Git** → Determine current phase from tags
2. **Read Plans** → Load phase-specific documents
3. **Continue Work** → From where Git/tracker shows

### During Session:
1. **Atomic Commits** → One feature per commit with `feat(mvp-vX):`
2. **Test Frequently** → CLI commands after each change
3. **Lint Always** → `npm run format && npm run lint && npm run build`

### Before Ending Session:
1. **Commit Changes** → Don't leave uncommitted work
2. **Update Tracker** → Add handoff notes (optional but helpful)
3. **Test Features** → Ensure everything still works

### Phase Completion:
1. **Verify Success** → All criteria met
2. **Tag Phase** → `git tag -a "vX.0.0-mvp"`
3. **Start Next** → Create new branch for next phase

**Remember**:
1. **Git tags = Source of truth** for phase tracking
2. **Quality > Speed** - Always format, lint, and build
3. **Sequential phases** - Complete v1 before v2, etc.
4. **Test via CLI** - Every feature should be testable
5. **Clean commits** - Professional, atomic, well-described
