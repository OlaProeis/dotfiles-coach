/**
 * `dotfiles-coach apply` command implementation.
 *
 * Reads cached suggestions from the last `suggest` run and writes them
 * to a shell configuration file with proper formatting, backup, and
 * dry-run support.
 *
 * Key behaviours (per PRD §7 & ai-context Hard Rule #3):
 *  - Reads from ~/.config/dotfiles-coach/last_suggestions.json
 *  - Writes to ~/.dotfiles_coach_aliases.sh (Bash/Zsh) or .ps1 (PowerShell)
 *  - Creates backups before overwriting
 *  - --dry-run shows what would be written without modifying files
 *  - --append-to appends to an existing profile file
 *  - NEVER auto-sources — prints `source` instructions instead
 */

import os from 'node:os';
import path from 'node:path';
import {
  readJsonFile,
  writeFileSafe,
  createBackup,
  appendToFile,
  fileExists,
  getSuggestionsCachePath,
} from '../utils/file-operations.js';
import { capitalize, wrapText } from '../utils/strings.js';
import type { ApplyOptions, SuggestionsCache, Suggestion, ShellType } from '../types/index.js';

// ── Default output paths ─────────────────────────────────────────────────────

function getDefaultOutputPath(shell: ShellType): string {
  if (shell === 'powershell') {
    return path.join(os.homedir(), '.dotfiles_coach_profile.ps1');
  }
  return path.join(os.homedir(), '.dotfiles_coach_aliases.sh');
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Run the `apply` command.
 *
 * 1. Load cached suggestions from last `suggest` run
 * 2. Format as shell code with comments and timestamps
 * 3. Optionally create backup, write file, or show dry-run
 * 4. Print `source` instructions (never auto-source)
 */
export async function runApply(options: ApplyOptions): Promise<void> {
  // Dynamic imports for ESM-only packages.
  const { default: chalk } = await import('chalk');
  const { default: boxen } = await import('boxen');

  // 1 ── Load cached suggestions ───────────────────────────────────────────
  const cachePath = getSuggestionsCachePath();
  const cache = await readJsonFile<SuggestionsCache>(cachePath);

  if (!cache || !cache.suggestions || cache.suggestions.length === 0) {
    console.error(
      chalk.red(
        "\nNo suggestions found. Run 'dotfiles-coach suggest' first.\n",
      ),
    );
    process.exit(1);
  }

  const { shell, suggestions, generatedAt } = cache;
  const outputPath = options.output ?? getDefaultOutputPath(shell);

  // 2 ── Format suggestions as shell code ──────────────────────────────────
  const formattedCode = formatSuggestionsAsCode(
    suggestions,
    shell,
    generatedAt,
  );

  // 3 ── Dry-run mode ─────────────────────────────────────────────────────
  if (options.dryRun) {
    // Header box
    console.log(
      boxen(chalk.bold.cyan('APPLYING SUGGESTIONS (DRY RUN)'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      }),
    );
    console.log('');
    console.log(
      chalk.yellow(
        `Would write ${suggestions.length} suggestion(s) to: ${options.appendTo ?? outputPath}`,
      ),
    );
    console.log('');
    console.log(chalk.dim('File contents preview:'));
    console.log('');

    // Show preview (indented)
    for (const line of formattedCode.split('\n')) {
      console.log(`    ${chalk.dim(line)}`);
    }

    console.log('');
    console.log(
      chalk.yellow('No files were modified (dry run).'),
    );
    return;
  }

  // 4 ── Append-to mode ───────────────────────────────────────────────────
  if (options.appendTo) {
    const targetPath = path.resolve(options.appendTo);

    // Create backup if requested and file exists
    if (options.backup !== false) {
      const backupPath = await createBackup(targetPath);
      if (backupPath) {
        console.log(
          chalk.green(`Created backup: ${backupPath}`),
        );
      }
    }

    const separator = `\n\n# ── Dotfiles Coach (appended ${new Date().toISOString().slice(0, 19)}) ──\n`;
    await appendToFile(targetPath, separator + formattedCode);

    // Header box
    console.log(
      boxen(chalk.bold.cyan('APPLYING SUGGESTIONS'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
      }),
    );
    console.log('');
    console.log(
      chalk.green(
        `Appended ${suggestions.length} suggestion(s) to: ${targetPath}`,
      ),
    );

    printReloadInstructions(chalk, shell, targetPath);
    return;
  }

  // 5 ── Write to output file ─────────────────────────────────────────────

  // Create backup if the file exists and backup is enabled (default: true)
  if (options.backup !== false && (await fileExists(outputPath))) {
    const backupPath = await createBackup(outputPath);
    if (backupPath) {
      console.log(chalk.green(`Created backup: ${backupPath}`));
    }
  }

  await writeFileSafe(outputPath, formattedCode);

  // Header box
  console.log(
    boxen(chalk.bold.cyan('APPLYING SUGGESTIONS'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'green',
    }),
  );
  console.log('');
  console.log(
    chalk.green(
      `Wrote ${suggestions.length} suggestion(s) to: ${outputPath}`,
    ),
  );

  // Show preview
  console.log('');
  console.log(chalk.dim('File contents preview:'));
  console.log('');
  const previewLines = formattedCode.split('\n').slice(0, 25);
  for (const line of previewLines) {
    console.log(`    ${chalk.dim(line)}`);
  }
  if (formattedCode.split('\n').length > 25) {
    console.log(chalk.dim('    ...'));
  }

  printSourceInstructions(chalk, shell, outputPath);
}

// ── Code formatting ──────────────────────────────────────────────────────────

/**
 * Format suggestions as valid shell code with comments and timestamps.
 */
function formatSuggestionsAsCode(
  suggestions: Suggestion[],
  shell: ShellType,
  generatedAt: string,
): string {
  const lines: string[] = [];
  const commentChar = '#';
  const dateStr = generatedAt.slice(0, 19).replace('T', ' ');

  // Header
  lines.push(`${commentChar} ============================================`);
  lines.push(`${commentChar} Dotfiles Coach - Generated Aliases & Functions`);
  lines.push(`${commentChar} Generated: ${dateStr}`);
  lines.push(`${commentChar} Shell: ${capitalize(shell)}`);
  lines.push(`${commentChar} ============================================`);
  lines.push('');

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    const label = s.name
      ? `${capitalize(s.type)}: ${s.name}`
      : `${capitalize(s.type)} for: ${s.pattern}`;

    lines.push(`${commentChar} Suggestion ${i + 1}: ${label}`);

    if (s.explanation) {
      // Wrap explanation as comment lines
      const wrapped = wrapText(s.explanation, 70);
      for (const wl of wrapped) {
        lines.push(`${commentChar}   ${wl}`);
      }
    }

    if (s.safety === 'warning') {
      lines.push(`${commentChar}   WARNING: Review this suggestion carefully before using.`);
    } else if (s.safety === 'danger') {
      lines.push(`${commentChar}   DANGER: This suggestion involves potentially dangerous operations.`);
    }

    lines.push(s.code);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Instruction printers ─────────────────────────────────────────────────────

/**
 * Print source/reload instructions after writing to a standalone file.
 */
function printSourceInstructions(
  chalk: ChalkInstance,
  shell: ShellType,
  outputPath: string,
): void {
  console.log('');
  console.log(chalk.dim('━'.repeat(68)));
  console.log('');
  console.log(chalk.bold('NEXT STEPS:'));
  console.log('');

  if (shell === 'powershell') {
    console.log(chalk.white('To use these aliases and functions immediately:'));
    console.log('');
    console.log(`    ${chalk.green(`. ${outputPath}`)}`);
    console.log('');
    console.log(
      chalk.white('To make them permanent, add this line to your $PROFILE:'),
    );
    console.log('');
    console.log(`    ${chalk.green(`. ${outputPath}`)}`);
    console.log('');
    console.log(chalk.white('Then reload your profile:'));
    console.log('');
    console.log(`    ${chalk.green('. $PROFILE')}`);
  } else {
    const rcFile = shell === 'zsh' ? '~/.zshrc' : '~/.bashrc';
    console.log(chalk.white('To use these aliases and functions immediately:'));
    console.log('');
    console.log(`    ${chalk.green(`source ${outputPath}`)}`);
    console.log('');
    console.log(
      chalk.white(`To make them permanent, add this line to your ${rcFile}:`),
    );
    console.log('');
    console.log(`    ${chalk.green(`source ${outputPath}`)}`);
    console.log('');
    console.log(chalk.white('Then reload your shell:'));
    console.log('');
    console.log(
      chalk.green(`    exec ${shell}`),
    );
  }

  console.log('');
}

/**
 * Print reload instructions after appending to an existing profile.
 */
function printReloadInstructions(
  chalk: ChalkInstance,
  shell: ShellType,
  targetPath: string,
): void {
  console.log('');
  console.log(chalk.dim('━'.repeat(68)));
  console.log('');
  console.log(chalk.bold('NEXT STEPS:'));
  console.log('');

  if (shell === 'powershell') {
    console.log(chalk.white('Reload your profile to activate the changes:'));
    console.log('');
    console.log(`    ${chalk.green(`. ${targetPath}`)}`);
  } else {
    console.log(chalk.white('Reload to activate the changes:'));
    console.log('');
    console.log(`    ${chalk.green(`source ${targetPath}`)}`);
  }

  console.log('');
}

// ── Type shims ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChalkInstance = any;
