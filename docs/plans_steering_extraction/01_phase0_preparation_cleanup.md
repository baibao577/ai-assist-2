# Phase 0: Preparation & Cleanup

## Objective
Remove all Flow-related code and prepare the codebase for the new domain-based steering and extraction framework.

## Duration
Day 1 (4-6 hours)

## Prerequisites
- Backup current working branch
- Ensure all tests pass before starting
- Document current Flow system behavior for reference

## Tasks

### 1. Create Safety Backup
```bash
git checkout -b backup/flow-system-mvp-v2
git checkout mvp-v2
```

### 2. Remove Flow Core Files
Delete these files completely:
- `/src/core/flows/flow-engine.ts` (588 lines)
- `/src/core/flows/flow-hints.ts` (298 lines)
- `/src/core/flows/index.ts`
- `/src/types/flows.ts`

### 3. Remove Flow Classifier
- Delete `/src/core/classifiers/flow.classifier.ts`
- Update `/src/core/classifiers/index.ts`:
  - Remove flow classifier export
  - Remove flow classifier import

### 4. Remove Flow Repository
- Delete `/src/database/repositories/flow.repository.ts`
- Update `/src/database/repositories/index.ts`:
  - Remove flow repository export

### 5. Clean Pipeline.ts
Remove from `/src/core/pipeline.ts`:
- Lines 22-24: Flow imports
- Lines 115-238: Entire flow handling block
- Line 342-353: Flow classifier promise
- Line 363: Flow promise from Promise.all
- Update arbiter call to remove flowResult

### 6. Update Arbiter
In `/src/core/classifiers/arbiter.ts`:
- Remove flowResult from arbitrate method signature
- Remove flow-related decision logic
- Update tests

### 7. Clean Environment Variables
Remove from `.env`:
- `USE_FLOW_HINTS=true`

### 8. Database Cleanup
- Create migration to drop flow_instances table
- Remove flow-related types from database

## Validation Checklist
- [ ] All flow files deleted
- [ ] Pipeline compiles without errors
- [ ] No remaining flow imports
- [ ] Arbiter works without flow results
- [ ] Basic conversation still works
- [ ] Tests updated and passing

## Rollback Plan
If issues arise:
```bash
git checkout backup/flow-system-mvp-v2
```

## Next Phase Gate
Before proceeding to Phase 1:
- Confirm clean TypeScript compilation
- Run full test suite
- Test basic conversation flow
- Verify no flow references remain