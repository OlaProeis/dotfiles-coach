# Architecture Reference

> Internal architecture, module responsibilities, data flow, and type system for Dotfiles Coach.

---

## System Overview

Dotfiles Coach is a modular CLI application built with **TypeScript** on **Node.js 18+**. It follows a layered pipeline architecture where data flows through clearly separated stages:

```
Shell History File
       │
       ▼
  ┌─────────┐
  │ Parsers  │   Parse raw history files (Bash/Zsh/PowerShell)
  └────┬─────┘
       │  HistoryEntry[]
       ▼
  ┌───────────┐
  │ Analyzers  │  Frequency analysis, pattern detection, safety checks
  └────┬───────┘
       │  CommandPattern[] + SafetyAlert[]
       ▼
  ┌────────────────┐
  │ Secret Scrubber │  Mandatory redaction before any external call
  └────┬───────────┘
       │  Scrubbed CommandPattern[]
       ▼
  ┌─────────────────┐
  │ Copilot Client   │  Send patterns to GitHub Copilot CLI
  └────┬─────────────┘
       │  Suggestion[]
       ▼
  ┌────────────┐
  │ Formatters  │  Table, Markdown, JSON output
  └────┬───────┘
       │
       ▼
   Terminal / File
```

Each layer is a standalone module with its own tests. The CLI layer (`cli.ts`) wires them together using Commander.js commands.

---

## Module Reference

### Entry Point

#### `src/cli.ts`

The Commander.js-based CLI entry point. Registers four commands (`analyze`, `suggest`, `apply`, `report`) with their options, parses arguments, and delegates to command handlers.

- **Framework:** Commander.js
- **Responsibility:** Argument parsing, option validation, command dispatch
- **No business logic** -- all work is delegated to command modules

---

### Commands (`src/commands/`)

Each command module exports a single `run*` function that orchestrates the full pipeline for that command.

#### `analyze.ts` -- `runAnalyze(options: AnalyzeOptions): Promise<AnalysisResult>`

Orchestrates the local analysis pipeline:

1. Detect shell type (`shell-detect`)
2. Resolve history file path (`history-paths`)
3. Verify file exists
4. Parse history entries (`parsers/bash`)
5. Run frequency analysis (`analyzers/frequency`)
6. Detect dangerous patterns (`analyzers/safety`)
7. Format and display results (`formatters/*`)

**Network calls:** None. This command is 100% offline.

#### `suggest.ts` -- `runSuggest(options: SuggestOptions): Promise<Suggestion[]>`

Extends the analysis pipeline with Copilot integration:

1. Steps 1-6 from `analyze`
2. **Scrub secrets** from all patterns (mandatory, via `secret-scrubber`)
3. Send scrubbed patterns to Copilot CLI (via `copilot/client`)
4. Parse Copilot response (via `copilot/response-parser`)
5. Cache suggestions to `~/.config/dotfiles-coach/last_suggestions.json`
6. Format and display suggestions

**Network calls:** GitHub Copilot CLI (through the `copilot` or `gh` binary).

#### `apply.ts` -- `runApply(options: ApplyOptions): Promise<void>`

Reads cached suggestions and writes them as shell code:

1. Load cached suggestions from `last_suggestions.json`
2. Format as valid shell code with comments and timestamps
3. Handle modes: `--dry-run`, `--append-to`, or write to output file
4. Create backups before overwriting
5. Print `source` instructions (never auto-sources)

**Network calls:** None. Reads only from local cache.

#### `report.ts` -- `runReport(options: ReportOptions): Promise<void>`

Generates a comprehensive report combining analysis and suggestions:

1. Run the full analysis pipeline (same as `analyze`)
2. Load cached suggestions if available
3. Generate formatted report (Markdown or JSON)
4. Write to file or stdout

**Network calls:** None.

---

### Parsers (`src/parsers/`)

#### `bash.ts` -- `parseBashHistory(filePath, options?): Promise<HistoryEntry[]>`

The primary parser. Handles **three** history formats:

| Format | Example | Detection |
|--------|---------|-----------|
| **Bash plain** | `git status` | Default |
| **Bash timestamped** | `#1700000000` followed by command | `#<9-11 digit epoch>` pattern |
| **Zsh extended_history** | `: 1700000000:0;git status` | `: <epoch>:<duration>;` pattern |

Also handles PowerShell history (plain text, one command per line) since PSReadLine uses the same format as Bash plain.

**Pipeline within the parser:**
1. Read file as UTF-8
2. Normalize line endings (`\r\n` → `\n`)
3. Limit to last N lines (default: 5,000) via `common.limitLines()`
4. Auto-detect format (Zsh extended vs. Bash/plain)
5. Parse lines into `HistoryEntry[]` with timestamp and line number
6. Handle multi-line commands (trailing `\` continuation)
7. Filter noise commands via `common.isNoiseCommand()`
8. Deduplicate consecutive identical commands via `common.deduplicateConsecutive()`

#### `powershell.ts`

Intentionally empty module. PowerShell's PSReadLine history is plain text (one command per line), identical to Bash plain format. The `parseBashHistory()` function handles it without any PowerShell-specific logic.

#### `common.ts` -- Shared Parsing Utilities

| Export | Description |
|--------|-------------|
| `DEFAULT_MAX_LINES` | `5000` -- default tail limit |
| `MIN_LINE_LIMIT` | `100` -- minimum configurable limit |
| `isNoiseCommand(cmd)` | Returns `true` for trivial commands (`ls`, `cd`, `clear`, `exit`, `pwd`, `history`, single-char) |
| `limitLines(lines, max)` | Keep only the last N lines from an array |
| `deduplicateConsecutive(entries)` | Remove consecutive identical commands (keeps first occurrence) |

---

### Analyzers (`src/analyzers/`)

#### `frequency.ts` -- `analyzeFrequency(entries, options?): CommandPattern[]`

The core analysis engine. Processes history entries through multiple stages:

1. **Exact command counting** -- Count occurrences of each unique command string and track the most recent usage timestamp.

2. **Sequence detection** -- Sliding window (sizes 2-5) over consecutive commands. Joins with ` && ` and counts repeated sequences. For example, if `git add .` followed by `git commit -m "..."` appears 15 times, the sequence `git add . && git commit -m "..."` gets a count of 15.

3. **Similarity grouping** -- Groups commands within a Levenshtein distance threshold (default: 3). The most frequent command becomes the representative pattern; similar commands become "variations". Length difference pre-check avoids expensive comparisons on wildly different strings.

4. **Frequency filtering** -- Remove patterns below `minFrequency` (default: 5).

5. **Ranking** -- Sort by frequency (descending), then by recency (most recent first).

6. **Top-N selection** -- Return only the top N results (default: 20).

**Configuration (`FrequencyOptions`):**

| Option | Default | Description |
|--------|---------|-------------|
| `minFrequency` | `5` | Minimum count to include |
| `top` | `20` | Maximum patterns to return |
| `similarityThreshold` | `3` | Levenshtein distance for grouping |
| `minSequenceLength` | `2` | Minimum commands in a sequence |
| `maxSequenceLength` | `5` | Maximum commands in a sequence |

#### `safety.ts` -- `detectDangerousPatterns(entries): SafetyAlert[]`

Scans all history entries against a rule set of dangerous patterns. Each rule tests a command string and returns a specific risk description if matched.

**Detection rules:**

| Rule | Detects | Safer Alternative |
|------|---------|-------------------|
| `rm-rf-no-interactive` | `rm -rf` without `-i` flag | `rm -rfi` or preview with `ls` first |
| `sudo-rm` | `sudo rm` without confirmation | `sudo rm -i` |
| `unquoted-variable` | `rm $VAR` without quotes (word splitting risk) | `rm "$VAR"` |
| `ps-remove-item-no-whatif` | `Remove-Item -Recurse -Force` without `-WhatIf`/`-Confirm` | Add `-WhatIf` or `-Confirm` |
| `dd-no-status` | `dd` without `status=progress` | Add `status=progress` |
| `chmod-777` | `chmod 777` (overly permissive) | `chmod 755` or `chmod 644` |

**Also exports:** `extractDangerousCommands(entries): string[]` -- extracts unique dangerous command strings for sending to Copilot's safety analysis.

#### `patterns.ts`

Intentionally empty. Sequence detection is implemented within `frequency.ts`. This module exists as a future extension point for complementary pattern logic (e.g., prefix-tree patterns, regex-based grouping).

---

### Copilot Integration (`src/copilot/`)

#### `client.ts` -- Copilot Client Interface + Implementations

Defines the `CopilotClient` interface and provides two implementations:

**Interface:**

```typescript
interface CopilotClient {
  generateSuggestions(patterns: CommandPattern[], shell: ShellType): Promise<Suggestion[]>;
  analyzeSafety(commands: string[], shell: ShellType): Promise<SafetyAlert[]>;
}
```

**`RealCopilotClient`** -- Calls the GitHub Copilot CLI as a child process via `execa`. Supports two backends:

| Backend | Binary | Flags | Notes |
|---------|--------|-------|-------|
| **New Copilot CLI** | `copilot` | `-p "prompt" -s --allow-all` | Agentic CLI, preferred |
| **Legacy gh extension** | `gh copilot suggest` | `-t shell "prompt"` | Retired Oct 2025, fallback |

Auto-detects the available backend on first call and caches the result. Falls back gracefully with informative error messages.

**Suggestion strategy:**
1. Try batch prompt (all patterns in one call) -- works well with the new CLI
2. If batch fails, fall back to individual calls per pattern (max 7)
3. Each response is parsed through the 3-tier parser

**Error handling:** Custom error classes `CopilotNotAvailableError` and `CopilotResponseError` with specific detection for: binary not found, authentication required, rate limiting, and timeouts.

**`MockCopilotClient`** -- Returns canned responses from JSON fixture files in `tests/fixtures/copilot_responses/`. Used in tests and optionally in local development.

**`createCopilotClient(fixturesDir?)`** -- Factory function:
- `DOTFILES_COACH_USE_MOCK_COPILOT=1` → `MockCopilotClient`
- Otherwise → `RealCopilotClient`

#### `prompts.ts` -- Prompt Templates

Builds structured prompts for the Copilot CLI. All prompts include a preamble instructing Copilot not to create files or run commands (critical for the agentic CLI mode).

| Function | Purpose |
|----------|---------|
| `buildBashZshPrompt(patterns)` | Full JSON-schema prompt for Bash/Zsh suggestions |
| `buildPowerShellPrompt(patterns)` | Full JSON-schema prompt for PowerShell suggestions |
| `buildSafetyPrompt(commands)` | Safety analysis prompt requesting JSON alerts |
| `buildSuggestionPrompt(patterns, shell)` | Dispatcher: routes to Bash/Zsh or PowerShell |
| `buildSinglePatternPrompt(pattern, shell)` | Short prompt for a single pattern (legacy/fallback) |
| `buildSingleSafetyPrompt(command)` | Short prompt for a single dangerous command |

#### `response-parser.ts` -- Copilot Response Parser

Robust 3-tier parsing strategy for handling Copilot's variable output format:

| Tier | Strategy | Description |
|------|----------|-------------|
| **1** | Markdown fences | Extract JSON from `` ```json ... ``` `` blocks |
| **2** | Raw JSON | Find bare `{...}` or `[...]` in output |
| **3** | Regex fallback | Parse conversational responses (headers + code blocks) |

**Key exports:**

| Function | Description |
|----------|-------------|
| `extractJson(text)` | Tier 1+2 JSON extraction, returns string or null |
| `parseSuggestions(raw)` | Full suggestion parsing (JSON → conversational fallback) |
| `parseSafetyAlerts(raw)` | Safety alert parsing (JSON only) |
| `stripAnsiCodes(str)` | Remove ANSI escape codes from terminal output |
| `extractCopilotSuggestion(raw)` | Extract command from `gh copilot suggest` UI chrome |
| `buildSuggestionFromRawCode(raw, pattern)` | Build a `Suggestion` from raw shell code output |

---

### Formatters (`src/formatters/`)

#### `table.ts` -- Terminal Table Formatter

Produces colorful terminal output using `chalk`, `boxen`, and hand-drawn tables. Used by the `analyze` command's default output format.

#### `markdown.ts` -- Markdown Formatter

Generates clean Markdown output for:
- Analysis results (used by `analyze --format markdown`)
- Full reports combining analysis + suggestions (used by `report`)

Includes pipe-character escaping for Markdown table safety.

#### `json.ts` -- JSON Formatter

Serializes `AnalysisResult` as pretty-printed JSON. Used by `analyze --format json`.

---

### Utilities (`src/utils/`)

#### `secret-scrubber.ts` -- Privacy-First Secret Scrubbing

**Critical security module.** All data MUST pass through `scrubSecrets()` before being sent to Copilot. This module cannot be disabled.

Detects 13 categories of secrets via regex patterns:

| # | Category | Example |
|---|----------|---------|
| 1 | Key-value assignments | `password=abc123`, `export TOKEN=...` |
| 2 | Export statements | `export AWS_SECRET_ACCESS_KEY=...` |
| 3 | Docker login | `docker login -p mypassword` |
| 4 | SSH key paths | `ssh -i ~/.ssh/id_rsa`, `ssh-add ...` |
| 5 | URL credentials | `https://user:pass@host.com` |
| 6 | curl auth | `curl -u user:pass ...` |
| 7 | AWS access keys | `AKIA...` (16 uppercase alphanumeric) |
| 8 | GitHub tokens | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` prefixed |
| 9 | GitLab tokens | `glpat-` prefixed |
| 10 | npm tokens | `npm_` prefixed |
| 11 | npm config auth | `npm config set ... _authToken ...` |
| 12 | Bearer/Authorization | `Bearer <token>`, `Authorization: <token>` |
| 13 | Base64 blobs | 40+ character Base64 strings |
| 14 | Hex secrets | 32+ hex chars in assignment context |

**API:**
- `scrubSecrets(input: string): ScrubResult` -- Scrub a text block, returns `{ scrubbed, redactedCount }`
- `scrubLines(lines: string[]): { scrubbedLines, totalRedacted }` -- Scrub an array of strings

#### `shell-detect.ts` -- `detectShell(override?): ShellType`

Auto-detects the active shell using this priority:

1. Explicit `--shell` flag (if not `auto`)
2. `$SHELL` environment variable (Unix: check for `zsh`, `bash`, `pwsh`)
3. `$PSModulePath` presence (non-Windows only, to avoid false positives)
4. Platform fallback: Windows → `powershell`, others → `bash`

#### `history-paths.ts` -- `getHistoryPath(shell, override?): HistoryPathResult`

Resolves the history file path for each shell:

| Shell | Default Path | Env Override |
|-------|-------------|--------------|
| Bash | `~/.bash_history` | `$HISTFILE` |
| Zsh | `~/.zsh_history` | `$HISTFILE` |
| PowerShell (Windows) | `%APPDATA%\...\PSReadLine\ConsoleHost_history.txt` | -- |
| PowerShell (macOS/Linux) | `~/.local/share/powershell/PSReadLine/ConsoleHost_history.txt` | -- |

User-supplied `--history-file` always takes priority.

#### `file-operations.ts` -- Safe File I/O

| Function | Description |
|----------|-------------|
| `ensureDir(path)` | Create directory recursively |
| `getConfigDir()` | Returns `~/.config/dotfiles-coach` |
| `getSuggestionsCachePath()` | Returns path to `last_suggestions.json` |
| `readFileIfExists(path)` | Read UTF-8 file, returns `null` if missing |
| `readJsonFile<T>(path)` | Parse JSON file, returns `null` on error |
| `writeFileSafe(path, content)` | Write file, creating parent dirs |
| `writeJsonFile(path, data)` | Write pretty-printed JSON |
| `createBackup(path)` | Timestamped backup (`.backup` or `.<timestamp>.backup`) |
| `appendToFile(path, content)` | Append to file, creating if needed |
| `fileExists(path)` | Check file existence |

#### `strings.ts` -- String Utilities

| Function | Description |
|----------|-------------|
| `capitalize(s)` | Uppercase first letter |
| `truncate(s, max)` | Truncate with `...` suffix |
| `wrapText(text, maxWidth)` | Word-boundary-aware line wrapping |

---

### Types (`src/types/index.ts`)

All shared TypeScript interfaces and types in a single file:

| Type | Description |
|------|-------------|
| `HistoryEntry` | A single parsed history line: `{ command, timestamp?, lineNumber }` |
| `CommandPattern` | A repeated pattern: `{ pattern, frequency, lastUsed?, variations }` |
| `SuggestionType` | `'alias' \| 'function' \| 'script'` |
| `Suggestion` | One Copilot suggestion: `{ pattern, type, code, name, explanation, safety? }` |
| `AnalysisResult` | Full analysis output: `{ shell, historyFile, totalCommands, uniqueCommands, patterns, safetyAlerts }` |
| `SafetyAlert` | A dangerous pattern: `{ pattern, frequency, risk, saferAlternative }` |
| `ShellType` | `'bash' \| 'zsh' \| 'powershell'` |
| `OutputFormat` | `'table' \| 'json' \| 'markdown'` |
| `AnalyzeOptions` | Options for the `analyze` command |
| `SuggestOptions` | Options for the `suggest` command |
| `ApplyOptions` | Options for the `apply` command |
| `ReportOptions` | Options for the `report` command |
| `SuggestionsCache` | Shape of the JSON cache: `{ shell, generatedAt, suggestions }` |

---

## Data Flow Diagrams

### `analyze` Command

```
User runs: dotfiles-coach analyze --shell bash --min-frequency 3

  detectShell("bash")
       │
  getHistoryPath("bash")  →  ~/.bash_history
       │
  parseBashHistory(path)  →  HistoryEntry[]
       │
  analyzeFrequency(entries, { minFrequency: 3 })  →  CommandPattern[]
       │
  detectDangerousPatterns(entries)  →  SafetyAlert[]
       │
  formatAnalysisTable(result)  →  Terminal output
```

### `suggest` Command

```
User runs: dotfiles-coach suggest --min-frequency 3

  [Same analysis pipeline as analyze]
       │
  scrubPatterns(patterns)  →  Scrubbed CommandPattern[]   ← MANDATORY
       │
  createCopilotClient()
       │
  client.generateSuggestions(scrubbedPatterns, shell)
       │  ├── buildSuggestionPrompt() → prompt string
       │  ├── runNewCopilot(prompt) or runLegacyGhCopilot(prompt)
       │  └── parseSuggestions(raw) → Suggestion[]
       │
  writeJsonFile(cachePath, cache)  →  ~/.config/dotfiles-coach/last_suggestions.json
       │
  formatSuggestionsTerminal(suggestions)  →  Terminal output
```

### `apply` Command

```
User runs: dotfiles-coach apply --output ~/my_aliases.sh

  readJsonFile(cachePath)  →  SuggestionsCache
       │
  formatSuggestionsAsCode(suggestions, shell)  →  Shell code string
       │
  createBackup(outputPath)  →  ~/my_aliases.sh.backup
       │
  writeFileSafe(outputPath, code)  →  File written
       │
  printSourceInstructions()  →  "source ~/my_aliases.sh"
```

---

## Testing Architecture

Tests mirror the source structure under `tests/`:

```
tests/
├── analyzers/           # frequency.test.ts, safety.test.ts
├── commands/            # analyze.test.ts, suggest.test.ts, apply.test.ts, report.test.ts
├── copilot/             # client.test.ts, prompts.test.ts, response-parser.test.ts
├── formatters/          # table.test.ts, json.test.ts, markdown.test.ts
├── parsers/             # bash.test.ts, common.test.ts
├── utils/               # shell-detect.test.ts, history-paths.test.ts,
│                        # secret-scrubber.test.ts, file-operations.test.ts
├── fixtures/            # Sample history files + mock Copilot responses
├── types.test.ts        # Type validation tests
└── e2e.test.ts          # End-to-end integration tests
```

**Key testing patterns:**
- All Copilot calls use `MockCopilotClient` (no network in tests)
- Fixture files in `tests/fixtures/` provide realistic sample data
- `DOTFILES_COACH_USE_MOCK_COPILOT=1` toggles mock mode for manual testing
- **291 tests** across 20 test files

---

## ESM Considerations

The project uses TypeScript with `"module": "NodeNext"` (ESM). Several dependencies (`chalk`, `ora`, `boxen`, `execa`) are ESM-only packages. These are imported dynamically within command functions to avoid top-level ESM import issues:

```typescript
const { default: chalk } = await import('chalk');
const { default: ora } = await import('ora');
```

All internal imports use the `.js` extension suffix (required by NodeNext resolution).
