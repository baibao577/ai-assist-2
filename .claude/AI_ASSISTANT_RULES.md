# AI Assistant Development Rules

**Project**: AI Assistant Boilerplate
**Language**: TypeScript (strict mode)
**AI Provider**: Anthropic Claude / OpenAI
**Database**: SQLite with Drizzle ORM
**API**: Fastify (optional)

This document defines the rules and best practices that AI assistants should follow when working on this codebase.

## 🎯 Core Principles

1. **Code Quality First** - Always prioritize clean, maintainable, and well-tested code
2. **Type Safety** - Leverage TypeScript's type system fully
3. **Consistency** - Follow established patterns in the codebase
4. **Documentation** - Code should be self-documenting with clear naming and comments where needed

## 📋 Mandatory Rules

### 1. Run Type Checking and Linting After Every Code Change
```bash
# Check TypeScript compilation
npx tsc --noEmit

# Check ESLint
npm run lint
```
- **ALWAYS** run TypeScript compiler after modifying any TypeScript file
- **ALWAYS** run ESLint after TypeScript passes
- Fix all TypeScript errors before proceeding
- Fix all ESLint errors before proceeding
- Address warnings when possible
- Use `npm run lint:fix` for automatic ESLint fixes

### 2. Follow TypeScript Best Practices
- Use strict mode settings
- Avoid `any` types - use proper typing or `unknown` if needed
- Prefer interfaces over type aliases for object shapes
- Use enums for fixed sets of values
- Leverage type inference where appropriate

### 3. Database Operations
- Always use Drizzle ORM methods, never raw SQL
- Use repository pattern for data access
- Handle database errors gracefully
- Use transactions for multi-step operations

### 4. Error Handling
- Always use try-catch blocks for async operations
- Return structured error responses
- Log errors appropriately (error, warn, info levels)
- Never expose internal errors to end users

### 5. Tool Development
- All tools must extend the base `Tool` class
- Use Zod schemas for parameter validation
- Include comprehensive descriptions
- Handle edge cases in tool execution
- Return consistent `ToolResult` format

### 6. Testing Before Integration
- Test new features with the CLI first
- Verify all tools work end-to-end
- Check database operations
- Ensure proper error handling

## 🛠️ Development Workflow

### Before Starting Work
1. Understand the current architecture
2. Check existing patterns in similar files
3. Plan the implementation approach
4. Use TodoWrite tool to track tasks

### During Development
1. Write code following existing patterns
2. Run `npx tsc --noEmit` after each file modification
3. Run `npm run lint` after TypeScript passes
4. Test functionality with CLI commands
5. Update relevant documentation

### After Completing Features
1. Run TypeScript check: `npx tsc --noEmit`
2. Run full lint check: `npm run lint`
3. Format code: `npm run format`
4. Test all affected functionality
5. Clean up any test files or temporary code
6. Update documentation if needed

## 📁 Project Structure

```
src/
├── cli.ts           # CLI entry point
├── config.ts        # Configuration management
├── core/           # Core business logic
│   ├── agent.ts    # Main AI agent
│   └── intents/    # Intent classification and handlers
├── database/       # Database layer
│   ├── client.ts   # Database connection
│   ├── schema.ts   # Drizzle schema definitions
│   └── repositories/ # Data access layer
├── tools/          # AI tool implementations
│   ├── registry.ts # Tool management
│   └── implementations/ # Individual tools
└── types/          # TypeScript type definitions
```

## 🔍 Code Review Checklist

Before considering code complete, verify:

- [ ] All TypeScript files compile without errors
- [ ] ESLint passes with no errors (`npm run lint`)
- [ ] No `console.log` statements in non-CLI files
- [ ] All `any` types are justified or replaced
- [ ] Error handling is comprehensive
- [ ] Database operations use repositories
- [ ] New tools follow the established pattern
- [ ] Code is formatted (`npm run format`)
- [ ] Tests pass (when applicable)
- [ ] Documentation is updated

## 🚫 What NOT to Do

1. **Never skip linting** - Always run `npm run lint`
2. **Never use raw SQL** - Use Drizzle ORM
3. **Never ignore TypeScript errors** - Fix them properly
4. **Never commit commented-out code** - Remove it
5. **Never use `var`** - Use `const` or `let`
6. **Never ignore error handling** - Always handle potential failures
7. **Never modify schema without migrations** - Use `npm run db:generate`
8. **Never expose API keys or secrets** - Use environment variables

## 🎨 Code Style

### Naming Conventions
- **Files**: `kebab-case.ts` (e.g., `weather.tool.ts`)
- **Classes**: `PascalCase` (e.g., `WeatherTool`)
- **Interfaces**: `PascalCase` with `I` prefix optional (e.g., `ToolResult`)
- **Functions**: `camelCase` (e.g., `executeFunction`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Enums**: `PascalCase` for name, `UPPER_SNAKE_CASE` for values

### Import Order
1. External packages (`import { z } from 'zod'`)
2. Internal aliases (`import { Tool } from '@/types'`)
3. Relative imports (`import { helper } from './utils'`)
4. Type imports (`import type { ... }`)

### File Organization
1. Imports
2. Type definitions
3. Constants
4. Main class/function
5. Helper functions
6. Exports

## 📝 Git Commit Messages

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style changes (formatting, etc)
- `refactor:` Code refactoring
- `test:` Test additions or changes
- `chore:` Build process or auxiliary tool changes

## 🔧 Available Scripts

```bash
# Development
npm run dev          # Start CLI in watch mode
npm run cli          # Run CLI commands

# Code Quality
npm run type-check   # Check TypeScript compilation
npm run lint         # Check for linting errors
npm run lint:fix     # Auto-fix linting errors
npm run format       # Format code with Prettier
npm run format:check # Check formatting
npm run check        # Run both type-check and lint (recommended)

# Database
npm run db:generate  # Generate migrations
npm run db:push      # Apply migrations
npm run db:studio    # Open Drizzle Studio

# Build & Test
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run clean        # Clean build artifacts
```

## 🤖 AI-Specific Guidelines

When working as an AI assistant on this codebase:

1. **Always run `npm run check` after code changes** - This runs both TypeScript and ESLint checks
2. **Read existing code first** - Understand patterns before implementing
3. **Test incrementally** - Don't write large amounts of code without testing
4. **Ask for clarification** - When requirements are unclear
5. **Explain significant decisions** - Document why you chose specific approaches
6. **Clean up after yourself** - Remove test files and temporary code
7. **Update this document** - If you discover new patterns or rules

## 📚 Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Zod Documentation](https://zod.dev/)

---

**Remember**: Good code is not just code that works, but code that can be understood, maintained, and extended by others (including future AI assistants).