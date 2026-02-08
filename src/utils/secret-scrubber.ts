/**
 * Privacy-first secret scrubbing.
 *
 * ALL shell-history data MUST pass through `scrubSecrets()` before being
 * sent to `gh copilot`. This module cannot be disabled.
 *
 * Detects:
 *  - password / token / key / secret assignments (`password=…`, `export SECRET_KEY=…`)
 *  - Docker-login credentials (`docker login -p …`)
 *  - SSH private-key paths and agent forwarding (`ssh -i …`, `ssh-add …`)
 *  - Base64-encoded blobs (≥ 40 chars, high-entropy)
 *  - URLs with embedded credentials (`https://user:pass@host`)
 *  - AWS-style access keys (AKIA…)
 *  - GitHub / GitLab tokens (ghp_, glpat-, etc.)
 *  - Bearer / Authorization headers
 *  - Generic high-entropy hex strings (≥ 32 hex chars) in assignment context
 */

/** Result returned by `scrubSecrets()`. */
export interface ScrubResult {
  /** The scrubbed text with secrets replaced by [REDACTED]. */
  scrubbed: string;
  /** Number of individual secret occurrences replaced. */
  redactedCount: number;
}

// ── Regex patterns ──────────────────────────────────────────────────────────

/**
 * Each entry is a named pattern that matches a secret.
 * Patterns use the `gi` flags so they work across multi-line inputs and
 * are case-insensitive where appropriate.
 */
const SECRET_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  // ── Key-value assignments (env vars, CLI flags) ─────────────────────────
  {
    name: 'key-value-assignment',
    regex:
      /(?:password|passwd|pwd|token|secret|api_key|apikey|api[-_]?secret|access[-_]?key|private[-_]?key|auth[-_]?token|client[-_]?secret|credentials?)[\s]*[=:]\s*['"]?[^\s'"]{4,}['"]?/gi,
  },
  {
    name: 'export-secret',
    regex:
      /export\s+(?:\w*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIALS?|AUTH)\w*)\s*=\s*['"]?[^\s'"]+['"]?/gi,
  },

  // ── Docker ──────────────────────────────────────────────────────────────
  {
    name: 'docker-login',
    regex: /docker\s+login\b[^\n]*/gi,
  },

  // ── SSH ─────────────────────────────────────────────────────────────────
  {
    name: 'ssh-key-path',
    regex: /ssh(?:-add)?\s+-i\s+\S+/gi,
  },
  {
    name: 'ssh-agent-generic',
    regex: /ssh-add\s+\S+/gi,
  },

  // ── URLs with credentials (any protocol: http, mongodb, postgres, etc.) ─
  {
    name: 'url-credentials',
    regex: /\w+:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
  },

  // ── curl basic auth ───────────────────────────────────────────────────
  {
    name: 'curl-auth',
    regex: /curl\b[^\n]*(?:-u|--user)\s+\S+/gi,
  },

  // ── AWS access keys ────────────────────────────────────────────────────
  {
    name: 'aws-access-key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },

  // ── GitHub / GitLab / npm tokens ───────────────────────────────────────
  {
    name: 'github-token',
    regex: /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36,}\b/g,
  },
  {
    name: 'gitlab-token',
    regex: /\bglpat-[A-Za-z0-9\-_]{20,}\b/g,
  },
  {
    name: 'npm-token',
    regex: /\bnpm_[A-Za-z0-9]{36,}\b/g,
  },

  // ── Bearer / Authorization headers ─────────────────────────────────────
  {
    name: 'bearer-token',
    regex: /(?:Bearer|Authorization[:\s]+Bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi,
  },
  {
    name: 'authorization-header',
    regex: /Authorization\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  },

  // ── Base64 blobs (≥ 40 chars, typical of secrets) ──────────────────────
  {
    name: 'base64-blob',
    regex: /\b[A-Za-z0-9+/]{40,}={0,3}\b/g,
  },

  // ── Generic hex strings in assignment context (≥ 32 hex chars) ─────────
  {
    name: 'hex-secret',
    regex: /(?:password|token|key|secret|api_key)\s*[=:]\s*['"]?[0-9a-fA-F]{32,}['"]?/gi,
  },
];

// ── Placeholder ─────────────────────────────────────────────────────────────

const REDACTED = '[REDACTED]';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Scrub secrets from a block of text.
 *
 * Every match is replaced with `[REDACTED]`.  The function returns both
 * the cleaned text and the count of redactions so callers can log it.
 *
 * @param input  - Raw text (may be multi-line).
 * @returns `ScrubResult` with `scrubbed` text and `redactedCount`.
 */
export function scrubSecrets(input: string): ScrubResult {
  let redactedCount = 0;
  let result = input;

  for (const { regex } of SECRET_PATTERNS) {
    // Reset lastIndex for patterns with the `g` flag.
    regex.lastIndex = 0;
    result = result.replace(regex, () => {
      redactedCount++;
      return REDACTED;
    });
  }

  return { scrubbed: result, redactedCount };
}

/**
 * Convenience: scrub an array of strings (e.g. history lines) in-place-ish.
 *
 * @returns Total redacted count across all lines plus the cleaned lines.
 */
export function scrubLines(lines: string[]): {
  scrubbedLines: string[];
  totalRedacted: number;
} {
  let totalRedacted = 0;
  const scrubbedLines = lines.map((line) => {
    const { scrubbed, redactedCount } = scrubSecrets(line);
    totalRedacted += redactedCount;
    return scrubbed;
  });
  return { scrubbedLines, totalRedacted };
}
