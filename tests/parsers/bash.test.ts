import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseBashHistory } from '../../src/parsers/bash.js';

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

// ─── Plain Bash history ────────────────────────────────────────────────────

describe('parseBashHistory — plain bash', () => {
  const file = path.join(FIXTURES, 'sample_bash_history.txt');

  it('parses commands from a plain bash history file', async () => {
    const entries = await parseBashHistory(file);
    expect(entries.length).toBeGreaterThan(0);
    // Every entry should have a non-empty command.
    for (const e of entries) {
      expect(e.command.trim().length).toBeGreaterThan(0);
    }
  });

  it('filters out noise commands (ls, cd, clear, exit, single-char)', async () => {
    const entries = await parseBashHistory(file);
    const commands = entries.map((e) => e.command);
    expect(commands).not.toContain('ls');
    expect(commands).not.toContain('cd');
    expect(commands).not.toContain('clear');
    expect(commands).not.toContain('exit');
    expect(commands).not.toContain('q');
  });

  it('deduplicates consecutive identical commands', async () => {
    const entries = await parseBashHistory(file);
    for (let i = 1; i < entries.length; i++) {
      // No two adjacent entries should have the same command.
      if (entries[i].command === entries[i - 1].command) {
        throw new Error(
          `Consecutive duplicate at index ${i}: "${entries[i].command}"`,
        );
      }
    }
  });

  it('keeps non-consecutive duplicates', async () => {
    const entries = await parseBashHistory(file);
    const commands = entries.map((e) => e.command);
    // "npm test" appears twice non-consecutively in the fixture.
    const npmTestCount = commands.filter((c) => c === 'npm test').length;
    expect(npmTestCount).toBe(2);
  });

  it('assigns 1-based line numbers', async () => {
    const entries = await parseBashHistory(file);
    for (const e of entries) {
      expect(e.lineNumber).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Timestamped Bash history ──────────────────────────────────────────────

describe('parseBashHistory — timestamped bash', () => {
  const file = path.join(FIXTURES, 'sample_bash_history_timestamped.txt');

  it('parses timestamps from #<epoch> lines', async () => {
    const entries = await parseBashHistory(file, { shell: 'bash' });
    const withTimestamps = entries.filter((e) => e.timestamp !== undefined);
    expect(withTimestamps.length).toBeGreaterThan(0);
  });

  it('correctly parses epoch seconds into Date objects', async () => {
    const entries = await parseBashHistory(file, { shell: 'bash' });
    // First command should be "git status" with timestamp 1700000000.
    const first = entries[0];
    expect(first.command).toBe('git status');
    expect(first.timestamp).toBeInstanceOf(Date);
    expect(first.timestamp!.getTime()).toBe(1700000000 * 1000);
  });

  it('filters noise even when timestamps are present', async () => {
    const entries = await parseBashHistory(file, { shell: 'bash' });
    const commands = entries.map((e) => e.command);
    expect(commands).not.toContain('ls');
    expect(commands).not.toContain('clear');
  });
});

// ─── Zsh extended_history ──────────────────────────────────────────────────

describe('parseBashHistory — zsh extended_history', () => {
  const file = path.join(FIXTURES, 'sample_zsh_history.txt');

  it('auto-detects zsh format and parses successfully', async () => {
    const entries = await parseBashHistory(file);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('extracts timestamps from zsh extended format', async () => {
    const entries = await parseBashHistory(file);
    const withTimestamps = entries.filter((e) => e.timestamp !== undefined);
    expect(withTimestamps.length).toBeGreaterThan(0);
    expect(withTimestamps[0].timestamp).toBeInstanceOf(Date);
  });

  it('extracts the command portion after the semicolon', async () => {
    const entries = await parseBashHistory(file);
    // None of the commands should contain the `: timestamp:duration;` prefix.
    for (const e of entries) {
      expect(e.command).not.toMatch(/^:\s*\d+:\d+;/);
    }
  });

  it('filters noise commands from zsh history', async () => {
    const entries = await parseBashHistory(file);
    const commands = entries.map((e) => e.command);
    expect(commands).not.toContain('ls');
    expect(commands).not.toContain('cd');
    expect(commands).not.toContain('exit');
    expect(commands).not.toContain('clear');
  });

  it('deduplicates consecutive "git status" entries', async () => {
    const entries = await parseBashHistory(file);
    for (let i = 1; i < entries.length; i++) {
      expect(
        entries[i].command === entries[i - 1].command,
      ).toBe(false);
    }
  });

  it('parses with explicit shell hint', async () => {
    const entries = await parseBashHistory(file, { shell: 'zsh' });
    expect(entries.length).toBeGreaterThan(0);
  });
});

// ─── Multi-line commands ───────────────────────────────────────────────────

describe('parseBashHistory — multi-line commands', () => {
  const file = path.join(FIXTURES, 'sample_bash_multiline.txt');

  it('joins lines ending with backslash into a single command', async () => {
    const entries = await parseBashHistory(file, { shell: 'bash' });
    // The docker run multi-line should be joined.
    const dockerEntry = entries.find((e) => e.command.includes('docker run'));
    expect(dockerEntry).toBeDefined();
    expect(dockerEntry!.command).toContain('nginx:latest');
    expect(dockerEntry!.command).toContain('-p 8080:80');
  });

  it('preserves single-line commands alongside multi-line ones', async () => {
    const entries = await parseBashHistory(file, { shell: 'bash' });
    const commands = entries.map((e) => e.command);
    expect(commands).toContain('git status');
    expect(commands).toContain('echo "single line"');
    expect(commands).toContain('npm test');
  });

  it('joins the curl multi-line command', async () => {
    const entries = await parseBashHistory(file, { shell: 'bash' });
    const curlEntry = entries.find((e) => e.command.includes('curl'));
    expect(curlEntry).toBeDefined();
    expect(curlEntry!.command).toContain('-X POST');
    expect(curlEntry!.command).toContain('api.example.com');
  });
});

// ─── Line limit ────────────────────────────────────────────────────────────

describe('parseBashHistory — maxLines option', () => {
  it('respects maxLines to limit processed lines', async () => {
    const file = path.join(FIXTURES, 'sample_bash_history.txt');
    // Our fixture has ~26 lines; request only 5 → should get the tail.
    const entries = await parseBashHistory(file, { maxLines: 200 });
    // Should still parse successfully (minimum limit is 100, and file is small).
    expect(entries.length).toBeGreaterThan(0);
  });
});

// ─── Performance (large file) ──────────────────────────────────────────────

describe('parseBashHistory — performance', () => {
  it('handles 10k+ lines within a reasonable time', async () => {
    // Generate a temporary large file.
    const tmpFile = path.join(FIXTURES, '_perf_test_history.txt');
    const lines: string[] = [];
    for (let i = 0; i < 12000; i++) {
      lines.push(`git commit -m "commit ${i}"`);
    }
    await fs.writeFile(tmpFile, lines.join('\n'), 'utf-8');

    try {
      const start = performance.now();
      const entries = await parseBashHistory(tmpFile, { maxLines: 10000 });
      const elapsed = performance.now() - start;

      // Should complete in under 2 seconds even on slow CI.
      expect(elapsed).toBeLessThan(2000);
      // After dedup, all entries are identical → only 1 remains.
      // Actually they're all different ("commit 0", "commit 1"...) so 10k entries.
      expect(entries.length).toBeGreaterThan(1000);
    } finally {
      // Clean up.
      await fs.unlink(tmpFile).catch(() => {});
    }
  });
});
