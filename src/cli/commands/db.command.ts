// Database Command - Database management
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { initializeDatabase, closeDatabase } from '@/database/client.js';

export function registerDbCommand(program: Command): void {
  const dbCmd = program.command('db').description('Database management commands');

  dbCmd
    .command('init')
    .description('Initialize database schema')
    .action(async () => {
      await executeInit();
    });
}

async function executeInit(): Promise<void> {
  const spinner = ora('Initializing database...').start();

  try {
    await initializeDatabase();
    spinner.succeed(chalk.green('Database initialized successfully!'));

    console.info(chalk.cyan('\nCreated tables:'));
    console.info('  - conversations');
    console.info('  - messages');
    console.info('');
  } catch (error) {
    spinner.fail(chalk.red('Failed to initialize database'));
    console.error(chalk.red('Error:'), (error as Error).message);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
