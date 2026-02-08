/**
 * End-to-end workflow tests for Dotfiles Coach.
 *
 * These tests exercise the full command pipeline using fixture data,
 * verifying that the CLI entry points work together correctly:
 *   analyze → report (suggest and apply require Copilot / cached data)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

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

import { runAnalyze } from '../src/commands/analyze.js';
import { runReport } from '../src/commands/report.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('E2E: Full workflow', () => {
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

  // ── analyze → report (bash) ───────────────────────────────────────────

  it('analyze then report produces consistent results for bash', async () => {
    const historyFile = path.join(FIXTURES_DIR, 'sample_bash_history.txt');

    // Step 1: Analyze
    const analysisResult = await runAnalyze({
      shell: 'bash',
      historyFile,
      minFrequency: 1,
      top: 10,
      format: 'json',
    });

    expect(analysisResult.totalCommands).toBeGreaterThan(0);
    expect(analysisResult.shell).toBe('bash');

    // Clear log spy for report
    logSpy.mockClear();

    // Step 2: Report (will analyse fresh, won't have cached suggestions)
    await runReport({
      shell: 'bash',
      historyFile,
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

    const report = JSON.parse(String(jsonCall![0]));
    expect(report.summary.totalCommands).toBe(analysisResult.totalCommands);
    expect(report.summary.uniqueCommands).toBe(analysisResult.uniqueCommands);
  });

  // ── analyze → report (zsh) ────────────────────────────────────────────

  it('analyze then report produces consistent results for zsh', async () => {
    const historyFile = path.join(FIXTURES_DIR, 'sample_zsh_history.txt');

    const analysisResult = await runAnalyze({
      shell: 'zsh',
      historyFile,
      minFrequency: 1,
      top: 10,
      format: 'json',
    });

    logSpy.mockClear();

    await runReport({
      shell: 'zsh',
      historyFile,
      minFrequency: 1,
      top: 10,
      format: 'json',
    });

    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        return JSON.parse(String(args[0])).summary !== undefined;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();

    const report = JSON.parse(String(jsonCall![0]));
    expect(report.shell).toBe('zsh');
    expect(report.summary.totalCommands).toBe(analysisResult.totalCommands);
  });

  // ── All output formats work for analyze ───────────────────────────────

  it('analyze supports all three output formats', async () => {
    const historyFile = path.join(FIXTURES_DIR, 'sample_bash_history.txt');

    // Table format
    const tableResult = await runAnalyze({
      shell: 'bash',
      historyFile,
      minFrequency: 1,
      top: 5,
      format: 'table',
    });
    expect(tableResult).toBeDefined();

    logSpy.mockClear();

    // JSON format
    const jsonResult = await runAnalyze({
      shell: 'bash',
      historyFile,
      minFrequency: 1,
      top: 5,
      format: 'json',
    });
    expect(jsonResult).toBeDefined();

    // Verify JSON was actually logged
    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        JSON.parse(String(args[0]));
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();

    logSpy.mockClear();

    // Markdown format
    const mdResult = await runAnalyze({
      shell: 'bash',
      historyFile,
      minFrequency: 1,
      top: 5,
      format: 'markdown',
    });
    expect(mdResult).toBeDefined();

    // Verify markdown was logged
    const mdCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Dotfiles Coach - History Analysis'),
    );
    expect(mdCall).toBeDefined();
  });

  // ── Report file output ────────────────────────────────────────────────

  it('report writes complete markdown file', async () => {
    const tmpDir = path.join(os.tmpdir(), `dotfiles-coach-e2e-${Date.now()}`);
    const outputPath = path.join(tmpDir, 'e2e-report.md');

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

      // Verify all major sections
      expect(content).toContain('# Dotfiles Coach Report');
      expect(content).toContain('## Summary');
      expect(content).toContain('## Top Repeated Patterns');
      expect(content).toContain('| Rank | Count | Pattern |');
      expect(content).toContain('## Recommendations');
      expect(content).toContain('Generated by [Dotfiles Coach]');
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ── Consistency across formats ────────────────────────────────────────

  it('report JSON and markdown contain the same data', async () => {
    const historyFile = path.join(FIXTURES_DIR, 'sample_bash_history.txt');

    // Get JSON report
    await runReport({
      shell: 'bash',
      historyFile,
      minFrequency: 1,
      top: 10,
      format: 'json',
    });

    const jsonCall = logSpy.mock.calls.find((args) => {
      try {
        return JSON.parse(String(args[0])).summary !== undefined;
      } catch {
        return false;
      }
    });
    const jsonReport = JSON.parse(String(jsonCall![0]));

    logSpy.mockClear();

    // Get Markdown report
    await runReport({
      shell: 'bash',
      historyFile,
      minFrequency: 1,
      top: 10,
      format: 'markdown',
    });

    const mdCall = logSpy.mock.calls.find((args) =>
      String(args[0]).includes('# Dotfiles Coach Report'),
    );
    const markdown = String(mdCall![0]);

    // Both should report the same totals
    expect(markdown).toContain(
      `**Total Commands:** ${jsonReport.summary.totalCommands.toLocaleString()}`,
    );
    expect(markdown).toContain(
      `**Unique Commands:** ${jsonReport.summary.uniqueCommands.toLocaleString()}`,
    );
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('analyze and report both exit cleanly for missing files', async () => {
    const badPath = path.join(FIXTURES_DIR, 'nonexistent_history.txt');

    await expect(
      runAnalyze({
        shell: 'bash',
        historyFile: badPath,
        format: 'table',
      }),
    ).rejects.toThrow(/process\.exit/);

    exitSpy.mockClear();

    await expect(
      runReport({
        shell: 'bash',
        historyFile: badPath,
        format: 'markdown',
      }),
    ).rejects.toThrow(/process\.exit/);
  });
});
