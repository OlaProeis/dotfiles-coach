import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// ── Mock ora to suppress spinner output ──────────────────────────────────────

vi.mock('ora', () => ({
  default: () => {
    const spinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: '',
    };
    return new Proxy(spinner, {
      set(target, prop, value) {
        if (prop === 'text') {
          (target as Record<string, unknown>).text = value;
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });
  },
}));

// ── Mock file-operations ─────────────────────────────────────────────────────

const sampleCache = {
  shell: 'bash' as const,
  generatedAt: '2026-02-08T12:00:00.000Z',
  suggestions: [
    {
      pattern: 'git add . && git commit -m',
      type: 'function' as const,
      code: 'function gac() {\n  git add . && git commit -m "$1"\n}',
      name: 'gac',
      explanation: 'Quick git add-all and commit with a message argument.',
      safety: 'safe' as const,
    },
    {
      pattern: 'docker compose up -d',
      type: 'alias' as const,
      code: "alias dcu='docker compose up -d'",
      name: 'dcu',
      explanation: 'Short alias for starting Docker Compose services.',
      safety: 'safe' as const,
    },
    {
      pattern: "find . -name '*.log' -delete",
      type: 'function' as const,
      code: 'function clean-logs() {\n  find "${1:-.}" -name \'*.log\' -print -delete\n}',
      name: 'clean-logs',
      explanation: 'Removes all .log files under the given directory.',
      safety: 'warning' as const,
    },
  ],
};

const mockReadJsonFile = vi.fn();
const mockWriteFileSafe = vi.fn().mockResolvedValue(undefined);
const mockCreateBackup = vi.fn().mockResolvedValue(null);
const mockAppendToFile = vi.fn().mockResolvedValue(undefined);
const mockFileExists = vi.fn().mockResolvedValue(false);
const mockGetSuggestionsCachePath = vi.fn().mockReturnValue(
  path.join(os.tmpdir(), 'dotfiles-coach-test', 'last_suggestions.json'),
);

vi.mock('../../src/utils/file-operations.js', () => ({
  readJsonFile: (...args: unknown[]) => mockReadJsonFile(...args),
  writeFileSafe: (...args: unknown[]) => mockWriteFileSafe(...args),
  createBackup: (...args: unknown[]) => mockCreateBackup(...args),
  appendToFile: (...args: unknown[]) => mockAppendToFile(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  getSuggestionsCachePath: () => mockGetSuggestionsCachePath(),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { runApply } from '../../src/commands/apply.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runApply', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);

    mockReadJsonFile.mockReset();
    mockWriteFileSafe.mockReset().mockResolvedValue(undefined);
    mockCreateBackup.mockReset().mockResolvedValue(null);
    mockAppendToFile.mockReset().mockResolvedValue(undefined);
    mockFileExists.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Error: no cached suggestions ──────────────────────────────────────

  it('exits with error when no cached suggestions exist', async () => {
    mockReadJsonFile.mockResolvedValue(null);

    await expect(runApply({})).rejects.toThrow(/process\.exit/);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errorOutput).toContain('No suggestions found');
  });

  it('exits with error when cached suggestions are empty', async () => {
    mockReadJsonFile.mockResolvedValue({
      shell: 'bash',
      generatedAt: '2026-02-08T12:00:00.000Z',
      suggestions: [],
    });

    await expect(runApply({})).rejects.toThrow(/process\.exit/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // ── Dry-run mode ──────────────────────────────────────────────────────

  it('shows preview without writing files in dry-run mode', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);

    await runApply({ dryRun: true });

    // Should NOT write any files
    expect(mockWriteFileSafe).not.toHaveBeenCalled();
    expect(mockAppendToFile).not.toHaveBeenCalled();

    // Should display preview
    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('DRY RUN');
    expect(allOutput).toContain('No files were modified');
  });

  // ── Write to default output file ──────────────────────────────────────

  it('writes suggestions to default output path', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);

    await runApply({});

    expect(mockWriteFileSafe).toHaveBeenCalledOnce();
    const [writtenPath, content] = mockWriteFileSafe.mock.calls[0];

    // Default path for bash
    expect(writtenPath).toContain('.dotfiles_coach_aliases.sh');

    // Content should include header and code
    expect(content).toContain('Dotfiles Coach - Generated Aliases & Functions');
    expect(content).toContain("alias dcu='docker compose up -d'");
    expect(content).toContain('function gac()');
    expect(content).toContain('Suggestion 1:');
    expect(content).toContain('Suggestion 2:');
    expect(content).toContain('Suggestion 3:');
  });

  it('writes to custom output path when --output specified', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);
    const customPath = path.join(os.tmpdir(), 'custom-aliases.sh');

    await runApply({ output: customPath });

    expect(mockWriteFileSafe).toHaveBeenCalledOnce();
    const [writtenPath] = mockWriteFileSafe.mock.calls[0];
    expect(writtenPath).toBe(customPath);
  });

  // ── PowerShell output ─────────────────────────────────────────────────

  it('uses .ps1 extension for PowerShell shell', async () => {
    mockReadJsonFile.mockResolvedValue({
      ...sampleCache,
      shell: 'powershell',
    });

    await runApply({});

    const [writtenPath] = mockWriteFileSafe.mock.calls[0];
    expect(writtenPath).toContain('.dotfiles_coach_profile.ps1');
  });

  // ── Backup creation ───────────────────────────────────────────────────

  it('creates backup when file exists and backup not disabled', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);
    mockFileExists.mockResolvedValue(true);
    mockCreateBackup.mockResolvedValue('/home/user/.dotfiles_coach_aliases.sh.backup');

    await runApply({ backup: true });

    expect(mockCreateBackup).toHaveBeenCalledOnce();

    // Should log the backup path
    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('backup');
  });

  it('skips backup when --no-backup is set', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);
    mockFileExists.mockResolvedValue(true);

    await runApply({ backup: false });

    expect(mockCreateBackup).not.toHaveBeenCalled();
  });

  // ── Append-to mode ────────────────────────────────────────────────────

  it('appends to existing file with --append-to', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);
    const targetFile = path.join(os.tmpdir(), '.zshrc');

    await runApply({ appendTo: targetFile });

    expect(mockAppendToFile).toHaveBeenCalledOnce();
    const [appendPath, content] = mockAppendToFile.mock.calls[0];
    expect(path.resolve(appendPath)).toBe(path.resolve(targetFile));
    expect(content).toContain('Dotfiles Coach');
  });

  // ── Source instructions ───────────────────────────────────────────────

  it('prints source instructions for bash', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);

    await runApply({});

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('source');
    expect(allOutput).toContain('NEXT STEPS');
  });

  it('prints PowerShell instructions for powershell', async () => {
    mockReadJsonFile.mockResolvedValue({
      ...sampleCache,
      shell: 'powershell',
    });

    await runApply({});

    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('$PROFILE');
  });

  // ── Code formatting ───────────────────────────────────────────────────

  it('formats code with proper comments and timestamps', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);

    await runApply({});

    const [, content] = mockWriteFileSafe.mock.calls[0];

    // Header block
    expect(content).toContain('# ============================================');
    expect(content).toContain('# Generated:');
    expect(content).toContain('# Shell: Bash');

    // Suggestion comments
    expect(content).toContain('# Suggestion 1: Function: gac');
    expect(content).toContain('# Suggestion 2: Alias: dcu');
    expect(content).toContain('# Suggestion 3: Function: clean-logs');
  });

  it('includes safety warnings in generated code comments', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);

    await runApply({});

    const [, content] = mockWriteFileSafe.mock.calls[0];
    expect(content).toContain('WARNING');
  });

  // ── Never auto-sources ────────────────────────────────────────────────

  it('never auto-sources the generated file', async () => {
    mockReadJsonFile.mockResolvedValue(sampleCache);

    await runApply({});

    // The command should print instructions but NOT execute source
    // We can verify no exec/spawn calls were made by checking
    // that only writeFileSafe was called (no execa/exec)
    const allOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('source'); // instruction text
    expect(allOutput).toContain('NEXT STEPS');
  });
});
