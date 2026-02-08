#!/usr/bin/env node
/**
 * Dotfiles Coach – CLI entry point.
 *
 * Commands: analyze, suggest, apply, report
 */

import { Command, Option } from 'commander';
import { runAnalyze } from './commands/analyze.js';
import { runSuggest } from './commands/suggest.js';
import { runApply } from './commands/apply.js';
import { runReport } from './commands/report.js';
import type { ShellType, OutputFormat } from './types/index.js';

const program = new Command();

program
  .name('dotfiles-coach')
  .description(
    'Analyze shell history and use GitHub Copilot CLI to suggest automation improvements',
  )
  .version('1.0.0');

// ── analyze ──────────────────────────────────────────────────────────────────

program
  .command('analyze')
  .description('Analyze shell history and display insights')
  .addOption(
    new Option('--shell <type>', 'Shell type')
      .choices(['bash', 'zsh', 'powershell', 'auto'])
      .default('auto'),
  )
  .option(
    '--history-file <path>',
    'Path to history file (overrides auto-detection)',
  )
  .option('--min-frequency <n>', 'Minimum frequency threshold', '5')
  .option('--top <n>', 'Show top N patterns', '20')
  .addOption(
    new Option('--format <format>', 'Output format')
      .choices(['table', 'json', 'markdown'])
      .default('table'),
  )
  .action(
    async (opts: {
      shell: string;
      historyFile?: string;
      minFrequency: string;
      top: string;
      format: string;
    }) => {
      await runAnalyze({
        shell: opts.shell as ShellType | 'auto',
        historyFile: opts.historyFile,
        minFrequency: parseInt(opts.minFrequency, 10) || 5,
        top: parseInt(opts.top, 10) || 20,
        format: opts.format as OutputFormat,
      });
    },
  );

// ── suggest ──────────────────────────────────────────────────────────────────

program
  .command('suggest')
  .description('Generate Copilot-powered suggestions based on analysis')
  .addOption(
    new Option('--shell <type>', 'Shell type')
      .choices(['bash', 'zsh', 'powershell', 'auto'])
      .default('auto'),
  )
  .option(
    '--history-file <path>',
    'Path to history file (overrides auto-detection)',
  )
  .option('--min-frequency <n>', 'Minimum frequency threshold', '5')
  .option('--output <file>', 'Save suggestions to file instead of stdout')
  .option('--interactive', 'Review/approve each suggestion one by one')
  .action(
    async (opts: {
      shell: string;
      historyFile?: string;
      minFrequency: string;
      output?: string;
      interactive?: boolean;
    }) => {
      await runSuggest({
        shell: opts.shell as ShellType | 'auto',
        historyFile: opts.historyFile,
        minFrequency: parseInt(opts.minFrequency, 10) || 5,
        output: opts.output,
        interactive: opts.interactive ?? false,
      });
    },
  );

// ── apply ────────────────────────────────────────────────────────────────────

program
  .command('apply')
  .description('Write approved suggestions to shell configuration files')
  .option(
    '--output <file>',
    'Output file path (default: ~/.dotfiles_coach_aliases.sh)',
  )
  .option(
    '--append-to <file>',
    'Append to existing profile file (e.g., ~/.zshrc)',
  )
  .option('--dry-run', 'Show what would be written without modifying files')
  .option('--no-backup', 'Skip backup creation')
  .action(
    async (opts: {
      output?: string;
      appendTo?: string;
      dryRun?: boolean;
      backup?: boolean;
    }) => {
      await runApply({
        output: opts.output,
        appendTo: opts.appendTo,
        dryRun: opts.dryRun ?? false,
        backup: opts.backup ?? true,
      });
    },
  );

// ── report ───────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Generate a summary report of analysis and suggestions')
  .addOption(
    new Option('--shell <type>', 'Shell type')
      .choices(['bash', 'zsh', 'powershell', 'auto'])
      .default('auto'),
  )
  .option(
    '--history-file <path>',
    'Path to history file (overrides auto-detection)',
  )
  .option('--min-frequency <n>', 'Minimum frequency threshold', '5')
  .option('--top <n>', 'Show top N patterns', '20')
  .option('--output <file>', 'Write report to file (default: stdout)')
  .addOption(
    new Option('--format <format>', 'Report format')
      .choices(['markdown', 'json'])
      .default('markdown'),
  )
  .action(
    async (opts: {
      shell: string;
      historyFile?: string;
      minFrequency: string;
      top: string;
      output?: string;
      format: string;
    }) => {
      await runReport({
        shell: opts.shell as ShellType | 'auto',
        historyFile: opts.historyFile,
        minFrequency: parseInt(opts.minFrequency, 10) || 5,
        top: parseInt(opts.top, 10) || 20,
        output: opts.output,
        format: opts.format as 'markdown' | 'json',
      });
    },
  );

program.parse();
