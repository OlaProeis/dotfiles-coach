# Contributing to Dotfiles Coach

> Development setup, project conventions, testing, and code organization guide.

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **npm** | 9+ | Bundled with Node.js |
| **TypeScript** | 5.7+ | Installed as devDependency |
| **GitHub Copilot CLI** | Latest | Only needed for `suggest` command; optional for dev |

### Setup

```bash
# Clone the repository
git clone https://github.com/OlaProeis/dotfiles-coach.git
cd dotfiles-coach

# Install dependencies
npm install

# Build the project (compiles TypeScript to dist/)
npm run build

# (Optional) Link for global CLI access
npm link
```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Compile TypeScript to `dist/` |
| `dev` | `npm run dev` | Run via ts-node (development) |
| `start` | `npm run start` | Run compiled CLI (`node dist/cli.js`) |
| `test` | `npm test` | Run all 291 tests with Vitest |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `typecheck` | `npm run typecheck` | Type-check without emitting |

---

## Project Structure

```
dotfiles-coach/
├── src/                          # Source code (TypeScript)
│   ├── cli.ts                    # Commander.js entry point
│   ├── types/index.ts            # All shared TypeScript interfaces
│   ├── commands/                 # CLI command implementations
│   │   ├── analyze.ts            # analyze: local history analysis
│   │   ├── suggest.ts            # suggest: Copilot-powered suggestions
│   │   ├── apply.ts              # apply: write suggestions to files
│   │   └── report.ts             # report: generate summary reports
│   ├── parsers/                  # Shell history file parsers
│   │   ├── bash.ts               # Bash/Zsh/PowerShell parser
│   │   ├── powershell.ts         # (empty -- bash.ts handles PS format)
│   │   └── common.ts             # Shared parsing utilities
│   ├── analyzers/                # Analysis engines
│   │   ├── frequency.ts          # Frequency + sequence + similarity analysis
│   │   ├── safety.ts             # Dangerous pattern detection
│   │   └── patterns.ts           # (empty -- future extension point)
│   ├── copilot/                  # GitHub Copilot CLI integration
│   │   ├── client.ts             # CopilotClient interface + Real/Mock impls
│   │   ├── prompts.ts            # Prompt template builders
│   │   └── response-parser.ts    # 3-tier response parser
│   ├── formatters/               # Output formatters
│   │   ├── table.ts              # Terminal table (chalk + boxen)
│   │   ├── markdown.ts           # Markdown reports
│   │   └── json.ts               # JSON output
│   └── utils/                    # Shared utilities
│       ├── shell-detect.ts       # Shell auto-detection
│       ├── history-paths.ts      # History file path resolution
│       ├── file-operations.ts    # Safe file I/O with backup
│       ├── secret-scrubber.ts    # Mandatory secret redaction
│       └── strings.ts            # String helpers
├── tests/                        # Test suite (Vitest)
│   ├── fixtures/                 # Sample history files + mock responses
│   │   ├── copilot_responses/    # Canned Copilot JSON responses
│   │   ├── sample_bash_history.txt
│   │   ├── sample_bash_history_timestamped.txt
│   │   ├── sample_bash_multiline.txt
│   │   └── sample_zsh_history.txt
│   └── ...                       # Test files mirroring src/ structure
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md           # Internal architecture reference
│   ├── CONTRIBUTING.md           # This file
│   ├── PRIVACY.md                # Privacy and security documentation
│   ├── prd.md                    # Product Requirements Document
│   ├── prd-features-rag-team-tui.md  # Future features PRD
│   ├── manual-test-plan.md       # Manual testing checklist
│   ├── TESTING-WITHOUT-COPILOT.md    # Mock client testing guide
│   ├── devto-submission.md       # DEV.to article content
│   ├── handover-review-prompt.md # Code review handover prompt
│   └── images/                   # Documentation images
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── .gitignore
```

---

## Code Conventions

### TypeScript

- **Strict mode** is enabled (`"strict": true` in `tsconfig.json`)
- **ESM** via `"module": "NodeNext"` -- all internal imports use `.js` extension
- **No `any` types** except for ESM dynamic import shims (clearly documented)
- **Interfaces over classes** where possible (prefer data types over OOP)

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | `kebab-case.ts` | `secret-scrubber.ts` |
| Functions | `camelCase` | `detectShell()` |
| Types/Interfaces | `PascalCase` | `HistoryEntry` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_MAX_LINES` |
| Command handlers | `run<Command>` | `runAnalyze()` |

### Module Organization

- Each module has **one clear responsibility**
- Public API is exported at the top of the file
- Internal helpers are private (not exported)
- JSDoc comments on all exported functions and interfaces
- Empty modules (e.g., `patterns.ts`, `powershell.ts`) are documented with a comment explaining why they exist

### ESM Dynamic Imports

ESM-only packages (`chalk`, `ora`, `boxen`, `execa`) are imported dynamically inside `async` functions:

```typescript
// Correct: dynamic import inside async function
export async function runAnalyze(options: AnalyzeOptions) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');
  // ...
}
```

This avoids top-level ESM import issues while keeping the project compatible with NodeNext module resolution.

---

## Testing

### Running Tests

```bash
# Run all tests (291 tests across 20 files)
npm test

# Watch mode for development
npm run test:watch

# Type-check only (no test execution)
npm run typecheck
```

### Test Structure

Tests mirror the source structure:

```
tests/
├── analyzers/           →  src/analyzers/
├── commands/            →  src/commands/
├── copilot/             →  src/copilot/
├── formatters/          →  src/formatters/
├── parsers/             →  src/parsers/
├── utils/               →  src/utils/
├── types.test.ts        →  src/types/
└── e2e.test.ts          →  End-to-end integration
```

### Test Coverage by Module

| Module | Tests | Coverage Focus |
|--------|-------|----------------|
| Parsers (Bash, Zsh, common) | 37 | Format detection, multi-line, edge cases |
| Utilities (shell-detect, history-paths, secret-scrubber, file-ops) | 70 | Platform logic, all 13 secret patterns |
| Copilot (client, prompts, response-parser) | 49 | Mock/real client, 3-tier parsing |
| Analyzers (frequency, safety) | 33 | Counting, sequences, Levenshtein grouping, all danger rules |
| Formatters (table, json, markdown) | 51 | Output formatting, escaping |
| Commands (analyze, suggest, apply, report) | 40 | Full pipeline integration |
| Types + E2E | 10 | Type validation, end-to-end flow |

### Mock Copilot Client

All tests use `MockCopilotClient` -- no real Copilot CLI calls during testing:

```typescript
// Tests inject the mock directly
const client = new MockCopilotClient('tests/fixtures/copilot_responses');
const suggestions = await client.generateSuggestions(patterns, 'bash');
```

For manual testing without a Copilot subscription:

```bash
# PowerShell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# Bash/Zsh
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
```

### Writing Tests

- Place test files next to the module they test (within the `tests/` mirror structure)
- Use Vitest's `describe`/`it`/`expect` pattern
- Always use the mock Copilot client -- never make real API calls in tests
- Add fixture files to `tests/fixtures/` for new test data
- Test edge cases: empty input, malformed data, missing files

---

## Adding a New Feature

### New Command

1. Create `src/commands/your-command.ts` with a `runYourCommand()` function
2. Register in `src/cli.ts` using Commander's `.command()` API
3. Add types to `src/types/index.ts` if needed
4. Create `tests/commands/your-command.test.ts`
5. Update `README.md` with command documentation

### New Analyzer

1. Create `src/analyzers/your-analyzer.ts`
2. Export a pure function taking `HistoryEntry[]` and returning results
3. Wire into the appropriate command(s) in `src/commands/`
4. Create `tests/analyzers/your-analyzer.test.ts`

### New Secret Pattern

1. Add a new entry to `SECRET_PATTERNS` in `src/utils/secret-scrubber.ts`
2. Add test cases in `tests/utils/secret-scrubber.test.ts`
3. Update the count in `docs/PRIVACY.md` and `README.md`

---

## Build & Release

### Building

```bash
npm run build          # Compiles TypeScript to dist/
npm run typecheck      # Verify types without emitting files
```

The `dist/` directory is the compiled output. The `bin` field in `package.json` points to `dist/cli.js`.

### Pre-release Checklist

1. All tests pass: `npm test`
2. Type-check clean: `npm run typecheck`
3. Build succeeds: `npm run build`
4. Manual smoke test of all 4 commands
5. README is up to date
6. Version bump in `package.json`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DOTFILES_COACH_USE_MOCK_COPILOT` | No | Set to `1` to use mock Copilot client |
| `SHELL` | No | Used for shell auto-detection (Unix) |
| `HISTFILE` | No | Overrides default history file path for Bash/Zsh |
| `PSModulePath` | No | Detected for PowerShell identification |
| `APPDATA` | No | Used for PowerShell history path on Windows |

See `.env.example` for a template.
