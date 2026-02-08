/**
 * Safe file read/write/backup utilities.
 *
 * Used by the `apply` command to write suggestions to disk and by
 * `suggest` to cache suggestions for later retrieval.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ── Constants ────────────────────────────────────────────────────────────────

/** Default config directory: ~/.config/dotfiles-coach */
const CONFIG_DIR = path.join(os.homedir(), '.config', 'dotfiles-coach');

/** Cached suggestions file name. */
const SUGGESTIONS_CACHE_FILE = 'last_suggestions.json';

// ── Directory helpers ────────────────────────────────────────────────────────

/**
 * Ensure a directory exists, creating it (and parents) if necessary.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Get the config directory path (~/.config/dotfiles-coach).
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the full path to the suggestions cache file.
 */
export function getSuggestionsCachePath(): string {
  return path.join(CONFIG_DIR, SUGGESTIONS_CACHE_FILE);
}

// ── Read helpers ─────────────────────────────────────────────────────────────

/**
 * Read a file's contents as UTF-8 text.
 * Returns `null` if the file does not exist.
 */
export async function readFileIfExists(
  filePath: string,
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON file. Returns `null` if the file doesn't exist
 * or contains invalid JSON.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const content = await readFileIfExists(filePath);
  if (content === null) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// ── Write helpers ────────────────────────────────────────────────────────────

/**
 * Write text content to a file, creating parent directories as needed.
 */
export async function writeFileSafe(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Write a JSON-serialisable value to a file (pretty-printed).
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  const json = JSON.stringify(data, null, 2) + '\n';
  await writeFileSafe(filePath, json);
}

// ── Backup helpers ───────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of a file if it exists.
 *
 * Backup naming: `<filename>.backup` (simple) or
 * `<filename>.<timestamp>.backup` if a backup already exists.
 *
 * @returns The backup file path, or `null` if the original didn't exist.
 */
export async function createBackup(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
  } catch {
    // File doesn't exist — nothing to back up.
    return null;
  }

  const backupPath = `${filePath}.backup`;

  // If a simple backup already exists, use a timestamped name.
  let finalBackupPath = backupPath;
  try {
    await fs.access(backupPath);
    // Simple backup exists — use timestamp.
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    finalBackupPath = `${filePath}.${timestamp}.backup`;
  } catch {
    // Simple backup doesn't exist — use it.
  }

  await fs.copyFile(filePath, finalBackupPath);
  return finalBackupPath;
}

// ── Append helper ────────────────────────────────────────────────────────────

/**
 * Append content to an existing file (creates if it doesn't exist).
 */
export async function appendToFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, content, 'utf-8');
}

// ── File existence ───────────────────────────────────────────────────────────

/**
 * Check whether a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
