/**
 * `dotfiles-coach report` command implementation.
 *
 * Generates a comprehensive markdown or JSON report combining analysis results
 * with cached Copilot suggestions. Matches PRD §8 output.
 *
 * Flow:
 *  1. Run the same analysis pipeline as `analyze`
 *  2. Load cached suggestions (if any) from last `suggest` run
 *  3. Combine into a formatted report
 *  4. Write to file (--output) or print to stdout
 */

import fs from 'node:fs/promises';
import { detectShell } from '../utils/shell-detect.js';
import { getHistoryPath } from '../utils/history-paths.js';
import { parseBashHistory } from '../parsers/bash.js';
import { analyzeFrequency } from '../analyzers/frequency.js';
import { detectDangerousPatterns } from '../analyzers/safety.js';
import {
  readJsonFile,
  writeFileSafe,
  getSuggestionsCachePath,
} from '../utils/file-operations.js';
import {
  formatFullReport,
  formatFullReportJson,
} from '../formatters/markdown.js';
import type {
  ReportOptions,
  SuggestionsCache,
  AnalysisResult,
  Suggestion,
} from '../types/index.js';

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Run the `report` command.
 *
 * 1. Analyse history (same pipeline as `analyze`)
 * 2. Load cached suggestions from last `suggest` run
 * 3. Generate formatted report (markdown or JSON)
 * 4. Write to file or stdout
 */
export async function runReport(options: ReportOptions): Promise<void> {
  // Dynamic imports for ESM-only packages.
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  const spinner = ora('Preparing report…').start();

  try {
    // 1 ── Detect shell ──────────────────────────────────────────────────
    const shell = detectShell(options.shell);
    spinner.text = `Detected shell: ${shell}`;

    // 2 ── Resolve history file path ─────────────────────────────────────
    const { filePath, source } = getHistoryPath(shell, options.historyFile);
    spinner.text = `Reading history from ${filePath}…`;

    // 3 ── Verify file exists ────────────────────────────────────────────
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

    // 4 ── Parse history entries ─────────────────────────────────────────
    spinner.text = 'Parsing history entries…';
    const entries = await parseBashHistory(filePath, { shell });

    if (entries.length === 0) {
      spinner.warn('No commands found in history file.');
      process.exit(0);
    }

    // 5 ── Frequency analysis ────────────────────────────────────────────
    spinner.text = 'Analyzing command frequency…';
    const patterns = analyzeFrequency(entries, {
      minFrequency: options.minFrequency,
      top: options.top,
    });

    // 6 ── Dangerous pattern detection ───────────────────────────────────
    spinner.text = 'Checking for dangerous patterns…';
    const safetyAlerts = detectDangerousPatterns(entries);

    // 7 ── Build analysis result ─────────────────────────────────────────
    const uniqueCommands = new Set(entries.map((e) => e.command)).size;
    const result: AnalysisResult = {
      shell,
      historyFile: filePath,
      totalCommands: entries.length,
      uniqueCommands,
      patterns,
      safetyAlerts,
    };

    // 8 ── Load cached suggestions (optional) ────────────────────────────
    spinner.text = 'Loading cached suggestions…';
    let suggestions: Suggestion[] = [];
    let generatedAt: string | undefined;

    const cache = await readJsonFile<SuggestionsCache>(
      getSuggestionsCachePath(),
    );

    if (cache?.suggestions && cache.suggestions.length > 0) {
      suggestions = cache.suggestions;
      generatedAt = cache.generatedAt;

      // Warn if cached suggestions were generated for a different shell
      if (cache.shell && cache.shell !== shell) {
        spinner.warn(
          `Cached suggestions were generated for ${cache.shell}, but current analysis is for ${shell}. Re-run 'suggest --shell ${shell}' for matching results.`,
        );
        spinner.start('Generating report…');
      }
    }

    // 9 ── Generate report ───────────────────────────────────────────────
    spinner.text = 'Generating report…';

    const format = options.format ?? 'markdown';
    let reportContent: string;

    if (format === 'json') {
      reportContent = formatFullReportJson(result, suggestions, generatedAt);
    } else {
      reportContent = formatFullReport(result, suggestions, generatedAt);
    }

    // 10 ── Output ───────────────────────────────────────────────────────
    if (options.output) {
      await writeFileSafe(options.output, reportContent + '\n');

      spinner.succeed('Report generated!');
      console.log('');
      console.log(
        chalk.green(`Report written to: ${options.output}`),
      );

      if (suggestions.length === 0) {
        console.log('');
        console.log(
          chalk.yellow(
            "Tip: Run 'dotfiles-coach suggest' first to include automation suggestions in the report.",
          ),
        );
      }
    } else {
      spinner.succeed('Report generated!');
      console.log('');
      console.log(reportContent);

      if (suggestions.length === 0) {
        console.log(
          chalk.yellow(
            "Tip: Run 'dotfiles-coach suggest' first to include automation suggestions in the report.",
          ),
        );
        console.log('');
      }
    }
  } catch (error) {
    spinner.fail('Report generation failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nError: ${message}`));
    process.exit(1);
  }
}
