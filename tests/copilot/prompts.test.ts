import { describe, it, expect } from 'vitest';
import {
  buildBashZshPrompt,
  buildPowerShellPrompt,
  buildSafetyPrompt,
  buildSuggestionPrompt,
  buildExplainPrompt,
} from '../../src/copilot/prompts.js';
import type { CommandPattern } from '../../src/types/index.js';

const samplePatterns: CommandPattern[] = [
  {
    pattern: 'git add . && git commit -m',
    frequency: 42,
    variations: ['git add -A && git commit -m'],
  },
  {
    pattern: 'docker compose up -d',
    frequency: 18,
    variations: [],
  },
];

// ── buildBashZshPrompt ──────────────────────────────────────────────────────

describe('buildBashZshPrompt', () => {
  it('includes the shell automation expert preamble', () => {
    const prompt = buildBashZshPrompt(samplePatterns);
    expect(prompt).toContain('shell automation and ergonomics expert');
    expect(prompt).toContain('Bash and Zsh');
  });

  it('lists patterns with frequencies', () => {
    const prompt = buildBashZshPrompt(samplePatterns);
    expect(prompt).toContain('git add . && git commit -m');
    expect(prompt).toContain('42 times');
    expect(prompt).toContain('docker compose up -d');
    expect(prompt).toContain('18 times');
  });

  it('includes variations when present', () => {
    const prompt = buildBashZshPrompt(samplePatterns);
    expect(prompt).toContain('git add -A && git commit -m');
  });

  it('requests JSON output format', () => {
    const prompt = buildBashZshPrompt(samplePatterns);
    expect(prompt).toContain('"suggestions"');
    expect(prompt).toContain('"pattern"');
    expect(prompt).toContain('"type"');
  });

  it('includes POSIX-compatible guideline', () => {
    const prompt = buildBashZshPrompt(samplePatterns);
    expect(prompt).toContain('POSIX-compatible');
  });
});

// ── buildPowerShellPrompt ───────────────────────────────────────────────────

describe('buildPowerShellPrompt', () => {
  it('includes the PowerShell expert preamble', () => {
    const prompt = buildPowerShellPrompt(samplePatterns);
    expect(prompt).toContain('PowerShell scripting expert');
  });

  it('lists patterns with frequencies', () => {
    const prompt = buildPowerShellPrompt(samplePatterns);
    expect(prompt).toContain('42 times');
  });

  it('requests JSON output format', () => {
    const prompt = buildPowerShellPrompt(samplePatterns);
    expect(prompt).toContain('"suggestions"');
  });

  it('includes PowerShell-specific guidelines', () => {
    const prompt = buildPowerShellPrompt(samplePatterns);
    expect(prompt).toContain('Set-Alias');
    expect(prompt).toContain('CmdletBinding');
    expect(prompt).toContain('Verb-Noun');
  });
});

// ── buildSafetyPrompt ───────────────────────────────────────────────────────

describe('buildSafetyPrompt', () => {
  const dangerousCommands = [
    'rm -rf /tmp/*',
    'chmod 777 /var/www',
    'dd if=/dev/zero of=/dev/sdb',
  ];

  it('includes the security expert preamble', () => {
    const prompt = buildSafetyPrompt(dangerousCommands);
    expect(prompt).toContain('system security expert');
  });

  it('lists all dangerous commands', () => {
    const prompt = buildSafetyPrompt(dangerousCommands);
    for (const cmd of dangerousCommands) {
      expect(prompt).toContain(cmd);
    }
  });

  it('requests JSON alerts format', () => {
    const prompt = buildSafetyPrompt(dangerousCommands);
    expect(prompt).toContain('"alerts"');
    expect(prompt).toContain('"risk"');
    expect(prompt).toContain('"safer_alternative"');
  });

  it('mentions focus areas', () => {
    const prompt = buildSafetyPrompt(dangerousCommands);
    expect(prompt).toContain('Destructive operations');
    expect(prompt).toContain('Privilege escalation');
    expect(prompt).toContain('Unquoted variables');
  });
});

// ── buildSuggestionPrompt (dispatcher) ──────────────────────────────────────

describe('buildSuggestionPrompt', () => {
  it('dispatches to Bash/Zsh template for bash', () => {
    const prompt = buildSuggestionPrompt(samplePatterns, 'bash');
    expect(prompt).toContain('Bash and Zsh');
  });

  it('dispatches to Bash/Zsh template for zsh', () => {
    const prompt = buildSuggestionPrompt(samplePatterns, 'zsh');
    expect(prompt).toContain('Bash and Zsh');
  });

  it('dispatches to PowerShell template for powershell', () => {
    const prompt = buildSuggestionPrompt(samplePatterns, 'powershell');
    expect(prompt).toContain('PowerShell scripting expert');
  });
});

// ── buildExplainPrompt ──────────────────────────────────────────────────────

describe('buildExplainPrompt', () => {
  it('includes the no-file-modification preamble', () => {
    const prompt = buildExplainPrompt('ls -la');
    expect(prompt).toContain('Do NOT create, modify, or read any files');
  });

  it('includes the command', () => {
    const prompt = buildExplainPrompt('ffmpeg -i input.mp4 -vcodec libx264 output.mp4');
    expect(prompt).toContain('ffmpeg -i input.mp4');
  });

  it('asks for a concise explanation', () => {
    const prompt = buildExplainPrompt('git rebase -i HEAD~3');
    expect(prompt).toContain('Explain');
    expect(prompt).toContain('concise');
  });

  it('truncates very long commands', () => {
    const longCmd = 'a'.repeat(300);
    const prompt = buildExplainPrompt(longCmd);
    // Should be truncated to 200 chars
    expect(prompt).not.toContain('a'.repeat(300));
    expect(prompt).toContain('a'.repeat(200));
  });
});
