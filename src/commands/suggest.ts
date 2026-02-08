/**
 * `dotfiles-coach suggest` command implementation.
 *
 * Orchestrates: shell detection -> history path resolution -> file reading ->
 * parsing -> frequency analysis -> safety detection -> secret scrubbing ->
 * Copilot call -> formatted output.
 *
 * Caches results to ~/.config/dotfiles-coach/last_suggestions.json for
 * the `apply` command to consume later.
 */

import fs from 'node:fs/promises';
import { detectShell } from '../utils/shell-detect.js';
import { getHistoryPath } from '../utils/history-paths.js';
import { parseBashHistory } from '../parsers/bash.js';
import { analyzeFrequency } from '../analyzers/frequency.js';
import { detectDangerousPatterns, extractDangerousCommands } from '../analyzers/safety.js';
import { scrubSecrets } from '../utils/secret-scrubber.js';
import { createCopilotClient, CopilotNotAvailableError, CopilotResponseError } from '../copilot/client.js';
import {
  writeJsonFile,
  writeFileSafe,
  getSuggestionsCachePath,
} from '../utils/file-operations.js';
import { capitalize, truncate } from '../utils/strings.js';
import type {
  SuggestOptions,
  SuggestionsCache,
  Suggestion,
  CommandPattern,
} from '../types/index.js';

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Run the `suggest` command.
 *
 * 1. Analyse history (reuses the same pipeline as `analyze`)
 * 2. Scrub secrets from patterns before sending to Copilot
 * 3. Call Copilot via the client abstraction
 * 4. Display beautifully formatted suggestions
 * 5. Cache results for `apply`
 */
export async function runSuggest(
  options: SuggestOptions,
): Promise<Suggestion[]> {
  // Dynamic imports for ESM-only packages.
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');
  const { default: boxen } = await import('boxen');

  const spinner = ora('Detecting shell environment...').start();

  try {
    // 1 ── Detect shell ────────────────────────────────────────────────────
    const shell = detectShell(options.shell);
    spinner.text = `Detected shell: ${shell}`;

    // 2 ── Resolve history file ────────────────────────────────────────────
    const { filePath } = getHistoryPath(shell, options.historyFile);
    spinner.text = `Reading history from ${filePath}...`;

    // 3 ── Verify file exists ──────────────────────────────────────────────
    try {
      await fs.access(filePath);
    } catch {
      spinner.fail(`History file not found: ${filePath}`);
      console.error(
        chalk.yellow(
          '\nTip: Use --history-file <path> to specify a custom history file location.',
        ),
      );
      process.exit(1);
    }

    // 4 ── Parse history ───────────────────────────────────────────────────
    spinner.text = 'Parsing history entries...';
    const entries = await parseBashHistory(filePath, { shell });

    if (entries.length === 0) {
      spinner.warn('No commands found in history file.');
      process.exit(0);
    }

    // 5 ── Frequency analysis ──────────────────────────────────────────────
    spinner.text = 'Analyzing command frequency...';
    const patterns = analyzeFrequency(entries, {
      minFrequency: options.minFrequency,
      top: 20,
    });

    if (patterns.length === 0) {
      spinner.warn('No repeated patterns found. Try lowering --min-frequency.');
      process.exit(0);
    }

    // 6 ── Safety detection ────────────────────────────────────────────────
    spinner.text = 'Checking for dangerous patterns...';
    detectDangerousPatterns(entries); // side-effect: validates entries
    const dangerousCommands = extractDangerousCommands(entries);

    // 7 ── Secret scrubbing (mandatory) ────────────────────────────────────
    spinner.text = 'Scrubbing secrets from patterns...';
    const scrubbedPatterns = scrubPatterns(patterns);
    const scrubbedDangerous = dangerousCommands.map(
      (cmd) => scrubSecrets(cmd).scrubbed,
    );

    // 8 ── Call Copilot ────────────────────────────────────────────────────
    spinner.text = 'Generating suggestions via GitHub Copilot CLI...';
    const client = createCopilotClient();

    let suggestions: Suggestion[];
    try {
      suggestions = await client.generateSuggestions(scrubbedPatterns, shell);

      // If we have dangerous commands, get safety-enhanced suggestions too
      if (scrubbedDangerous.length > 0) {
        spinner.text = 'Analyzing safety improvements...';
        const safetyAlerts = await client.analyzeSafety(
          scrubbedDangerous,
          shell,
        );

        // Convert safety alerts into safety-typed suggestions
        for (const alert of safetyAlerts) {
          if (alert.saferAlternative) {
            suggestions.push({
              pattern: alert.pattern,
              type: 'function',
              code: alert.saferAlternative,
              name: `safe-${alert.pattern.split(/\s+/)[0] ?? 'cmd'}`,
              explanation: `Safety improvement: ${alert.risk}`,
              safety: 'warning',
            });
          }
        }
      }
    } catch (error) {
      if (error instanceof CopilotNotAvailableError) {
        spinner.fail('GitHub Copilot CLI is not available.');
        console.error(chalk.red(`\n${error.message}`));
        console.error(
          chalk.yellow(
            '\nTo use the suggest command, you need:\n' +
              '  1. GitHub CLI: https://cli.github.com\n' +
              '  2. Copilot extension: gh extension install github/gh-copilot\n' +
              '  3. Authentication: gh auth login\n',
          ),
        );
        process.exit(1);
      }
      if (error instanceof CopilotResponseError) {
        spinner.fail('Copilot returned an unexpected response.');
        console.error(chalk.red(`\n${error.message}`));
        process.exit(1);
      }
      throw error;
    }

    if (suggestions.length === 0) {
      spinner.warn('Copilot did not return any suggestions.');
      process.exit(0);
    }

    // 9 ── Cache suggestions for `apply` ───────────────────────────────────
    const cache: SuggestionsCache = {
      shell,
      generatedAt: new Date().toISOString(),
      suggestions,
    };
    await writeJsonFile(getSuggestionsCachePath(), cache);

    // 10 ── Display ────────────────────────────────────────────────────────
    spinner.succeed(
      `Analysis complete. Found ${suggestions.length} optimization opportunit${suggestions.length === 1 ? 'y' : 'ies'}.`,
    );
    console.log('');

    // If --output flag, write to file and exit early
    if (options.output) {
      const formatted = formatSuggestionsPlainText(suggestions);
      await writeFileSafe(options.output, formatted);
      console.log(
        chalk.green(`Suggestions written to: ${options.output}`),
      );
      return suggestions;
    }

    // Pretty terminal output
    console.log(formatSuggestionsTerminal(suggestions, chalk, boxen));
    console.log('');
    console.log(
      chalk.cyan(
        "Use 'dotfiles-coach apply' to save these suggestions to a file.",
      ),
    );

    return suggestions;
  } catch (error) {
    spinner.fail('Suggestion generation failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nError: ${message}`));
    process.exit(1);
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format suggestions for beautiful terminal display (matching PRD §6 output).
 */
function formatSuggestionsTerminal(
  suggestions: Suggestion[],
  chalk: ChalkInstance,
  boxen: BoxenFn,
): string {
  const output: string[] = [];
  const total = suggestions.length;
  const divider = chalk.dim('━'.repeat(68));

  // Header box
  output.push(
    boxen(
      chalk.bold.cyan('GENERATING SUGGESTIONS VIA GITHUB COPILOT CLI...'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      },
    ),
  );
  output.push('');

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    output.push(divider);
    output.push('');
    output.push(
      chalk.bold(`SUGGESTION ${i + 1}/${total}: ${suggestionTitle(s)}`),
    );
    output.push('');
    output.push(`${chalk.dim('Pattern:')} ${s.pattern}`);
    output.push(`${chalk.dim('Type:')}    ${capitalize(s.type)}`);

    if (s.safety === 'warning') {
      output.push(`${chalk.yellow('Safety:')}  ${chalk.yellow('Warning')}`);
    } else if (s.safety === 'danger') {
      output.push(`${chalk.red('Safety:')}  ${chalk.red('Danger')}`);
    } else if (s.safety === 'safe') {
      output.push(`${chalk.green('Safety:')}  ${chalk.green('Safe')}`);
    }

    output.push('');
    output.push(chalk.dim('Suggested Code:'));
    output.push('');

    // Indent each line of code
    for (const line of s.code.split('\n')) {
      output.push(`    ${chalk.green(line)}`);
    }

    if (s.explanation) {
      output.push('');
      output.push(chalk.dim('Explanation:'));
      output.push(`   ${s.explanation}`);
    }
    output.push('');
  }

  output.push(divider);

  return output.join('\n');
}

/**
 * Format suggestions as plain text (for --output file).
 */
function formatSuggestionsPlainText(suggestions: Suggestion[]): string {
  const lines: string[] = [];
  const total = suggestions.length;

  lines.push('DOTFILES COACH - Copilot Suggestions');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total suggestions: ${total}`);
  lines.push('');
  lines.push('='.repeat(68));

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    lines.push('');
    lines.push(`SUGGESTION ${i + 1}/${total}: ${suggestionTitle(s)}`);
    lines.push('-'.repeat(40));
    lines.push(`Pattern: ${s.pattern}`);
    lines.push(`Type:    ${capitalize(s.type)}`);
    if (s.safety) lines.push(`Safety:  ${s.safety}`);
    lines.push('');
    lines.push('Code:');
    for (const line of s.code.split('\n')) {
      lines.push(`    ${line}`);
    }
    if (s.explanation) {
      lines.push('');
      lines.push(`Explanation: ${s.explanation}`);
    }
    lines.push('');
    lines.push('='.repeat(68));
  }

  return lines.join('\n') + '\n';
}

/**
 * Build a short title for a suggestion (used in headers).
 */
function suggestionTitle(s: Suggestion): string {
  if (s.name) {
    return `${capitalize(s.type)} "${s.name}" for ${truncate(s.pattern, 40)}`;
  }
  return `${capitalize(s.type)} for ${truncate(s.pattern, 50)}`;
}

// ── Secret scrubbing for patterns ────────────────────────────────────────────

/**
 * Scrub secrets from CommandPattern objects before sending to Copilot.
 * Returns new pattern objects with scrubbed strings.
 */
function scrubPatterns(patterns: CommandPattern[]): CommandPattern[] {
  return patterns.map((p) => ({
    ...p,
    pattern: scrubSecrets(p.pattern).scrubbed,
    variations: p.variations.map((v) => scrubSecrets(v).scrubbed),
  }));
}

// ── Type shims for dynamic ESM imports ───────────────────────────────────────

// Minimal type definitions to avoid importing ESM-only packages statically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChalkInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BoxenFn = any;
