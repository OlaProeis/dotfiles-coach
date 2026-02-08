/**
 * Bash / Zsh history file parser.
 *
 * Supported formats
 * ─────────────────
 * **Bash** (plain):
 *   command1
 *   command2
 *
 * **Bash** (timestamped, HISTTIMEFORMAT):
 *   #1700000000
 *   command1
 *
 * **Zsh** (extended_history):
 *   : 1700000000:0;command1
 *
 * Both formats may contain multi-line commands (trailing `\`).
 *
 * Pipeline
 * ────────
 * 1. Read file → raw lines
 * 2. Limit to last N lines (default 5 000)
 * 3. Parse lines into HistoryEntry[] (handling timestamps + multi-line)
 * 4. Filter noise commands
 * 5. Deduplicate consecutive identical commands
 */

import fs from 'node:fs/promises';
import type { HistoryEntry, ShellType } from '../types/index.js';
import {
  DEFAULT_MAX_LINES,
  isNoiseCommand,
  limitLines,
  deduplicateConsecutive,
} from './common.js';

/** Options accepted by the parser. */
export interface BashParserOptions {
  /** Maximum raw lines to keep (from the tail of the file). */
  maxLines?: number;
  /** Shell hint — affects timestamp parsing strategy. */
  shell?: ShellType;
}

/**
 * Parse a Bash or Zsh history file into structured entries.
 *
 * @param filePath - Absolute path to the history file.
 * @param options  - Optional parser tuning.
 * @returns Parsed, filtered, deduplicated history entries.
 */
export async function parseBashHistory(
  filePath: string,
  options: BashParserOptions = {},
): Promise<HistoryEntry[]> {
  const { maxLines = DEFAULT_MAX_LINES, shell } = options;

  const content = await fs.readFile(filePath, 'utf-8');
  // Normalise line endings — Windows files may use \r\n.
  const rawLines = content.split(/\r?\n/);

  // Keep only the tail of the file to bound memory / token usage.
  const trimmedLines = limitLines(rawLines, maxLines);

  // Decide parsing strategy.
  const isZsh = shell === 'zsh' || detectZshFormat(trimmedLines);

  const entries = isZsh
    ? parseZshLines(trimmedLines)
    : parseBashLines(trimmedLines);

  // Filter noise, then deduplicate consecutive runs.
  const filtered = entries.filter((e) => !isNoiseCommand(e.command));
  return deduplicateConsecutive(filtered);
}

// ─── Bash format ──────────────────────────────────────────────────────────────

/**
 * Parse plain (or timestamped) bash history lines.
 *
 * Timestamped lines start with `#<epoch>` followed by the command on the next line.
 * Multi-line commands end with a trailing `\`.
 */
function parseBashLines(lines: string[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let pendingTimestamp: Date | undefined;
  let continuationBuffer = '';
  let continuationStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Bash timestamp marker: `#<epoch>`
    if (/^#\d{9,11}$/.test(raw.trim())) {
      const epoch = parseInt(raw.trim().slice(1), 10);
      pendingTimestamp = new Date(epoch * 1000);
      continue;
    }

    const trimmed = raw.trimEnd();

    // Multi-line continuation (trailing backslash).
    if (trimmed.endsWith('\\')) {
      if (continuationBuffer === '') {
        continuationStartLine = i + 1; // 1-indexed
      }
      continuationBuffer += trimmed.slice(0, -1) + '\n';
      continue;
    }

    // Finish any pending continuation.
    if (continuationBuffer !== '') {
      const fullCommand = (continuationBuffer + trimmed).trim();
      continuationBuffer = '';
      if (fullCommand) {
        entries.push({
          command: fullCommand,
          timestamp: pendingTimestamp,
          lineNumber: continuationStartLine,
        });
      }
      pendingTimestamp = undefined;
      continue;
    }

    // Normal single-line command.
    const command = trimmed.trim();
    if (command === '') continue;

    entries.push({
      command,
      timestamp: pendingTimestamp,
      lineNumber: i + 1,
    });
    pendingTimestamp = undefined;
  }

  return entries;
}

// ─── Zsh format ───────────────────────────────────────────────────────────────

/**
 * Regex for Zsh extended_history format:
 *   `: <timestamp>:<duration>;command`
 */
const ZSH_EXTENDED_RE = /^:\s*(\d{9,11}):(\d+);(.*)$/;

/**
 * Parse Zsh history lines (supports both extended_history and plain formats).
 */
function parseZshLines(lines: string[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let continuationBuffer = '';
  let continuationTimestamp: Date | undefined;
  let continuationStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Try extended_history match.
    const match = ZSH_EXTENDED_RE.exec(raw);

    if (match) {
      const epoch = parseInt(match[1], 10);
      const commandPart = match[3];

      // Multi-line continuation (trailing backslash).
      if (commandPart.trimEnd().endsWith('\\')) {
        continuationBuffer = commandPart.trimEnd().slice(0, -1) + '\n';
        continuationTimestamp = new Date(epoch * 1000);
        continuationStartLine = i + 1;
        continue;
      }

      const command = commandPart.trim();
      if (command) {
        entries.push({
          command,
          timestamp: new Date(epoch * 1000),
          lineNumber: i + 1,
        });
      }
      continue;
    }

    // Inside a multi-line continuation from a zsh extended line.
    if (continuationBuffer !== '') {
      const trimmed = raw.trimEnd();
      if (trimmed.endsWith('\\')) {
        continuationBuffer += trimmed.slice(0, -1) + '\n';
        continue;
      }
      const fullCommand = (continuationBuffer + trimmed).trim();
      continuationBuffer = '';
      if (fullCommand) {
        entries.push({
          command: fullCommand,
          timestamp: continuationTimestamp,
          lineNumber: continuationStartLine,
        });
      }
      continuationTimestamp = undefined;
      continue;
    }

    // Plain line (zsh without extended_history, or mixed).
    const command = raw.trim();
    if (command === '') continue;

    entries.push({
      command,
      lineNumber: i + 1,
    });
  }

  return entries;
}

// ─── Format detection ─────────────────────────────────────────────────────────

/**
 * Heuristic: scan the first 20 non-empty lines looking for the Zsh
 * extended_history pattern `: <timestamp>:<duration>;...`.
 */
function detectZshFormat(lines: string[]): boolean {
  let checked = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (ZSH_EXTENDED_RE.test(line)) return true;
    checked++;
    if (checked >= 20) break;
  }
  return false;
}
