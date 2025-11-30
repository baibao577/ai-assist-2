# Git Strategy for Phase-Based Development

## 🎯 Core Principle
**Git commits and tags are the source of truth for implementation progress**

---

## 📋 Branch Strategy

### Main Branches
```
main
  └── develop
        ├── mvp-v1
        ├── mvp-v2
        ├── mvp-v3
        ├── mvp-v4
        ├── mvp-v5
        ├── mvp-v6
        └── production-v7
```

### Branch Rules
- `main` - Only completed, tagged versions
- `develop` - Integration branch for completed MVPs
- `mvp-vX` - Feature branch for each phase

---

## 🏷️ Tagging Strategy

### Version Tags
Each completed phase gets a tag:
```bash
# After completing MVP v1
git tag -a "v1.0.0-mvp" -m "MVP v1: Basic message processing complete"

# After completing MVP v2
git tag -a "v2.0.0-mvp" -m "MVP v2: State management complete"

# ... and so on
```

### Tag Format
- `vX.0.0-mvp` - Phase completion
- `vX.1.0-mvp` - Major feature within phase
- `vX.1.1-mvp` - Bug fix within phase

---

## 💾 Commit Strategy

### Commit Prefixes
```
feat(mvp-v1): Add database schema
fix(mvp-v1): Correct message repository
test(mvp-v1): Add conversation tests
docs(mvp-v1): Update progress tracker
chore(mvp-v1): Update dependencies
```

### Atomic Commits
Each commit should be functional:
```bash
# Good - Each commit works
git commit -m "feat(mvp-v1): Add SQLite database connection"
git commit -m "feat(mvp-v1): Add conversation repository"
git commit -m "feat(mvp-v1): Add CLI chat command"

# Bad - Broken state between commits
git commit -m "feat(mvp-v1): Start adding database"
git commit -m "feat(mvp-v1): Continue database work"
git commit -m "feat(mvp-v1): Finish database"
```

---

## 📝 Phase Completion Checklist

### Before Tagging a Phase Complete

```bash
# 1. Check all tests pass
npm test

# 2. Ensure build works
npm run build

# 3. Verify lint passes
npm run lint

# 4. Test CLI commands for this phase
npm run cli chat  # for v1
# ... phase-specific commands

# 5. Update documentation
# Edit docs/plans/00_progress_tracker.md

# 6. Commit all changes
git add .
git commit -m "feat(mvp-vX): Complete MVP vX implementation"

# 7. Create completion tag
git tag -a "vX.0.0-mvp" -m "MVP vX: [Description] complete"

# 8. Push to remote
git push origin mvp-vX
git push origin --tags

# 9. Merge to develop (if stable)
git checkout develop
git merge mvp-vX
git push origin develop
```

---

## 🔍 Progress Detection Commands

### For AI to Check Current Phase

```bash
# 1. Check latest tag
git describe --tags --abbrev=0
# Output: v2.0.0-mvp (means v2 is complete, working on v3)

# 2. Check current branch
git branch --show-current
# Output: mvp-v3 (confirms working on v3)

# 3. Check phase completion
git tag -l "v*.0.0-mvp"
# Output: List of completed phases

# 4. Check work in progress
git status
# Shows uncommitted changes

# 5. Check recent commits
git log --oneline -10
# Shows recent work pattern
```

---

## 📊 Phase Status Detection Logic

The AI should run this sequence:

```bash
#!/bin/bash
# detect_phase.sh

# Get the latest MVP tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Parse phase from tag
if [[ $LATEST_TAG == v*.0.0-mvp ]]; then
    COMPLETED_PHASE=$(echo $LATEST_TAG | grep -oP '(?<=v)\d')
    NEXT_PHASE=$((COMPLETED_PHASE + 1))
    echo "Last completed: MVP v$COMPLETED_PHASE"
    echo "Should work on: MVP v$NEXT_PHASE"
else
    echo "No phases completed yet"
    echo "Should work on: MVP v1"
    NEXT_PHASE=1
fi

# Verify branch matches
if [[ $CURRENT_BRANCH == "mvp-v$NEXT_PHASE" ]]; then
    echo "✅ On correct branch: $CURRENT_BRANCH"
else
    echo "⚠️ Wrong branch. Should be on: mvp-v$NEXT_PHASE"
    echo "Run: git checkout -b mvp-v$NEXT_PHASE"
fi

# Check for uncommitted work
if [[ -n $(git status -s) ]]; then
    echo "📝 Uncommitted changes present"
    git status -s
else
    echo "✨ Working directory clean"
fi
```

---

## 🚀 Starting Each Phase

### Phase Start Template

```bash
# 1. Ensure on develop branch
git checkout develop
git pull origin develop

# 2. Check completed phases
git tag -l "v*.0.0-mvp"

# 3. Create phase branch (if not exists)
git checkout -b mvp-v[NEXT_NUMBER]

# 4. Create phase marker file
echo "MVP v[X] - Started: $(date)" > .phase-marker

# 5. Initial commit for phase
git add .phase-marker
git commit -m "chore(mvp-v[X]): Start MVP v[X] implementation"
```

---

## 📝 Updated Conversation Starter

Replace the original template with:

```markdown
I'm working on the AI Assistant LLM boilerplate project. This is a TypeScript CLI application with SQLite/Drizzle ORM implementing a 7-stage conversation pipeline with parallel classifiers.

PROJECT CONTEXT:
- Tech Stack: TypeScript, SQLite, Drizzle ORM, Anthropic/OpenAI APIs
- Architecture: 7-stage pipeline with parallel classification

Please check our progress using Git:
1. Run: git describe --tags --abbrev=0 (shows last completed phase)
2. Run: git branch --show-current (shows current working branch)
3. Run: git status (shows current changes)
4. Run: git log --oneline -5 (shows recent commits)

Based on Git tags:
- If latest tag is v1.0.0-mvp, we've completed MVP v1, should work on v2
- If latest tag is v2.0.0-mvp, we've completed MVP v2, should work on v3
- If no tags, we should start MVP v1

Please also read:
- @docs/plans/00_implementation_phases.md - Phasing roadmap
- @.claude/AI_ASSISTANT_RULES.md - Development rules
- @docs/GIT_STRATEGY.md - Git workflow

Tell me:
1. What phase are we currently on? (based on git tags)
2. What branch should we be on? (mvp-vX)
3. What's the next task for this phase?

Let's continue building from where we left off.
```

---

## 🎯 Benefits of Git-Based Tracking

1. **Single Source of Truth**: Git tags definitively show completed phases
2. **No Manual Updates**: No need to update tracker files
3. **Easy Rollback**: Can always return to last known good state
4. **Clear History**: Git log shows exact implementation sequence
5. **Automatic Detection**: AI can programmatically determine current phase
6. **Works Across Sessions**: Any AI can check git and know exactly where we are

---

## 📋 Quick Reference

### Check Progress
```bash
git tag -l "v*.0.0-mvp" | tail -1  # Last completed phase
```

### Start New Phase
```bash
NEXT_PHASE=3  # Set to your next phase number
git checkout -b mvp-v$NEXT_PHASE
echo "Starting MVP v$NEXT_PHASE" > .phase-marker
git add .phase-marker
git commit -m "chore(mvp-v$NEXT_PHASE): Start phase"
```

### Complete Phase
```bash
PHASE=3  # Set to current phase number
npm test && npm run build && npm run lint
git add .
git commit -m "feat(mvp-v$PHASE): Complete implementation"
git tag -a "v$PHASE.0.0-mvp" -m "MVP v$PHASE complete"
git push origin mvp-v$PHASE --tags
```

### Emergency Rollback
```bash
# Go back to last completed phase
git checkout $(git describe --tags --abbrev=0)
```

---

## 🔄 Migration from Progress Tracker to Git

To migrate existing progress to Git-based tracking:

```bash
# If you've completed MVP v1 and v2:
git tag -a "v1.0.0-mvp" -m "MVP v1: Basic message processing complete" [commit-hash-of-v1]
git tag -a "v2.0.0-mvp" -m "MVP v2: State management complete" [commit-hash-of-v2]

# Push tags
git push origin --tags
```

Now Git tags are your source of truth!