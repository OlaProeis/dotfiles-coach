/**
 * CopilotClient – interface + real/mock implementations.
 *
 * IMPORTANT: There is NO `@github/copilot` npm SDK.
 * The real client wraps `gh copilot suggest` / `gh copilot explain` via `execa`.
 *
 * Toggle: set env var `DOTFILES_COACH_USE_MOCK_COPILOT=1` to force mock.
 * Tests always inject `MockCopilotClient` directly.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseSuggestions,
  parseSafetyAlerts,
  stripAnsiCodes,
  buildSuggestionFromRawCode,
} from './response-parser.js';
import {
  buildSuggestionPrompt,
  buildSafetyPrompt,
  buildSinglePatternPrompt,
  buildSingleSafetyPrompt,
} from './prompts.js';
import type {
  CommandPattern,
  Suggestion,
  SafetyAlert,
  ShellType,
} from '../types/index.js';

// ── Interface ───────────────────────────────────────────────────────────────

/** Abstract contract that both real and mock clients implement. */
export interface CopilotClient {
  /**
   * Given repeated command patterns and the target shell, ask Copilot for
   * alias/function/script suggestions.
   */
  generateSuggestions(
    patterns: CommandPattern[],
    shell: ShellType,
  ): Promise<Suggestion[]>;

  /**
   * Given a list of raw commands, ask Copilot to flag dangerous ones and
   * suggest safer alternatives.
   */
  analyzeSafety(
    commands: string[],
    shell: ShellType,
  ): Promise<SafetyAlert[]>;
}

// ── Error types ─────────────────────────────────────────────────────────────

/** Thrown when `gh` CLI or Copilot extension is not installed / authenticated. */
export class CopilotNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotNotAvailableError';
  }
}

/** Thrown when Copilot returns an unparseable response. */
export class CopilotResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotResponseError';
  }
}

// ── Real implementation ─────────────────────────────────────────────────────

/**
 * Calls the GitHub Copilot CLI as a child process.
 *
 * Supports TWO backends:
 *
 * 1. **New Copilot CLI** (`copilot` binary) — the agentic CLI installed
 *    via `npm install -g @github/copilot`, WinGet, or Homebrew.
 *    Uses `-p` (non-interactive) + `-s` (silent / scripting output) +
 *    `--allow-all` for clean programmatic access.
 *
 * 2. **Legacy `gh copilot suggest`** fallback — if the old extension
 *    still works, individual calls with `-t shell` and short prompts.
 *    NOTE: The old extension was retired Oct 2025.
 *
 * The backend is auto-detected on first call and cached.
 */
export class RealCopilotClient implements CopilotClient {
  /** Maximum individual calls when using legacy gh copilot suggest. */
  private static readonly MAX_LEGACY_CALLS = 7;

  /** Detected backend: 'copilot' (new CLI) or 'gh-legacy' or null (not yet checked). */
  private backend: 'copilot' | 'gh-legacy' | null = null;

  // ── Backend discovery ──────────────────────────────────────────────────

  /**
   * Auto-detect which Copilot CLI backend is available.
   * Caches result after first successful probe.
   */
  private async detectBackend(): Promise<'copilot' | 'gh-legacy'> {
    if (this.backend) return this.backend;

    const { execa } = await import('execa');

    // 1. Prefer the new standalone Copilot CLI
    try {
      await execa('copilot', ['version'], { timeout: 10_000, reject: true });
      this.backend = 'copilot';
      return this.backend;
    } catch {
      // Not installed
    }

    // 2. Try legacy `gh copilot suggest` (may still work for some users)
    try {
      const probe = await execa(
        'gh',
        ['copilot', 'suggest', '-t', 'shell', 'echo hello'],
        {
          timeout: 15_000,
          env: { ...process.env, GH_PROMPT_DISABLED: '1' },
          reject: false, // don't throw — we inspect the output
        },
      );
      const out = (probe.stdout ?? '') + (probe.stderr ?? '');
      const exitOk = probe.exitCode === 0;
      // Reject if: non-zero exit, deprecated notice, unknown command, or error text
      const isUsable =
        exitOk &&
        !out.includes('deprecated') &&
        !out.includes('No commands will be executed') &&
        !out.includes('unknown command') &&
        !out.includes('not a gh command');
      if (isUsable) {
        this.backend = 'gh-legacy';
        return this.backend;
      }
    } catch {
      // Not available
    }

    throw new CopilotNotAvailableError(
      'GitHub Copilot CLI is not installed.\n\n' +
        'The old `gh copilot` extension has been retired.\n' +
        'Install the new Copilot CLI:\n' +
        '  Windows:  winget install GitHub.Copilot\n' +
        '  macOS:    brew install copilot-cli\n' +
        '  npm:      npm install -g @github/copilot (requires Node 22+)\n\n' +
        'Then authenticate by running: copilot',
    );
  }

  // ── New Copilot CLI (copilot -p -s) ────────────────────────────────────

  /**
   * Run a prompt through the new Copilot CLI in non-interactive mode.
   * `-p` = non-interactive (exits after), `-s` = silent (scripting output).
   */
  private async runNewCopilot(prompt: string): Promise<string> {
    const { execa } = await import('execa');
    try {
      const result = await execa(
        'copilot',
        ['-p', prompt, '-s', '--allow-all'],
        {
          timeout: 60_000, // 60s — agentic processing may be slower
          reject: true,
        },
      );
      return stripAnsiCodes(result.stdout).trim();
    } catch (err: unknown) {
      return this.handleError(err, 'copilot');
    }
  }

  // ── Legacy gh copilot suggest ──────────────────────────────────────────

  /**
   * Run a single `gh copilot suggest -t shell` invocation (legacy path).
   */
  private async runLegacyGhCopilot(prompt: string): Promise<string> {
    const { execa } = await import('execa');
    try {
      const result = await execa(
        'gh',
        ['copilot', 'suggest', '-t', 'shell', prompt],
        {
          timeout: 30_000,
          env: { ...process.env, GH_PROMPT_DISABLED: '1' },
          reject: true,
        },
      );
      return stripAnsiCodes(result.stdout).trim();
    } catch (err: unknown) {
      return this.handleError(err, 'gh copilot');
    }
  }

  // ── Shared error handler ───────────────────────────────────────────────

  private handleError(err: unknown, label: string): string {
    const execaErr = err as Record<string, unknown>;
    const stderr = String(execaErr.stderr ?? '');
    const stdout = String(execaErr.stdout ?? '');
    const msg = String(
      execaErr.message ?? (err instanceof Error ? err.message : ''),
    );

    // Binary not found
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      this.backend = null; // reset so next call re-probes
      throw new CopilotNotAvailableError(
        `${label} binary not found. Ensure it is installed and on your PATH.`,
      );
    }
    // Auth — use specific phrases to avoid false positives from gh's help
    // text which lists "auth" as an available command.
    if (
      stderr.includes('not authenticated') ||
      stderr.includes('not logged in') ||
      stderr.includes('authentication required') ||
      stderr.includes('please login') ||
      stderr.includes('unauthorized') ||
      stderr.includes('401')
    ) {
      throw new CopilotNotAvailableError(
        label === 'copilot'
          ? 'Copilot CLI is not authenticated. Run: copilot (and use /login)'
          : 'GitHub CLI is not authenticated. Run: gh auth login',
      );
    }
    // Rate limit
    if (stderr.includes('rate limit') || stderr.includes('429')) {
      throw new CopilotResponseError(
        'Copilot rate limit reached. Please wait and try again.',
      );
    }
    // Timeout
    if (msg.includes('timed out')) {
      throw new CopilotResponseError(
        'Copilot request timed out. Try again or reduce --top.',
      );
    }

    // If the process exited non-zero but stdout has content, return it.
    if (stdout.trim()) {
      return stripAnsiCodes(stdout).trim();
    }

    throw new CopilotResponseError(
      `${label} failed: ${stderr || msg}`,
    );
  }

  // ── CopilotClient interface ────────────────────────────────────────────

  async generateSuggestions(
    patterns: CommandPattern[],
    shell: ShellType,
  ): Promise<Suggestion[]> {
    const backend = await this.detectBackend();

    if (backend === 'copilot') {
      return this.generateWithNewCli(patterns, shell);
    }
    return this.generateWithLegacy(patterns, shell);
  }

  async analyzeSafety(
    commands: string[],
    shell: ShellType,
  ): Promise<SafetyAlert[]> {
    const backend = await this.detectBackend();

    if (backend === 'copilot') {
      return this.analyzeSafetyNewCli(commands, shell);
    }
    return this.analyzeSafetyLegacy(commands, shell);
  }

  // ── New CLI: batch prompts ─────────────────────────────────────────────

  /**
   * With the new CLI we can send the full structured prompt in a single
   * call and expect JSON back — it's a full agentic LLM.
   */
  private async generateWithNewCli(
    patterns: CommandPattern[],
    shell: ShellType,
  ): Promise<Suggestion[]> {
    // Try batch prompt first
    const batchPrompt = buildSuggestionPrompt(patterns, shell);
    try {
      const raw = await this.runNewCopilot(batchPrompt);
      if (raw) {
        const suggestions = parseSuggestions(raw);
        if (suggestions.length > 0) return suggestions;
      }
    } catch (error) {
      if (error instanceof CopilotNotAvailableError) throw error;
      // Batch failed — fall through to individual calls
    }

    // Fallback: individual calls (same as legacy but using new CLI)
    return this.generateIndividual(
      patterns.slice(0, RealCopilotClient.MAX_LEGACY_CALLS),
      shell,
      (prompt) => this.runNewCopilot(prompt),
    );
  }

  private async analyzeSafetyNewCli(
    commands: string[],
    _shell: ShellType,
  ): Promise<SafetyAlert[]> {
    const batchPrompt = buildSafetyPrompt(commands);
    try {
      const raw = await this.runNewCopilot(batchPrompt);
      if (raw) {
        const alerts = parseSafetyAlerts(raw);
        if (alerts.length > 0) return alerts;
      }
    } catch (error) {
      if (error instanceof CopilotNotAvailableError) throw error;
    }

    // Fallback: individual safety calls
    return this.analyzeSafetyIndividual(
      commands.slice(0, 3),
      (prompt) => this.runNewCopilot(prompt),
    );
  }

  // ── Legacy: individual pattern calls ───────────────────────────────────

  private async generateWithLegacy(
    patterns: CommandPattern[],
    shell: ShellType,
  ): Promise<Suggestion[]> {
    return this.generateIndividual(
      patterns.slice(0, RealCopilotClient.MAX_LEGACY_CALLS),
      shell,
      (prompt) => this.runLegacyGhCopilot(prompt),
    );
  }

  private async analyzeSafetyLegacy(
    commands: string[],
    _shell: ShellType,
  ): Promise<SafetyAlert[]> {
    return this.analyzeSafetyIndividual(
      commands.slice(0, 3),
      (prompt) => this.runLegacyGhCopilot(prompt),
    );
  }

  // ── Shared individual-call helpers ─────────────────────────────────────

  private async generateIndividual(
    patterns: CommandPattern[],
    shell: ShellType,
    run: (prompt: string) => Promise<string>,
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    for (const pat of patterns) {
      try {
        const prompt = buildSinglePatternPrompt(pat, shell);
        const raw = await run(prompt);
        if (!raw) continue;

        // Try JSON
        const jsonResult = parseSuggestions(raw);
        if (jsonResult.length > 0) {
          suggestions.push(...jsonResult);
          continue;
        }

        // Parse as raw shell code
        const suggestion = buildSuggestionFromRawCode(raw, pat);
        if (suggestion) suggestions.push(suggestion);
      } catch (error) {
        if (error instanceof CopilotNotAvailableError) throw error;
        continue;
      }
    }

    return suggestions;
  }

  private async analyzeSafetyIndividual(
    commands: string[],
    run: (prompt: string) => Promise<string>,
  ): Promise<SafetyAlert[]> {
    const alerts: SafetyAlert[] = [];

    for (const cmd of commands) {
      try {
        const prompt = buildSingleSafetyPrompt(cmd);
        const raw = await run(prompt);
        if (!raw) continue;

        const jsonAlerts = parseSafetyAlerts(raw);
        if (jsonAlerts.length > 0) {
          alerts.push(...jsonAlerts);
          continue;
        }

        alerts.push({
          pattern: cmd,
          frequency: 0,
          risk: 'Potentially dangerous command',
          saferAlternative: raw,
        });
      } catch (error) {
        if (error instanceof CopilotNotAvailableError) throw error;
        continue;
      }
    }

    return alerts;
  }
}

// ── Mock implementation ─────────────────────────────────────────────────────

/**
 * Returns canned responses from JSON fixture files.
 * Used in tests and optionally in local dev (via env var).
 */
export class MockCopilotClient implements CopilotClient {
  private fixturesDir: string;

  /**
   * @param fixturesDir - Path to `tests/fixtures/copilot_responses/`.
   *   Defaults to `<projectRoot>/tests/fixtures/copilot_responses`.
   */
  constructor(fixturesDir?: string) {
    this.fixturesDir =
      fixturesDir ??
      join(process.cwd(), 'tests', 'fixtures', 'copilot_responses');
  }

  async generateSuggestions(
    _patterns: CommandPattern[],
    shell: ShellType,
  ): Promise<Suggestion[]> {
    const file = join(this.fixturesDir, `suggest_${shell}.json`);
    try {
      const content = await readFile(file, 'utf-8');
      return JSON.parse(content) as Suggestion[];
    } catch {
      // If no fixture exists for this specific shell, fall back to bash.
      try {
        const fallback = join(this.fixturesDir, 'suggest_bash.json');
        const content = await readFile(fallback, 'utf-8');
        return JSON.parse(content) as Suggestion[];
      } catch {
        return [];
      }
    }
  }

  async analyzeSafety(
    _commands: string[],
    _shell: ShellType,
  ): Promise<SafetyAlert[]> {
    const file = join(this.fixturesDir, 'safety_alerts.json');
    try {
      const content = await readFile(file, 'utf-8');
      return JSON.parse(content) as SafetyAlert[];
    } catch {
      return [];
    }
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create the appropriate `CopilotClient` based on the environment.
 *
 * - `DOTFILES_COACH_USE_MOCK_COPILOT=1` → `MockCopilotClient`
 * - otherwise → `RealCopilotClient`
 */
export function createCopilotClient(
  fixturesDir?: string,
): CopilotClient {
  const useMock = process.env.DOTFILES_COACH_USE_MOCK_COPILOT === '1';
  if (useMock) {
    return new MockCopilotClient(fixturesDir);
  }
  return new RealCopilotClient();
}

