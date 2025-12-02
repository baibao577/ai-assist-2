// Chat Command - Interactive conversation
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { pipeline } from '@/core/pipeline.js';
import { logger } from '@/core/logger.js';
import { registerHealthDomain } from '@/domains/health/index.js';
import type { PipelineContext } from '@/types/index.js';

// Initialize domains on module load
registerHealthDomain();

interface ChatOptions {
  user?: string;
  conversationId?: string;
  new?: boolean;
  debug?: boolean;
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start interactive chat session')
    .option('-u, --user <id>', 'User ID', 'cli-user')
    .option(
      '-n, --new',
      'Force create new conversation (ignore existing active conversations)',
      false
    )
    .option('-i, --conversation-id <id>', 'Continue specific conversation by ID')
    .option('-d, --debug', 'Show debug information', false)
    .action(async (options: ChatOptions) => {
      await executeChat(options);
    });
}

async function executeChat(options: ChatOptions): Promise<void> {
  // Debug: Log received options
  logger.info(
    {
      optionsReceived: {
        user: options.user,
        new: options.new,
        conversationId: options.conversationId,
        debug: options.debug,
      },
    },
    'Chat command: Starting with options'
  );

  console.info(chalk.blue('\n🤖 AI Assistant Ready (MVP v3)\n'));
  console.info(chalk.gray('Type "exit" or "quit" to end the conversation\n'));

  const userId = options.user ?? 'cli-user';
  // Force new conversation if --new flag is set, otherwise use provided ID or let pipeline find/create
  let conversationId = options.new ? undefined : options.conversationId;

  if (options.new) {
    console.info(chalk.yellow('Creating new conversation...\n'));
  } else if (options.conversationId) {
    console.info(chalk.yellow(`Continuing conversation: ${options.conversationId}\n`));
  }

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
      const forceNew = options.new && !conversationId;
      const context: PipelineContext = {
        conversationId,
        userId,
        message: message.trim(),
        timestamp: new Date(),
        forceNewConversation: forceNew,
      };

      // Debug log to verify flag
      logger.debug(
        {
          optionsNew: options.new,
          conversationId,
          forceNewConversation: forceNew,
        },
        'Chat command: Building pipeline context'
      );

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
