import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { getHistoryPath, getAllKnownHistoryPaths } from '../../src/utils/history-paths.js';

describe('getHistoryPath', () => {
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;
  const home = os.homedir();

  beforeEach(() => {
    delete process.env.HISTFILE;
    delete process.env.APPDATA;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  // ── Override flag ────────────────────────────────────────────────────────

  it('returns user-supplied override path (absolute)', () => {
    const result = getHistoryPath('bash', '/custom/history.txt');
    expect(result.filePath).toBe(path.resolve('/custom/history.txt'));
    expect(result.source).toBe('override');
  });

  it('resolves relative override to absolute', () => {
    const result = getHistoryPath('zsh', 'relative/history.txt');
    expect(path.isAbsolute(result.filePath)).toBe(true);
    expect(result.source).toBe('override');
  });

  // ── Bash ─────────────────────────────────────────────────────────────────

  it('bash default → ~/.bash_history', () => {
    const result = getHistoryPath('bash');
    expect(result.filePath).toBe(path.join(home, '.bash_history'));
    expect(result.source).toBe('default');
  });

  it('bash honours $HISTFILE', () => {
    process.env.HISTFILE = '/tmp/my_bash_history';
    const result = getHistoryPath('bash');
    expect(result.filePath).toBe(path.resolve('/tmp/my_bash_history'));
    expect(result.source).toBe('env');
  });

  // ── Zsh ──────────────────────────────────────────────────────────────────

  it('zsh default → ~/.zsh_history', () => {
    const result = getHistoryPath('zsh');
    expect(result.filePath).toBe(path.join(home, '.zsh_history'));
    expect(result.source).toBe('default');
  });

  it('zsh honours $HISTFILE', () => {
    process.env.HISTFILE = '/tmp/my_zsh_history';
    const result = getHistoryPath('zsh');
    expect(result.filePath).toBe(path.resolve('/tmp/my_zsh_history'));
    expect(result.source).toBe('env');
  });

  // ── PowerShell ───────────────────────────────────────────────────────────

  it('powershell on win32 → APPDATA path', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.APPDATA = 'C:\\Users\\testuser\\AppData\\Roaming';

    const result = getHistoryPath('powershell');
    expect(result.filePath).toBe(
      path.join(
        'C:\\Users\\testuser\\AppData\\Roaming',
        'Microsoft',
        'Windows',
        'PowerShell',
        'PSReadLine',
        'ConsoleHost_history.txt',
      ),
    );
    expect(result.source).toBe('default');
  });

  it('powershell on win32 without $APPDATA falls back to homedir', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.APPDATA;

    const result = getHistoryPath('powershell');
    expect(result.filePath).toContain('ConsoleHost_history.txt');
    expect(result.filePath).toContain('PSReadLine');
    expect(result.source).toBe('default');
  });

  it('powershell on linux → ~/.local/share/powershell/PSReadLine/', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const result = getHistoryPath('powershell');
    expect(result.filePath).toBe(
      path.join(home, '.local', 'share', 'powershell', 'PSReadLine', 'ConsoleHost_history.txt'),
    );
    expect(result.source).toBe('default');
  });

  it('powershell on darwin → ~/.local/share/powershell/PSReadLine/', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const result = getHistoryPath('powershell');
    expect(result.filePath).toBe(
      path.join(home, '.local', 'share', 'powershell', 'PSReadLine', 'ConsoleHost_history.txt'),
    );
    expect(result.source).toBe('default');
  });

  // ── Override takes precedence over everything ────────────────────────────

  it('override beats $HISTFILE for bash', () => {
    process.env.HISTFILE = '/env/history';
    const result = getHistoryPath('bash', '/override/history');
    expect(result.filePath).toBe(path.resolve('/override/history'));
    expect(result.source).toBe('override');
  });

  it('override beats $HISTFILE for zsh', () => {
    process.env.HISTFILE = '/env/history';
    const result = getHistoryPath('zsh', '/override/history');
    expect(result.filePath).toBe(path.resolve('/override/history'));
    expect(result.source).toBe('override');
  });
});

describe('getAllKnownHistoryPaths', () => {
  it('returns paths for all three shells', () => {
    const paths = getAllKnownHistoryPaths();
    expect(paths).toHaveProperty('bash');
    expect(paths).toHaveProperty('zsh');
    expect(paths).toHaveProperty('powershell');
    expect(typeof paths.bash).toBe('string');
    expect(typeof paths.zsh).toBe('string');
    expect(typeof paths.powershell).toBe('string');
  });

  it('all paths are absolute', () => {
    const paths = getAllKnownHistoryPaths();
    expect(path.isAbsolute(paths.bash)).toBe(true);
    expect(path.isAbsolute(paths.zsh)).toBe(true);
    expect(path.isAbsolute(paths.powershell)).toBe(true);
  });
});
