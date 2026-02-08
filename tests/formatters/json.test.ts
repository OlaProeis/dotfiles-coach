import { describe, it, expect } from 'vitest';
import { formatAnalysisJson } from '../../src/formatters/json.js';
import type { AnalysisResult } from '../../src/types/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    shell: 'bash',
    historyFile: '/home/user/.bash_history',
    totalCommands: 100,
    uniqueCommands: 50,
    patterns: [],
    safetyAlerts: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('formatAnalysisJson', () => {
  it('returns valid JSON string', () => {
    const result = makeResult();
    const json = formatAnalysisJson(result);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves all AnalysisResult fields', () => {
    const result = makeResult({
      shell: 'zsh',
      historyFile: '/home/user/.zsh_history',
      totalCommands: 8472,
      uniqueCommands: 1203,
      patterns: [
        { pattern: 'git status', frequency: 247, variations: ['git st'] },
      ],
      safetyAlerts: [
        {
          pattern: 'rm -rf /',
          frequency: 3,
          risk: 'Destructive',
          saferAlternative: 'rm -rfi',
        },
      ],
    });

    const parsed = JSON.parse(formatAnalysisJson(result));

    expect(parsed.shell).toBe('zsh');
    expect(parsed.historyFile).toBe('/home/user/.zsh_history');
    expect(parsed.totalCommands).toBe(8472);
    expect(parsed.uniqueCommands).toBe(1203);
    expect(parsed.patterns).toHaveLength(1);
    expect(parsed.patterns[0].pattern).toBe('git status');
    expect(parsed.patterns[0].frequency).toBe(247);
    expect(parsed.patterns[0].variations).toEqual(['git st']);
    expect(parsed.safetyAlerts).toHaveLength(1);
    expect(parsed.safetyAlerts[0].pattern).toBe('rm -rf /');
  });

  it('is pretty-printed with 2-space indentation', () => {
    const json = formatAnalysisJson(makeResult());

    // Pretty-printed JSON has newlines and indentation
    expect(json).toContain('\n');
    expect(json).toContain('  "shell"');
  });

  it('handles empty patterns and alerts', () => {
    const result = makeResult({ patterns: [], safetyAlerts: [] });
    const parsed = JSON.parse(formatAnalysisJson(result));

    expect(parsed.patterns).toEqual([]);
    expect(parsed.safetyAlerts).toEqual([]);
  });

  it('serialises Date objects as ISO strings', () => {
    const date = new Date('2026-02-08T12:00:00Z');
    const result = makeResult({
      patterns: [
        { pattern: 'git status', frequency: 10, lastUsed: date, variations: [] },
      ],
    });

    const parsed = JSON.parse(formatAnalysisJson(result));
    expect(parsed.patterns[0].lastUsed).toBe('2026-02-08T12:00:00.000Z');
  });

  it('handles large datasets without truncation', () => {
    const patterns = Array.from({ length: 100 }, (_, i) => ({
      pattern: `command-${i}`,
      frequency: 100 - i,
      variations: [],
    }));

    const result = makeResult({ patterns });
    const parsed = JSON.parse(formatAnalysisJson(result));

    expect(parsed.patterns).toHaveLength(100);
  });
});
