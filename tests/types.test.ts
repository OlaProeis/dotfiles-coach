import { describe, it, expect } from 'vitest';
import type {
  HistoryEntry,
  CommandPattern,
  Suggestion,
  AnalysisResult,
  SafetyAlert,
  SearchResult,
  SearchOptions,
} from '../src/types/index';

describe('types', () => {
  it('HistoryEntry shape', () => {
    const e: HistoryEntry = {
      command: 'git status',
      lineNumber: 1,
    };
    expect(e.command).toBe('git status');
    expect(e.lineNumber).toBe(1);
  });

  it('Suggestion shape', () => {
    const s: Suggestion = {
      pattern: 'git status',
      type: 'alias',
      code: "alias gs='git status'",
      name: 'gs',
      explanation: 'Short alias for git status',
    };
    expect(s.type).toBe('alias');
  });

  it('AnalysisResult shape', () => {
    const r: AnalysisResult = {
      shell: 'zsh',
      historyFile: '/home/user/.zsh_history',
      totalCommands: 100,
      uniqueCommands: 50,
      patterns: [],
      safetyAlerts: [],
    };
    expect(r.shell).toBe('zsh');
  });

  it('SafetyAlert shape', () => {
    const a: SafetyAlert = {
      pattern: 'rm -rf /tmp/*',
      frequency: 3,
      risk: 'Destructive without confirmation',
      saferAlternative: 'rm -rfi /tmp/*',
    };
    expect(a.saferAlternative).toContain('rfi');
  });

  it('SearchResult shape', () => {
    const r: SearchResult = {
      command: 'git status',
      score: 0.85,
      frequency: 5,
      lineNumber: 42,
      lastUsed: new Date(),
    };
    expect(r.command).toBe('git status');
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.frequency).toBe(5);
    expect(r.lineNumber).toBe(42);
    expect(r.lastUsed).toBeInstanceOf(Date);
  });

  it('SearchResult with optional lastUsed undefined', () => {
    const r: SearchResult = {
      command: 'ls -la',
      score: 0.5,
      frequency: 1,
      lineNumber: 1,
    };
    expect(r.lastUsed).toBeUndefined();
  });

  it('SearchOptions shape', () => {
    const o: SearchOptions = {
      shell: 'bash',
      query: 'git status',
      maxResults: 10,
      format: 'table',
      explain: false,
    };
    expect(o.query).toBe('git status');
    expect(o.maxResults).toBe(10);
    expect(o.explain).toBe(false);
  });

  it('SearchOptions with minimal fields', () => {
    const o: SearchOptions = {
      query: 'docker',
    };
    expect(o.query).toBe('docker');
    expect(o.shell).toBeUndefined();
    expect(o.maxResults).toBeUndefined();
    expect(o.explain).toBeUndefined();
  });
});
