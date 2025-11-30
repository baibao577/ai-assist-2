# Automation Rules for Claude

## Automatic Actions

### 1. Post-Code-Change Actions

After modifying ANY TypeScript file (`.ts` or `.tsx`), automatically:

1. **Format Code First**
   ```bash
   npm run format
   ```
   (Auto-formats with Prettier to ensure consistency)

2. **Run ESLint Check**
   ```bash
   npm run lint
   ```
   (Checks for code quality issues)

3. **Run TypeScript Build**
   ```bash
   npm run build
   ```
   (Verifies TypeScript compilation)

4. **If formatting issues exist**, they're auto-fixed by step 1

5. **If ESLint errors exist**, attempt fix:
   ```bash
   npm run lint:fix
   npm run lint  # Check again
   ```

6. **Report status** to user:
   - ✅ "Code formatted, passes linting and TypeScript compilation"
   - ⚠️ "Fixed X issues, Y warnings remain"
   - ❌ "X ESLint errors, Y TypeScript errors need manual fixing"

### 2. Pre-Commit Checklist

Before marking any task as complete:

- [ ] Code formatted with Prettier (`npm run format`)
- [ ] ESLint shows 0 errors (`npm run lint`)
- [ ] All TypeScript files compile (`npm run build`)
- [ ] Unused parameters prefixed with `_`
- [ ] Functionality tested via CLI
- [ ] No test files left behind
- [ ] Documentation updated if needed

### 3. Tool Creation Workflow

When creating a new tool:

1. Create file in `src/tools/implementations/` or `src/tools/` subdirectory
2. Extend Tool class (or OrchestratorTool for delegation)
3. Define Zod schema
4. Implement execute method (prefix unused params with `_`)
5. Set `internal = true` if tool is not for LLM exposure
6. **Automatically run**: `npm run format && npm run lint`
7. Register in `src/tools/registry.ts`
8. **Automatically run**: `npm run format && npm run lint && npm run build`
9. Test with CLI

### 4. Database Changes

After modifying `src/database/schema.ts`:

1. **Automatically run**:
   ```bash
   npm run db:generate
   npm run format
   npm run lint
   npm run build
   ```

2. Inform user of migration status

### 5. Error Recovery

If any command fails:

1. Check for TypeScript errors first
2. Run `npm run lint` to identify issues
3. Check for missing imports
4. Verify file paths are correct
5. Report specific error to user

## Behavioral Rules

### Always Active Behaviors

1. **TodoWrite Usage**: Always use for multi-step tasks
2. **Incremental Testing**: Test after each significant change
3. **Lint Awareness**: Mention linting status in responses
4. **Error Context**: Provide full error messages with solutions

### Response Patterns

When user asks to modify code:
```
"I'll make those changes and ensure code quality."
[make changes]
"Formatting and validating code..."
[npm run format && npm run lint && npm run build]
"✅ Code changes complete, formatted, and passing all checks."
```

When creating new features:
```
"I'll implement this feature following the project patterns."
[implement]
"Running format, lint, and build checks..."
[npm run format && npm run lint && npm run build]
"✅ Feature implemented, validated, and tested via CLI."
```

## Trigger Conditions

### Automatic Validation Triggers

Run `npm run format && npm run lint && npm run build` when:
- Any `.ts` file is created
- Any `.ts` file is modified
- Any import statement changes
- Any new dependency is added
- Before marking task complete
- After fixing any error
- After running lint:fix

### Automatic Test Triggers

Run CLI test when:
- New tool is created
- Tool logic is modified
- Database schema changes
- Configuration changes

## Quality Gates

### Cannot Proceed If:
- ESLint has errors (must fix first)
- TypeScript compilation fails
- Required files are missing
- Database migrations pending

### Must Clean Up:
- Test files (test-*.ts)
- Commented code blocks
- Console.log in non-CLI files
- Unused imports

## Reporting Format

### Status Updates

```markdown
📋 Task: [Description]
🔧 Action: [What was done]
✅ Lint: Passing (0 errors, X warnings)
🧪 Test: [Result if tested]
```

### Error Reports

```markdown
❌ Error Detected
Type: [ESLint/TypeScript/Runtime]
File: [path/to/file.ts]
Line: [line number]
Issue: [description]
Fix: [proposed solution]
```

## Priority Rules

1. **Linting is mandatory** - Never skip
2. **Type safety over any** - Always use proper types
3. **Test before complete** - Verify functionality
4. **Clean commits** - No lint errors in commits
5. **Documentation accuracy** - Keep docs updated

---

These automation rules ensure consistent code quality and should be followed automatically without requiring user prompts.