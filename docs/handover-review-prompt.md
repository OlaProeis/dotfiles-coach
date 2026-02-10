# Handover Prompt: Full Project Review

> Copy everything below this line into a new chat to start the review session.

---

## Context

I'm building **Dotfiles Coach**, a CLI tool for the **GitHub Copilot CLI Challenge** on DEV.to (deadline: Feb 15 2026). The tool analyzes shell history (Bash/Zsh/PowerShell), finds repeated patterns, detects dangerous commands, and uses `gh copilot suggest` via `execa` to generate aliases, functions, and safety improvements.

**All 14 tasks are complete. All 290 tests pass. The project builds and typechecks cleanly.**

I need you to do a **comprehensive code review** before I release this. Please read `@ai-context.md` first for the full architecture, then review every source file.

## What to review

### 1. Security audit (CRITICAL)

This tool reads shell history which may contain secrets. Review:

- `src/utils/secret-scrubber.ts` — Are the 12 regex categories comprehensive enough? Any bypass vectors?
- `src/commands/suggest.ts` — Is scrubbing ALWAYS applied before data reaches Copilot? Can it be skipped?
- `src/copilot/client.ts` — Does the real client send anything unscrubbed? Is the execa call safe (no shell injection)?
- `src/commands/apply.ts` — Can it overwrite files it shouldn't? Is the backup logic sound?
- `src/utils/file-operations.ts` — Any path traversal risks? Race conditions?
- Are there any code paths where user data could leak without scrubbing?

### 2. Bug hunting

Review each source file for:

- Edge cases in parsers (`bash.ts`, `powershell.ts`, `common.ts`) — malformed history, empty files, huge files
- Error handling — do all commands exit cleanly on failure? Are there unhandled promise rejections?
- `execa` dynamic import in `copilot/client.ts` — is it correct? Any issues?
- Type safety — any `as` casts that could hide bugs? Any `any` types that should be tighter?
- The `formatters/markdown.ts` pipe escaping — is it sufficient for markdown tables?
- The `report` command — does it handle missing cached suggestions gracefully?
- The `analyze` command — does `--format markdown` work correctly now (was a fallback before)?

### 3. Competition readiness

- Does the README clearly explain what the tool does for judges?
- Is the `--help` output clear and professional?
- Are the test fixtures realistic enough for a demo?
- Any rough edges in the terminal UI output (table formatting, spinner messages, chalk colors)?
- Does the project structure follow best practices?

### 4. Code quality

- DRY violations (repeated code across commands/formatters)
- Unused imports or dead code
- Inconsistent naming or style
- Missing JSDoc on public APIs
- Any `TODO` or placeholder code left behind

### 5. Cross-platform

- Windows (PowerShell): path handling, CRLF line endings, history path resolution
- macOS/Linux (Bash/Zsh): history file locations, shell detection
- Does `--shell auto` work reliably on each platform?

## Source files to review

```
src/
├── cli.ts
├── types/index.ts
├── commands/analyze.ts
├── commands/suggest.ts
├── commands/apply.ts
├── commands/report.ts
├── parsers/bash.ts
├── parsers/powershell.ts
├── parsers/common.ts
├── analyzers/frequency.ts
├── analyzers/patterns.ts
├── analyzers/safety.ts
├── copilot/client.ts
├── copilot/prompts.ts
├── copilot/response-parser.ts
├── formatters/table.ts
├── formatters/markdown.ts
├── formatters/json.ts
├── utils/shell-detect.ts
├── utils/history-paths.ts
├── utils/file-operations.ts
└── utils/secret-scrubber.ts
```

Also review: `package.json`, `tsconfig.json`, `README.md`, `docs/prd.md`

## Deliverables

After reviewing, provide:

1. **Critical issues** (must fix before release) — security holes, data leaks, crashes
2. **Important issues** (should fix) — bugs, edge cases, misleading output
3. **Nice-to-haves** (polish) — code quality, minor UX improvements
4. **Specific code suggestions** with file paths and line numbers
5. **Verdict** — is this ready for submission?

---
