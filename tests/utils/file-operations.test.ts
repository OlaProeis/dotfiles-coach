import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  ensureDir,
  readFileIfExists,
  readJsonFile,
  writeFileSafe,
  writeJsonFile,
  createBackup,
  appendToFile,
  fileExists,
  getConfigDir,
  getSuggestionsCachePath,
} from '../../src/utils/file-operations.js';

// ── Test directory setup ─────────────────────────────────────────────────────

const TEST_DIR = path.join(os.tmpdir(), 'dotfiles-coach-file-ops-test');

async function cleanTestDir(): Promise<void> {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe('file-operations', () => {
  beforeEach(async () => {
    await cleanTestDir();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanTestDir();
  });

  // ── ensureDir ──────────────────────────────────────────────────────────

  describe('ensureDir', () => {
    it('creates a nested directory', async () => {
      const dirPath = path.join(TEST_DIR, 'a', 'b', 'c');
      await ensureDir(dirPath);
      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('is idempotent', async () => {
      const dirPath = path.join(TEST_DIR, 'already');
      await ensureDir(dirPath);
      await ensureDir(dirPath); // should not throw
      const stat = await fs.stat(dirPath);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  // ── readFileIfExists ───────────────────────────────────────────────────

  describe('readFileIfExists', () => {
    it('returns content for existing file', async () => {
      const filePath = path.join(TEST_DIR, 'hello.txt');
      await fs.writeFile(filePath, 'hello world', 'utf-8');
      const content = await readFileIfExists(filePath);
      expect(content).toBe('hello world');
    });

    it('returns null for missing file', async () => {
      const content = await readFileIfExists(
        path.join(TEST_DIR, 'nonexistent.txt'),
      );
      expect(content).toBeNull();
    });
  });

  // ── readJsonFile ───────────────────────────────────────────────────────

  describe('readJsonFile', () => {
    it('parses valid JSON file', async () => {
      const filePath = path.join(TEST_DIR, 'data.json');
      await fs.writeFile(filePath, '{"name":"test","value":42}', 'utf-8');
      const data = await readJsonFile<{ name: string; value: number }>(filePath);
      expect(data).toEqual({ name: 'test', value: 42 });
    });

    it('returns null for invalid JSON', async () => {
      const filePath = path.join(TEST_DIR, 'bad.json');
      await fs.writeFile(filePath, 'not json', 'utf-8');
      const data = await readJsonFile(filePath);
      expect(data).toBeNull();
    });

    it('returns null for missing file', async () => {
      const data = await readJsonFile(path.join(TEST_DIR, 'missing.json'));
      expect(data).toBeNull();
    });
  });

  // ── writeFileSafe ──────────────────────────────────────────────────────

  describe('writeFileSafe', () => {
    it('creates parent directories and writes file', async () => {
      const filePath = path.join(TEST_DIR, 'deep', 'nested', 'file.txt');
      await writeFileSafe(filePath, 'deep content');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('deep content');
    });

    it('overwrites existing file', async () => {
      const filePath = path.join(TEST_DIR, 'overwrite.txt');
      await writeFileSafe(filePath, 'first');
      await writeFileSafe(filePath, 'second');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('second');
    });
  });

  // ── writeJsonFile ──────────────────────────────────────────────────────

  describe('writeJsonFile', () => {
    it('writes pretty-printed JSON', async () => {
      const filePath = path.join(TEST_DIR, 'out.json');
      await writeJsonFile(filePath, { hello: 'world' });
      const raw = await fs.readFile(filePath, 'utf-8');
      expect(raw).toContain('"hello": "world"');
      expect(raw.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual({ hello: 'world' });
    });
  });

  // ── createBackup ───────────────────────────────────────────────────────

  describe('createBackup', () => {
    it('returns null for non-existent file', async () => {
      const result = await createBackup(path.join(TEST_DIR, 'nope.txt'));
      expect(result).toBeNull();
    });

    it('creates .backup file for existing file', async () => {
      const original = path.join(TEST_DIR, 'original.txt');
      await fs.writeFile(original, 'original content', 'utf-8');

      const backupPath = await createBackup(original);
      expect(backupPath).toBe(`${original}.backup`);

      const backupContent = await fs.readFile(backupPath!, 'utf-8');
      expect(backupContent).toBe('original content');
    });

    it('uses timestamped name when .backup already exists', async () => {
      const original = path.join(TEST_DIR, 'duped.txt');
      await fs.writeFile(original, 'v1', 'utf-8');

      // First backup
      await createBackup(original);

      // Modify original
      await fs.writeFile(original, 'v2', 'utf-8');

      // Second backup should be timestamped
      const second = await createBackup(original);
      expect(second).not.toBe(`${original}.backup`);
      expect(second).toContain('.backup');

      const backupContent = await fs.readFile(second!, 'utf-8');
      expect(backupContent).toBe('v2');
    });
  });

  // ── appendToFile ───────────────────────────────────────────────────────

  describe('appendToFile', () => {
    it('appends to existing file', async () => {
      const filePath = path.join(TEST_DIR, 'append.txt');
      await fs.writeFile(filePath, 'line1\n', 'utf-8');
      await appendToFile(filePath, 'line2\n');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('line1\nline2\n');
    });

    it('creates file if it does not exist', async () => {
      const filePath = path.join(TEST_DIR, 'new-append.txt');
      await appendToFile(filePath, 'first line\n');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('first line\n');
    });
  });

  // ── fileExists ─────────────────────────────────────────────────────────

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(TEST_DIR, 'exists.txt');
      await fs.writeFile(filePath, '', 'utf-8');
      expect(await fileExists(filePath)).toBe(true);
    });

    it('returns false for missing file', async () => {
      expect(
        await fileExists(path.join(TEST_DIR, 'missing.txt')),
      ).toBe(false);
    });
  });

  // ── Path helpers ───────────────────────────────────────────────────────

  describe('path helpers', () => {
    it('getConfigDir returns a path under home directory', () => {
      const dir = getConfigDir();
      expect(dir).toContain('.config');
      expect(dir).toContain('dotfiles-coach');
    });

    it('getSuggestionsCachePath returns a JSON path', () => {
      const cachePath = getSuggestionsCachePath();
      expect(cachePath).toContain('last_suggestions.json');
      expect(cachePath).toContain('dotfiles-coach');
    });
  });
});
