import { describe, it, expect } from 'vitest';
import {
  formatAnalysisMarkdown,
  formatFullReport,
  formatFullReportJson,
} from '../../src/formatters/markdown.js';
import type { AnalysisResult, Suggestion } from '../../src/types/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makeSuggestions(): Suggestion[] {
  return [
    {
      pattern: 'git status',
      type: 'alias',
      code: "alias gs='git status'",
      name: 'gs',
      explanation: 'Shortcut for frequently used git status command.',
    },
    {
      pattern: 'cd ~/projects/myapp && npm install',
      type: 'function',
      code: 'function dev-start() {\n    cd ~/projects/myapp || return 1\n    npm install || return 1\n}',
      name: 'dev-start',
      explanation: 'Automates repetitive development setup workflow.',
      safety: 'safe',
    },
  ];
}

// ── formatAnalysisMarkdown ──────────────────────────────────────────────────

describe('formatAnalysisMarkdown', () => {
  it('includes the header title', () => {
    const output = formatAnalysisMarkdown(makeResult());
    expect(output).toContain('# Dotfiles Coach - History Analysis');
  });

  it('shows capitalised shell name', () => {
    const output = formatAnalysisMarkdown(makeResult({ shell: 'zsh' }));
    expect(output).toContain('**Shell:** Zsh');
  });

  it('shows history file path in code', () => {
    const output = formatAnalysisMarkdown(
      makeResult({ historyFile: '/custom/.zsh_history' }),
    );
    expect(output).toContain('`/custom/.zsh_history`');
  });

  it('shows total and unique command counts', () => {
    const output = formatAnalysisMarkdown(
      makeResult({ totalCommands: 8472, uniqueCommands: 1203 }),
    );
    expect(output).toContain('8,472');
    expect(output).toContain('1,203');
  });

  it('shows patterns as a markdown table', () => {
    const output = formatAnalysisMarkdown(makeResult());
    expect(output).toContain('| Rank | Count | Pattern |');
    expect(output).toContain('| 1 | 20 | `git status` |');
    expect(output).toContain('| 2 | 10 | `npm test` |');
  });

  it('shows "no patterns found" when empty', () => {
    const output = formatAnalysisMarkdown(makeResult({ patterns: [] }));
    expect(output).toContain('No patterns found');
  });

  it('echoes back minFrequency in section header', () => {
    const output = formatAnalysisMarkdown(makeResult(), { minFrequency: 3 });
    expect(output).toContain('min frequency: 3');
  });

  it('shows safety alerts section when alerts exist', () => {
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
    const output = formatAnalysisMarkdown(result);
    expect(output).toContain('Safety Alerts');
    expect(output).toContain('`rm -rf /tmp/*`');
    expect(output).toContain('rm -rf without -i flag');
    expect(output).toContain('Use rm -rfi');
  });

  it('does NOT show safety section when no alerts', () => {
    const output = formatAnalysisMarkdown(makeResult({ safetyAlerts: [] }));
    expect(output).not.toContain('Safety Alerts');
  });

  it('includes call-to-action for suggest command', () => {
    const output = formatAnalysisMarkdown(makeResult());
    expect(output).toContain('dotfiles-coach suggest');
  });

  it('returns a non-empty string', () => {
    const output = formatAnalysisMarkdown(makeResult());
    expect(output.length).toBeGreaterThan(0);
  });

  it('escapes pipe characters in patterns', () => {
    const result = makeResult({
      patterns: [
        { pattern: 'echo foo | grep bar', frequency: 5, variations: [] },
      ],
    });
    const output = formatAnalysisMarkdown(result);
    expect(output).toContain('echo foo \\| grep bar');
  });
});

// ── formatFullReport ────────────────────────────────────────────────────────

describe('formatFullReport', () => {
  it('includes the report header', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('# Dotfiles Coach Report');
  });

  it('shows generated date', () => {
    const output = formatFullReport(
      makeResult(),
      makeSuggestions(),
      '2026-02-08T12:00:00Z',
    );
    expect(output).toContain('2026-02-08 12:00:00');
  });

  it('includes summary section with counts', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('## Summary');
    expect(output).toContain('**Total Commands:** 100');
    expect(output).toContain('**Unique Commands:** 50');
    expect(output).toContain('**Automation Opportunities Found:** 2');
    expect(output).toContain('**Safety Alerts:** 0');
  });

  it('includes top patterns table', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('## Top Repeated Patterns');
    expect(output).toContain('| 1 | 20 | `git status` |');
  });

  it('includes suggested automations', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('## Suggested Automations');
    expect(output).toContain("alias gs='git status'");
    expect(output).toContain('dev-start');
  });

  it('shows suggestion type labels', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('**Type:** Alias');
    expect(output).toContain('**Type:** Function');
  });

  it('shows safety label for suggestions with safety field', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('**Safety:** Safe');
  });

  it('includes safety alerts section when present', () => {
    const result = makeResult({
      safetyAlerts: [
        {
          pattern: 'rm -rf /',
          frequency: 2,
          risk: 'Destructive without confirmation',
          saferAlternative: 'rm -rfi /',
        },
      ],
    });
    const output = formatFullReport(result, []);
    expect(output).toContain('## Safety Alerts');
    expect(output).toContain('`rm -rf /`');
    expect(output).toContain('Destructive without confirmation');
  });

  it('includes recommendations section', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('## Recommendations');
    expect(output).toContain('Apply the 2 suggested aliases and functions');
  });

  it('includes footer with tool link', () => {
    const output = formatFullReport(makeResult(), makeSuggestions());
    expect(output).toContain('Generated by [Dotfiles Coach]');
  });

  it('handles empty suggestions gracefully', () => {
    const output = formatFullReport(makeResult(), []);
    expect(output).not.toContain('## Suggested Automations');
    expect(output).toContain('## Recommendations');
  });

  it('limits patterns table to top 10', () => {
    const patterns = Array.from({ length: 15 }, (_, i) => ({
      pattern: `cmd-${i}`,
      frequency: 100 - i,
      variations: [],
    }));
    const result = makeResult({ patterns });
    const output = formatFullReport(result, []);
    // Should have 10 data rows + header + separator = check for rank 10 but not 11
    expect(output).toContain('| 10 |');
    expect(output).not.toContain('| 11 |');
  });
});

// ── formatFullReportJson ────────────────────────────────────────────────────

describe('formatFullReportJson', () => {
  it('returns valid JSON', () => {
    const output = formatFullReportJson(makeResult(), makeSuggestions());
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('includes summary section', () => {
    const parsed = JSON.parse(
      formatFullReportJson(makeResult(), makeSuggestions()),
    );
    expect(parsed.summary).toEqual({
      totalCommands: 100,
      uniqueCommands: 50,
      automationOpportunities: 2,
      safetyAlerts: 0,
    });
  });

  it('includes patterns array', () => {
    const parsed = JSON.parse(
      formatFullReportJson(makeResult(), makeSuggestions()),
    );
    expect(parsed.patterns).toHaveLength(2);
    expect(parsed.patterns[0].pattern).toBe('git status');
  });

  it('includes suggestions array', () => {
    const parsed = JSON.parse(
      formatFullReportJson(makeResult(), makeSuggestions()),
    );
    expect(parsed.suggestions).toHaveLength(2);
    expect(parsed.suggestions[0].name).toBe('gs');
  });

  it('includes generatedAt timestamp', () => {
    const parsed = JSON.parse(
      formatFullReportJson(
        makeResult(),
        makeSuggestions(),
        '2026-02-08T10:00:00Z',
      ),
    );
    expect(parsed.generatedAt).toBe('2026-02-08T10:00:00Z');
  });

  it('includes safetyAlerts array', () => {
    const result = makeResult({
      safetyAlerts: [
        {
          pattern: 'rm -rf /',
          frequency: 1,
          risk: 'Dangerous',
          saferAlternative: 'rm -rfi /',
        },
      ],
    });
    const parsed = JSON.parse(
      formatFullReportJson(result, []),
    );
    expect(parsed.safetyAlerts).toHaveLength(1);
    expect(parsed.summary.safetyAlerts).toBe(1);
  });

  it('is pretty-printed with 2-space indentation', () => {
    const output = formatFullReportJson(makeResult(), []);
    expect(output).toContain('\n');
    expect(output).toContain('  "generatedAt"');
  });
});
