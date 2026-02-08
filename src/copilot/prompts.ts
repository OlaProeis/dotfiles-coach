/**
 * Prompt templates for Copilot CLI integration.
 *
 * Three template families (from PRD Appendix A):
 *  1. Bash/Zsh suggestions
 *  2. PowerShell suggestions
 *  3. Safety analysis
 *
 * Each builder accepts structured data and returns a plain-text prompt string
 * suitable for passing to `gh copilot suggest`.
 */

import type { CommandPattern, ShellType } from '../types/index.js';

// ── Bash / Zsh Prompt ───────────────────────────────────────────────────────

/**
 * Build a suggestion prompt for Bash/Zsh shells.
 * Follows the exact template from PRD Appendix A.
 */
export function buildBashZshPrompt(patterns: CommandPattern[]): string {
  const patternsBlock = patterns
    .map(
      (p, i) =>
        `${i + 1}. "${p.pattern}" (${p.frequency} times)${p.variations.length > 0 ? ` [variations: ${p.variations.join(', ')}]` : ''}`,
    )
    .join('\n');

  return `You are a shell automation and ergonomics expert specializing in Bash and Zsh.

Below are frequently repeated command patterns from a developer's shell history:

${patternsBlock}

For each pattern:
1. Determine if an alias, function, or script would be most appropriate
2. Generate idiomatic, safe code
3. Explain the benefit and rationale
4. Use POSIX-compatible syntax where possible

Return your response as JSON matching this schema:
{
  "suggestions": [
    {
      "pattern": "original command pattern",
      "type": "alias|function|script",
      "code": "suggested code",
      "name": "suggested name",
      "explanation": "rationale and usage notes"
    }
  ]
}

Guidelines:
- Aliases are best for simple 1:1 replacements
- Functions are best for multi-step workflows or commands needing arguments
- Include error handling in functions (|| return 1)
- Use descriptive but concise names
- Add comments for complex logic`;
}

// ── PowerShell Prompt ───────────────────────────────────────────────────────

/**
 * Build a suggestion prompt for PowerShell.
 * Follows the exact template from PRD Appendix A.
 */
export function buildPowerShellPrompt(patterns: CommandPattern[]): string {
  const patternsBlock = patterns
    .map(
      (p, i) =>
        `${i + 1}. "${p.pattern}" (${p.frequency} times)${p.variations.length > 0 ? ` [variations: ${p.variations.join(', ')}]` : ''}`,
    )
    .join('\n');

  return `You are a PowerShell scripting expert focused on automation and best practices.

Below are frequently repeated command patterns from a developer's PowerShell history:

${patternsBlock}

For each pattern:
1. Determine if a PowerShell alias, function, or .ps1 script is most appropriate
2. Generate idiomatic PowerShell code following best practices
3. Explain the benefit and rationale
4. Use approved verbs (Get-, Set-, etc.) for function names where applicable

Return your response as JSON matching this schema:
{
  "suggestions": [
    {
      "pattern": "original command pattern",
      "type": "alias|function|script",
      "code": "suggested PowerShell code",
      "name": "suggested name",
      "explanation": "rationale and usage notes"
    }
  ]
}

Guidelines:
- Use Set-Alias for simple command replacements
- Use functions for complex logic
- Include proper error handling (try/catch, -ErrorAction)
- Follow PowerShell naming conventions (Verb-Noun)
- Add [CmdletBinding()] for advanced functions
- Include parameter validation where appropriate`;
}

// ── Safety Prompt ───────────────────────────────────────────────────────────

/**
 * Build a safety-analysis prompt for dangerous commands.
 * Follows the exact template from PRD Appendix A.
 */
export function buildSafetyPrompt(dangerousCommands: string[]): string {
  const commandsBlock = dangerousCommands
    .map((c, i) => `${i + 1}. \`${c}\``)
    .join('\n');

  return `You are a system security expert specializing in shell command safety.

The following commands appear in a user's shell history and may pose risks:

${commandsBlock}

For each command:
1. Explain the specific risk
2. Provide a safer alternative that achieves the same goal
3. Suggest preventive measures (aliases, wrappers, confirmation flags)

Return as JSON:
{
  "alerts": [
    {
      "command": "original command",
      "risk": "description of danger",
      "safer_alternative": "safer command or approach",
      "preventive_measure": "optional alias or wrapper suggestion"
    }
  ]
}

Focus on:
- Destructive operations (rm, dd, format)
- Privilege escalation (sudo, Run-As-Administrator)
- Unquoted variables and wildcards
- Exposure of credentials or secrets`;
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Select the right suggestion prompt builder based on shell type.
 */
export function buildSuggestionPrompt(
  patterns: CommandPattern[],
  shell: ShellType,
): string {
  if (shell === 'powershell') {
    return buildPowerShellPrompt(patterns);
  }
  // bash and zsh share the same template
  return buildBashZshPrompt(patterns);
}
