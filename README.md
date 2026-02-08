![Dotfiles Coach](docs/images/cover-image.png)

# Dotfiles Coach

> AI-powered shell automation from your command history, built for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github).

Dotfiles Coach analyses your shell history (Bash, Zsh, PowerShell), finds repeated patterns, detects dangerous commands, and uses **GitHub Copilot CLI** to generate smart aliases, functions, and safety improvements -- tailored to your actual workflow.

**Privacy-first:** All analysis happens locally. Secrets are scrubbed before any data touches Copilot.

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/OlaProeis/dotfiles-coach.git
cd dotfiles-coach
npm install
npm run build

# (Optional) Link for global "dotfiles-coach" command
npm link
```

Once built, run commands with `dotfiles-coach` (if linked) or `node dist/cli.js`:

```bash
# 1. Analyse your shell history (100% local, no network)
dotfiles-coach analyze

# 2. Generate Copilot-powered suggestions
dotfiles-coach suggest

# 3. Apply suggestions to a file
dotfiles-coach apply

# 4. Generate a summary report
dotfiles-coach report --output report.md
```

### Try it instantly with sample data

```bash
# No real history needed -- use bundled fixtures
dotfiles-coach analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
```

---

## Prerequisites

| Requirement | How to get it |
|-------------|---------------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **GitHub Copilot CLI** | Windows: `winget install GitHub.Copilot` / macOS: `brew install copilot-cli` / npm: `npm install -g @github/copilot` (Node 22+) |
| **Copilot auth** | Run `copilot` and use `/login` (one-time) |
| **Copilot subscription** | Free tier works |

> **Note:** The `analyze` and `report` commands work 100% offline. Only `suggest` requires GitHub Copilot CLI.
>
> **Migration note:** The old `gh copilot suggest/explain` extension was retired in October 2025. If you still have it, remove it with `gh extension remove gh-copilot` and install the new standalone Copilot CLI above.

---

## Commands

### `dotfiles-coach analyze`

Parse shell history and display frequency stats + safety alerts.

```bash
dotfiles-coach analyze [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | Shell type: `bash`, `zsh`, `powershell`, `auto` |
| `--history-file <path>` | auto-detected | Path to history file |
| `--min-frequency <n>` | `5` | Minimum frequency threshold |
| `--top <n>` | `20` | Show top N patterns |
| `--format <format>` | `table` | Output format: `table`, `json`, `markdown` |

### `dotfiles-coach suggest`

Send top patterns to GitHub Copilot CLI and display automation suggestions.

```bash
dotfiles-coach suggest [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | Shell type |
| `--history-file <path>` | auto-detected | Path to history file |
| `--min-frequency <n>` | `5` | Minimum frequency threshold |
| `--output <file>` | stdout | Save suggestions to file |

### `dotfiles-coach apply`

Write approved suggestions to a shell configuration file.

```bash
dotfiles-coach apply [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--output <file>` | `~/.dotfiles_coach_aliases.sh` | Output file path |
| `--append-to <file>` | - | Append to existing profile (e.g. `~/.zshrc`) |
| `--dry-run` | `false` | Preview without writing |
| `--no-backup` | `false` | Skip backup creation |

> **Safety:** The `apply` command **never** auto-sources files. It prints `source` instructions for you to run manually.

### `dotfiles-coach report`

Generate a comprehensive markdown or JSON report of analysis and suggestions.

```bash
dotfiles-coach report [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--shell <type>` | `auto` | Shell type |
| `--history-file <path>` | auto-detected | Path to history file |
| `--min-frequency <n>` | `5` | Minimum frequency threshold |
| `--top <n>` | `20` | Show top N patterns |
| `--output <file>` | stdout | Write report to file |
| `--format <format>` | `markdown` | Report format: `markdown`, `json` |

---

## How It Works

![Dotfiles Coach Workflow](docs/images/workflow.png)

1. **Analyze** reads your shell history file and identifies repeated command patterns
2. **Suggest** scrubs all secrets, sends patterns to the GitHub Copilot CLI in non-interactive mode (`copilot -p "..." -s`), and parses the structured JSON response
3. **Apply** reads cached suggestions and writes them as valid shell code
4. **Report** combines analysis + suggestions into a shareable document

**No API tokens needed.** The tool uses your existing Copilot CLI authentication.

### Internal Pipeline

![Dotfiles Coach Architecture](docs/images/architecture.png)

---

## Privacy & Security

![Privacy Flow](docs/images/privacy-flow.png)

- All analysis happens **locally** on your machine
- Secrets are **scrubbed** through 13 regex filters before any data leaves via Copilot (env vars, tokens, passwords, SSH keys, AWS keys, npm auth tokens, URLs with credentials, base64 blobs, and more)
- Secret scrubbing is **mandatory** and cannot be disabled
- The tool sends data **only** through the GitHub Copilot CLI binary -- no direct HTTP calls, no telemetry
- The `apply` command **never** auto-modifies your shell config without explicit `--append-to`

---

## Development

```bash
# Clone and install
git clone https://github.com/OlaProeis/dotfiles-coach.git
cd dotfiles-coach
npm install

# Build (required for manual testing)
npm run build

# Type-check
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Testing with mock Copilot

Set the environment variable to use the mock client (no real Copilot subscription needed):

```bash
# PowerShell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# Bash/Zsh
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
```

---

## Project Structure

```
src/
├── cli.ts                    # Commander entry point
├── types/index.ts            # All shared interfaces
├── commands/                 # analyze, suggest, apply, report
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
| Runtime | Node.js 18+ (ESM via `"module": "NodeNext"`) |
| Language | TypeScript (strict mode) |
| CLI framework | `commander` |
| Terminal UI | `chalk`, `ora`, `boxen` |
| Copilot integration | `execa` wrapping `copilot -p -s` (new Copilot CLI) with legacy `gh copilot suggest` fallback |
| String similarity | `fast-levenshtein` |
| File I/O | `fs-extra` |
| Tests | `vitest` |

---

## Testing

291 automated tests across 20 test files covering parsers, analyzers, formatters, commands, utilities, and end-to-end workflows.

```bash
npm test              # Run all 291 tests
npm run test:watch    # Watch mode
npm run typecheck     # Type-check without emitting
```

| Module | Tests |
|--------|-------|
| Parsers (Bash, Zsh, common) | 37 |
| Utilities (shell-detect, history-paths, secret-scrubber, file-ops) | 70 |
| Copilot (client, prompts, response-parser) | 49 |
| Analyzers (frequency, safety) | 33 |
| Formatters (table, json, markdown) | 51 |
| Commands (analyze, suggest, apply, report) | 40 |
| Types + E2E | 10 |

---

## Disclaimer

This project was built with significant assistance from AI tools, including GitHub Copilot and Cursor AI. The code, tests, documentation, and images were generated and refined through AI-assisted development. All output has been reviewed and tested by a human.

---

## License

MIT
