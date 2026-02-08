import { describe, it, expect } from 'vitest';
import type {
  HistoryEntry,
  CommandPattern,
  Suggestion,
  AnalysisResult,
  SafetyAlert,
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
});
