import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectShell } from '../../src/utils/shell-detect.js';

describe('detectShell', () => {
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  beforeEach(() => {
    // Clean env vars that affect detection.
    delete process.env.SHELL;
    delete process.env.PSModulePath;
  });

  afterEach(() => {
    // Restore original env and platform.
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  // ── Explicit override ────────────────────────────────────────────────────

  it('returns override when explicitly provided', () => {
    expect(detectShell('zsh')).toBe('zsh');
    expect(detectShell('bash')).toBe('bash');
    expect(detectShell('powershell')).toBe('powershell');
  });

  it('ignores override when set to "auto"', () => {
    process.env.SHELL = '/bin/zsh';
    expect(detectShell('auto')).toBe('zsh');
  });

  // ── $SHELL env detection ─────────────────────────────────────────────────

  it('detects bash from $SHELL', () => {
    process.env.SHELL = '/bin/bash';
    expect(detectShell()).toBe('bash');
  });

  it('detects zsh from $SHELL', () => {
    process.env.SHELL = '/usr/bin/zsh';
    expect(detectShell()).toBe('zsh');
  });

  it('detects zsh from $SHELL with uppercase path', () => {
    process.env.SHELL = '/usr/local/bin/Zsh';
    expect(detectShell()).toBe('zsh');
  });

  it('detects powershell from $SHELL (pwsh)', () => {
    process.env.SHELL = '/usr/local/bin/pwsh';
    expect(detectShell()).toBe('powershell');
  });

  it('detects powershell from $SHELL (powershell)', () => {
    process.env.SHELL = '/usr/local/bin/powershell';
    expect(detectShell()).toBe('powershell');
  });

  // ── Platform fallback ────────────────────────────────────────────────────

  it('defaults to powershell on win32 when no $SHELL', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.SHELL;
    expect(detectShell()).toBe('powershell');
  });

  it('defaults to bash on linux when no $SHELL', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.SHELL;
    expect(detectShell()).toBe('bash');
  });

  it('defaults to bash on darwin when no $SHELL', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    delete process.env.SHELL;
    expect(detectShell()).toBe('bash');
  });

  // ── PSModulePath heuristic (non-Windows) ─────────────────────────────────

  it('detects powershell via PSModulePath on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.SHELL;
    process.env.PSModulePath = '/home/user/.local/share/powershell/Modules';
    expect(detectShell()).toBe('powershell');
  });

  it('does NOT use PSModulePath heuristic on Windows (would be false positive)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.SHELL;
    process.env.PSModulePath = 'C:\\Program Files\\PowerShell\\Modules';
    // win32 already defaults to powershell, but the heuristic itself is skipped.
    expect(detectShell()).toBe('powershell');
  });
});
