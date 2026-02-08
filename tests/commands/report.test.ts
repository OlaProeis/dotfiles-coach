import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
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

// ── Mock suggestions cache path to isolate from real filesystem ──────────────

vi.mock('../../src/utils/file-operations.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/utils/file-operations.js')
  >('../../src/utils/file-operations.js');
  return {
    ...actual,
    getSuggestionsCachePath: () =>
      path.join(
        os.tmpdir(),
        `dotfiles-coach-test-no-cache-${process.pid}.json`,
      ),
  };
});

// ── Import after mocks ──────────────────────────────────────────────────────

import { runReport } from '../../src/commands/report.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runReport', () => {
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

  // ── Markdown output (stdout) ──────────────────────────────────────────

  it('generates markdown report to stdout for bash fixture', async () => {
    await runReport({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 10,
      format: 'markdown',
    });

    // Find the markdown output in console.log calls
    const markdownCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Dotfiles Coach Report'),
    );
    expect(markdownCall).toBeDefined();

    const markdown = String(markdownCall![0]);
    expect(markdown).toContain('**Shell:** Bash');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('## Top Repeated Patterns');
    expect(markdown).toContain('## Recommendations');
  });

  it('generates markdown report for zsh fixture', async () => {
    await runReport({
      shell: 'zsh',
      historyFile: path.join(FIXTURES_DIR, 'sample_zsh_history.txt'),
      minFrequency: 1,
      top: 10,
      format: 'markdown',
    });

    const markdownCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Dotfiles Coach Report'),
    );
    expect(markdownCall).toBeDefined();
    expect(String(markdownCall![0])).toContain('**Shell:** Zsh');
  });

  // ── JSON output (stdout) ──────────────────────────────────────────────

  it('generates valid JSON report to stdout', async () => {
    await runReport({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 10,
      format: 'json',
    });

    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        const parsed = JSON.parse(String(args[0]));
        return parsed.summary !== undefined;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();

    const parsed = JSON.parse(String(jsonCall![0]));
    expect(parsed.shell).toBe('bash');
    expect(parsed.summary.totalCommands).toBeGreaterThan(0);
    expect(parsed.summary.uniqueCommands).toBeGreaterThan(0);
    expect(Array.isArray(parsed.patterns)).toBe(true);
    expect(Array.isArray(parsed.suggestions)).toBe(true);
    expect(Array.isArray(parsed.safetyAlerts)).toBe(true);
  });

  // ── File output ────────────────────────────────────────────────────────

  it('writes markdown report to file when --output specified', async () => {
    const tmpDir = path.join(os.tmpdir(), `dotfiles-coach-test-${Date.now()}`);
    const outputPath = path.join(tmpDir, 'report.md');

    try {
      await runReport({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
        minFrequency: 1,
        top: 10,
        output: outputPath,
        format: 'markdown',
      });

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('# Dotfiles Coach Report');
      expect(content).toContain('**Shell:** Bash');
      expect(content).toContain('## Summary');
    } finally {
      // Cleanup
      try {
        await fs.rm(tmpDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('writes JSON report to file when --output and --format json', async () => {
    const tmpDir = path.join(os.tmpdir(), `dotfiles-coach-test-${Date.now()}`);
    const outputPath = path.join(tmpDir, 'report.json');

    try {
      await runReport({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
        minFrequency: 1,
        top: 10,
        output: outputPath,
        format: 'json',
      });

      const content = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.shell).toBe('bash');
      expect(parsed.summary).toBeDefined();
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ── Error cases ────────────────────────────────────────────────────────

  it('exits with code 1 for non-existent history file', async () => {
    await expect(
      runReport({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'does_not_exist.txt'),
        format: 'markdown',
      }),
    ).rejects.toThrow(/process\.exit/);

    expect(exitSpy).toHaveBeenCalled();
  });

  // ── Flag behaviour ────────────────────────────────────────────────────

  it('defaults format to markdown when not specified', async () => {
    await runReport({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 10,
    });

    const markdownCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Dotfiles Coach Report'),
    );
    expect(markdownCall).toBeDefined();
  });

  it('shows tip about suggest command when no cached suggestions', async () => {
    await runReport({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 10,
      format: 'markdown',
    });

    // Check all console.log calls for the tip
    const allOutput = logSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(allOutput).toContain('dotfiles-coach suggest');
  });
});
