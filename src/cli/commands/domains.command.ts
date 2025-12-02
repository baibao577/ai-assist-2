// Domains Command - Manage domain configuration
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { domainConfig } from '@/core/domains/config/DomainConfig.js';
import { domainRegistry } from '@/core/domains/registries/index.js';

interface DomainOptions {
  list?: boolean;
  enable?: string;
  disable?: string;
  config?: boolean;
}

export function registerDomainsCommand(program: Command): void {
  program
    .command('domains')
    .description('Manage domain configuration')
    .option('-l, --list', 'List all registered domains')
    .option('-e, --enable <domainId>', 'Enable a domain')
    .option('-d, --disable <domainId>', 'Disable a domain')
    .option('-c, --config', 'Interactive configuration')
    .action(async (options: DomainOptions) => {
      await executeDomainsCommand(options);
    });
}

async function executeDomainsCommand(options: DomainOptions): Promise<void> {
  // List domains
  if (options.list) {
    listDomains();
    return;
  }

  // Enable domain
  if (options.enable) {
    enableDomain(options.enable);
    return;
  }

  // Disable domain
  if (options.disable) {
    disableDomain(options.disable);
    return;
  }

  // Interactive config
  if (options.config) {
    await interactiveConfig();
    return;
  }

  // Default: show domains
  listDomains();
}

function listDomains(): void {
  console.log(chalk.blue('\n📋 Registered Domains:\n'));

  const allDomains = domainRegistry.getAllDomains();
  const config = domainConfig.getGlobalConfig();

  for (const domain of allDomains) {
    const domainConfig = config.domains.find((d) => d.domainId === domain.id);
    const isEnabled = domainConfig?.enabled ?? false;

    const status = isEnabled ? chalk.green('✓ Enabled') : chalk.red('✗ Disabled');
    const priority = domain.priority || 0;

    console.log(`${chalk.bold(domain.name)} (${domain.id})`);
    console.log(`  Status: ${status}`);
    console.log(`  Priority: ${priority}`);
    console.log(`  ${chalk.gray(domain.description)}`);

    if (domain.capabilities) {
      const caps = [];
      if (domain.capabilities.extraction) caps.push('Extraction');
      if (domain.capabilities.steering) caps.push('Steering');
      if (domain.capabilities.summarization) caps.push('Summarization');
      console.log(`  Capabilities: ${chalk.cyan(caps.join(', '))}`);
    }

    console.log();
  }

  // Show global status
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.bold('Global Settings:'));
  console.log(`  System: ${config.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
  console.log(
    `  Steering: ${config.steeringEnabled ? chalk.green('Enabled') : chalk.red('Disabled')}`
  );
  console.log();
}

function enableDomain(domainId: string): void {
  const domain = domainRegistry.getDomain(domainId);
  if (!domain) {
    console.error(chalk.red(`Domain '${domainId}' not found`));
    return;
  }

  domainConfig.updateDomainConfig(domainId, { enabled: true });
  console.log(chalk.green(`✓ Domain '${domain.name}' enabled`));
}

function disableDomain(domainId: string): void {
  const domain = domainRegistry.getDomain(domainId);
  if (!domain) {
    console.error(chalk.red(`Domain '${domainId}' not found`));
    return;
  }

  domainConfig.updateDomainConfig(domainId, { enabled: false });
  console.log(chalk.yellow(`✗ Domain '${domain.name}' disabled`));
}

async function interactiveConfig(): Promise<void> {
  console.log(chalk.blue('\n⚙️  Domain Configuration\n'));

  const globalConfig = domainConfig.getGlobalConfig();

  // Global settings
  const { globalEnabled, steeringEnabled } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'globalEnabled',
      message: 'Enable domain system?',
      default: globalConfig.enabled,
    },
    {
      type: 'confirm',
      name: 'steeringEnabled',
      message: 'Enable conversation steering?',
      default: globalConfig.steeringEnabled,
      when: (answers) => answers.globalEnabled,
    },
  ]);

  domainConfig.updateGlobalConfig({
    enabled: globalEnabled,
    steeringEnabled: steeringEnabled,
  });

  if (!globalEnabled) {
    console.log(chalk.yellow('Domain system disabled'));
    return;
  }

  // Domain-specific settings
  const allDomains = domainRegistry.getAllDomains();

  for (const domain of allDomains) {
    console.log(chalk.gray(`\nConfiguring ${domain.name}:`));

    const currentConfig = domainConfig.getDomainConfig(domain.id) || {
      domainId: domain.id,
      enabled: true,
    };

    const { enabled, confidenceThreshold } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enabled',
        message: `Enable ${domain.name}?`,
        default: currentConfig.enabled,
      },
      {
        type: 'number',
        name: 'confidenceThreshold',
        message: 'Minimum confidence threshold (0-1):',
        default: currentConfig.extractionConfig?.confidenceThreshold || 0.5,
        when: (answers) => answers.enabled,
        validate: (value) => {
          const num = parseFloat(value);
          if (isNaN(num) || num < 0 || num > 1) {
            return 'Please enter a number between 0 and 1';
          }
          return true;
        },
      },
    ]);

    domainConfig.updateDomainConfig(domain.id, {
      enabled,
      extractionConfig: {
        ...currentConfig.extractionConfig,
        confidenceThreshold,
      },
    });
  }

  console.log(chalk.green('\n✓ Configuration saved\n'));
  listDomains();
}
