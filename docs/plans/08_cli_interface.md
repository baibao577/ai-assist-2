# CLI Interface Implementation Plan

## Overview
Command-line interface for testing and interacting with the AI assistant system using TypeScript and Commander.js.

## CLI Architecture

### 1. Main CLI Entry Point
```typescript
// src/cli.ts
import { Command } from 'commander';
import { ChatCommand } from './cli/commands/chat';
import { DatabaseCommand } from './cli/commands/database';
import { PipelineCommand } from './cli/commands/pipeline';
import { FlowCommand } from './cli/commands/flow';
import { TestCommand } from './cli/commands/test';
import { ConfigCommand } from './cli/commands/config';

const program = new Command();

program
  .name('ai-assistant')
  .description('AI Assistant CLI - Test and interact with the conversation system')
  .version('1.0.0');

// Register commands
new ChatCommand(program);
new DatabaseCommand(program);
new PipelineCommand(program);
new FlowCommand(program);
new TestCommand(program);
new ConfigCommand(program);

program.parse(process.argv);
```

## Command Implementations

### 1. Chat Command (Interactive Conversation)
```typescript
// src/cli/commands/chat.ts
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class ChatCommand {
  private pipelineManager: PipelineManager;
  private conversationId: string;

  constructor(program: Command) {
    const chatCmd = program
      .command('chat')
      .description('Start interactive chat session')
      .option('-u, --user <id>', 'User ID', 'cli-user')
      .option('-c, --conversation <id>', 'Continue existing conversation')
      .option('-m, --mode <mode>', 'Initial conversation mode', 'consult')
      .option('-d, --debug', 'Show debug information')
      .option('--trace', 'Show execution traces')
      .action(this.execute.bind(this));
  }

  async execute(options: ChatOptions): Promise<void> {
    // Initialize services
    await this.initialize(options);

    console.log(chalk.blue('\n🤖 AI Assistant Ready\n'));
    console.log(chalk.gray('Type "exit" to quit, "help" for commands\n'));

    // Start conversation loop
    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.green('You:'),
          prefix: ''
        }
      ]);

      if (message.toLowerCase() === 'exit') break;

      if (message.startsWith('/')) {
        await this.handleCommand(message);
        continue;
      }

      // Process message through pipeline
      const spinner = ora('Processing...').start();

      try {
        const result = await this.processMessage(message, options);
        spinner.succeed();

        // Display response
        console.log(chalk.blue('\nAssistant:'), result.response);

        if (options.debug) {
          this.showDebugInfo(result);
        }

        if (options.trace) {
          this.showTrace(result.trace);
        }
      } catch (error) {
        spinner.fail('Error processing message');
        console.error(chalk.red(error.message));
      }
    }

    console.log(chalk.blue('\n👋 Goodbye!\n'));
  }

  private async processMessage(
    message: string,
    options: ChatOptions
  ): Promise<PipelineResult> {
    return this.pipelineManager.execute({
      conversationId: this.conversationId,
      userId: options.user,
      message,
      timestamp: new Date()
    });
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'state':
        await this.showState();
        break;
      case 'mode':
        await this.switchMode(args[0]);
        break;
      case 'flow':
        await this.startFlow(args[0]);
        break;
      case 'clear':
        console.clear();
        break;
      case 'history':
        await this.showHistory();
        break;
      case 'metrics':
        await this.showMetrics();
        break;
      default:
        console.log(chalk.yellow(`Unknown command: ${cmd}`));
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan('\nAvailable Commands:'));
    console.log('  /help     - Show this help message');
    console.log('  /state    - Show conversation state');
    console.log('  /mode     - Switch conversation mode');
    console.log('  /flow     - Start a flow');
    console.log('  /clear    - Clear screen');
    console.log('  /history  - Show message history');
    console.log('  /metrics  - Show performance metrics');
    console.log();
  }

  private showDebugInfo(result: PipelineResult): void {
    console.log(chalk.gray('\n--- Debug Info ---'));
    console.log('Mode:', result.state.mode);
    console.log('Classification:', {
      intent: result.classification.intent.primaryClass,
      sentiment: result.classification.sentiment.sentiment,
      topic: result.classification.topic.mainTopic,
      safety: result.classification.safety.riskLevel
    });
    console.log('Processing Time:', `${result.processingTime}ms`);
    console.log(chalk.gray('----------------\n'));
  }
}
```

### 2. Database Command
```typescript
// src/cli/commands/database.ts
export class DatabaseCommand {
  constructor(program: Command) {
    const dbCmd = program
      .command('db')
      .description('Database management commands');

    dbCmd
      .command('init')
      .description('Initialize database schema')
      .action(this.init.bind(this));

    dbCmd
      .command('migrate')
      .description('Run database migrations')
      .action(this.migrate.bind(this));

    dbCmd
      .command('seed')
      .description('Seed database with test data')
      .option('-n, --count <count>', 'Number of records', '10')
      .action(this.seed.bind(this));

    dbCmd
      .command('reset')
      .description('Reset database (WARNING: deletes all data)')
      .option('-f, --force', 'Skip confirmation')
      .action(this.reset.bind(this));

    dbCmd
      .command('studio')
      .description('Open Drizzle Studio')
      .action(this.studio.bind(this));

    dbCmd
      .command('query')
      .description('Execute custom query')
      .option('-s, --sql <query>', 'SQL query')
      .option('-t, --table <table>', 'Table to query')
      .action(this.query.bind(this));
  }

  private async init(): Promise<void> {
    const spinner = ora('Initializing database...').start();

    try {
      const db = await createDatabase();
      await runMigrations(db);
      spinner.succeed('Database initialized successfully');

      // Show table info
      const tables = await db.select(sql`
        SELECT name FROM sqlite_master
        WHERE type='table'
        ORDER BY name
      `);

      console.log(chalk.cyan('\nCreated tables:'));
      tables.forEach(t => console.log(`  - ${t.name}`));
    } catch (error) {
      spinner.fail('Failed to initialize database');
      console.error(error);
    }
  }

  private async seed(options: any): Promise<void> {
    const count = parseInt(options.count);
    const spinner = ora(`Seeding ${count} records...`).start();

    try {
      const seeder = new DatabaseSeeder();
      await seeder.seed({
        conversations: count,
        messagesPerConversation: 10,
        users: Math.ceil(count / 3)
      });

      spinner.succeed(`Seeded ${count} conversations successfully`);
    } catch (error) {
      spinner.fail('Seeding failed');
      console.error(error);
    }
  }
}
```

### 3. Pipeline Command
```typescript
// src/cli/commands/pipeline.ts
export class PipelineCommand {
  constructor(program: Command) {
    const pipelineCmd = program
      .command('pipeline')
      .description('Pipeline testing and debugging');

    pipelineCmd
      .command('test')
      .description('Test pipeline with a message')
      .option('-m, --message <message>', 'Message to process')
      .option('-s, --stage <stage>', 'Test specific stage only')
      .option('-v, --verbose', 'Verbose output')
      .action(this.test.bind(this));

    pipelineCmd
      .command('trace')
      .description('View pipeline execution trace')
      .option('-c, --conversation <id>', 'Conversation ID')
      .option('-t, --trace <id>', 'Specific trace ID')
      .action(this.trace.bind(this));

    pipelineCmd
      .command('bench')
      .description('Benchmark pipeline performance')
      .option('-i, --iterations <n>', 'Number of iterations', '100')
      .option('-c, --concurrent <n>', 'Concurrent executions', '1')
      .action(this.benchmark.bind(this));

    pipelineCmd
      .command('debug')
      .description('Debug pipeline execution')
      .option('-m, --message <message>', 'Message to debug')
      .option('--break <stage>', 'Set breakpoint at stage')
      .action(this.debug.bind(this));
  }

  private async test(options: any): Promise<void> {
    const message = options.message || 'Hello, how are you?';
    const stage = options.stage;

    console.log(chalk.cyan('\nTesting Pipeline'));
    console.log('Message:', chalk.yellow(message));

    if (stage) {
      console.log('Stage:', chalk.yellow(stage));
      await this.testStage(stage, message, options);
    } else {
      await this.testFullPipeline(message, options);
    }
  }

  private async testFullPipeline(
    message: string,
    options: any
  ): Promise<void> {
    const stages = [
      'load', 'decay', 'global', 'classify',
      'handle', 'post-process', 'save'
    ];

    for (const stage of stages) {
      const spinner = ora(`Stage: ${stage}`).start();

      try {
        const start = Date.now();
        const result = await this.executeStage(stage, message);
        const duration = Date.now() - start;

        spinner.succeed(`${stage} (${duration}ms)`);

        if (options.verbose) {
          console.log(chalk.gray(JSON.stringify(result, null, 2)));
        }
      } catch (error) {
        spinner.fail(`${stage} failed`);
        console.error(chalk.red(error.message));
        break;
      }
    }
  }

  private async benchmark(options: any): Promise<void> {
    const iterations = parseInt(options.iterations);
    const concurrent = parseInt(options.concurrent);

    console.log(chalk.cyan('\nBenchmarking Pipeline'));
    console.log(`Iterations: ${iterations}`);
    console.log(`Concurrent: ${concurrent}`);

    const results: number[] = [];
    const progressBar = new ProgressBar(
      'Progress [:bar] :percent :etas',
      { total: iterations }
    );

    const startTime = Date.now();

    for (let i = 0; i < iterations; i += concurrent) {
      const batch = Math.min(concurrent, iterations - i);
      const batchPromises = [];

      for (let j = 0; j < batch; j++) {
        batchPromises.push(this.runPipelineBenchmark());
      }

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      progressBar.update(i + batch);
    }

    const totalTime = Date.now() - startTime;

    // Calculate statistics
    const stats = {
      total: iterations,
      totalTime,
      avgTime: results.reduce((a, b) => a + b, 0) / results.length,
      minTime: Math.min(...results),
      maxTime: Math.max(...results),
      p50: this.percentile(results, 0.5),
      p95: this.percentile(results, 0.95),
      p99: this.percentile(results, 0.99),
      throughput: (iterations / totalTime) * 1000
    };

    console.log(chalk.green('\n✓ Benchmark Complete\n'));
    console.table(stats);
  }
}
```

### 4. Flow Command
```typescript
// src/cli/commands/flow.ts
export class FlowCommand {
  constructor(program: Command) {
    const flowCmd = program
      .command('flow')
      .description('Flow management and testing');

    flowCmd
      .command('start')
      .description('Start a new flow')
      .option('-t, --type <type>', 'Flow type')
      .option('-i, --interactive', 'Interactive mode')
      .action(this.start.bind(this));

    flowCmd
      .command('continue')
      .description('Continue an active flow')
      .option('-f, --flow <id>', 'Flow ID')
      .option('-i, --input <input>', 'Input for current step')
      .action(this.continue.bind(this));

    flowCmd
      .command('list')
      .description('List flows')
      .option('-a, --active', 'Show only active flows')
      .option('-u, --user <id>', 'Filter by user')
      .action(this.list.bind(this));

    flowCmd
      .command('simulate')
      .description('Simulate flow execution')
      .option('-t, --type <type>', 'Flow type')
      .option('-r, --responses <file>', 'Mock responses file')
      .action(this.simulate.bind(this));

    flowCmd
      .command('validate')
      .description('Validate flow definition')
      .option('-f, --file <file>', 'Flow definition file')
      .action(this.validate.bind(this));
  }

  private async start(options: any): Promise<void> {
    const flowTypes = Object.values(FlowType);

    let flowType = options.type;

    if (!flowType) {
      const { selectedType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedType',
          message: 'Select flow type:',
          choices: flowTypes
        }
      ]);
      flowType = selectedType;
    }

    console.log(chalk.cyan(`\nStarting ${flowType} flow...\n`));

    if (options.interactive) {
      await this.runInteractiveFlow(flowType);
    } else {
      const flow = await this.flowEngine.startFlow(
        flowType,
        'cli-conversation'
      );

      console.log(chalk.green('✓ Flow started'));
      console.log('Flow ID:', chalk.yellow(flow.id));
      console.log('First step:', flow.currentStepId);
    }
  }

  private async runInteractiveFlow(flowType: FlowType): Promise<void> {
    const flow = await this.flowEngine.startFlow(
      flowType,
      'cli-conversation'
    );

    while (!flow.state.completed) {
      const step = flow.getCurrentStep();

      // Display prompt
      console.log(chalk.blue('\n' + step.prompt.template));

      if (step.prompt.examples) {
        console.log(chalk.gray('Examples:'));
        step.prompt.examples.forEach(ex =>
          console.log(chalk.gray(`  - ${ex}`))
        );
      }

      // Get user input
      const { input } = await inquirer.prompt([
        {
          type: step.type === StepType.CHOICE ? 'list' : 'input',
          name: 'input',
          message: '>',
          choices: step.type === StepType.CHOICE ?
            step.validation.rules[0].values : undefined
        }
      ]);

      // Process input
      const result = await flow.executeStep(input);

      if (!result.success) {
        console.log(chalk.red(`Error: ${result.error}`));
        if (result.retry) {
          console.log(chalk.yellow('Please try again'));
          continue;
        }
      }

      if (result.output) {
        console.log(chalk.green(result.output));
      }

      if (result.completed) {
        console.log(chalk.green('\n✓ Flow completed!'));
        break;
      }
    }
  }
}
```

### 5. Test Command
```typescript
// src/cli/commands/test.ts
export class TestCommand {
  constructor(program: Command) {
    const testCmd = program
      .command('test')
      .description('Run various tests');

    testCmd
      .command('all')
      .description('Run all tests')
      .action(this.testAll.bind(this));

    testCmd
      .command('classifier')
      .description('Test classifiers')
      .option('-m, --message <message>', 'Message to classify')
      .option('-c, --classifier <name>', 'Specific classifier')
      .action(this.testClassifier.bind(this));

    testCmd
      .command('handler')
      .description('Test mode handlers')
      .option('-m, --mode <mode>', 'Handler mode')
      .option('-i, --input <message>', 'Input message')
      .action(this.testHandler.bind(this));

    testCmd
      .command('integration')
      .description('Run integration tests')
      .option('-s, --scenario <name>', 'Specific scenario')
      .action(this.testIntegration.bind(this));

    testCmd
      .command('load')
      .description('Load testing')
      .option('-u, --users <n>', 'Concurrent users', '10')
      .option('-d, --duration <s>', 'Duration in seconds', '60')
      .action(this.testLoad.bind(this));
  }

  private async testClassifier(options: any): Promise<void> {
    const message = options.message || 'I need help with my anxiety';
    const classifier = options.classifier;

    console.log(chalk.cyan('\nTesting Classifiers'));
    console.log('Message:', chalk.yellow(message));

    const classifiers = classifier ?
      [classifier] :
      ['safety', 'intent', 'topic', 'sentiment'];

    for (const name of classifiers) {
      const spinner = ora(`Classifying with ${name}`).start();

      try {
        const result = await this.runClassifier(name, message);
        spinner.succeed(`${name}: ${result.primaryClass} (${result.confidence.toFixed(2)})`);

        console.log(chalk.gray(JSON.stringify(result, null, 2)));
      } catch (error) {
        spinner.fail(`${name} failed`);
        console.error(error);
      }
    }
  }

  private async testIntegration(options: any): Promise<void> {
    const scenarios = options.scenario ?
      [options.scenario] :
      ['basic-chat', 'crisis-flow', 'commerce-flow', 'goal-setting'];

    console.log(chalk.cyan('\nRunning Integration Tests\n'));

    const results = [];

    for (const scenario of scenarios) {
      const spinner = ora(`Testing ${scenario}`).start();

      try {
        const result = await this.runScenario(scenario);
        spinner.succeed(`${scenario}: ${result.passed}/${result.total} tests passed`);
        results.push(result);
      } catch (error) {
        spinner.fail(`${scenario} failed`);
        results.push({ scenario, passed: 0, total: 1, error });
      }
    }

    // Summary
    console.log(chalk.cyan('\n--- Test Summary ---'));
    const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
    const totalTests = results.reduce((sum, r) => sum + r.total, 0);

    console.log(`Total: ${totalPassed}/${totalTests} tests passed`);

    if (totalPassed === totalTests) {
      console.log(chalk.green('✓ All tests passed!'));
    } else {
      console.log(chalk.red('✗ Some tests failed'));
    }
  }
}
```

### 6. Config Command
```typescript
// src/cli/commands/config.ts
export class ConfigCommand {
  constructor(program: Command) {
    const configCmd = program
      .command('config')
      .description('Configuration management');

    configCmd
      .command('show')
      .description('Show current configuration')
      .action(this.show.bind(this));

    configCmd
      .command('set')
      .description('Set configuration value')
      .argument('<key>', 'Configuration key')
      .argument('<value>', 'Configuration value')
      .action(this.set.bind(this));

    configCmd
      .command('validate')
      .description('Validate configuration')
      .action(this.validate.bind(this));

    configCmd
      .command('export')
      .description('Export configuration')
      .option('-f, --file <file>', 'Output file', 'config.json')
      .action(this.export.bind(this));
  }

  private async show(): Promise<void> {
    const config = await loadConfig();

    console.log(chalk.cyan('\nCurrent Configuration:\n'));

    // Mask sensitive values
    const displayConfig = {
      ...config,
      llm: {
        ...config.llm,
        apiKey: config.llm.apiKey ? '***' : 'not set'
      }
    };

    console.log(JSON.stringify(displayConfig, null, 2));
  }

  private async validate(): Promise<void> {
    const spinner = ora('Validating configuration...').start();

    try {
      const config = await loadConfig();
      const validation = await validateConfig(config);

      if (validation.valid) {
        spinner.succeed('Configuration is valid');
      } else {
        spinner.fail('Configuration is invalid');
        console.log(chalk.red('\nErrors:'));
        validation.errors.forEach(err =>
          console.log(`  - ${err}`)
        );
      }
    } catch (error) {
      spinner.fail('Failed to validate configuration');
      console.error(error);
    }
  }
}
```

## Utility Functions

### 1. Display Helpers
```typescript
// src/cli/utils/display.ts
export class DisplayUtils {
  static formatTable(data: any[]): void {
    console.table(data);
  }

  static formatJson(data: any, color: boolean = true): string {
    const json = JSON.stringify(data, null, 2);
    return color ? highlight(json, { language: 'json' }) : json;
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  static createProgressBar(total: number, label: string): any {
    return new ProgressBar(`${label} [:bar] :percent :etas`, {
      total,
      width: 40,
      complete: '█',
      incomplete: '░'
    });
  }
}
```

### 2. Interactive Helpers
```typescript
// src/cli/utils/interactive.ts
export class InteractiveUtils {
  static async confirmAction(message: string): Promise<boolean> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message,
        default: false
      }
    ]);
    return confirm;
  }

  static async selectFromList(
    message: string,
    choices: string[]
  ): Promise<string> {
    const { selection } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message,
        choices
      }
    ]);
    return selection;
  }

  static async multiSelect(
    message: string,
    choices: string[]
  ): Promise<string[]> {
    const { selections } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selections',
        message,
        choices
      }
    ]);
    return selections;
  }
}
```

## Configuration

### 1. CLI Configuration File
```typescript
// src/cli/config.ts
export interface CLIConfig {
  defaultUser: string;
  defaultMode: ConversationMode;
  debugMode: boolean;
  tracingEnabled: boolean;
  colors: boolean;
  maxHistoryDisplay: number;
  llmTimeout: number;
  databasePath: string;
}

export const DEFAULT_CLI_CONFIG: CLIConfig = {
  defaultUser: 'cli-user',
  defaultMode: ConversationMode.CONSULT,
  debugMode: false,
  tracingEnabled: false,
  colors: true,
  maxHistoryDisplay: 10,
  llmTimeout: 30000,
  databasePath: './data/assistant.db'
};

export async function loadCLIConfig(): Promise<CLIConfig> {
  const configPath = path.join(os.homedir(), '.ai-assistant', 'cli.json');

  if (await fs.pathExists(configPath)) {
    const config = await fs.readJson(configPath);
    return { ...DEFAULT_CLI_CONFIG, ...config };
  }

  return DEFAULT_CLI_CONFIG;
}
```

## Package.json Scripts

```json
{
  "scripts": {
    "cli": "tsx src/cli.ts",
    "cli:chat": "tsx src/cli.ts chat",
    "cli:db:init": "tsx src/cli.ts db init",
    "cli:db:seed": "tsx src/cli.ts db seed",
    "cli:pipeline:test": "tsx src/cli.ts pipeline test",
    "cli:flow:start": "tsx src/cli.ts flow start",
    "cli:test": "tsx src/cli.ts test all",
    "cli:dev": "nodemon --watch src --ext ts --exec tsx src/cli.ts"
  }
}
```

## Implementation Timeline
1. **Week 1**: Basic CLI structure and chat command
2. **Week 2**: Database and pipeline commands
3. **Week 3**: Flow and test commands
4. **Week 4**: Interactive features and helpers
5. **Week 5**: Configuration and utilities
6. **Week 6**: Polish and documentation