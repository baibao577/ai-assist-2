// Chat Command - Interactive conversation
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { pipeline } from '@/core/pipeline.js';
import { logger } from '@/core/logger.js';
import type { PipelineContext } from '@/types/index.js';

interface ChatOptions {
  user?: string;
  conversation?: string;
  debug?: boolean;
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start interactive chat session')
    .option('-u, --user <id>', 'User ID', 'cli-user')
    .option('-c, --conversation <id>', 'Continue existing conversation')
    .option('-d, --debug', 'Show debug information', false)
    .action(async (options: ChatOptions) => {
      await executeChat(options);
    });
}

async function executeChat(options: ChatOptions): Promise<void> {
  console.info(chalk.blue('\n🤖 AI Assistant Ready (MVP v2)\n'));
  console.info(chalk.gray('Type "exit" or "quit" to end the conversation\n'));

  const userId = options.user ?? 'cli-user';
  let conversationId = options.conversation; // Let pipeline find/create conversation

  // Main conversation loop
  while (true) {
    try {
      // Get user input
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.green('You:'),
          prefix: '',
        },
      ]);

      // Check for exit commands
      if (!message.trim()) {
        continue;
      }

      if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
        break;
      }

      // Show processing indicator
      const spinner = ora('Thinking...').start();

      // Process message through pipeline
      const context: PipelineContext = {
        conversationId,
        userId,
        message: message.trim(),
        timestamp: new Date(),
      };

      const result = await pipeline.execute(context);

      // Capture conversation ID from result for subsequent messages
      conversationId = result.conversationId;

      logger.debug(
        {
          conversationId,
          messageId: result.messageId,
          processingTime: result.processingTime,
        },
        'Message processed successfully'
      );

      spinner.succeed(chalk.gray(`(${result.processingTime}ms)`));

      // Display response
      console.info(chalk.blue('\nAssistant:'), result.response);
      console.info('');

      // Show debug info if requested
      if (options.debug) {
        console.info(chalk.gray('─'.repeat(60)));
        console.info(chalk.gray('Debug Info:'));
        console.info(chalk.gray(`  Conversation ID: ${conversationId}`));
        console.info(chalk.gray(`  Message ID: ${result.messageId}`));
        console.info(chalk.gray(`  Processing Time: ${result.processingTime}ms`));
        console.info(chalk.gray('─'.repeat(60)));
        console.info('');
      }
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message, stack: err.stack }, 'Chat error');

      console.error(chalk.red('\n❌ Error:'), err.message);
      console.info('');

      if (options.debug) {
        console.error(chalk.red('Stack:'), err.stack);
      }
    }
  }

  console.info(chalk.blue('\n👋 Goodbye!\n'));
}
