import { describe, it, expect } from 'vitest';
import {
  isNoiseCommand,
  limitLines,
  deduplicateConsecutive,
  DEFAULT_MAX_LINES,
  MIN_LINE_LIMIT,
} from '../../src/parsers/common.js';

// ── isNoiseCommand ──────────────────────────────────────────────────────────

describe('isNoiseCommand', () => {
  it('returns true for empty string', () => {
    expect(isNoiseCommand('')).toBe(true);
  });

  it('returns true for whitespace-only', () => {
    expect(isNoiseCommand('   ')).toBe(true);
    expect(isNoiseCommand('\t')).toBe(true);
  });

  it('returns true for single characters', () => {
    expect(isNoiseCommand('q')).toBe(true);
    expect(isNoiseCommand('l')).toBe(true);
    expect(isNoiseCommand('x')).toBe(true);
  });

  it('returns true for bare noise commands', () => {
    expect(isNoiseCommand('ls')).toBe(true);
    expect(isNoiseCommand('cd')).toBe(true);
    expect(isNoiseCommand('clear')).toBe(true);
    expect(isNoiseCommand('exit')).toBe(true);
    expect(isNoiseCommand('pwd')).toBe(true);
    expect(isNoiseCommand('history')).toBe(true);
  });

  it('is case-insensitive for noise commands', () => {
    expect(isNoiseCommand('LS')).toBe(true);
    expect(isNoiseCommand('Clear')).toBe(true);
    expect(isNoiseCommand('EXIT')).toBe(true);
  });

  it('returns false for noise commands with arguments', () => {
    expect(isNoiseCommand('ls -la')).toBe(false);
    expect(isNoiseCommand('cd /tmp')).toBe(false);
    expect(isNoiseCommand('cd ~')).toBe(false);
  });

  it('returns false for real commands', () => {
    expect(isNoiseCommand('git status')).toBe(false);
    expect(isNoiseCommand('npm install')).toBe(false);
    expect(isNoiseCommand('docker compose up')).toBe(false);
    expect(isNoiseCommand('kubectl get pods')).toBe(false);
  });
});

// ── limitLines ──────────────────────────────────────────────────────────────

describe('limitLines', () => {
  it('returns all lines when under limit', () => {
    const lines = ['a', 'b', 'c'];
    expect(limitLines(lines, 10)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the last N lines when over limit', () => {
    // Must use arrays larger than MIN_LINE_LIMIT (100) to test trimming.
    const lines = Array.from({ length: 200 }, (_, i) => `line-${i}`);
    const result = limitLines(lines, 150);
    expect(result).toHaveLength(150);
    expect(result[0]).toBe('line-50'); // kept the tail
    expect(result[149]).toBe('line-199');
  });

  it('returns exact count when equal to limit', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `line-${i}`);
    expect(limitLines(lines, 150)).toHaveLength(150);
  });

  it('enforces minimum limit of MIN_LINE_LIMIT', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line-${i}`);
    const result = limitLines(lines, 50); // below MIN_LINE_LIMIT (100)
    expect(result.length).toBe(MIN_LINE_LIMIT);
  });

  it('returns all lines when array is smaller than limit', () => {
    const lines = ['a', 'b', 'c'];
    expect(limitLines(lines, 500)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the original array', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    const copy = [...lines];
    limitLines(lines, 3);
    expect(lines).toEqual(copy);
  });

  it('exports correct DEFAULT_MAX_LINES', () => {
    expect(DEFAULT_MAX_LINES).toBe(5000);
  });
});

// ── deduplicateConsecutive ──────────────────────────────────────────────────

describe('deduplicateConsecutive', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateConsecutive([])).toEqual([]);
  });

  it('removes consecutive duplicates', () => {
    const entries = [
      { command: 'git status', lineNumber: 1 },
      { command: 'git status', lineNumber: 2 },
      { command: 'git status', lineNumber: 3 },
      { command: 'npm test', lineNumber: 4 },
    ];
    const result = deduplicateConsecutive(entries);
    expect(result).toHaveLength(2);
    expect(result[0].command).toBe('git status');
    expect(result[0].lineNumber).toBe(1); // keeps the first
    expect(result[1].command).toBe('npm test');
  });

  it('preserves non-consecutive duplicates', () => {
    const entries = [
      { command: 'git status', lineNumber: 1 },
      { command: 'npm test', lineNumber: 2 },
      { command: 'git status', lineNumber: 3 },
    ];
    const result = deduplicateConsecutive(entries);
    expect(result).toHaveLength(3);
  });

  it('handles single-element array', () => {
    const entries = [{ command: 'git status', lineNumber: 1 }];
    const result = deduplicateConsecutive(entries);
    expect(result).toHaveLength(1);
  });
});
