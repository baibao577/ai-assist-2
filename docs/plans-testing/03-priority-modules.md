# Priority Modules for Testing

## Testing Priority Matrix

### Priority Levels
- 🔴 **P0 (Critical)**: System breaks without these working
- 🟠 **P1 (High)**: Core features, user-facing impact
- 🟡 **P2 (Medium)**: Important but has fallbacks
- 🟢 **P3 (Low)**: Nice to have, optimization

## Module Priority Ranking

### 🔴 P0: Critical - Test First!

#### 1. Safety Classifier (`src/core/classifiers/safety.classifier.ts`)
**Why Critical**: User safety is paramount
**Risk**: Missing crisis detection could harm users
**Testing Complexity**: Medium (needs semantic testing)
**Test Types**: Unit (parsing), Integration (flow), Semantic (accuracy)

```typescript
// What to test
- Crisis keyword detection
- Confidence threshold handling
- Fallback to SAFE when uncertain
- Error handling for malformed responses
```

#### 2. Database Operations (`src/database/repositories/`)
**Why Critical**: Data loss/corruption is unrecoverable
**Risk**: Lost conversations, corrupted state
**Testing Complexity**: Low (deterministic)
**Test Types**: Unit, Integration

```typescript
// What to test
- CRUD operations work correctly
- Transactions maintain consistency
- Error handling for DB failures
- Concurrent access handling
```

#### 3. Error Handling & Fallbacks
**Why Critical**: System must degrade gracefully
**Risk**: Complete system failure
**Testing Complexity**: Low
**Test Types**: Unit, Integration

```typescript
// What to test
- LLM timeout handling
- Malformed response handling
- Database connection failures
- Missing environment variables
```

### 🟠 P1: High Priority - Core Features

#### 4. Pipeline Flow (`src/core/pipeline.ts`)
**Why Important**: Main orchestration logic
**Risk**: Broken user experience
**Testing Complexity**: High (many dependencies)
**Test Types**: Integration with mocks

```typescript
// What to test
- Stage execution order
- State passing between stages
- Parallel group coordination
- Error propagation
```

#### 5. State Management (`src/core/stages/decay.stage.ts`)
**Why Important**: Conversation continuity
**Risk**: Lost context, weird responses
**Testing Complexity**: Low (deterministic)
**Test Types**: Unit

```typescript
// What to test
- Decay calculations
- State merging logic
- Context element management
- Goal status updates
```

#### 6. Schema Validation (All `schemas/*.schema.ts`)
**Why Important**: Data integrity
**Risk**: Runtime errors, data corruption
**Testing Complexity**: Low
**Test Types**: Unit

```typescript
// What to test
- Valid data passes
- Invalid data rejected
- Partial data handled (nullable fields)
- Edge cases (empty arrays, null values)
```

### 🟡 P2: Medium Priority - Important Features

#### 7. Intent Classifier (`src/core/classifiers/intent.classifier.ts`)
**Why Important**: Routing logic
**Risk**: Wrong mode selection
**Testing Complexity**: Medium
**Test Types**: Unit (parsing), Integration

```typescript
// What to test
- Intent extraction logic
- Mode suggestion accuracy
- Entity detection
- Default fallbacks
```

#### 8. Domain Extractors (`src/domains/*/extractors/`)
**Why Important**: Feature richness
**Risk**: Missing domain-specific features
**Testing Complexity**: Medium
**Test Types**: Unit (schema), Integration

```typescript
// What to test
- Health data extraction
- Finance data extraction
- Confidence scoring
- Partial extraction handling
```

#### 9. Message Handlers (`src/core/modes/*.handler.ts`)
**Why Important**: Response generation
**Risk**: Poor response quality
**Testing Complexity**: High (LLM dependent)
**Test Types**: Integration, Semantic

```typescript
// What to test
- Correct mode handling
- Context inclusion
- Response formatting
- Steering hint application
```

### 🟢 P3: Low Priority - Optimizations

#### 10. Parallel Processing
**Why Less Critical**: Performance only
**Risk**: Slower responses
**Testing Complexity**: Medium
**Test Types**: Performance tests

```typescript
// What to test
- Parallel vs sequential timing
- Race condition handling
- Error in one parallel branch
```

#### 11. Domain History Loading
**Why Less Critical**: Enhancement feature
**Risk**: Less contextual responses
**Testing Complexity**: Medium
**Test Types**: Integration

```typescript
// What to test
- History retrieval
- History limit enforcement
- History in system prompt
```

#### 12. Logging & Monitoring
**Why Less Critical**: Debugging aid
**Risk**: Harder debugging
**Testing Complexity**: Low
**Test Types**: Unit

```typescript
// What to test
- Log levels work correctly
- Sensitive data not logged
- Performance metrics accurate
```

## Testing Effort Estimation

### Quick Wins (Start Here!)
These give maximum value for minimum effort:

| Module | Time | Value | ROI |
|--------|------|-------|-----|
| Schema Validation | 2 hrs | High | ⭐⭐⭐⭐⭐ |
| Database Repos | 4 hrs | Critical | ⭐⭐⭐⭐⭐ |
| Decay Logic | 2 hrs | High | ⭐⭐⭐⭐ |
| Error Handling | 3 hrs | Critical | ⭐⭐⭐⭐ |

### Medium Effort
Balance of effort and value:

| Module | Time | Value | ROI |
|--------|------|-------|-----|
| Safety Classifier | 8 hrs | Critical | ⭐⭐⭐⭐ |
| Pipeline Flow | 8 hrs | High | ⭐⭐⭐ |
| Intent Classifier | 6 hrs | Medium | ⭐⭐⭐ |

### High Effort
Important but time-consuming:

| Module | Time | Value | ROI |
|--------|------|-------|-----|
| Semantic Testing | 16 hrs | High | ⭐⭐⭐ |
| Multi-turn Context | 12 hrs | Medium | ⭐⭐ |
| Performance Tests | 8 hrs | Low | ⭐⭐ |

## Module Testing Checklist

### Phase 1: Foundation (Week 1)
- [ ] Set up Vitest
- [ ] Configure test structure
- [ ] Create mock utilities
- [ ] Test database repositories
- [ ] Test schema validation
- [ ] Test decay logic

### Phase 2: Core Logic (Week 2)
- [ ] Test safety classifier (unit)
- [ ] Test error handling
- [ ] Test pipeline flow (mocked)
- [ ] Test state management

### Phase 3: Integration (Week 3)
- [ ] Set up VCR/MSW
- [ ] Test pipeline integration
- [ ] Test multi-turn conversations
- [ ] Test domain extractors

### Phase 4: Quality (Week 4)
- [ ] Add semantic tests for safety
- [ ] Add response quality tests
- [ ] Add performance tests
- [ ] Set up CI/CD

## Risk-Based Testing Priority

### By User Impact
1. **Safety Issues** → Test exhaustively
2. **Data Loss** → Test all paths
3. **Wrong Responses** → Test key scenarios
4. **Slow Performance** → Test if time permits

### By Likelihood of Bugs
1. **Complex Logic** (pipeline) → High test coverage
2. **External Dependencies** (LLM) → Mock extensively
3. **Simple Calculations** (decay) → Basic tests sufficient
4. **UI/Display** → Manual testing okay

### By Change Frequency
1. **Frequently Modified** → Comprehensive tests
2. **Stable Code** → Basic tests sufficient
3. **Third-party Deps** → Integration tests only

## Recommended Testing Order

### Week 1: Foundations
```
1. Database repositories (4 hrs)
2. Schema validation (2 hrs)
3. Decay & state logic (2 hrs)
4. Basic error handling (2 hrs)
= 10 hours
```

### Week 2: Critical Path
```
1. Safety classifier - unit (4 hrs)
2. Pipeline flow - mocked (4 hrs)
3. Intent classifier - unit (2 hrs)
= 10 hours
```

### Week 3: Integration
```
1. VCR setup (2 hrs)
2. Pipeline integration (4 hrs)
3. Domain extractors (4 hrs)
= 10 hours
```

### Week 4: Quality & Polish
```
1. Semantic safety tests (4 hrs)
2. Multi-turn tests (4 hrs)
3. CI/CD setup (2 hrs)
= 10 hours
```

## Success Metrics

### Coverage Goals
- P0 modules: 90% coverage
- P1 modules: 70% coverage
- P2 modules: 50% coverage
- P3 modules: 30% coverage

### Quality Gates
- All P0 tests must pass for deployment
- P1 test failures block merge to main
- P2 test failures generate warnings
- P3 test failures are informational

## Summary

Start with:
1. **Database & Schemas** - Quick, high value
2. **Safety Classifier** - Critical for users
3. **Pipeline Flow** - Core functionality

Skip (initially):
1. Performance optimization tests
2. Extensive semantic testing
3. UI/formatting tests

Focus on testing the **glue code** that connects LLMs to your business logic, not the LLM outputs themselves.

Next: [Practical Implementation →](./04-practical-implementation.md)