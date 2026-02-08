import { describe, it, expect } from 'vitest';
import { formatAnalysisTable } from '../../src/formatters/table.js';
import type { AnalysisResult } from '../../src/types/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip ANSI escape sequences for assertion. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    shell: 'bash',
    historyFile: '/home/user/.bash_history',
    totalCommands: 100,
    uniqueCommands: 50,
    patterns: [
      { pattern: 'git status', frequency: 20, variations: [] },
      { pattern: 'npm test', frequency: 10, variations: [] },
    ],
    safetyAlerts: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('formatAnalysisTable', () => {
  it('includes the header title', async () => {
    const output = stripAnsi(await formatAnalysisTable(makeResult()));
    expect(output).toContain('DOTFILES COACH - History Analysis');
  });

  it('shows capitalised shell name', async () => {
    const output = stripAnsi(await formatAnalysisTable(makeResult({ shell: 'zsh' })));
    expect(output).toContain('Zsh');
  });

  it('shows all shell types capitalised', async () => {
    for (const shell of ['bash', 'zsh', 'powershell'] as const) {
      const output = stripAnsi(await formatAnalysisTable(makeResult({ shell })));
      // First letter should be uppercase
      const expected = shell.charAt(0).toUpperCase() + shell.slice(1);
      expect(output).toContain(expected);
    }
  });

  it('shows history file path', async () => {
    const output = stripAnsi(
      await formatAnalysisTable(
        makeResult({ historyFile: '/custom/path/.zsh_history' }),
      ),
    );
    expect(output).toContain('/custom/path/.zsh_history');
  });

  it('shows total and unique command counts', async () => {
    const output = stripAnsi(
      await formatAnalysisTable(
        makeResult({ totalCommands: 8472, uniqueCommands: 1203 }),
      ),
    );
    expect(output).toContain('8,472');
    expect(output).toContain('1,203');
  });

  it('shows pattern table with rank and count', async () => {
    const output = stripAnsi(await formatAnalysisTable(makeResult()));

    expect(output).toContain('Rank');
    expect(output).toContain('Count');
    expect(output).toContain('Pattern');
    expect(output).toContain('git status');
    expect(output).toContain('npm test');
    expect(output).toContain('20');
    expect(output).toContain('10');
  });

  it('shows "no patterns found" when empty', async () => {
    const output = stripAnsi(
      await formatAnalysisTable(makeResult({ patterns: [] })),
    );
    expect(output).toContain('No patterns found');
  });

  it('echoes back minFrequency in section header', async () => {
    const output = stripAnsi(
      await formatAnalysisTable(makeResult(), { minFrequency: 3 }),
    );
    expect(output).toContain('min frequency: 3');
  });

  it('defaults minFrequency to 5 when not provided', async () => {
    const output = stripAnsi(await formatAnalysisTable(makeResult()));
    expect(output).toContain('min frequency: 5');
  });

  it('shows safety alerts section when alerts exist', async () => {
    const result = makeResult({
      safetyAlerts: [
        {
          pattern: 'rm -rf /tmp/*',
          frequency: 3,
          risk: 'rm -rf without -i flag',
          saferAlternative: 'Use rm -rfi',
        },
      ],
    });

    const output = stripAnsi(await formatAnalysisTable(result));

    expect(output).toContain('SAFETY ALERTS');
    expect(output).toContain('1 dangerous pattern detected');
    expect(output).toContain('rm -rf /tmp/*');
    expect(output).toContain('rm -rf without -i flag');
    expect(output).toContain('Use rm -rfi');
  });

  it('pluralises safety alert count correctly', async () => {
    const result = makeResult({
      safetyAlerts: [
        { pattern: 'rm -rf /', frequency: 2, risk: 'Risk A', saferAlternative: 'Fix A' },
        { pattern: 'chmod 777 .', frequency: 1, risk: 'Risk B', saferAlternative: 'Fix B' },
      ],
    });

    const output = stripAnsi(await formatAnalysisTable(result));
    expect(output).toContain('2 dangerous patterns detected');
  });

  it('does NOT show safety section when no alerts', async () => {
    const output = stripAnsi(
      await formatAnalysisTable(makeResult({ safetyAlerts: [] })),
    );
    expect(output).not.toContain('SAFETY ALERTS');
  });

  it('includes call-to-action for suggest command', async () => {
    const output = stripAnsi(await formatAnalysisTable(makeResult()));
    expect(output).toContain('dotfiles-coach suggest');
  });

  it('returns a non-empty string', async () => {
    const output = await formatAnalysisTable(makeResult());
    expect(output.length).toBeGreaterThan(0);
  });
});
