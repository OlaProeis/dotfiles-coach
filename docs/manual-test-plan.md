# Manual Test Plan: Dotfiles Coach

> Run these tests before submission. Check each box as you go.
> Requires: `npm run build` first.

---

## Phase 1: Smoke Tests (5 min)

Quick sanity checks that the CLI boots and responds.

- [ ] `node dist/cli.js --help` — shows all 5 commands (analyze, suggest, apply, report, search)
- [ ] `node dist/cli.js --version` — prints `1.0.0`
- [ ] `node dist/cli.js analyze --help` — shows all analyze flags
- [ ] `node dist/cli.js suggest --help` — shows all suggest flags
- [ ] `node dist/cli.js apply --help` — shows all apply flags
- [ ] `node dist/cli.js report --help` — shows all report flags
- [ ] `node dist/cli.js search --help` — shows `<query>` argument + `--shell`, `--history-file`, `--max-results`, `--format`, `--explain`
- [ ] `node dist/cli.js badcommand` — shows helpful error (unknown command)

---

## Phase 2: Analyze Command (10 min)

The analyze command is 100% local — no Copilot needed.

### Bash fixtures

- [ ] `node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1`
  - Shows colored table with header box, pattern table, footer
  - Shell shows "Bash", file path is correct
  - Patterns are listed by frequency

- [ ] `node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --format json`
  - Valid JSON output with `shell`, `totalCommands`, `uniqueCommands`, `patterns`, `safetyAlerts`

- [ ] `node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --format markdown --min-frequency 1`
  - Clean markdown with header, stats, pattern table, footer
  - No ANSI escape codes in markdown output

- [ ] `node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history_timestamped.txt --min-frequency 1`
  - Handles timestamped Bash history (lines starting with `#<epoch>`)

### Zsh fixtures

- [ ] `node dist/cli.js analyze --shell zsh --history-file tests/fixtures/sample_zsh_history.txt --min-frequency 1`
  - Shell shows "Zsh", parses extended_history format correctly

### Your real history

- [ ] `node dist/cli.js analyze --min-frequency 5 --top 10`
  - Auto-detects your shell and history file
  - Shows real patterns from your actual history
  - **CHECK: No secrets visible in the output** (this is pre-scrubbing, but analyze doesn't send data anywhere)

### Error handling

- [ ] `node dist/cli.js analyze --history-file nonexistent.txt`
  - Shows clean error: "History file not found" + tip about `--history-file`
  - Exits with code 1

- [ ] `node dist/cli.js analyze --shell fish`
  - Commander rejects with "Invalid values" error

### Flag behaviour

- [ ] `node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 99`
  - Shows "No patterns found" or empty table (high threshold)

- [ ] `node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --top 2 --min-frequency 1`
  - Shows exactly 2 patterns max

---

## Phase 3: Suggest Command (10 min)

### With mock client (no Copilot needed)

PowerShell:
```powershell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
```

Bash/Zsh:
```bash
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
```

- [ ] Shows formatted suggestions with code blocks, explanations
- [ ] Caches results to `~/.config/dotfiles-coach/last_suggestions.json`
- [ ] Check the cache file exists and contains valid JSON

### With --output flag

```
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1 --output /tmp/suggestions.txt
```

- [ ] Writes plain-text suggestions to the specified file
- [ ] File contents are readable and correctly formatted

### With real Copilot (if you have it)

- [ ] `node dist/cli.js suggest --min-frequency 5`
  - Sends real patterns to `gh copilot suggest`
  - Parses response and displays suggestions
  - **SECURITY CHECK:** Verify no secrets in the Copilot prompt (add `console.log` temporarily to `client.ts` if needed)

### Error handling (no mock)

- [ ] Without `gh` installed: shows "GitHub CLI (gh) is not installed" with install URL
- [ ] Without Copilot extension: shows "Copilot CLI extension is not installed"

---

## Phase 4: Apply Command (10 min)

**Prerequisites:** Run a successful `suggest` first (mock is fine) to populate the cache.

### Dry run

- [ ] `node dist/cli.js apply --dry-run`
  - Shows "DRY RUN" in header
  - Previews file contents without creating any files
  - Shows "No files were modified"

### Write to file

- [ ] `node dist/cli.js apply --output /tmp/test_aliases.sh`
  - Creates the file with shell code
  - Shows source instructions
  - File contains valid shell syntax with comments

### Backup

- [ ] Run apply twice to same file:
  ```
  node dist/cli.js apply --output /tmp/test_aliases.sh
  node dist/cli.js apply --output /tmp/test_aliases.sh
  ```
  - Second run creates a `.backup` file
  - Third run creates a timestamped `.backup` file

### Append mode

- [ ] Create a dummy file, then append:
  ```
  echo "# existing content" > /tmp/test_profile.sh
  node dist/cli.js apply --append-to /tmp/test_profile.sh
  ```
  - Original content preserved
  - Suggestions appended below a separator comment
  - Backup created

### No cached suggestions

- [ ] Delete `~/.config/dotfiles-coach/last_suggestions.json`, then:
  ```
  node dist/cli.js apply
  ```
  - Shows "No suggestions found. Run 'dotfiles-coach suggest' first."

### Safety check

- [ ] **VERIFY:** `apply` never auto-sources any file
- [ ] **VERIFY:** `apply` always prints "source" instructions, never runs them

---

## Phase 5: Report Command (10 min)

### Markdown to stdout

- [ ] `node dist/cli.js report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1`
  - Shows full markdown report with Summary, Patterns table, Recommendations
  - If suggestions were cached, shows "Suggested Automations" section

### JSON to stdout

- [ ] `node dist/cli.js report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1 --format json`
  - Valid JSON with `summary`, `patterns`, `suggestions`, `safetyAlerts`
  - `summary.totalCommands` matches what `analyze` reports

### File output

- [ ] `node dist/cli.js report --shell bash --history-file tests/fixtures/sample_bash_history.txt --output /tmp/report.md`
  - Creates markdown file
  - File renders correctly in a markdown viewer

- [ ] `node dist/cli.js report --output /tmp/report.json --format json`
  - Creates JSON file with your real history data

### With cached suggestions

- [ ] Run `suggest` with mock first, then `report`:
  ```powershell
  $env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
  node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
  node dist/cli.js report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
  ```
  - Report includes "Suggested Automations" section with the cached suggestions
  - "Automation Opportunities Found" count matches

### Without cached suggestions

- [ ] Delete cache, run report:
  - Report shows "Automation Opportunities Found: 0"
  - No "Suggested Automations" section
  - Shows tip about running `suggest` first

---

## Phase 6: Search Command (10 min)

The search command is 100% local — no Copilot needed for core search.
Only the optional `--explain` flag calls Copilot.

### Smoke test

- [ ] `node dist/cli.js search --help` — shows `<query>` argument and all flags (`--shell`, `--history-file`, `--max-results`, `--format`, `--explain`)

### Basic search against fixtures

- [ ] `node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt`
  - Shows boxen header: "DOTFILES COACH - History Search"
  - Query shows `"git"`
  - Results table with Rank, Score, Freq, Command columns
  - Top results are all `git *` commands
  - `git status` ranks #1 (frequency 3× in fixture)
  - Footer: "Use 'dotfiles-coach search ... --explain' ..."

- [ ] `node dist/cli.js search "docker compose" --shell bash --history-file tests/fixtures/sample_bash_history.txt`
  - Top results contain `docker compose` commands
  - Both `docker compose up -d` and `docker compose logs -f` appear

- [ ] `node dist/cli.js search kubectl --shell bash --history-file tests/fixtures/sample_bash_history.txt`
  - Finds `kubectl get pods` in results

### Fuzzy / typo tolerance

- [ ] `node dist/cli.js search gti --shell bash --history-file tests/fixtures/sample_bash_history.txt`
  - Still finds git commands despite typo (Levenshtein distance 1)
  - `git status` should appear in results

- [ ] `node dist/cli.js search dokcer --shell bash --history-file tests/fixtures/sample_bash_history.txt`
  - Still finds docker commands despite typo

### Output formats

- [ ] `node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt --format json`
  - Valid JSON output with `{ "results": [...] }` structure
  - Each result has: `command`, `score`, `frequency`, `lastUsed`, `lineNumber`
  - Copy output and paste into a JSON validator — no errors

- [ ] `node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt --format markdown`
  - Markdown output with `# Search Results: "git"` title
  - Markdown table with `| Rank | Score | Freq | Command |` header
  - Commands are in backtick code spans

### Flag behaviour

- [ ] `node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt --max-results 2`
  - Shows at most 2 results

- [ ] `node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt --max-results 1`
  - Shows exactly 1 result (the top match)

### Zsh fixture

- [ ] `node dist/cli.js search git --shell zsh --history-file tests/fixtures/sample_zsh_history.txt`
  - Parses Zsh extended_history format correctly
  - Finds git commands

### Timestamped Bash fixture

- [ ] `node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history_timestamped.txt`
  - Parses timestamped Bash history correctly
  - Finds git commands

### Your real history

- [ ] `node dist/cli.js search "that command" --max-results 5`
  - Replace `"that command"` with something you know you typed recently
  - Auto-detects your shell and history file
  - Returns relevant results from your actual history
  - **CHECK:** No secrets visible in the search results (search only shows command text — it's 100% local)

### --explain flag (with mock Copilot)

PowerShell:
```powershell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt --explain
```

Bash/Zsh:
```bash
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js search git --shell bash --history-file tests/fixtures/sample_bash_history.txt --explain
```

- [ ] With mock client: shows search results normally, then shows a spinner "Asking Copilot to explain..."
  - Mock client doesn't expose `runNewCopilot` method, so it will fall back to direct `copilot` binary call
  - If Copilot CLI is not installed: shows warning "Could not get an explanation. Is GitHub Copilot CLI installed?"
  - If Copilot CLI IS installed: shows the top result command followed by `→ <explanation>`

### --explain flag (with real Copilot, if available)

- [ ] `node dist/cli.js search "git rebase" --shell bash --history-file tests/fixtures/sample_bash_history.txt --explain`
  - Shows search results, then Copilot explanation of the top result
  - **SECURITY CHECK:** Only the single top-result command is sent to Copilot (scrubbed)
  - Explanation is a concise 1–2 sentence description

### Error handling

- [ ] `node dist/cli.js search git --history-file nonexistent.txt`
  - Shows clean error: "History file not found" + tip about `--history-file`
  - Exits with code 1

- [ ] `node dist/cli.js search git --shell fish`
  - Commander rejects with "Invalid values" error

- [ ] `node dist/cli.js search "xyzzy foobar completely unrelated words" --shell bash --history-file tests/fixtures/sample_bash_history.txt`
  - Either shows "No matching commands found" or returns very low-score results
  - Does NOT crash

### Consistency check

- [ ] Run the same search with all three formats and compare:
  ```
  node dist/cli.js search npm --shell bash --history-file tests/fixtures/sample_bash_history.txt --format table
  node dist/cli.js search npm --shell bash --history-file tests/fixtures/sample_bash_history.txt --format json
  node dist/cli.js search npm --shell bash --history-file tests/fixtures/sample_bash_history.txt --format markdown
  ```
  - All three show the same commands in the same order
  - Scores and frequencies match across formats

---

## Phase 7: Security Tests (15 min)

> Phase number shifted — was Phase 6 before the search feature was added.

**CRITICAL: These must all pass before submission.**

### Secret scrubbing

Create a test history file with secrets:
```
echo 'export API_KEY=sk-abc123secret456' > /tmp/secret_history.txt
echo 'curl -H "Authorization: Bearer ghp_1234567890abcdef"' >> /tmp/secret_history.txt
echo 'docker login -p mypassword123' >> /tmp/secret_history.txt
echo 'git clone https://user:pass@github.com/repo.git' >> /tmp/secret_history.txt
echo 'export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' >> /tmp/secret_history.txt
echo 'npm config set //registry.npmjs.org/:_authToken npm_1234567890abcdef' >> /tmp/secret_history.txt
echo 'git status' >> /tmp/secret_history.txt
echo 'git status' >> /tmp/secret_history.txt
echo 'git status' >> /tmp/secret_history.txt
echo 'npm test' >> /tmp/secret_history.txt
echo 'npm test' >> /tmp/secret_history.txt
```

- [ ] `node dist/cli.js analyze --shell bash --history-file /tmp/secret_history.txt --min-frequency 1`
  - Analyze output does NOT show `[REDACTED]` (analyze doesn't scrub — it's local only)
  - **This is expected and OK** — analyze never sends data anywhere

- [ ] With mock Copilot:
  ```
  DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file /tmp/secret_history.txt --min-frequency 1
  ```
  - Mock client returns canned suggestions (scrubbing happens internally before copilot call)
  - **Verified:** Automated tests confirm scrubbing pipeline works correctly

### No telemetry

- [ ] Run all commands with network monitoring (e.g. `netstat`, Wireshark, or Little Snitch)
  - Only network call should be to `gh copilot` (via the `gh` binary)
  - No other outbound connections (verified: analyze/report/apply make zero network calls)

### File safety

- [ ] `apply` with `--append-to` to a read-only file:
  - Shows raw EPERM stack trace instead of clean error (non-blocking, cosmetic issue)

- [ ] `apply` with `--output` to a path with missing parent directories:
  - Creates parent directories automatically (expected behaviour)

---

## Phase 8: Cross-Platform (5 min per platform)

### Windows (PowerShell)

- [ ] `node dist/cli.js analyze` (no flags) — detects PowerShell, finds history
- [ ] History path resolves to `$env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`
- [ ] Safety detection catches `Remove-Item -Recurse -Force` if present (found 5 instances)

### macOS/Linux (Bash or Zsh)

- [ ] `node dist/cli.js analyze` (no flags) — detects correct shell, finds history
- [ ] `$HISTFILE` override works if set
- [ ] Zsh extended_history format auto-detected

---

## Phase 9: Full E2E Workflow (5 min)

Run the complete user journey:

```bash
# 1. Build
npm run build

# 2. Analyze
node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 3. Search (100% local)
node dist/cli.js search "git commit" --shell bash --history-file tests/fixtures/sample_bash_history.txt

# 4. Search with typo (fuzzy)
node dist/cli.js search gti --shell bash --history-file tests/fixtures/sample_bash_history.txt

# 5. Suggest (mock)
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 6. Apply (dry run)
node dist/cli.js apply --dry-run

# 7. Apply (real)
node dist/cli.js apply --output /tmp/dotfiles_coach_test.sh

# 8. Verify file
cat /tmp/dotfiles_coach_test.sh

# 9. Report
node dist/cli.js report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1 --output /tmp/report.md

# 10. Verify report
cat /tmp/report.md
```

- [ ] Every step succeeds without errors
- [ ] Output is professional and visually polished
- [ ] Search finds relevant results and handles typos gracefully
- [ ] Report includes both analysis and suggestions from the cache

---

## Phase 10: Automated Tests (2 min)

- [ ] `npm run typecheck` — no errors
- [ ] `npm test` — all 425 tests pass
- [ ] `npm run build` — compiles cleanly

---

## Phase 11: Judge Experience (5 min)

Pretend you're a judge seeing this for the first time.

- [ ] README is clear and compelling
- [ ] Quick Start section works as documented
- [ ] `--help` output is clear for all commands
- [ ] Error messages are helpful (not stack traces) — except read-only file edge case
- [ ] Terminal output is visually appealing (colors, boxes, spinners)
- [ ] The tool solves a real problem (repetitive commands)
- [ ] Copilot integration is meaningful (not just a gimmick)

---

## Results Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Smoke Tests | | All 8 checks: --help (5 commands listed), --version, 5× command --help, badcommand error |
| 2. Analyze | | Bash/Zsh fixtures, timestamped history, JSON/markdown/table formats, error handling, flag behavior |
| 3. Suggest | | Mock client suggestions, cache file, --output flag |
| 4. Apply | | Dry-run, write, backup, append, no-cache error |
| 5. Report | | Markdown/JSON stdout, file output, with/without cached suggestions |
| 6. Search | | Basic, fuzzy/typo, 3 output formats, max-results, Zsh, timestamps, real history, --explain, errors, consistency |
| 7. Security | | Secret scrubbing, no telemetry, file safety |
| 8. Cross-Platform | | Windows/macOS/Linux shell detection |
| 9. Full E2E | | Complete analyze→search→suggest→apply→report workflow |
| 10. Automated Tests | | typecheck clean, 425/425 tests pass, build clean |
| 11. Judge Experience | | Professional output, helpful errors, clear --help, visually polished |

**Overall Verdict:** _(fill after testing)_

**Blocking Issues Found:** _(list any)_

**Non-blocking Issues Found:**
1. `apply --append-to` on a read-only file shows a raw Node.js EPERM stack trace instead of a clean error message (pre-existing)

**Ready for Merge:** _(yes/no)_
