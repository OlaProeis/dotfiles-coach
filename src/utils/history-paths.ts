/**
 * Standard history file path resolution.
 *
 * Bash  : ~/.bash_history
 * Zsh   : ~/.zsh_history  (or $HISTFILE if set)
 * PowerShell:
 *   - Windows : $env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
 *   - macOS/Linux : ~/.local/share/powershell/PSReadLine/ConsoleHost_history.txt
 *
 * All paths can be overridden with a --history-file flag (passed as `override`).
 */

import path from 'node:path';
import os from 'node:os';
import type { ShellType } from '../types/index.js';

/** Return value for getHistoryPath() — carries both the resolved path and its source. */
export interface HistoryPathResult {
  /** Absolute path to the history file. */
  filePath: string;
  /** How the path was determined. */
  source: 'override' | 'env' | 'default';
}

/**
 * Resolve the history file path for the given shell.
 *
 * @param shell    - The detected (or explicit) shell type.
 * @param override - A user-supplied --history-file value. Takes priority over everything.
 * @returns The resolved path and how it was determined.
 */
export function getHistoryPath(
  shell: ShellType,
  override?: string,
): HistoryPathResult {
  // 1) User-supplied override wins unconditionally.
  if (override) {
    return {
      filePath: path.resolve(override),
      source: 'override',
    };
  }

  switch (shell) {
    case 'bash':
      return resolveBashHistoryPath();
    case 'zsh':
      return resolveZshHistoryPath();
    case 'powershell':
      return resolvePowerShellHistoryPath();
  }
}

// ─── Per-shell helpers ────────────────────────────────────────────────────────

function resolveBashHistoryPath(): HistoryPathResult {
  // Bash honours $HISTFILE if set.
  const envPath = process.env.HISTFILE;
  if (envPath) {
    return { filePath: path.resolve(envPath), source: 'env' };
  }
  return {
    filePath: path.join(os.homedir(), '.bash_history'),
    source: 'default',
  };
}

function resolveZshHistoryPath(): HistoryPathResult {
  // Zsh also honours $HISTFILE.
  const envPath = process.env.HISTFILE;
  if (envPath) {
    return { filePath: path.resolve(envPath), source: 'env' };
  }
  return {
    filePath: path.join(os.homedir(), '.zsh_history'),
    source: 'default',
  };
}

function resolvePowerShellHistoryPath(): HistoryPathResult {
  // PSReadLine history location is platform-dependent.
  const psReadLinePath = getPowerShellReadLinePath();
  return {
    filePath: psReadLinePath,
    source: 'default',
  };
}

/**
 * Return the platform-specific PSReadLine ConsoleHost_history.txt path.
 *
 * Windows:     %APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
 * macOS/Linux: ~/.local/share/powershell/PSReadLine/ConsoleHost_history.txt
 */
function getPowerShellReadLinePath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(
      appData,
      'Microsoft',
      'Windows',
      'PowerShell',
      'PSReadLine',
      'ConsoleHost_history.txt',
    );
  }

  // macOS / Linux
  return path.join(
    os.homedir(),
    '.local',
    'share',
    'powershell',
    'PSReadLine',
    'ConsoleHost_history.txt',
  );
}

/**
 * Get all known history file paths for every supported shell.
 * Useful for discovery / diagnostic commands.
 */
export function getAllKnownHistoryPaths(): Record<ShellType, string> {
  return {
    bash: getHistoryPath('bash').filePath,
    zsh: getHistoryPath('zsh').filePath,
    powershell: getHistoryPath('powershell').filePath,
  };
}
