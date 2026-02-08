/**
 * Common parsing utilities shared by Bash, Zsh, and PowerShell parsers.
 */

/** Default maximum number of history lines to process. */
export const DEFAULT_MAX_LINES = 5000;

/** Minimum configurable line limit. */
export const MIN_LINE_LIMIT = 100;

/**
 * Commands considered "noise" — too trivial to analyse.
 *
 * Matches from ai-context.md:
 *  - single-char commands
 *  - bare `ls`, `cd` (without args), `clear`, `exit`
 */
const NOISE_COMMANDS = new Set([
  'ls',
  'cd',
  'clear',
  'exit',
  'pwd',
  'history',
]);

/**
 * Returns `true` if a command is noise and should be skipped.
 *
 * Noise criteria:
 *  1. Empty / whitespace-only
 *  2. Single character (e.g. `q`, `l`)
 *  3. Exact match in the NOISE_COMMANDS set (case-insensitive, trimmed)
 */
export function isNoiseCommand(command: string): boolean {
  const trimmed = command.trim();

  // Empty or whitespace-only.
  if (trimmed.length === 0) return true;

  // Single character.
  if (trimmed.length === 1) return true;

  // Bare noise command (no args).
  if (NOISE_COMMANDS.has(trimmed.toLowerCase())) return true;

  return false;
}

/**
 * Trim trailing lines from an array so at most `maxLines` remain (keeps the *last* N).
 * Returns a new array; does not mutate the input.
 */
export function limitLines(lines: string[], maxLines: number): string[] {
  const limit = Math.max(maxLines, MIN_LINE_LIMIT);
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}

/**
 * Deduplicate *consecutive* identical commands.
 * Running `git status` three times in a row keeps only the first occurrence
 * (with the earliest lineNumber), but later non-consecutive duplicates are kept.
 */
export function deduplicateConsecutive<T extends { command: string }>(entries: T[]): T[] {
  if (entries.length === 0) return [];

  const result: T[] = [entries[0]];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].command !== entries[i - 1].command) {
      result.push(entries[i]);
    }
  }
  return result;
}
