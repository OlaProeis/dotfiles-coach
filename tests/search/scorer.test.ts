/**
 * Comprehensive tests for the search scorer module.
 *
 * Covers: tokenizer, all five scoring functions, the main searchHistory
 * integration, edge cases, timestamp/frequency handling, and score-weight
 * sanity checks.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  exactOverlap,
  fuzzyOverlap,
  substringScore,
  frequencyScore,
  recencyScore,
  searchHistory,
} from '../../src/search/scorer.js';
import type { HistoryEntry } from '../../src/types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// tokenize
// ═══════════════════════════════════════════════════════════════════════════

describe('tokenize', () => {
  // ── Basic splitting ────────────────────────────────────────────────────
  it('splits on spaces', () => {
    expect(tokenize('git status')).toEqual(['git', 'status']);
  });

  it('lowercases all tokens', () => {
    expect(tokenize('Docker Compose UP')).toEqual(['docker', 'compose', 'up']);
  });

  it('splits on dashes', () => {
    expect(tokenize('docker-compose')).toEqual(['docker', 'compose']);
  });

  it('splits on dots', () => {
    expect(tokenize('file.tar.gz')).toEqual(['file', 'tar', 'gz']);
  });

  it('splits on slashes', () => {
    expect(tokenize('/usr/local/bin')).toEqual(['usr', 'local', 'bin']);
  });

  it('splits on equals', () => {
    expect(tokenize('FOO=bar')).toEqual(['foo', 'bar']);
  });

  it('splits on pipes', () => {
    expect(tokenize('cat file | grep pattern')).toEqual(['cat', 'file', 'grep', 'pattern']);
  });

  it('splits on semicolons', () => {
    expect(tokenize('cd /tmp; ls')).toEqual(['cd', 'tmp', 'ls']);
  });

  it('splits on ampersands (&&)', () => {
    expect(tokenize('git add . && git commit')).toEqual(['git', 'add', 'git', 'commit']);
  });

  it('splits on colons', () => {
    // @ is not a separator, so user@host stays together
    expect(tokenize('user@host:path')).toEqual(['user@host', 'path']);
  });

  // ── Quoting and brackets ──────────────────────────────────────────────
  it('strips double quotes', () => {
    expect(tokenize('echo "hello world"')).toEqual(['echo', 'hello', 'world']);
  });

  it('strips single quotes', () => {
    expect(tokenize("echo 'hello'")).toEqual(['echo', 'hello']);
  });

  it('strips backticks', () => {
    expect(tokenize('echo `date`')).toEqual(['echo', 'date']);
  });

  it('strips parentheses', () => {
    // $ is a single-char token after splitting on parentheses
    expect(tokenize('$(echo foo)')).toEqual(['$', 'echo', 'foo']);
  });

  it('strips angle brackets (redirects)', () => {
    expect(tokenize('echo foo > file.txt')).toEqual(['echo', 'foo', 'file', 'txt']);
  });

  it('strips curly braces', () => {
    // $ remains as a single-char token after splitting on { }
    expect(tokenize('echo ${HOME}')).toEqual(['echo', '$', 'home']);
  });

  it('strips square brackets', () => {
    expect(tokenize('test[0]')).toEqual(['test', '0']);
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(tokenize('   ')).toEqual([]);
  });

  it('returns empty array for punctuation-only input', () => {
    expect(tokenize('---...')).toEqual([]);
  });

  it('filters out empty tokens from consecutive separators', () => {
    expect(tokenize('  git  --status  ')).toEqual(['git', 'status']);
  });

  it('handles single character tokens', () => {
    expect(tokenize('a b c')).toEqual(['a', 'b', 'c']);
  });

  it('handles numeric tokens', () => {
    expect(tokenize('sleep 300')).toEqual(['sleep', '300']);
  });

  it('handles mixed alphanumeric', () => {
    expect(tokenize('python3 script2.py')).toEqual(['python3', 'script2', 'py']);
  });

  it('handles complex real-world command', () => {
    const tokens = tokenize('ffmpeg -i input.mp4 -vcodec libx264 -crf 23 output.mp4');
    expect(tokens).toContain('ffmpeg');
    expect(tokens).toContain('input');
    expect(tokens).toContain('mp4');
    expect(tokens).toContain('libx264');
    expect(tokens).toContain('output');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// exactOverlap
// ═══════════════════════════════════════════════════════════════════════════

describe('exactOverlap', () => {
  it('returns 1 for identical token sets', () => {
    expect(exactOverlap(['git', 'status'], ['git', 'status'])).toBe(1);
  });

  it('returns 0.5 when half the query tokens match', () => {
    expect(exactOverlap(['git', 'pull'], ['git', 'status'])).toBe(0.5);
  });

  it('returns 0 when no tokens match', () => {
    expect(exactOverlap(['docker', 'run'], ['git', 'status'])).toBe(0);
  });

  it('returns 0 for empty query tokens', () => {
    expect(exactOverlap([], ['git', 'status'])).toBe(0);
  });

  it('handles single-token query against multi-token command', () => {
    expect(exactOverlap(['git'], ['git', 'status', 'add'])).toBe(1);
  });

  it('handles multi-token query against single-token command', () => {
    expect(exactOverlap(['git', 'status'], ['git'])).toBe(0.5);
  });

  it('handles duplicate tokens in query', () => {
    // Both "git" tokens match, so 2/2 = 1
    expect(exactOverlap(['git', 'git'], ['git', 'status'])).toBe(1);
  });

  it('handles empty command tokens', () => {
    expect(exactOverlap(['git'], [])).toBe(0);
  });

  it('is case-sensitive (expects pre-lowercased tokens)', () => {
    expect(exactOverlap(['git'], ['Git'])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fuzzyOverlap
// ═══════════════════════════════════════════════════════════════════════════

describe('fuzzyOverlap', () => {
  it('returns 1 when all tokens match exactly (short-circuits)', () => {
    expect(fuzzyOverlap(['git', 'status'], ['git', 'status'])).toBe(1);
  });

  it('finds fuzzy match for single-char typo', () => {
    // "gti" → "git" (distance 1)
    const score = fuzzyOverlap(['gti'], ['git', 'status']);
    expect(score).toBeGreaterThan(0);
  });

  it('finds fuzzy match for two-char typo', () => {
    // "gi" → "git" (distance 1)
    const score = fuzzyOverlap(['gi'], ['git']);
    expect(score).toBeGreaterThan(0);
  });

  it('rejects tokens with distance > 2', () => {
    // "kubernetes" is way too far from any token in ["git", "status"]
    expect(fuzzyOverlap(['kubernetes'], ['git', 'status'])).toBe(0);
  });

  it('returns 0 for empty query tokens', () => {
    expect(fuzzyOverlap([], ['git', 'status'])).toBe(0);
  });

  it('returns 0 for empty command tokens', () => {
    expect(fuzzyOverlap(['git'], [])).toBe(0);
  });

  it('skips tokens with length difference > threshold', () => {
    // "ab" vs "abcdef" — length diff of 4 exceeds threshold of 2
    expect(fuzzyOverlap(['ab'], ['abcdef'])).toBe(0);
  });

  it('handles mix of exact and fuzzy matches', () => {
    // "git" matches exactly, "staus" fuzzy-matches "status" (distance 1)
    const score = fuzzyOverlap(['git', 'staus'], ['git', 'status']);
    // "git" matched exactly → only "staus" remains. It fuzzy-matches.
    // 1 fuzzy match / 2 total query tokens = 0.5
    expect(score).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// substringScore
// ═══════════════════════════════════════════════════════════════════════════

describe('substringScore', () => {
  it('returns 1 when full query is a substring of the command', () => {
    expect(
      substringScore('git st', 'git status', ['git', 'st'], ['git', 'status']),
    ).toBe(1);
  });

  it('returns 1 for exact command match', () => {
    expect(
      substringScore('git status', 'git status', ['git', 'status'], ['git', 'status']),
    ).toBe(1);
  });

  it('is case-insensitive for substring check', () => {
    expect(
      substringScore('GIT STATUS', 'git status', ['git', 'status'], ['git', 'status']),
    ).toBe(1);
  });

  it('scores prefix matches between tokens', () => {
    const score = substringScore(
      'dock compose',
      'docker-compose up -d',
      ['dock', 'compose'],
      ['docker', 'compose', 'up', 'd'],
    );
    // "dock" is prefix of "docker", "compose" matches exactly
    expect(score).toBe(1); // 2/2 prefix hits
  });

  it('scores partial prefix matches', () => {
    const score = substringScore(
      'dock xyz',
      'docker run hello',
      ['dock', 'xyz'],
      ['docker', 'run', 'hello'],
    );
    // "dock" is prefix of "docker" (1 hit), "xyz" matches nothing (0)
    expect(score).toBe(0.5); // 1/2
  });

  it('returns 0 when no substring or prefix match', () => {
    expect(
      substringScore('kubernetes', 'git status', ['kubernetes'], ['git', 'status']),
    ).toBe(0);
  });

  it('handles empty query tokens', () => {
    // Empty string is a substring of everything via String.includes(''),
    // so the full-substring check returns 1.0. This is fine because
    // searchHistory never calls with an empty query.
    expect(substringScore('', 'git status', [], ['git', 'status'])).toBe(1);
  });

  it('checks reverse prefix (command token is prefix of query token)', () => {
    // "git" is a prefix of "github"
    const score = substringScore(
      'github',
      'git status',
      ['github'],
      ['git', 'status'],
    );
    expect(score).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// frequencyScore
// ═══════════════════════════════════════════════════════════════════════════

describe('frequencyScore', () => {
  it('returns 0 when maxFrequency is 1 (all commands equal)', () => {
    expect(frequencyScore(1, 1)).toBe(0);
  });

  it('returns ~1 for the most frequent command', () => {
    expect(frequencyScore(100, 100)).toBeCloseTo(1, 2);
  });

  it('returns value between 0 and 1', () => {
    const score = frequencyScore(10, 100);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('increases monotonically with frequency', () => {
    const s1 = frequencyScore(2, 100);
    const s2 = frequencyScore(10, 100);
    const s3 = frequencyScore(50, 100);
    const s4 = frequencyScore(99, 100);
    expect(s1).toBeLessThan(s2);
    expect(s2).toBeLessThan(s3);
    expect(s3).toBeLessThan(s4);
  });

  it('handles frequency of 0', () => {
    // log(1+0) / log(1+10) = 0
    expect(frequencyScore(0, 10)).toBe(0);
  });

  it('uses log scale (not linear)', () => {
    // If linear, 50/100 = 0.5. With log it should be higher.
    const score = frequencyScore(50, 100);
    expect(score).toBeGreaterThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// recencyScore
// ═══════════════════════════════════════════════════════════════════════════

describe('recencyScore', () => {
  it('returns 0 when no timestamp', () => {
    expect(recencyScore(undefined, new Date())).toBe(0);
  });

  it('returns 1 for the most recent entry (same timestamp)', () => {
    const now = new Date();
    expect(recencyScore(now, now)).toBe(1);
  });

  it('returns ~0.97 for 1-day-old entry', () => {
    const now = new Date();
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const score = recencyScore(oneDay, now);
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThan(1);
  });

  it('returns ~0.77 for 1-week-old entry', () => {
    const now = new Date();
    const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const score = recencyScore(oneWeek, now);
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(0.85);
  });

  it('decreases with age', () => {
    const now = new Date();
    const oneDay = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeks = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    expect(recencyScore(oneDay, now)).toBeGreaterThan(recencyScore(oneWeek, now));
    expect(recencyScore(oneWeek, now)).toBeGreaterThan(recencyScore(twoWeeks, now));
  });

  it('returns 0 for entries older than 30 days', () => {
    const now = new Date();
    const old = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    expect(recencyScore(old, now)).toBe(0);
  });

  it('returns 0 for entries exactly 30 days old', () => {
    const now = new Date();
    const exact30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(recencyScore(exact30, now)).toBe(0);
  });

  it('returns 1 when timestamp is in the future', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000);
    expect(recencyScore(future, now)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// searchHistory — integration
// ═══════════════════════════════════════════════════════════════════════════

describe('searchHistory', () => {
  // ── Shared test data ──────────────────────────────────────────────────
  const entries: HistoryEntry[] = [
    { command: 'git status', lineNumber: 1 },
    { command: 'git status', lineNumber: 2 },
    { command: 'git status', lineNumber: 3 },
    { command: 'git commit -m "fix bug"', lineNumber: 4 },
    { command: 'docker-compose up -d', lineNumber: 5 },
    { command: 'docker-compose down', lineNumber: 6 },
    { command: 'npm install', lineNumber: 7 },
    { command: 'npm test', lineNumber: 8 },
    { command: 'ffmpeg -i input.mp4 -vcodec libx264 output.mp4', lineNumber: 9 },
    { command: 'kubectl get pods -n production', lineNumber: 10 },
    { command: 'ssh user@server.example.com', lineNumber: 11 },
    { command: 'curl -X POST https://api.example.com/data', lineNumber: 12 },
  ];

  // ── Empty / invalid input ─────────────────────────────────────────────

  it('returns empty for empty query', () => {
    expect(searchHistory(entries, '')).toEqual([]);
  });

  it('returns empty for whitespace-only query', () => {
    expect(searchHistory(entries, '   ')).toEqual([]);
  });

  it('returns empty for empty entries', () => {
    expect(searchHistory([], 'git')).toEqual([]);
  });

  it('returns empty for punctuation-only query', () => {
    expect(searchHistory(entries, '---')).toEqual([]);
  });

  // ── Exact matching ────────────────────────────────────────────────────

  it('finds exact command match for "git status"', () => {
    const results = searchHistory(entries, 'git status');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toBe('git status');
  });

  it('finds exact match for "npm test"', () => {
    const results = searchHistory(entries, 'npm test');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toBe('npm test');
  });

  it('finds exact match for "npm install"', () => {
    const results = searchHistory(entries, 'npm install');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toBe('npm install');
  });

  // ── Partial / keyword matching ────────────────────────────────────────

  it('finds all git commands for query "git"', () => {
    const results = searchHistory(entries, 'git');
    const gitCommands = results.filter((r) => r.command.startsWith('git'));
    expect(gitCommands.length).toBeGreaterThanOrEqual(2);
  });

  it('finds docker commands for query "docker compose"', () => {
    const results = searchHistory(entries, 'docker compose');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('docker');
  });

  it('finds ffmpeg by partial keywords', () => {
    const results = searchHistory(entries, 'ffmpeg video');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('ffmpeg');
  });

  it('finds ffmpeg by tool name alone', () => {
    const results = searchHistory(entries, 'ffmpeg');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('ffmpeg');
  });

  it('finds kubectl pod listing', () => {
    const results = searchHistory(entries, 'kubectl pods');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('kubectl');
  });

  it('finds curl POST command', () => {
    const results = searchHistory(entries, 'curl POST api');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('curl');
  });

  it('finds ssh command', () => {
    const results = searchHistory(entries, 'ssh server');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toContain('ssh');
  });

  // ── Fuzzy matching ────────────────────────────────────────────────────

  it('finds git commands even with typo "gti"', () => {
    const results = searchHistory(entries, 'gti status');
    expect(results.length).toBeGreaterThan(0);
    const gitResult = results.find((r) => r.command === 'git status');
    expect(gitResult).toBeDefined();
  });

  it('finds docker with typo "dokcer"', () => {
    const results = searchHistory(entries, 'dokcer');
    const dockerResult = results.find((r) => r.command.includes('docker'));
    expect(dockerResult).toBeDefined();
  });

  it('finds npm with typo "nmp"', () => {
    const results = searchHistory(entries, 'nmp');
    const npmResult = results.find((r) => r.command.startsWith('npm'));
    expect(npmResult).toBeDefined();
  });

  // ── Ranking behaviour ─────────────────────────────────────────────────

  it('ranks git status higher than git commit (frequency=3 vs 1)', () => {
    const results = searchHistory(entries, 'git');
    const statusIdx = results.findIndex((r) => r.command === 'git status');
    const commitIdx = results.findIndex((r) => r.command.includes('git commit'));
    expect(statusIdx).toBeLessThan(commitIdx);
  });

  it('scores are in descending order', () => {
    const results = searchHistory(entries, 'git');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('more specific query yields higher top score', () => {
    const broad = searchHistory(entries, 'git');
    const specific = searchHistory(entries, 'git status');
    // The exact match should score at least as high
    expect(specific[0].score).toBeGreaterThanOrEqual(broad[0].score);
  });

  // ── maxResults ────────────────────────────────────────────────────────

  it('respects maxResults=1', () => {
    const results = searchHistory(entries, 'git', 1);
    expect(results.length).toBe(1);
  });

  it('respects maxResults=3', () => {
    const results = searchHistory(entries, 'git', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns all results when maxResults exceeds matches', () => {
    const results = searchHistory(entries, 'ffmpeg', 100);
    // Only one ffmpeg command in the dataset
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThan(100);
  });

  it('defaults to 10 results', () => {
    const results = searchHistory(entries, 'git');
    expect(results.length).toBeLessThanOrEqual(10);
  });

  // ── Frequency tracking ────────────────────────────────────────────────

  it('tracks frequency correctly for "git status" (3 occurrences)', () => {
    const results = searchHistory(entries, 'git status', 1);
    expect(results[0].command).toBe('git status');
    expect(results[0].frequency).toBe(3);
  });

  it('tracks frequency=1 for unique commands', () => {
    const results = searchHistory(entries, 'ffmpeg', 1);
    expect(results[0].frequency).toBe(1);
  });

  // ── Line number tracking ──────────────────────────────────────────────

  it('tracks highest line number for repeated commands', () => {
    const results = searchHistory(entries, 'git status', 1);
    // git status appears at lines 1, 2, 3 → max is 3
    expect(results[0].lineNumber).toBe(3);
  });

  it('tracks line number for unique commands', () => {
    const results = searchHistory(entries, 'ffmpeg', 1);
    expect(results[0].lineNumber).toBe(9);
  });

  // ── Result shape validation ───────────────────────────────────────────

  it('returns results with all required fields', () => {
    const results = searchHistory(entries, 'npm');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('command');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('frequency');
      expect(r).toHaveProperty('lineNumber');
      expect(typeof r.command).toBe('string');
      expect(typeof r.score).toBe('number');
      expect(typeof r.frequency).toBe('number');
      expect(typeof r.lineNumber).toBe('number');
    }
  });

  it('scores are between 0 and 1', () => {
    const results = searchHistory(entries, 'git');
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('scores have at most 3 decimal places', () => {
    const results = searchHistory(entries, 'docker');
    for (const r of results) {
      const decimals = String(r.score).split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(3);
    }
  });

  // ── Timestamp handling ────────────────────────────────────────────────

  it('handles entries with timestamps', () => {
    const now = new Date();
    const timestampedEntries: HistoryEntry[] = [
      { command: 'git push', lineNumber: 1, timestamp: new Date(now.getTime() - 1000) },
      { command: 'git pull', lineNumber: 2, timestamp: now },
    ];
    const results = searchHistory(timestampedEntries, 'git');
    expect(results.length).toBe(2);
    // Both should have lastUsed set
    for (const r of results) {
      expect(r.lastUsed).toBeInstanceOf(Date);
    }
  });

  it('recency boosts more recent commands', () => {
    const now = new Date();
    const entriesWithTime: HistoryEntry[] = [
      { command: 'git push old', lineNumber: 1, timestamp: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000) },
      { command: 'git push new', lineNumber: 2, timestamp: now },
    ];
    const results = searchHistory(entriesWithTime, 'git push');
    // The newer command should rank first
    expect(results[0].command).toBe('git push new');
  });

  it('handles entries without timestamps (lastUsed is undefined)', () => {
    const noTimestampEntries: HistoryEntry[] = [
      { command: 'ls -la', lineNumber: 1 },
    ];
    const results = searchHistory(noTimestampEntries, 'ls');
    expect(results.length).toBe(1);
    expect(results[0].lastUsed).toBeUndefined();
  });

  // ── Deduplication ─────────────────────────────────────────────────────

  it('deduplicates identical commands into single result', () => {
    const results = searchHistory(entries, 'git status');
    const gitStatusResults = results.filter((r) => r.command === 'git status');
    expect(gitStatusResults.length).toBe(1);
    expect(gitStatusResults[0].frequency).toBe(3);
  });

  // ── No-match behaviour ────────────────────────────────────────────────

  it('returns few/low-score results for unrelated query', () => {
    // Short tokens like "baz" may fuzzy-match short command tokens,
    // so we check that any results have very low scores.
    const results = searchHistory(entries, 'xyzzyxyzzy foobarfoobar');
    if (results.length > 0) {
      for (const r of results) {
        expect(r.score).toBeLessThan(0.3);
      }
    }
  });

  // ── Score threshold (MIN_SCORE = 0.05) ────────────────────────────────

  it('filters out results below minimum score threshold', () => {
    const results = searchHistory(entries, 'git');
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.05);
    }
  });

  // ── Large dataset behaviour ───────────────────────────────────────────

  it('handles large history efficiently', () => {
    const largeEntries: HistoryEntry[] = [];
    for (let i = 0; i < 5000; i++) {
      largeEntries.push({
        command: `command-${i % 100} --arg${i}`,
        lineNumber: i + 1,
      });
    }
    // Add one unique target command
    largeEntries.push({ command: 'special-unique-command --flag', lineNumber: 5001 });

    const start = Date.now();
    const results = searchHistory(largeEntries, 'special unique command');
    const elapsed = Date.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].command).toBe('special-unique-command --flag');
    // Should complete in under 5 seconds (PRD requirement)
    expect(elapsed).toBeLessThan(5000);
  });
});
