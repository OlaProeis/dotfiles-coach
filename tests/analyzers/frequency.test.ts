import { describe, it, expect } from 'vitest';
import { analyzeFrequency } from '../../src/analyzers/frequency.js';
import type { HistoryEntry } from '../../src/types/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(
  command: string,
  lineNumber: number,
  timestamp?: Date,
): HistoryEntry {
  return { command, lineNumber, timestamp };
}

function makeEntries(commands: string[]): HistoryEntry[] {
  return commands.map((cmd, i) => makeEntry(cmd, i + 1));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('analyzeFrequency', () => {
  it('returns empty array for no entries', () => {
    expect(analyzeFrequency([])).toEqual([]);
  });

  it('counts exact command matches', () => {
    const entries = makeEntries([
      'git status',
      'git add .',
      'git status',
      'git status',
      'git add .',
      'git status',
      'git status',
    ]);

    const result = analyzeFrequency(entries, { minFrequency: 1 });

    const gitStatus = result.find((p) => p.pattern === 'git status');
    expect(gitStatus).toBeDefined();
    expect(gitStatus!.frequency).toBe(5);
  });

  it('respects minFrequency filter', () => {
    const entries = makeEntries([
      'git status',
      'git status',
      'git status',
      'npm test', // only 1 occurrence
    ]);

    const result = analyzeFrequency(entries, { minFrequency: 3 });

    expect(result.some((p) => p.pattern === 'npm test')).toBe(false);
    expect(result.some((p) => p.pattern === 'git status')).toBe(true);
  });

  it('detects command sequences via sliding window', () => {
    const entries = makeEntries([
      'git add .',
      'git commit -m "fix"',
      'git push',
      'ls',
      'git add .',
      'git commit -m "fix"',
      'git push',
      'ls',
      'git add .',
      'git commit -m "fix"',
      'git push',
    ]);

    // Sequence "git add . && git commit -m "fix" && git push" appears 3 times
    const result = analyzeFrequency(entries, {
      minFrequency: 2,
      minSequenceLength: 2,
      maxSequenceLength: 3,
    });

    const seqPattern = result.find((p) => p.pattern.includes(' && '));
    expect(seqPattern).toBeDefined();
    expect(seqPattern!.frequency).toBeGreaterThanOrEqual(2);
  });

  it('groups similar commands via Levenshtein distance', () => {
    const entries = makeEntries([
      'docker ps',
      'docker ps',
      'docker ps',
      'docker ps -a',
      'docker ps -a',
      'docker ps -a',
    ]);

    const result = analyzeFrequency(entries, {
      minFrequency: 1,
      similarityThreshold: 3,
    });

    // "docker ps" and "docker ps -a" differ by 3 characters → should be grouped
    const dockerPattern = result.find((p) => p.pattern === 'docker ps -a' || p.pattern === 'docker ps');
    expect(dockerPattern).toBeDefined();
    // Combined frequency should be 6
    expect(dockerPattern!.frequency).toBe(6);
    expect(dockerPattern!.variations.length).toBe(1);
  });

  it('ranks by frequency descending', () => {
    const entries = makeEntries([
      'npm test',
      'npm test',
      'git status',
      'git status',
      'git status',
      'git status',
      'git status',
    ]);

    const result = analyzeFrequency(entries, { minFrequency: 1 });

    // git status (5) should come before npm test (2)
    const gitIdx = result.findIndex((p) => p.pattern === 'git status');
    const npmIdx = result.findIndex((p) => p.pattern === 'npm test');
    expect(gitIdx).toBeLessThan(npmIdx);
  });

  it('tracks lastUsed from timestamps', () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 3600_000);

    const entries: HistoryEntry[] = [
      makeEntry('git status', 1, earlier),
      makeEntry('git status', 2, now),
    ];

    const result = analyzeFrequency(entries, { minFrequency: 1 });
    const pattern = result.find((p) => p.pattern === 'git status');
    expect(pattern?.lastUsed).toEqual(now);
  });

  it('respects top limit', () => {
    const commands: string[] = [];
    for (let i = 0; i < 30; i++) {
      const cmd = `command-${i}`;
      for (let j = 0; j < 10; j++) {
        commands.push(cmd);
      }
    }
    const entries = makeEntries(commands);

    const result = analyzeFrequency(entries, { minFrequency: 1, top: 5 });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty variations when no similar commands exist', () => {
    const entries = makeEntries([
      'git status',
      'git status',
      'git status',
      'npm install',
      'npm install',
      'npm install',
    ]);

    const result = analyzeFrequency(entries, {
      minFrequency: 1,
      similarityThreshold: 3,
    });

    // These two differ by much more than 3 characters
    for (const p of result) {
      if (p.pattern === 'git status' || p.pattern === 'npm install') {
        expect(p.variations).toEqual([]);
      }
    }
  });

  it('handles entries without timestamps gracefully', () => {
    const entries = makeEntries(['foo', 'foo', 'foo', 'foo', 'foo']);
    const result = analyzeFrequency(entries, { minFrequency: 1 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].lastUsed).toBeUndefined();
  });
});
