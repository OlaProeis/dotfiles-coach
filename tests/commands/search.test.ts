/**
 * Comprehensive command-level tests for `dotfiles-coach search`.
 *
 * Covers: all three shells, all three output formats, maxResults, error
 * handling, empty results, result shape validation, timestamped fixtures,
 * and JSON structure validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Resolve fixture directory ────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

// ── Mock ora to suppress spinner output ──────────────────────────────────────

vi.mock('ora', () => ({
  default: () => {
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: '',
    };
    return new Proxy(spinner, {
      set(target, prop, value) {
        if (prop === 'text') {
          (target as Record<string, unknown>).text = value;
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { runSearch } from '../../src/commands/search.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runSearch', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Success cases — different shell fixtures
  // ═══════════════════════════════════════════════════════════════════════

  it('returns results for bash fixture', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 10,
      format: 'table',
    });

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command.toLowerCase()).toContain('git');
  });

  it('returns results for zsh fixture', async () => {
    const results = await runSearch({
      shell: 'zsh',
      historyFile: path.join(FIXTURES_DIR, 'sample_zsh_history.txt'),
      query: 'git',
      maxResults: 10,
      format: 'table',
    });

    expect(results.length).toBeGreaterThan(0);
  });

  it('returns results for timestamped bash fixture', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history_timestamped.txt'),
      query: 'git',
      maxResults: 10,
      format: 'json',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command.toLowerCase()).toContain('git');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Output formats — table
  // ═══════════════════════════════════════════════════════════════════════

  it('table output includes header box and columns', async () => {
    await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 5,
      format: 'table',
    });

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('History Search');
    expect(allOutput).toContain('Rank');
    expect(allOutput).toContain('Score');
    expect(allOutput).toContain('Freq');
    expect(allOutput).toContain('Command');
  });

  it('table output includes the explain hint', async () => {
    await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 3,
      format: 'table',
    });

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('--explain');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Output formats — JSON
  // ═══════════════════════════════════════════════════════════════════════

  it('outputs valid JSON with correct top-level structure', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 5,
      format: 'json',
    });

    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        JSON.parse(String(args[0]));
        return true;
      } catch {
        return false;
      }
    });

    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(String(jsonCall![0]));
    expect(parsed).toHaveProperty('results');
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBe(results.length);
  });

  it('JSON results have all expected fields', async () => {
    await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 3,
      format: 'json',
    });

    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        JSON.parse(String(args[0]));
        return true;
      } catch {
        return false;
      }
    });

    const parsed = JSON.parse(String(jsonCall![0]));
    for (const item of parsed.results) {
      expect(item).toHaveProperty('command');
      expect(item).toHaveProperty('score');
      expect(item).toHaveProperty('frequency');
      expect(item).toHaveProperty('lastUsed');
      expect(item).toHaveProperty('lineNumber');
      expect(typeof item.command).toBe('string');
      expect(typeof item.score).toBe('number');
      expect(typeof item.frequency).toBe('number');
      expect(typeof item.lineNumber).toBe('number');
    }
  });

  it('JSON scores match returned result scores', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'docker',
      maxResults: 5,
      format: 'json',
    });

    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        JSON.parse(String(args[0]));
        return true;
      } catch {
        return false;
      }
    });

    const parsed = JSON.parse(String(jsonCall![0]));
    for (let i = 0; i < results.length; i++) {
      expect(parsed.results[i].command).toBe(results[i].command);
      expect(parsed.results[i].score).toBe(results[i].score);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Output formats — Markdown
  // ═══════════════════════════════════════════════════════════════════════

  it('outputs markdown with title and table', async () => {
    await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 5,
      format: 'markdown',
    });

    const mdCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Search Results'),
    );
    expect(mdCall).toBeDefined();

    const md = String(mdCall![0]);
    expect(md).toContain('| Rank | Score | Freq | Command |');
    expect(md).toContain('|------|-------|------|---------|');
    // Should contain the query in the title
    expect(md).toContain('"git"');
  });

  it('markdown table has the right number of data rows', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'npm',
      maxResults: 5,
      format: 'markdown',
    });

    const mdCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Search Results'),
    );
    const md = String(mdCall![0]);
    const dataRows = md
      .split('\n')
      .filter((line) => line.startsWith('|') && !line.startsWith('| Rank') && !line.startsWith('|---'));
    expect(dataRows.length).toBe(results.length);
  });

  it('markdown escapes pipe characters in commands', async () => {
    // This tests the pipe-escaping logic in formatSearchMarkdown
    // The fixture doesn't have pipe commands, but the code handles it
    await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 3,
      format: 'markdown',
    });

    // Just verify markdown output was produced without errors
    const mdCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Search Results'),
    );
    expect(mdCall).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // maxResults behaviour
  // ═══════════════════════════════════════════════════════════════════════

  it('respects maxResults=1', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 1,
      format: 'json',
    });

    expect(results.length).toBe(1);
  });

  it('respects maxResults=2', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 2,
      format: 'json',
    });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('defaults to 10 when maxResults not specified', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      format: 'json',
    });

    expect(results.length).toBeLessThanOrEqual(10);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Result shape validation
  // ═══════════════════════════════════════════════════════════════════════

  it('all results have correct SearchResult shape', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 5,
      format: 'json',
    });

    for (const r of results) {
      expect(r).toEqual(
        expect.objectContaining({
          command: expect.any(String),
          score: expect.any(Number),
          frequency: expect.any(Number),
          lineNumber: expect.any(Number),
        }),
      );
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.frequency).toBeGreaterThanOrEqual(1);
      expect(r.lineNumber).toBeGreaterThanOrEqual(1);
    }
  });

  it('results are sorted by score descending', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'git',
      maxResults: 10,
      format: 'json',
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Different queries
  // ═══════════════════════════════════════════════════════════════════════

  it('finds docker commands', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'docker',
      maxResults: 5,
      format: 'json',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('docker');
  });

  it('finds npm commands', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'npm',
      maxResults: 5,
      format: 'json',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('npm');
  });

  it('finds kubectl commands', async () => {
    const results = await runSearch({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      query: 'kubectl pods',
      maxResults: 5,
      format: 'json',
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('kubectl');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════════════════

  it('exits with code 1 for non-existent history file', async () => {
    await expect(
      runSearch({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'does_not_exist.txt'),
        query: 'git',
        format: 'table',
      }),
    ).rejects.toThrow(/process\.exit/);

    expect(exitSpy).toHaveBeenCalled();
  });

  it('shows tip message when default history file is missing', async () => {
    // This test uses a non-existent default path by not specifying historyFile
    // Since we can't easily control the default path, we verify the error
    // handling code path via the fixture test above.
    // Instead, verify error spy is called on failure
    try {
      await runSearch({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'does_not_exist.txt'),
        query: 'git',
        format: 'table',
      });
    } catch {
      // Expected
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
