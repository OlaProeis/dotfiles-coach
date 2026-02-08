/**
 * `dotfiles-coach analyze` command implementation.
 *
 * Orchestrates: shell detection → history path resolution → file reading →
 * history parsing → frequency analysis → safety detection → formatted output.
 */

import fs from 'node:fs/promises';
import { detectShell } from '../utils/shell-detect.js';
import { getHistoryPath } from '../utils/history-paths.js';
import { parseBashHistory } from '../parsers/bash.js';
import { analyzeFrequency } from '../analyzers/frequency.js';
import { detectDangerousPatterns } from '../analyzers/safety.js';
import { formatAnalysisTable } from '../formatters/table.js';
import { formatAnalysisJson } from '../formatters/json.js';
import { formatAnalysisMarkdown } from '../formatters/markdown.js';
import type { AnalyzeOptions, AnalysisResult } from '../types/index.js';

/**
 * Run the `analyze` command.
 *
 * Detects the shell, reads the history file, performs frequency and safety
 * analysis, and prints formatted results to stdout.
 *
 * @param options - CLI options parsed by Commander.
 * @returns The structured analysis result (also printed to stdout).
 */
export async function runAnalyze(
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  // Dynamic imports for ESM-only packages (project is CJS under NodeNext).
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  const spinner = ora('Detecting shell environment…').start();

  try {
    // 1 ── Detect shell ──────────────────────────────────────────────────────
    const shell = detectShell(options.shell);
    spinner.text = `Detected shell: ${shell}`;

    // 2 ── Resolve history file path ─────────────────────────────────────────
    const { filePath, source } = getHistoryPath(shell, options.historyFile);
    spinner.text = `Reading history from ${filePath}…`;

    // 3 ── Verify file exists ────────────────────────────────────────────────
    try {
      await fs.access(filePath);
    } catch {
      spinner.fail(`History file not found: ${filePath}`);
      if (source === 'default') {
        console.error(
          chalk.yellow(
            '\nTip: Use --history-file <path> to specify a custom history file location.',
          ),
        );
      }
      process.exit(1);
    }

    // 4 ── Parse history entries ─────────────────────────────────────────────
    // parseBashHistory handles Bash, Zsh (auto-detected), and PowerShell
    // (plain text, one command per line) via its bash-plain parser.
    spinner.text = 'Parsing history entries…';
    const entries = await parseBashHistory(filePath, { shell });

    if (entries.length === 0) {
      spinner.warn('No commands found in history file.');
      process.exit(0);
    }

    // 5 ── Frequency analysis ────────────────────────────────────────────────
    spinner.text = 'Analyzing command frequency…';
    const patterns = analyzeFrequency(entries, {
      minFrequency: options.minFrequency,
      top: options.top,
    });

    // 6 ── Dangerous pattern detection ───────────────────────────────────────
    spinner.text = 'Checking for dangerous patterns…';
    const safetyAlerts = detectDangerousPatterns(entries);

    // 7 ── Build result object ───────────────────────────────────────────────
    const uniqueCommands = new Set(entries.map((e) => e.command)).size;
    const result: AnalysisResult = {
      shell,
      historyFile: filePath,
      totalCommands: entries.length,
      uniqueCommands,
      patterns,
      safetyAlerts,
    };

    spinner.succeed('Analysis complete!');
    console.log('');

    // 8 ── Formatted output ──────────────────────────────────────────────────
    switch (options.format) {
      case 'json':
        console.log(formatAnalysisJson(result));
        break;
      case 'markdown':
        console.log(formatAnalysisMarkdown(result, options));
        break;
      default:
        console.log(await formatAnalysisTable(result, options));
        break;
    }

    return result;
  } catch (error) {
    spinner.fail('Analysis failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nError: ${message}`));
    process.exit(1);
  }
}
