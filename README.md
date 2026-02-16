![Dotfiles Coach](docs/images/cover-image.png)

# Dotfiles Coach

> AI-powered shell automation from your command history, built for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github).

Dotfiles Coach analyses your shell history (Bash, Zsh, PowerShell), finds repeated patterns, detects dangerous commands, and uses **GitHub Copilot CLI** to generate smart aliases, functions, and safety improvements -- tailored to your actual workflow.

**Privacy-first:** All analysis happens locally. Secrets are scrubbed before any data touches Copilot.

---

## Quick Start

```bash
git clone https://github.com/OlaProeis/dotfiles-coach.git
cd dotfiles-coach
npm install
npm run build
npm link          # optional -- gives you the global "dotfiles-coach" command
```

> If you skip `npm link`, replace `dotfiles-coach` with `node dist/cli.js` in the examples below.

---

## Try It Out

Every command below uses bundled sample data -- **no real history or Copilot subscription needed**.

> **PowerShell users:** swap double quotes for single quotes if you get parsing errors.

```bash
# 1. Analyze -- find patterns & safety issues (100% local)
dotfiles-coach analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 2. Search -- find a command by intent (100% local, fuzzy matching)
dotfiles-coach search "docker" --shell bash --history-file tests/fixtures/sample_bash_history.txt

# 3. Suggest -- generate Copilot-powered aliases & functions
dotfiles-coach suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 4. Suggest with Interactive TUI -- review, edit & approve each suggestion
dotfiles-coach suggest --interactive --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 5. Apply -- preview generated shell code (dry run, no files touched)
dotfiles-coach apply --dry-run

# 6. Apply with Interactive TUI -- pick which suggestions to write
dotfiles-coach apply --interactive --dry-run

# 7. Report -- export a markdown summary
dotfiles-coach report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1 --output report.md

# 8. Help & version
dotfiles-coach --help
dotfiles-coach --version
```

**Without Copilot installed?** Set the mock-client flag first:

```bash
# PowerShell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"

# Bash / Zsh
export DOTFILES_COACH_USE_MOCK_COPILOT=1
```

Then run any `suggest` or `report` command above -- the mock returns realistic sample suggestions.

**Using your real history** -- just drop the `--shell` and `--history-file` flags:

```bash
dotfiles-coach analyze
dotfiles-coach search "that docker command from last week"
dotfiles-coach suggest --interactive
dotfiles-coach report --output report.md
```

---

## Prerequisites

| Requirement | How to get it |
|-------------|---------------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **GitHub Copilot CLI** | Windows: `winget install GitHub.Copilot` / macOS: `brew install copilot-cli` / npm: `npm install -g @github/copilot` (Node 22+) |
| **Copilot auth** | Run `copilot` and use `/login` (one-time) |
| **Copilot subscription** | Free tier works |

> `analyze`, `report`, and `search` work **100% offline**. Only `suggest` (and `search --explain`) talks to Copilot.

---

## Commands

### `dotfiles-coach analyze`

Parse shell history and display frequency stats + safety alerts.

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | `bash`, `zsh`, `powershell`, `auto` |
| `--history-file <path>` | auto-detected | Path to history file |
| `--min-frequency <n>` | `5` | Minimum repeat count |
| `--top <n>` | `20` | Show top N patterns |
| `--format <format>` | `table` | `table`, `json`, `markdown` |

### `dotfiles-coach search <query>`

Search your shell history by natural-language query -- 100% local fuzzy + keyword matching.

![Search Pipeline](docs/images/search-flow.png)

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | `bash`, `zsh`, `powershell`, `auto` |
| `--history-file <path>` | auto-detected | Path to history file |
| `--max-results <n>` | `10` | Maximum results |
| `--format <format>` | `table` | `table`, `json`, `markdown` |
| `--explain` | `false` | Ask Copilot to explain the top result |

### `dotfiles-coach suggest`

Send top patterns to GitHub Copilot CLI and display automation suggestions.

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | `bash`, `zsh`, `powershell`, `auto` |
| `--history-file <path>` | auto-detected | Path to history file |
| `--min-frequency <n>` | `5` | Minimum repeat count |
| `--output <file>` | stdout | Save suggestions to file |
| **`--interactive`** | `false` | **Launch TUI to review, edit & approve each suggestion** |

### `dotfiles-coach apply`

Write approved suggestions to a shell configuration file.

| Option | Default | Description |
|--------|---------|-------------|
| `--output <file>` | `~/.dotfiles_coach_aliases.sh` | Output file path |
| `--append-to <file>` | - | Append to existing profile (e.g. `~/.zshrc`) |
| `--dry-run` | `false` | Preview without writing |
| `--no-backup` | `false` | Skip backup creation |
| **`--interactive`** | `false` | **Launch TUI to pick which suggestions to apply** |

> **Safety:** `apply` **never** auto-sources files. It prints `source` instructions for you to run manually.

### `dotfiles-coach report`

Generate a comprehensive markdown or JSON report.

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | `bash`, `zsh`, `powershell`, `auto` |
| `--history-file <path>` | auto-detected | Path to history file |
| `--min-frequency <n>` | `5` | Minimum repeat count |
| `--top <n>` | `20` | Show top N patterns |
| `--output <file>` | stdout | Write report to file |
| `--format <format>` | `markdown` | `markdown`, `json` |

---

## Interactive TUI

The `--interactive` flag (on `suggest` and `apply`) launches a full terminal UI built with [ink](https://github.com/vadimdemedes/ink):

- **Up / Down** -- navigate the suggestion list
- **Enter** -- toggle a suggestion for apply
- **Space** -- toggle as ignored
- **e** -- open the suggestion code in your `$EDITOR` for live editing
- **a** -- apply all pending
- **q** -- finish and continue

The TUI re-renders after each editor session so you can tweak code and keep reviewing. Falls back to non-interactive output when not running in a TTY (e.g. CI pipelines).

---

## How It Works

![Dotfiles Coach Workflow](docs/images/workflow.png)

1. **Analyze** reads your shell history and identifies repeated command patterns
2. **Search** tokenizes your query and every history command, scores by keyword overlap + fuzzy (Levenshtein) matching, and ranks by relevance
3. **Suggest** scrubs all secrets, sends patterns to the Copilot CLI (`copilot -p "..." -s`), and parses the structured JSON response
4. **Apply** reads cached suggestions and writes them as valid shell code
5. **Report** combines analysis + suggestions into a shareable document

**No API tokens needed.** The tool uses your existing Copilot CLI authentication.

### Internal Pipeline

![Dotfiles Coach Architecture](docs/images/architecture.png)

---

## Privacy & Security

![Privacy Flow](docs/images/privacy-flow.png)

- All analysis happens **locally** on your machine
- Secrets are **scrubbed** through 13 regex filters before any data leaves via Copilot
- Secret scrubbing is **mandatory** and cannot be disabled
- The tool sends data **only** through the GitHub Copilot CLI binary -- no direct HTTP calls, no telemetry
- `apply` **never** auto-modifies your shell config without explicit `--append-to`

> Full details: [docs/PRIVACY.md](docs/PRIVACY.md)

---

## Testing

425 automated tests across 22 test files:

```bash
npm test              # run all 425 tests
npm run test:watch    # watch mode
npm run typecheck     # type-check without emitting
```

| Module | Tests |
|--------|-------|
| Parsers (Bash, Zsh, common) | 37 |
| Utilities (shell-detect, history-paths, secret-scrubber, file-ops) | 70 |
| Copilot (client, prompts, response-parser) | 53 |
| Analyzers (frequency, safety) | 33 |
| Formatters (table, json, markdown) | 51 |
| Search (scorer) | 102 |
| Commands (analyze, suggest, apply, report, search) | 53 |
| Types + E2E | 26 |

> Full manual test checklist: [docs/manual-test-plan.md](docs/manual-test-plan.md)

---

## Project Structure

```
src/
├── cli.ts                    # Commander entry point
├── types/index.ts            # All shared interfaces
├── commands/                 # analyze, suggest, apply, report, search
├── search/                   # scorer.ts (tokenize + keyword/fuzzy ranking)
├── tui/                      # Interactive TUI (ink + React)
├── parsers/                  # bash.ts (Bash+Zsh), powershell.ts, common.ts
├── analyzers/                # frequency.ts, patterns.ts, safety.ts
├── copilot/                  # client.ts, prompts.ts, response-parser.ts
├── formatters/               # table.ts, markdown.ts, json.ts
└── utils/                    # shell-detect.ts, history-paths.ts, file-operations.ts, secret-scrubber.ts
```

---

## Tech Stack

| Area | Choice |
|------|--------|
| Runtime | Node.js 18+ (ESM) |
| Language | TypeScript (strict mode) |
| CLI framework | `commander` |
| Terminal UI | `chalk`, `ora`, `boxen`, `ink` (React for CLIs) |
| Copilot integration | `execa` wrapping `copilot -p -s` with legacy `gh copilot suggest` fallback |
| String similarity | `fast-levenshtein` |
| File I/O | `fs-extra` |
| Tests | `vitest` |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Internal architecture, module reference, data flow |
| [Contributing](docs/CONTRIBUTING.md) | Development setup, conventions, testing |
| [Privacy & Security](docs/PRIVACY.md) | Privacy model, secret scrubbing details |
| [Manual Test Plan](docs/manual-test-plan.md) | Pre-release manual testing checklist |
| [Testing Without Copilot](docs/TESTING-WITHOUT-COPILOT.md) | Mock client setup and testing guide |

---

## Disclaimer

This project was built with significant assistance from AI tools, including GitHub Copilot and Cursor AI. The code, tests, documentation, and images were generated and refined through AI-assisted development. All output has been reviewed and tested by a human.

---

## License

MIT
