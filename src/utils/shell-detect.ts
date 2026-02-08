/**
 * Shell type auto-detection.
 *
 * Detection strategy:
 *  1. If the caller supplies a shell explicitly, use it.
 *  2. Check $SHELL (Unix) — look for "bash", "zsh", "pwsh"/"powershell".
 *  3. On Windows (process.platform === 'win32'), default to PowerShell.
 *  4. Fall back to 'bash'.
 */

import type { ShellType } from '../types/index.js';

/**
 * Try to determine the active shell from env vars and platform.
 *
 * @param override - If the user explicitly provided a shell, skip detection.
 * @returns Detected (or overridden) shell type.
 */
export function detectShell(override?: ShellType | 'auto'): ShellType {
  // Explicit override (not 'auto') — honour it directly.
  if (override && override !== 'auto') {
    return override;
  }

  // 1) $SHELL env var (common on macOS/Linux).
  const shellEnv = process.env.SHELL?.toLowerCase() ?? '';

  if (shellEnv.includes('zsh')) return 'zsh';
  if (shellEnv.includes('bash')) return 'bash';
  if (shellEnv.includes('pwsh') || shellEnv.includes('powershell')) return 'powershell';

  // 2) PowerShell-specific env vars (works inside pwsh on all platforms).
  if (process.env.PSModulePath) {
    // PSModulePath is set inside any PowerShell session.
    // To avoid false positives on Windows (where it always exists),
    // only use this heuristic on non-Windows.
    if (process.platform !== 'win32') return 'powershell';
  }

  // 3) Platform fallback — Windows defaults to PowerShell, others to bash.
  if (process.platform === 'win32') return 'powershell';

  return 'bash';
}
