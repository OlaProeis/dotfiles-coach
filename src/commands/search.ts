/**
 * `dotfiles-coach search` command implementation.
 *
 * Orchestrates: shell detection → history path resolution → file reading →
 * history parsing → search scoring → optional Copilot "explain" → formatted output.
 *
 * The search itself is 100 % local (no Copilot). The optional `--explain`
 * flag asks Copilot to explain the top result in one sentence.
 */

import fs from 'node:fs/promises';
import { detectShell } from '../utils/shell-detect.js';
import { getHistoryPath } from '../utils/history-paths.js';
import { parseBashHistory } from '../parsers/bash.js';
import { searchHistory } from '../search/scorer.js';
import { scrubSecrets } from '../utils/secret-scrubber.js';
import { createCopilotClient } from '../copilot/client.js';
import { buildExplainPrompt } from '../copilot/prompts.js';
import type { SearchOptions, SearchResult } from '../types/index.js';

// ── Explain via Copilot ─────────────────────────────────────────────────────

/**
 * Ask Copilot to explain a single command.
 * The command is scrubbed first — only the sanitised string is sent.
 */
async function explainCommand(command: string): Promise<string | null> {
  try {
    const { scrubbed } = scrubSecrets(command);
    const client = createCopilotClient();

    // We reuse the CopilotClient's internal machinery.  Since the interface
    // only exposes `generateSuggestions` and `analyzeSafety`, we call it
    // indirectly via a thin wrapper that sends the explain prompt.
    // For the new CLI backend this works because `generateSuggestions`
    // ultimately calls `copilot -p "..." -s`.  We build a one-item pattern
    // array with the explain prompt embedded.
    const prompt = buildExplainPrompt(scrubbed);

    // Use the real client's internal method if available, otherwise fall
    // back to a direct execa call.
    const realClient = client as unknown as Record<string, unknown>;
    if (typeof realClient.runNewCopilot === 'function') {
      return (await (realClient.runNewCopilot as (p: string) => Promise<string>)(prompt)) || null;
    }

    // Fallback: call the copilot binary directly.
    const { execa } = await import('execa');
    try {
      const result = await execa('copilot', ['-p', prompt, '-s', '--allow-all'], {
        timeout: 30_000,
        reject: true,
      });
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// ── Main runner ─────────────────────────────────────────────────────────────

/**
 * Run the `search` command.
 *
 * Loads shell history, scores every unique command against the query,
 * and prints ranked results.  Optionally asks Copilot to explain the
 * top result when `--explain` is set.
 *
 * @param options - CLI options parsed by Commander.
 * @returns The search results array (also printed to stdout).
 */
export async function runSearch(
  options: SearchOptions,
): Promise<SearchResult[]> {
  const { default: ora } = await import('ora');
  const { default: chalk } = await import('chalk');

  const spinner = ora('Detecting shell environment…').start();

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

    // 5 ── Search ────────────────────────────────────────────────────────
    const maxResults = options.maxResults ?? 10;
    spinner.text = `Searching ${entries.length} commands for "${options.query}"…`;
    const results = searchHistory(entries, options.query, maxResults);

    if (results.length === 0) {
      spinner.warn('No matching commands found.');
      console.log('');
      console.log(
        chalk.dim('Try a broader query or check your history file.'),
      );
      return [];
    }

    spinner.succeed(`Found ${results.length} matching command${results.length === 1 ? '' : 's'}!`);
    console.log('');

    // 6 ── Formatted output ──────────────────────────────────────────────
    switch (options.format) {
      case 'json':
        console.log(formatSearchJson(results));
        break;
      case 'markdown':
        console.log(formatSearchMarkdown(results, options.query));
        break;
      default:
        console.log(await formatSearchTable(results, options.query));
        break;
    }

    // 7 ── Optional Copilot explain ──────────────────────────────────────
    if (options.explain && results.length > 0) {
      console.log('');
      const explainSpinner = ora('Asking Copilot to explain the top result…').start();
      const explanation = await explainCommand(results[0].command);
      if (explanation) {
        explainSpinner.succeed('Copilot explanation:');
        console.log('');
        console.log(chalk.cyan(`  ${results[0].command}`));
        console.log(chalk.dim(`  → ${explanation}`));
      } else {
        explainSpinner.warn(
          'Could not get an explanation. Is GitHub Copilot CLI installed and authenticated?',
        );
      }
    }

    return results;
  } catch (error) {
    spinner.fail('Search failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nError: ${message}`));
    process.exit(1);
  }
}

// ── Formatters (co-located to keep the feature self-contained) ──────────────

/** Format results as a styled terminal table. */
async function formatSearchTable(results: SearchResult[], query: string): Promise<string> {
  const { default: chalk } = await import('chalk');
  const { default: boxen } = await import('boxen');

  const output: string[] = [];

  // Header box
  const title = chalk.bold.cyan('DOTFILES COACH - History Search');
  const divider = chalk.dim('─'.repeat(55));
  const stats = [
    `${chalk.bold('Query:')} "${query}"`,
    `${chalk.bold('Results:')} ${results.length}`,
  ].join('\n');

  output.push(
    boxen(`${title}\n${divider}\n${stats}`, {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    }),
  );

  output.push('');

  // Results table
  output.push(
    `${chalk.dim('Rank')}  ${chalk.dim('Score')}  ${chalk.dim('Freq')}  ${chalk.dim('Command')}`,
  );
  output.push(chalk.dim('─'.repeat(72)));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const rank = String(i + 1).padStart(4);
    const score = (r.score * 100).toFixed(0).padStart(4) + '%';
    const freq = String(r.frequency).padStart(4) + '×';
    output.push(
      `${chalk.yellow(rank)}  ${chalk.green(score)}  ${chalk.dim(freq)}  ${r.command}`,
    );
  }

  output.push('');
  output.push(
    chalk.cyan(
      "Use 'dotfiles-coach search \"<query>\" --explain' to explain the top result via Copilot.",
    ),
  );

  return output.join('\n');
}

/** Format results as JSON. */
function formatSearchJson(results: SearchResult[]): string {
  return JSON.stringify(
    {
      results: results.map((r) => ({
        command: r.command,
        score: r.score,
        frequency: r.frequency,
        lastUsed: r.lastUsed?.toISOString() ?? null,
        lineNumber: r.lineNumber,
      })),
    },
    null,
    2,
  );
}

/** Format results as markdown. */
function formatSearchMarkdown(results: SearchResult[], query: string): string {
  const lines: string[] = [];
  lines.push(`# Search Results: "${query}"`);
  lines.push('');
  lines.push(`| Rank | Score | Freq | Command |`);
  lines.push(`|------|-------|------|---------|`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = (r.score * 100).toFixed(0) + '%';
    const cmd = r.command.replace(/\|/g, '\\|');
    lines.push(`| ${i + 1} | ${score} | ${r.frequency}× | \`${cmd}\` |`);
  }

  return lines.join('\n');
}
