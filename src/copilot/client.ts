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
import { parseSuggestions, parseSafetyAlerts } from './response-parser.js';
import { buildSuggestionPrompt, buildSafetyPrompt } from './prompts.js';
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
 * Calls `gh copilot suggest` / `gh copilot explain` as a child process.
 * Requires `gh` CLI + Copilot extension to be installed and authenticated.
 */
export class RealCopilotClient implements CopilotClient {
  /**
   * Run a `gh copilot suggest` invocation and return the raw stdout.
   * Handles common error cases (missing CLI, auth, rate limits).
   */
  private async runGhCopilot(
    subcommand: 'suggest' | 'explain',
    prompt: string,
  ): Promise<string> {
    try {
      // Dynamic import: execa v9 is ESM-only and cannot be require()'d.
      const { execa } = await import('execa');
      const result = await execa('gh', ['copilot', subcommand, prompt], {
        timeout: 30_000, // 30 s
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
        reject: true,
      });
      return result.stdout;
    } catch (err: unknown) {
      const execaErr = err as Record<string, unknown>;
      const stderr = String(execaErr.stderr ?? '');
      const msg = String(
        execaErr.message ?? (err instanceof Error ? err.message : ''),
      );

      // gh not installed
      if (msg.includes('ENOENT') || msg.includes('not found')) {
        throw new CopilotNotAvailableError(
          'GitHub CLI (gh) is not installed. Install from https://cli.github.com',
        );
      }
      // Copilot extension not installed or auth failure
      if (
        stderr.includes('copilot') &&
        (stderr.includes('not found') || stderr.includes('extension'))
      ) {
        throw new CopilotNotAvailableError(
          'GitHub Copilot CLI extension is not installed. Run: gh extension install github/gh-copilot',
        );
      }
      if (stderr.includes('auth') || stderr.includes('login')) {
        throw new CopilotNotAvailableError(
          'GitHub CLI is not authenticated. Run: gh auth login',
        );
      }
      // Rate limiting
      if (stderr.includes('rate limit') || stderr.includes('429')) {
        throw new CopilotResponseError(
          'Copilot rate limit reached. Please wait and try again.',
        );
      }
      // Timeout
      if (msg.includes('timed out')) {
        throw new CopilotResponseError(
          'Copilot request timed out after 30 seconds.',
        );
      }

      throw new CopilotResponseError(
        `Copilot ${subcommand} failed: ${stderr || msg}`,
      );
    }
  }

  async generateSuggestions(
    patterns: CommandPattern[],
    shell: ShellType,
  ): Promise<Suggestion[]> {
    const prompt = buildSuggestionPrompt(patterns, shell);
    const raw = await this.runGhCopilot('suggest', prompt);
    return parseSuggestions(raw);
  }

  async analyzeSafety(
    commands: string[],
    _shell: ShellType,
  ): Promise<SafetyAlert[]> {
    const prompt = buildSafetyPrompt(commands);
    const raw = await this.runGhCopilot('suggest', prompt);
    return parseSafetyAlerts(raw);
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

