/**
 * Table formatter for the analyze command.
 *
 * Uses chalk for colours, boxen for bordered boxes.
 * Output closely matches the PRD §5 "dotfiles-coach analyze" example.
 */

import type { AnalysisResult, AnalyzeOptions } from '../types/index.js';
import { capitalize } from '../utils/strings.js';

/**
 * Format analysis results as a styled terminal table.
 *
 * @param result  - The structured analysis data.
 * @param options - Analyse options (used to echo back minFrequency).
 * @returns A multi-line string ready for `console.log`.
 */
export async function formatAnalysisTable(
  result: AnalysisResult,
  options?: Pick<AnalyzeOptions, 'minFrequency'>,
): Promise<string> {
  // Dynamic imports for ESM-only packages.
  const { default: chalk } = await import('chalk');
  const { default: boxen } = await import('boxen');

  const output: string[] = [];

  // ── Header box ─────────────────────────────────────────────────────────────
  const title = chalk.bold.cyan('DOTFILES COACH - History Analysis');
  const divider = chalk.dim('─'.repeat(55));
  const stats = [
    `${chalk.bold('Shell:')} ${capitalize(result.shell)}`,
    `${chalk.bold('History file:')} ${result.historyFile}`,
    `${chalk.bold('Total commands:')} ${result.totalCommands.toLocaleString()}`,
    `${chalk.bold('Unique commands:')} ${result.uniqueCommands.toLocaleString()}`,
  ].join('\n');

  output.push(
    boxen(`${title}\n${divider}\n${stats}`, {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    }),
  );

  output.push('');

  // ── Patterns table ─────────────────────────────────────────────────────────
  const minFreq = options?.minFrequency ?? 5;
  output.push(
    chalk.bold(`TOP REPEATED PATTERNS (min frequency: ${minFreq})`),
  );
  output.push('');
  output.push(
    `${chalk.dim('Rank')}  ${chalk.dim('Count')}  ${chalk.dim('Pattern')}`,
  );
  output.push(chalk.dim('─'.repeat(68)));

  if (result.patterns.length === 0) {
    output.push(chalk.dim('  No patterns found matching the criteria.'));
  } else {
    for (let i = 0; i < result.patterns.length; i++) {
      const p = result.patterns[i];
      const rank = String(i + 1).padStart(4);
      const count = String(p.frequency).padStart(5);
      output.push(
        `${chalk.yellow(rank)}  ${chalk.green(count)}    ${p.pattern}`,
      );
    }
  }

  // ── Safety alerts summary ──────────────────────────────────────────────────
  if (result.safetyAlerts.length > 0) {
    output.push('');
    const n = result.safetyAlerts.length;
    output.push(
      chalk.yellow.bold(
        `⚠️  SAFETY ALERTS: ${n} dangerous pattern${n === 1 ? '' : 's'} detected`,
      ),
    );

    // Show brief details for each alert.
    for (const alert of result.safetyAlerts) {
      output.push('');
      output.push(
        `  ${chalk.red('●')} ${chalk.bold(alert.pattern)} ${chalk.dim(`(${alert.frequency}×)`)}`,
      );
      output.push(`    ${chalk.dim('Risk:')} ${alert.risk}`);
      output.push(
        `    ${chalk.dim('Fix:')}  ${alert.saferAlternative}`,
      );
    }
  }

  output.push('');
  output.push(
    chalk.cyan(
      "Use 'dotfiles-coach suggest' to generate automation recommendations.",
    ),
  );

  return output.join('\n');
}

