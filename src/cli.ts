#!/usr/bin/env node

// AI Assistant CLI - Main entry point
// MVP v1: Basic chat with database persistence

import { Command } from 'commander';
import { registerChatCommand } from '@/cli/commands/chat.command.js';
import { registerDbCommand } from '@/cli/commands/db.command.js';
import { registerDomainsCommand } from '@/cli/commands/domains.command.js';

const program = new Command();

program
  .name('ai-assistant')
  .description('AI Assistant CLI - MVP v2: State Management & Modes')
  .version('1.0.0-mvp-v2');

// Register commands
registerChatCommand(program);
registerDbCommand(program);
registerDomainsCommand(program);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
