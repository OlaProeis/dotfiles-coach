/**
 * PowerShell history parser.
 *
 * PowerShell's PSReadLine history is plain text (one command per line),
 * identical to Bash plain format. The {@link parseBashHistory} function
 * in `bash.ts` handles it correctly without any PowerShell-specific logic.
 *
 * This module is intentionally empty — no dedicated parser is needed.
 * It exists to match the project structure described in the PRD.
 */
export {};
