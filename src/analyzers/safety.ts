/**
 * Dangerous pattern detection.
 *
 * Scans parsed history entries for high-risk commands and returns SafetyAlert[]
 * with specific information about what flag/practice is missing.
 */

import type { HistoryEntry, SafetyAlert } from '../types/index.js';

// ── Rule definitions ────────────────────────────────────────────────────────

/**
 * A single detection rule.  `test` receives a trimmed command; if it returns
 * a truthy string (the risk description) the command is flagged.
 */
interface DangerRule {
  /** Human-readable name used for deduplication. */
  name: string;
  /** Return a risk description if the command matches, or `null` to skip. */
  test: (cmd: string) => string | null;
  /** Safer alternative suggestion. */
  saferAlternative: string;
}

/**
 * All detection rules.  Order does NOT matter – every command is checked
 * against every rule (a command can trigger multiple alerts).
 */
const DANGER_RULES: DangerRule[] = [
  // ── rm -rf without -i ──────────────────────────────────────────────────
  {
    name: 'rm-rf-no-interactive',
    test(cmd) {
      // Match `rm` invocations that contain `-rf` or `-fr` (or combos like -rfi)
      // but do NOT contain `-i`.
      if (!/\brm\b/.test(cmd)) return null;
      // Must have -r and -f somewhere in the flags
      const hasRecursiveForce =
        /\brm\s+.*-[^\s]*r[^\s]*f/.test(cmd) ||
        /\brm\s+.*-[^\s]*f[^\s]*r/.test(cmd);
      if (!hasRecursiveForce) return null;
      // Check if -i is present in the same flag group or as separate flag
      const hasInteractive =
        /\brm\s+.*-[^\s]*i/.test(cmd) || /\brm\b.*\s-i\b/.test(cmd);
      if (hasInteractive) return null;
      return 'rm -rf without -i flag — no confirmation prompt before deletion';
    },
    saferAlternative:
      'Use `rm -rfi` for interactive confirmation, or preview with `ls` first: `ls -la <path> && rm -rf <path>`',
  },

  // ── sudo rm ───────────────────────────────────────────────────────────
  {
    name: 'sudo-rm',
    test(cmd) {
      if (!/\bsudo\s+rm\b/.test(cmd)) return null;
      return 'sudo rm — running destructive delete with elevated privileges without confirmation';
    },
    saferAlternative:
      'Use `sudo rm -i` for interactive prompts, or double-check the path before execution.',
  },

  // ── Unquoted variable expansion ────────────────────────────────────────
  {
    name: 'unquoted-variable',
    test(cmd) {
      // Look for rm/mv/cp with $VAR not inside quotes
      // Match patterns like `rm $VAR` or `rm -rf $VAR/*`
      // But not `rm "$VAR"` or `rm "${VAR}"`
      if (!/\b(rm|mv|cp)\b/.test(cmd)) return null;
      // Find $VAR that is NOT preceded by " and NOT inside "${}"
      // Simple heuristic: look for $WORD not preceded by " or {
      const hasUnquoted = /\$[A-Za-z_]\w*/.test(cmd);
      if (!hasUnquoted) return null;
      // Check if the raw $VAR is outside quotes (heuristic: no " before it on the same segment)
      // We check each segment individually so that `rm "$SAFE" $UNSAFE` is still caught.
      const segments = cmd.split(/\s+/);
      for (const seg of segments) {
        if (/\$[A-Za-z_]\w*/.test(seg) && !seg.includes('"') && !seg.includes("'")) {
          return 'Unquoted variable expansion — risk of word splitting and glob expansion';
        }
      }
      return null;
    },
    saferAlternative:
      'Always quote variable expansions: use `"$VAR"` instead of `$VAR` to prevent word splitting.',
  },

  // ── PowerShell Remove-Item -Recurse -Force without -WhatIf ────────────
  {
    name: 'ps-remove-item-no-whatif',
    test(cmd) {
      if (!/Remove-Item/i.test(cmd)) return null;
      const hasRecurse = /-Recurse/i.test(cmd);
      const hasForce = /-Force/i.test(cmd);
      if (!hasRecurse || !hasForce) return null;
      const hasWhatIf = /-WhatIf/i.test(cmd);
      const hasConfirm = /-Confirm/i.test(cmd);
      if (hasWhatIf || hasConfirm) return null;
      return 'Remove-Item -Recurse -Force without -WhatIf or -Confirm — silent recursive deletion';
    },
    saferAlternative:
      'Add `-WhatIf` to preview changes first, or `-Confirm` for interactive prompts: `Remove-Item -Recurse -Force -WhatIf`',
  },

  // ── dd without status=progress ────────────────────────────────────────
  {
    name: 'dd-no-status',
    test(cmd) {
      if (!/\bdd\b/.test(cmd)) return null;
      // Must look like a dd invocation with if= or of=
      if (!/\b(if|of)=/.test(cmd)) return null;
      if (/status=progress/.test(cmd)) return null;
      return 'dd without status=progress — silent data operation with no progress indicator';
    },
    saferAlternative:
      'Add `status=progress` to see real-time progress: `dd if=... of=... status=progress`',
  },

  // ── chmod -R 777 / chmod 777 ──────────────────────────────────────────
  {
    name: 'chmod-777',
    test(cmd) {
      if (!/\bchmod\b/.test(cmd)) return null;
      if (!/\b777\b/.test(cmd)) return null;
      return 'chmod 777 — overly permissive file permissions (world-readable/writable/executable)';
    },
    saferAlternative:
      'Use minimum necessary permissions: `chmod 755` for directories, `chmod 644` for files.',
  },
];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan history entries for dangerous patterns and return aggregated alerts.
 *
 * Each unique (rule, command) pair is counted for frequency.
 * The returned array is sorted by frequency descending.
 */
export function detectDangerousPatterns(
  entries: HistoryEntry[],
): SafetyAlert[] {
  // Map: "ruleName::command" → { alert details, count }
  const alertMap = new Map<
    string,
    { pattern: string; risk: string; saferAlternative: string; count: number }
  >();

  for (const entry of entries) {
    const cmd = entry.command.trim();
    if (!cmd) continue;

    for (const rule of DANGER_RULES) {
      const risk = rule.test(cmd);
      if (risk === null) continue;

      const key = `${rule.name}::${cmd}`;
      const existing = alertMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        alertMap.set(key, {
          pattern: cmd,
          risk,
          saferAlternative: rule.saferAlternative,
          count: 1,
        });
      }
    }
  }

  // Convert to SafetyAlert[] and sort by frequency
  const alerts: SafetyAlert[] = [...alertMap.values()].map((a) => ({
    pattern: a.pattern,
    frequency: a.count,
    risk: a.risk,
    saferAlternative: a.saferAlternative,
  }));

  alerts.sort((a, b) => b.frequency - a.frequency);

  return alerts;
}

/**
 * Convenience: extract just the unique dangerous command strings from entries.
 * Useful for sending to Copilot's safety analysis endpoint.
 */
export function extractDangerousCommands(entries: HistoryEntry[]): string[] {
  const dangerous = new Set<string>();

  for (const entry of entries) {
    const cmd = entry.command.trim();
    if (!cmd) continue;
    for (const rule of DANGER_RULES) {
      if (rule.test(cmd) !== null) {
        dangerous.add(cmd);
        break; // one match is enough to flag this command
      }
    }
  }

  return [...dangerous];
}
