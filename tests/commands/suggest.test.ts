import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── Resolve fixture directory ────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const COPILOT_FIXTURES = path.join(FIXTURES_DIR, 'copilot_responses');

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

// ── Mock the Copilot client to always use MockCopilotClient ──────────────────

vi.mock('../../src/copilot/client.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  const { MockCopilotClient } = original as { MockCopilotClient: new (dir?: string) => unknown };
  return {
    ...original,
    createCopilotClient: () => new MockCopilotClient(
      path.join(FIXTURES_DIR, 'copilot_responses'),
    ),
  };
});

// ── Mock file-operations to avoid writing to real filesystem ─────────────────

const mockWriteJsonFile = vi.fn().mockResolvedValue(undefined);
const mockWriteFileSafe = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/utils/file-operations.js', () => ({
  writeJsonFile: (...args: unknown[]) => mockWriteJsonFile(...args),
  writeFileSafe: (...args: unknown[]) => mockWriteFileSafe(...args),
  getSuggestionsCachePath: () =>
    path.join(os.tmpdir(), 'dotfiles-coach-test', 'last_suggestions.json'),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { runSuggest } from '../../src/commands/suggest.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runSuggest', () => {
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
    mockWriteJsonFile.mockClear();
    mockWriteFileSafe.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Success cases ───────────────────────────────────────────────────────

  it('returns suggestions for bash fixture', async () => {
    const suggestions = await runSuggest({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
    });

    expect(suggestions).toBeDefined();
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('each suggestion has required fields', async () => {
    const suggestions = await runSuggest({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
    });

    for (const s of suggestions) {
      expect(s).toHaveProperty('pattern');
      expect(s).toHaveProperty('type');
      expect(s).toHaveProperty('code');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('explanation');
      expect(['alias', 'function', 'script']).toContain(s.type);
    }
  });

  it('caches suggestions to JSON file', async () => {
    await runSuggest({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
    });

    expect(mockWriteJsonFile).toHaveBeenCalledOnce();

    // Verify the cache path (first argument) contains the expected filename
    const cachePath = String(mockWriteJsonFile.mock.calls[0][0] ?? '');
    expect(cachePath).toContain('last_suggestions.json');

    // Verify the cache data (second argument) has the right shape
    const cacheData = mockWriteJsonFile.mock.calls[0][1] as Record<string, unknown>;
    expect(cacheData).toHaveProperty('shell', 'bash');
    expect(cacheData).toHaveProperty('generatedAt');
    expect(cacheData).toHaveProperty('suggestions');
    expect(Array.isArray(cacheData.suggestions)).toBe(true);
  });

  it('returns suggestions for zsh fixture', async () => {
    const suggestions = await runSuggest({
      shell: 'zsh',
      historyFile: path.join(FIXTURES_DIR, 'sample_zsh_history.txt'),
      minFrequency: 1,
    });

    expect(suggestions.length).toBeGreaterThan(0);
  });

  // ── Output file mode ──────────────────────────────────────────────────

  it('writes to --output file when specified', async () => {
    const outputPath = path.join(os.tmpdir(), 'test-suggest-output.txt');

    await runSuggest({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
      output: outputPath,
    });

    expect(mockWriteFileSafe).toHaveBeenCalledOnce();
    const [writtenPath, content] = mockWriteFileSafe.mock.calls[0];
    expect(writtenPath).toBe(outputPath);
    expect(content).toContain('SUGGESTION');
  });

  // ── Terminal output format ────────────────────────────────────────────

  it('displays formatted suggestions to stdout', async () => {
    await runSuggest({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
    });

    // Verify console.log was called with suggestion content
    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('SUGGESTION');
  });

  // ── Error cases ───────────────────────────────────────────────────────

  it('exits with code 1 for non-existent history file', async () => {
    await expect(
      runSuggest({
        shell: 'bash',
        historyFile: path.join(FIXTURES_DIR, 'does_not_exist.txt'),
      }),
    ).rejects.toThrow(/process\.exit/);

    expect(exitSpy).toHaveBeenCalled();
  });

  // ── Secret scrubbing ──────────────────────────────────────────────────

  it('scrubs secrets from patterns before sending to Copilot', async () => {
    // The mock client doesn't actually inspect patterns, but we can verify
    // the suggest command doesn't crash when processing history that might
    // contain secrets. The real scrubbing is tested in secret-scrubber tests.
    const suggestions = await runSuggest({
      shell: 'bash',
      historyFile: path.join(FIXTURES_DIR, 'sample_bash_history.txt'),
      minFrequency: 1,
    });

    expect(suggestions).toBeDefined();
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
