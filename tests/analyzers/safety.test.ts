import { describe, it, expect } from 'vitest';
import {
  detectDangerousPatterns,
  extractDangerousCommands,
} from '../../src/analyzers/safety.js';
import type { HistoryEntry } from '../../src/types/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function entry(command: string, lineNumber = 1): HistoryEntry {
  return { command, lineNumber };
}

function entries(commands: string[]): HistoryEntry[] {
  return commands.map((cmd, i) => entry(cmd, i + 1));
}

// ── Tests: detectDangerousPatterns ──────────────────────────────────────────

describe('detectDangerousPatterns', () => {
  it('returns empty array for safe commands', () => {
    const result = detectDangerousPatterns(
      entries(['git status', 'npm install', 'ls -la']),
    );
    expect(result).toEqual([]);
  });

  // ── rm -rf without -i ─────────────────────────────────────────────────

  describe('rm -rf without -i', () => {
    it('flags rm -rf without -i', () => {
      const result = detectDangerousPatterns(entries(['rm -rf /tmp/old']));
      expect(result.length).toBe(1);
      expect(result[0].risk).toContain('-i');
    });

    it('flags rm -fr (reversed flags)', () => {
      const result = detectDangerousPatterns(entries(['rm -fr /tmp/old']));
      expect(result.length).toBe(1);
    });

    it('does NOT flag rm -rfi (includes -i)', () => {
      const result = detectDangerousPatterns(entries(['rm -rfi /tmp/old']));
      expect(result).toEqual([]);
    });

    it('does NOT flag plain rm without -rf', () => {
      const result = detectDangerousPatterns(entries(['rm file.txt']));
      expect(result).toEqual([]);
    });
  });

  // ── sudo rm ───────────────────────────────────────────────────────────

  describe('sudo rm', () => {
    it('flags sudo rm', () => {
      const result = detectDangerousPatterns(entries(['sudo rm -rf /var/old']));
      // Should get two alerts: sudo rm + rm -rf without -i
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some((a) => a.risk.includes('sudo rm'))).toBe(true);
    });

    it('does NOT flag sudo with non-rm commands', () => {
      const result = detectDangerousPatterns(
        entries(['sudo apt-get update']),
      );
      expect(result).toEqual([]);
    });
  });

  // ── Unquoted variable expansion ───────────────────────────────────────

  describe('unquoted variable expansion', () => {
    it('flags rm $DIR without quotes', () => {
      const result = detectDangerousPatterns(entries(['rm -rf $DIR/*']));
      const unquoted = result.find((a) =>
        a.risk.includes('Unquoted variable'),
      );
      expect(unquoted).toBeDefined();
    });

    it('does NOT flag rm "$DIR"', () => {
      const alerts = detectDangerousPatterns(entries(['rm -rf "$DIR"/*']));
      const unquoted = alerts.find((a) =>
        a.risk.includes('Unquoted variable'),
      );
      expect(unquoted).toBeUndefined();
    });
  });

  // ── PowerShell Remove-Item ────────────────────────────────────────────

  describe('PowerShell Remove-Item', () => {
    it('flags Remove-Item -Recurse -Force without -WhatIf', () => {
      const result = detectDangerousPatterns(
        entries(['Remove-Item -Recurse -Force C:\\temp\\old']),
      );
      expect(result.length).toBe(1);
      expect(result[0].risk).toContain('Remove-Item');
    });

    it('does NOT flag when -WhatIf is present', () => {
      const result = detectDangerousPatterns(
        entries(['Remove-Item -Recurse -Force -WhatIf C:\\temp\\old']),
      );
      expect(result).toEqual([]);
    });

    it('does NOT flag when -Confirm is present', () => {
      const result = detectDangerousPatterns(
        entries(['Remove-Item -Recurse -Force -Confirm C:\\temp\\old']),
      );
      expect(result).toEqual([]);
    });

    it('does NOT flag Remove-Item without -Force', () => {
      const result = detectDangerousPatterns(
        entries(['Remove-Item -Recurse C:\\temp\\old']),
      );
      expect(result).toEqual([]);
    });
  });

  // ── dd without status=progress ────────────────────────────────────────

  describe('dd without status=progress', () => {
    it('flags dd without status=progress', () => {
      const result = detectDangerousPatterns(
        entries(['dd if=/dev/zero of=/dev/sdb bs=4M']),
      );
      expect(result.length).toBe(1);
      expect(result[0].risk).toContain('status=progress');
    });

    it('does NOT flag dd with status=progress', () => {
      const result = detectDangerousPatterns(
        entries(['dd if=/dev/zero of=/dev/sdb bs=4M status=progress']),
      );
      expect(result).toEqual([]);
    });

    it('does NOT flag bare dd without if=/of=', () => {
      const result = detectDangerousPatterns(entries(['dd --help']));
      expect(result).toEqual([]);
    });
  });

  // ── chmod 777 ─────────────────────────────────────────────────────────

  describe('chmod 777', () => {
    it('flags chmod 777', () => {
      const result = detectDangerousPatterns(
        entries(['chmod 777 /var/www']),
      );
      expect(result.length).toBe(1);
      expect(result[0].risk).toContain('777');
    });

    it('flags chmod -R 777', () => {
      const result = detectDangerousPatterns(
        entries(['chmod -R 777 /var/www']),
      );
      expect(result.length).toBe(1);
    });

    it('does NOT flag chmod 755', () => {
      const result = detectDangerousPatterns(
        entries(['chmod 755 /var/www']),
      );
      expect(result).toEqual([]);
    });
  });

  // ── Frequency aggregation ─────────────────────────────────────────────

  it('aggregates frequency for repeated dangerous commands', () => {
    const result = detectDangerousPatterns(
      entries([
        'rm -rf /tmp/old',
        'rm -rf /tmp/old',
        'rm -rf /tmp/old',
      ]),
    );

    expect(result.length).toBe(1);
    expect(result[0].frequency).toBe(3);
  });

  it('sorts by frequency descending', () => {
    const result = detectDangerousPatterns(
      entries([
        'chmod 777 /var',
        'rm -rf /tmp',
        'rm -rf /tmp',
        'rm -rf /tmp',
      ]),
    );

    expect(result.length).toBe(2);
    expect(result[0].frequency).toBeGreaterThanOrEqual(result[1].frequency);
  });
});

// ── Tests: extractDangerousCommands ─────────────────────────────────────────

describe('extractDangerousCommands', () => {
  it('extracts unique dangerous commands', () => {
    const cmds = extractDangerousCommands(
      entries([
        'git status',
        'rm -rf /tmp/old',
        'rm -rf /tmp/old',
        'chmod 777 /var',
        'npm install',
      ]),
    );
    expect(cmds).toContain('rm -rf /tmp/old');
    expect(cmds).toContain('chmod 777 /var');
    expect(cmds).not.toContain('git status');
    expect(cmds).not.toContain('npm install');
    // Deduplicated
    expect(cmds.filter((c) => c === 'rm -rf /tmp/old').length).toBe(1);
  });

  it('returns empty array for safe history', () => {
    const cmds = extractDangerousCommands(
      entries(['git status', 'npm test']),
    );
    expect(cmds).toEqual([]);
  });
});
