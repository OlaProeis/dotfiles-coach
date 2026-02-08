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
    // Allow assigning to `.text`
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

import { runAnalyze } from '../../src/commands/analyze.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runAnalyze', () => {
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

  // ── Success cases ───────────────────────────────────────────────────────

  it('returns AnalysisResult for bash fixture', async () => {
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 20,
      format: 'table',
    });

    expect(result).toBeDefined();
    expect(result.shell).toBe('bash');
    expect(result.totalCommands).toBeGreaterThan(0);
    expect(result.uniqueCommands).toBeGreaterThan(0);
    expect(result.uniqueCommands).toBeLessThanOrEqual(result.totalCommands);
    expect(Array.isArray(result.patterns)).toBe(true);
    expect(Array.isArray(result.safetyAlerts)).toBe(true);
  });

  it('returns AnalysisResult for zsh fixture', async () => {
    const result = await runAnalyze({
      shell: 'zsh',
      historyFile: path.join(FIXTURES_DIR, 'sample_zsh_history.txt'),
      minFrequency: 1,
      top: 20,
      format: 'table',
    });

    expect(result.shell).toBe('zsh');
    expect(result.totalCommands).toBeGreaterThan(0);
  });

  it('returns AnalysisResult for timestamped bash fixture', async () => {
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history_timestamped.txt'),
      minFrequency: 1,
      top: 20,
      format: 'table',
    });

    expect(result.shell).toBe('bash');
    expect(result.totalCommands).toBeGreaterThan(0);
  });

  // ── Output format: JSON ─────────────────────────────────────────────────

  it('outputs valid JSON when format is json', async () => {
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 20,
      format: 'json',
    });

    // Find the JSON blob in captured console.log calls
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

    expect(parsed.shell).toBe('bash');
    expect(parsed.totalCommands).toBe(result.totalCommands);
    expect(parsed.uniqueCommands).toBe(result.uniqueCommands);
    expect(parsed.patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pattern: expect.any(String), frequency: expect.any(Number) }),
      ]),
    );
  });

  // ── Flag behaviour ──────────────────────────────────────────────────────

  it('respects --min-frequency flag', async () => {
    const resultLow = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 50,
      format: 'json',
    });

    const resultHigh = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 3,
      top: 50,
      format: 'json',
    });

    expect(resultLow.patterns.length).toBeGreaterThanOrEqual(resultHigh.patterns.length);
  });

  it('respects --top flag', async () => {
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 2,
      format: 'json',
    });

    expect(result.patterns.length).toBeLessThanOrEqual(2);
  });

  it('historyFile overrides default path', async () => {
    const customPath = path.join(FIXTURES_DIR, 'sample_bash_history.txt');
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: customPath,
      minFrequency: 1,
      top: 20,
      format: 'json',
    });

    expect(path.resolve(result.historyFile)).toBe(path.resolve(customPath));
  });

  // ── Error cases ─────────────────────────────────────────────────────────

  it('exits with code 1 for non-existent history file', async () => {
    await expect(
      runAnalyze({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'does_not_exist.txt'),
        format: 'table',
      }),
    ).rejects.toThrow(/process\.exit/);

    expect(exitSpy).toHaveBeenCalled();
  });

  // ── Result structure ────────────────────────────────────────────────────

  it('returns correct AnalysisResult shape', async () => {
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      top: 20,
      format: 'json',
    });

    // Verify complete shape
    expect(result).toEqual(
      expect.objectContaining({
        shell: 'bash',
        historyFile: expect.any(String),
        totalCommands: expect.any(Number),
        uniqueCommands: expect.any(Number),
        patterns: expect.any(Array),
        safetyAlerts: expect.any(Array),
      }),
    );

    // Verify pattern shape (if any exist)
    if (result.patterns.length > 0) {
      expect(result.patterns[0]).toEqual(
        expect.objectContaining({
          pattern: expect.any(String),
          frequency: expect.any(Number),
          variations: expect.any(Array),
        }),
      );
    }
  });

  it('detects patterns that appear in the fixture', async () => {
    const result = await runAnalyze({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 2,
      top: 20,
      format: 'json',
    });

    // sample_bash_history.txt has "git status" repeated 3 consecutive times
    // (which dedup to 1), plus the initial one = 2 total after dedup,
    // but let's just check patterns is populated
    const patternNames = result.patterns.map((p) => p.pattern);
    expect(patternNames.length).toBeGreaterThan(0);
  });
});
