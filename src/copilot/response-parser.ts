/**
 * Robust Copilot response parser.
 *
 * 3-tier strategy:
 *  1. Extract JSON from markdown fences (```json … ```)
 *  2. Find raw JSON object/array
 *  3. Regex fallback for conversational responses
 *
 * This is the canonical parser used by both `RealCopilotClient` (via import)
 * and tests. All response parsing flows through this module.
 */

import type { Suggestion, SafetyAlert, CommandPattern } from '../types/index.js';

// ── JSON extraction (3-tier) ────────────────────────────────────────────────

/**
 * Attempt to pull a JSON string out of Copilot's textual output.
 *
 * Tier 1: markdown fenced code blocks
 * Tier 2: raw JSON array or object
 * Tier 3: returns null (caller should use regex fallback)
 */
export function extractJson(text: string): string | null {
  // Tier 1: markdown fenced JSON
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    const trimmed = fenceMatch[1].trim();
    if (isValidJson(trimmed)) return trimmed;
  }

  // Tier 2: raw JSON array or object
  const rawMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (rawMatch?.[1]) {
    const trimmed = rawMatch[1].trim();
    if (isValidJson(trimmed)) return trimmed;
  }

  // Tier 3: no JSON found
  return null;
}

/** Quick check whether a string is valid JSON. */
function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// ── Suggestion parsing ──────────────────────────────────────────────────────

/**
 * Parse suggestions from raw Copilot output.
 *
 * Tries JSON extraction first; falls back to regex-based conversational
 * response parsing if JSON is not found.
 */
export function parseSuggestions(raw: string): Suggestion[] {
  const json = extractJson(raw);
  if (json) {
    return parseSuggestionsFromJson(json);
  }
  // Tier 3: regex fallback for conversational responses
  return parseSuggestionsFromConversational(raw);
}

/**
 * Parse a JSON string that could be:
 * - A raw array of Suggestion objects  → `[{...}, ...]`
 * - An object with a `suggestions` key → `{ "suggestions": [...] }`
 */
function parseSuggestionsFromJson(json: string): Suggestion[] {
  const parsed: unknown = JSON.parse(json);

  if (Array.isArray(parsed)) {
    return validateSuggestions(parsed);
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'suggestions' in parsed
  ) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.suggestions)) {
      return validateSuggestions(obj.suggestions);
    }
  }

  return [];
}

/**
 * Best-effort validation: keep items that have at minimum `pattern` + `code`.
 * Fill missing fields with sensible defaults.
 */
function validateSuggestions(items: unknown[]): Suggestion[] {
  const results: Suggestion[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const pattern = typeof obj.pattern === 'string' ? obj.pattern : '';
    const code = typeof obj.code === 'string' ? obj.code : '';
    if (!pattern && !code) continue; // skip garbage

    results.push({
      pattern,
      type: normalizeSuggestionType(obj.type),
      code,
      name: typeof obj.name === 'string' ? obj.name : '',
      explanation:
        typeof obj.explanation === 'string' ? obj.explanation : '',
      safety: normalizeSafety(obj.safety),
    });
  }

  return results;
}

function normalizeSuggestionType(
  val: unknown,
): 'alias' | 'function' | 'script' {
  if (val === 'alias' || val === 'function' || val === 'script') return val;
  return 'function'; // default
}

function normalizeSafety(
  val: unknown,
): 'safe' | 'warning' | 'danger' | undefined {
  if (val === 'safe' || val === 'warning' || val === 'danger') return val;
  return undefined;
}

// ── Conversational response fallback ────────────────────────────────────────

/**
 * Regex-based fallback that attempts to extract suggestions from a
 * conversational / markdown-formatted Copilot response.
 *
 * Looks for patterns like:
 *  - "Alias: ..." or "**Alias:**"
 *  - Code blocks following an alias/function header
 *  - Numbered suggestion lists
 */
function parseSuggestionsFromConversational(raw: string): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Strategy: find code blocks preceded by a header mentioning alias/function/script
  const blockPattern =
    /(?:#{1,3}\s+)?(?:\*{0,2})?(?:(?:Suggestion|Alias|Function|Script)\s*\d*[:.])?\s*(?:\*{0,2})?\s*[`"]?([^`"\n]+)[`"]?\s*\n+```\w*\n([\s\S]*?)```/gi;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(raw)) !== null) {
    const headerText = match[1].trim();
    const codeBlock = match[2].trim();
    if (!codeBlock) continue;

    // Infer type from the code itself
    let type: 'alias' | 'function' | 'script' = 'function';
    if (/^alias\s/m.test(codeBlock) || /^Set-Alias/mi.test(codeBlock)) {
      type = 'alias';
    } else if (/^#!\//.test(codeBlock)) {
      type = 'script';
    }

    // Try to pull a name from the code
    const aliasName = codeBlock.match(/^alias\s+(\w[\w-]*)=/m)?.[1];
    const funcName = codeBlock.match(/^function\s+([\w-]+)/m)?.[1];
    const name = aliasName ?? funcName ?? headerText.split(/\s+/)[0] ?? '';

    suggestions.push({
      pattern: headerText,
      type,
      code: codeBlock,
      name,
      explanation: '',
    });
  }

  return suggestions;
}

// ── Safety alert parsing ────────────────────────────────────────────────────

/**
 * Parse safety alerts from raw Copilot output.
 *
 * Tries JSON extraction first; returns empty array on failure
 * (safety alerts are less likely to come in conversational format).
 */
export function parseSafetyAlerts(raw: string): SafetyAlert[] {
  const json = extractJson(raw);
  if (!json) return [];

  const parsed: unknown = JSON.parse(json);

  // Could be a raw array
  if (Array.isArray(parsed)) {
    return validateSafetyAlerts(parsed);
  }

  // Could be { "alerts": [...] }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'alerts' in parsed
  ) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.alerts)) {
      return validateSafetyAlerts(obj.alerts);
    }
  }

  return [];
}

/**
 * Validate and normalise raw safety alert objects.
 * Handles both PRD field names (`safer_alternative`) and our interface names (`saferAlternative`).
 */
function validateSafetyAlerts(items: unknown[]): SafetyAlert[] {
  const results: SafetyAlert[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    const pattern =
      typeof obj.pattern === 'string'
        ? obj.pattern
        : typeof obj.command === 'string'
          ? obj.command
          : '';
    if (!pattern) continue;

    const risk = typeof obj.risk === 'string' ? obj.risk : '';
    const saferAlternative =
      typeof obj.saferAlternative === 'string'
        ? obj.saferAlternative
        : typeof obj.safer_alternative === 'string'
          ? obj.safer_alternative
          : '';
    const frequency =
      typeof obj.frequency === 'number' ? obj.frequency : 0;

    results.push({ pattern, frequency, risk, saferAlternative });
  }

  return results;
}

// ── ANSI code stripping ──────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes from terminal output.
 *
 * Needed when parsing raw output from `gh copilot suggest` which may
 * contain color codes, cursor control sequences, and other non-printable
 * characters.
 */
export function stripAnsiCodes(str: string): string {
  return str
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\].*?(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[()][AB012]/g, '')
    .replace(/\x1B[>=]/g, '')
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');
}

// ── Copilot suggest output extraction ────────────────────────────────────────

/**
 * Extract the actual suggested command from the raw output of
 * `gh copilot suggest -t shell`.
 *
 * The output may contain UI chrome like "Suggestion:", interactive menu
 * options, etc. This function strips that away and returns just the
 * command/code portion.
 */
export function extractCopilotSuggestion(raw: string): string {
  const cleaned = stripAnsiCodes(raw).trim();
  if (!cleaned) return '';

  // Pattern 1: "Suggestion:\n  <code>\n? Select an option..."
  const suggestionBlock = cleaned.match(
    /Suggestion:\s*\n\s*([\s\S]*?)(?:\n\s*\?\s*Select|$)/i,
  );
  if (suggestionBlock?.[1]?.trim()) {
    return suggestionBlock[1].trim();
  }

  // Pattern 2: strip known interactive menu elements
  const withoutMenu = cleaned
    .replace(/\?\s*Select an option[\s\S]*$/m, '')
    .replace(/>\s*Copy command to clipboard[\s\S]*$/m, '')
    .replace(/Suggestion:\s*/i, '')
    .replace(/^\s*\n/gm, '')
    .trim();

  return withoutMenu || cleaned;
}

// ── Single Copilot response → Suggestion ─────────────────────────────────────

/**
 * Build a `Suggestion` from the raw output of a single
 * `gh copilot suggest -t shell` invocation.
 *
 * Inspects the code to determine the type (alias / function / script)
 * and extract the name.
 */
export function buildSuggestionFromRawCode(
  raw: string,
  pattern: CommandPattern,
): Suggestion | null {
  const code = extractCopilotSuggestion(raw);
  if (!code) return null;

  let type: 'alias' | 'function' | 'script' = 'function';
  let name = '';

  // ── Bash / Zsh patterns ──
  // alias name='...'
  const aliasMatch = code.match(/^alias\s+([\w-]+)\s*=/m);
  // name() { ... } or function name() { ... }
  const funcMatch = code.match(/^(?:function\s+)?([\w-]+)\s*\(\)/m);

  // ── PowerShell patterns ──
  // Set-Alias -Name X -Value Y
  const psAliasMatch = code.match(/Set-Alias\s+-Name\s+([\w-]+)/i);
  // function VerbNoun { ... }
  const psFuncMatch = code.match(/^function\s+([\w-]+)/m);

  // Shebang → script
  const hasShebang = /^#!\//.test(code);

  if (aliasMatch) {
    type = 'alias';
    name = aliasMatch[1];
  } else if (psAliasMatch) {
    type = 'alias';
    name = psAliasMatch[1];
  } else if (funcMatch) {
    type = 'function';
    name = funcMatch[1];
  } else if (psFuncMatch) {
    type = 'function';
    name = psFuncMatch[1];
  } else if (hasShebang) {
    type = 'script';
  }

  return {
    pattern: pattern.pattern,
    type,
    code,
    name,
    explanation: `Shortcut for "${pattern.pattern}" (used ${pattern.frequency} times)`,
  };
}
