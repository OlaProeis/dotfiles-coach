/**
 * Markdown formatter for analysis results and report generation.
 *
 * Produces clean Markdown matching PRD §8 "dotfiles-coach report" output.
 * Used by both `analyze --format markdown` and the `report` command.
 */

import type {
  AnalysisResult,
  AnalyzeOptions,
  Suggestion,
  SafetyAlert,
} from '../types/index.js';
import { capitalize } from '../utils/strings.js';

// ── Analysis-only markdown ──────────────────────────────────────────────────

/**
 * Format analysis results as a Markdown document.
 *
 * This is the simpler variant used by `analyze --format markdown`.
 * For the full report with suggestions, use {@link formatFullReport}.
 */
export function formatAnalysisMarkdown(
  result: AnalysisResult,
  options?: Pick<AnalyzeOptions, 'minFrequency'>,
): string {
  const lines: string[] = [];
  const minFreq = options?.minFrequency ?? 5;

  lines.push('# Dotfiles Coach - History Analysis');
  lines.push('');
  lines.push(`**Shell:** ${capitalize(result.shell)}  `);
  lines.push(`**History File:** \`${result.historyFile}\`  `);
  lines.push(`**Total Commands:** ${result.totalCommands.toLocaleString()}  `);
  lines.push(`**Unique Commands:** ${result.uniqueCommands.toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Patterns table ──────────────────────────────────────────────────────
  lines.push(`## Top Repeated Patterns (min frequency: ${minFreq})`);
  lines.push('');

  if (result.patterns.length === 0) {
    lines.push('_No patterns found matching the criteria._');
  } else {
    lines.push('| Rank | Count | Pattern |');
    lines.push('|------|-------|---------|');

    for (let i = 0; i < result.patterns.length; i++) {
      const p = result.patterns[i];
      lines.push(`| ${i + 1} | ${p.frequency} | \`${escapeMarkdown(p.pattern)}\` |`);
    }
  }

  // ── Safety alerts ─────────────────────────────────────────────────────
  if (result.safetyAlerts.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(
      `## Safety Alerts (${result.safetyAlerts.length} dangerous pattern${result.safetyAlerts.length === 1 ? '' : 's'} detected)`,
    );
    lines.push('');

    for (let i = 0; i < result.safetyAlerts.length; i++) {
      const alert = result.safetyAlerts[i];
      lines.push(`### Alert ${i + 1}: \`${escapeMarkdown(alert.pattern)}\``);
      lines.push('');
      lines.push(`**Frequency:** ${alert.frequency} times  `);
      lines.push(`**Risk:** ${alert.risk}  `);
      lines.push(`**Safer Alternative:** ${alert.saferAlternative}`);
      lines.push('');
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push("_Use `dotfiles-coach suggest` to generate automation recommendations._");
  lines.push('');

  return lines.join('\n');
}

// ── Full report markdown (analysis + suggestions) ───────────────────────────

/**
 * Generate a complete Markdown report combining analysis results
 * and Copilot suggestions. Matches PRD §8 output format.
 */
export function formatFullReport(
  result: AnalysisResult,
  suggestions: Suggestion[],
  generatedAt?: string,
): string {
  const lines: string[] = [];
  const dateStr = generatedAt ?? new Date().toISOString();
  const displayDate = dateStr.slice(0, 19).replace('T', ' ');

  // ── Header ────────────────────────────────────────────────────────────
  lines.push('# Dotfiles Coach Report');
  lines.push('');
  lines.push(`**Generated:** ${displayDate}  `);
  lines.push(`**Shell:** ${capitalize(result.shell)}  `);
  lines.push(`**History File:** \`${result.historyFile}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Summary ───────────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Commands:** ${result.totalCommands.toLocaleString()}`);
  lines.push(`- **Unique Commands:** ${result.uniqueCommands.toLocaleString()}`);
  lines.push(`- **Automation Opportunities Found:** ${suggestions.length}`);
  lines.push(`- **Safety Alerts:** ${result.safetyAlerts.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Top patterns table ────────────────────────────────────────────────
  const topPatterns = result.patterns.slice(0, 10);
  lines.push('## Top Repeated Patterns');
  lines.push('');

  if (topPatterns.length === 0) {
    lines.push('_No patterns found._');
  } else {
    lines.push('| Rank | Count | Pattern |');
    lines.push('|------|-------|---------|');

    for (let i = 0; i < topPatterns.length; i++) {
      const p = topPatterns[i];
      lines.push(`| ${i + 1} | ${p.frequency} | \`${escapeMarkdown(p.pattern)}\` |`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Suggested automations ─────────────────────────────────────────────
  if (suggestions.length > 0) {
    lines.push('## Suggested Automations');
    lines.push('');

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const typeLabel = capitalize(s.type);
      const nameLabel = s.name ? `: \`${s.name}\`` : '';
      lines.push(`### ${i + 1}. ${typeLabel}${nameLabel} for \`${escapeMarkdown(s.pattern)}\``);
      lines.push('');
      lines.push(`**Original Pattern:** \`${escapeMarkdown(s.pattern)}\`  `);
      lines.push(`**Type:** ${typeLabel}`);

      if (s.safety) {
        const safetyIcon =
          s.safety === 'danger' ? '**DANGER**' :
          s.safety === 'warning' ? '**WARNING**' :
          'Safe';
        lines.push(`**Safety:** ${safetyIcon}`);
      }

      const lang = result.shell === 'powershell' ? 'powershell' : 'bash';
      lines.push('');
      lines.push(`\`\`\`${lang}`);
      lines.push(s.code);
      lines.push('```');

      if (s.explanation) {
        lines.push('');
        lines.push(`**Rationale:** ${s.explanation}`);
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // ── Safety alerts ─────────────────────────────────────────────────────
  if (result.safetyAlerts.length > 0) {
    lines.push('## Safety Alerts');
    lines.push('');

    for (let i = 0; i < result.safetyAlerts.length; i++) {
      const alert = result.safetyAlerts[i];
      lines.push(`### Alert ${i + 1}: \`${escapeMarkdown(alert.pattern)}\``);
      lines.push('');
      lines.push(`**Frequency:** ${alert.frequency} times  `);
      lines.push(`**Risk:** ${alert.risk}`);
      lines.push('');
      lines.push('**Safer Alternative:**');
      lines.push('');
      lines.push('```bash');
      lines.push(alert.saferAlternative);
      lines.push('```');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // ── Recommendations ───────────────────────────────────────────────────
  lines.push('## Recommendations');
  lines.push('');

  if (suggestions.length > 0) {
    lines.push(`1. Apply the ${suggestions.length} suggested alias${suggestions.length === 1 ? '' : 'es'} and functions`);
  }

  if (result.safetyAlerts.length > 0) {
    lines.push(`2. Review and address the ${result.safetyAlerts.length} flagged dangerous pattern${result.safetyAlerts.length === 1 ? '' : 's'}`);
  }

  lines.push(`${suggestions.length > 0 || result.safetyAlerts.length > 0 ? '3' : '1'}. Run \`dotfiles-coach analyze\` periodically to identify new patterns`);

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Generated by [Dotfiles Coach](https://github.com/OlaProeis/dotfiles-coach)*');
  lines.push('');

  return lines.join('\n');
}

// ── JSON report ─────────────────────────────────────────────────────────────

/** Shape of the full JSON report. */
export interface ReportJson {
  generatedAt: string;
  shell: string;
  historyFile: string;
  summary: {
    totalCommands: number;
    uniqueCommands: number;
    automationOpportunities: number;
    safetyAlerts: number;
  };
  patterns: AnalysisResult['patterns'];
  suggestions: Suggestion[];
  safetyAlerts: SafetyAlert[];
}

/**
 * Format analysis + suggestions as structured JSON for programmatic use.
 */
export function formatFullReportJson(
  result: AnalysisResult,
  suggestions: Suggestion[],
  generatedAt?: string,
): string {
  const report: ReportJson = {
    generatedAt: generatedAt ?? new Date().toISOString(),
    shell: result.shell,
    historyFile: result.historyFile,
    summary: {
      totalCommands: result.totalCommands,
      uniqueCommands: result.uniqueCommands,
      automationOpportunities: suggestions.length,
      safetyAlerts: result.safetyAlerts.length,
    },
    patterns: result.patterns,
    suggestions,
    safetyAlerts: result.safetyAlerts,
  };

  return JSON.stringify(report, null, 2);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Escape pipe characters, backticks, and newlines inside markdown table cells. */
function escapeMarkdown(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/`/g, '\\`').replace(/\n/g, ' ');
}
