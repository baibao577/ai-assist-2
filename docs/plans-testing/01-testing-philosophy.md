# Testing Philosophy for LLM-Based Systems

## Why Testing LLMs is Different

### The Fundamental Challenge

Traditional software testing relies on **deterministic behavior**: given input X, we always expect output Y. LLM-based systems break this assumption fundamentally:

```
Traditional Function: add(2, 3) → 5 (always)
LLM Function: classify("I'm sad") → could be "depression", "sadness", "melancholy" (varies)
```

### Key Differences from Traditional Testing

| Aspect | Traditional Software | LLM-Based Systems |
|--------|---------------------|-------------------|
| **Determinism** | Same input → Same output | Same input → Variable outputs |
| **Correctness** | Binary (pass/fail) | Spectrum (quality scores) |
| **Test Data** | Exact matches | Semantic similarity |
| **Coverage** | Code paths | Conversation scenarios |
| **Mocking** | Replace implementations | Record/replay patterns |
| **Cost** | CPU time only | API calls cost money |
| **Speed** | Milliseconds | Seconds per call |

## The Non-Determinism Problem

### Sources of Variability

1. **Model Updates**: OpenAI updates models regularly, changing outputs
2. **Temperature Settings**: Even at 0, outputs can vary
3. **Context Windows**: Different message history affects responses
4. **Token Sampling**: Probabilistic token selection introduces randomness
5. **System Prompts**: Small prompt changes cascade into different outputs

### Example: Same Input, Different Outputs

```typescript
// Monday's test run
classify("I'm stressed about money")
// Output: { level: "CONCERN", confidence: 0.85 }

// Tuesday's test run (same code, same input)
classify("I'm stressed about money")
// Output: { level: "CONCERN", confidence: 0.92 }

// After model update
classify("I'm stressed about money")
// Output: { level: "WARNING", confidence: 0.88 }
```

## The Layered Testing Approach

### Layer 1: Deterministic Core (Unit Tests)
**What**: Business logic that doesn't involve LLMs
**Why**: This is your safety net - it always works
**Coverage Goal**: 100%

Examples:
- Decay calculations
- State management
- Data validation
- Database operations
- Message routing

### Layer 2: Integration with Mocks
**What**: Component interactions using recorded LLM responses
**Why**: Fast, cheap, deterministic integration testing
**Coverage Goal**: 80%

Examples:
- Pipeline flow with mocked LLM calls
- Error handling paths
- State transitions
- Multi-stage processing

### Layer 3: Semantic Validation
**What**: Real LLM calls with flexible assertions
**Why**: Ensure quality without expecting exact outputs
**Coverage Goal**: Critical paths only

Examples:
- Safety classification accuracy
- Domain extraction completeness
- Response appropriateness
- Context understanding

## Cost-Benefit Analysis

### Testing Cost Factors

```
Unit Test Cost: ~$0 (CPU only)
Integration Test Cost: ~$0 (mocked responses)
Semantic Test Cost: $0.002-0.02 per test (real API calls)

Example Monthly Costs:
- 1000 unit tests × 100 runs/day = $0
- 100 integration tests × 20 runs/day = $0
- 20 semantic tests × 2 runs/day = ~$30/month
```

### Value vs Risk Matrix

| Component | Business Risk | Testing Cost | Priority |
|-----------|--------------|--------------|----------|
| Safety Classifier | CRITICAL - User safety | High | MUST TEST |
| Payment Processing | HIGH - Financial impact | Low | MUST TEST |
| Domain Extraction | MEDIUM - Features | Medium | SHOULD TEST |
| Conversation Flow | MEDIUM - UX | Low | SHOULD TEST |
| Response Quality | LOW - Subjective | High | NICE TO HAVE |

## Testing Principles for This Project

### 1. Test the Glue, Not the Model
We don't test if GPT-4 works - OpenAI does that. We test:
- Our prompts produce parseable outputs
- We handle errors gracefully
- Our business logic is correct
- State flows work as expected

### 2. Embrace Probabilistic Assertions
Instead of:
```typescript
expect(response).toBe("Hello! How can I help you today?")
```

Use:
```typescript
expect(response).toContain("help")
expect(response.length).toBeGreaterThan(10)
expect(sentiment(response)).toBe("positive")
```

### 3. Record and Replay for Stability
- Record real LLM responses during development
- Replay them in CI/CD for speed and consistency
- Refresh recordings periodically
- Use real calls only for quality checks

### 4. Focus on Behavior, Not Implementation
Test what the system does, not how:
- ✅ "Crisis messages trigger safety protocols"
- ❌ "The prompt contains the word 'safety'"

### 5. Optimize for Fast Feedback
- Unit tests: Run on every save (< 1 second)
- Integration tests: Run on every commit (< 10 seconds)
- Semantic tests: Run on PR/nightly (< 5 minutes)

## What Success Looks Like

### Good LLM Testing
- **Fast**: Most tests run without API calls
- **Reliable**: Tests don't randomly fail
- **Meaningful**: Failures indicate real problems
- **Maintainable**: Easy to update when requirements change
- **Cost-effective**: Minimal API costs

### Signs You're Testing Wrong
- ❌ Tests fail randomly without code changes
- ❌ Spending $100s/month on test API calls
- ❌ Testing exact LLM output strings
- ❌ Skipping tests because they're slow
- ❌ Complex prompt engineering in tests

## Summary

Testing LLM systems requires a fundamental shift in thinking:

1. **Accept non-determinism** - Don't fight it, work with it
2. **Layer your tests** - Deterministic core, flexible edges
3. **Mock strategically** - Record real responses, replay in tests
4. **Assert semantically** - Test meaning, not exact text
5. **Optimize costs** - Real LLM calls only when necessary
6. **Focus on value** - Test what matters to users

Remember: **We're not testing the LLM itself, we're testing our system that uses the LLM.**

Next: [Testing Strategies →](./02-testing-strategies.md)