# Manual Test Plan: Dotfiles Coach

> Run these tests before submission. Check each box as you go.
> Requires: `npm run build` first.

---

## Phase 1: Smoke Tests (5 min)

Quick sanity checks that the CLI boots and responds.

- [ ] `node dist/cli.js --help` — shows all 4 commands
- [ ] `node dist/cli.js --version` — prints `0.1.0`
- [ ] `node dist/cli.js analyze --help` — shows all analyze flags
- [ ] `node dist/cli.js suggest --help` — shows all suggest flags
- [ ] `node dist/cli.js apply --help` — shows all apply flags
- [ ] `node dist/cli.js report --help` — shows all report flags
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

## Phase 6: Security Tests (15 min)

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
  - Suggestions show `[REDACTED]` for secret values in pattern descriptions
  - **CHECK:** The mock client received scrubbed patterns (add temp logging if needed)

### No telemetry

- [ ] Run all commands with network monitoring (e.g. `netstat`, Wireshark, or Little Snitch)
  - Only network call should be to `gh copilot` (via the `gh` binary)
  - No other outbound connections

### File safety

- [ ] `apply` with `--append-to` to a read-only file:
  - Shows a clean error, doesn't crash

- [ ] `apply` with `--output` to a path with missing parent directories:
  - Creates parent directories automatically (expected behaviour)

---

## Phase 7: Cross-Platform (5 min per platform)

### Windows (PowerShell)

- [ ] `node dist/cli.js analyze` (no flags) — detects PowerShell, finds history
- [ ] History path resolves to `$env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`
- [ ] Safety detection catches `Remove-Item -Recurse -Force` if present

### macOS/Linux (Bash or Zsh)

- [ ] `node dist/cli.js analyze` (no flags) — detects correct shell, finds history
- [ ] `$HISTFILE` override works if set
- [ ] Zsh extended_history format auto-detected

---

## Phase 8: Full E2E Workflow (5 min)

Run the complete user journey:

```bash
# 1. Build
npm run build

# 2. Analyze
node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 3. Suggest (mock)
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# 4. Apply (dry run)
node dist/cli.js apply --dry-run

# 5. Apply (real)
node dist/cli.js apply --output /tmp/dotfiles_coach_test.sh

# 6. Verify file
cat /tmp/dotfiles_coach_test.sh

# 7. Report
node dist/cli.js report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1 --output /tmp/report.md

# 8. Verify report
cat /tmp/report.md
```

- [ ] Every step succeeds without errors
- [ ] Output is professional and visually polished
- [ ] Report includes both analysis and suggestions from the cache

---

## Phase 9: Automated Tests (2 min)

- [ ] `npm run typecheck` — no errors
- [ ] `npm test` — all 290 tests pass
- [ ] `npm run build` — compiles cleanly

---

## Phase 10: Judge Experience (5 min)

Pretend you're a judge seeing this for the first time.

- [ ] README is clear and compelling
- [ ] Quick Start section works as documented
- [ ] `--help` output is clear for all commands
- [ ] Error messages are helpful (not stack traces)
- [ ] Terminal output is visually appealing (colors, boxes, spinners)
- [ ] The tool solves a real problem (repetitive commands)
- [ ] Copilot integration is meaningful (not just a gimmick)

---

## Results Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Smoke Tests | | |
| 2. Analyze | | |
| 3. Suggest | | |
| 4. Apply | | |
| 5. Report | | |
| 6. Security | | |
| 7. Cross-Platform | | |
| 8. Full E2E | | |
| 9. Automated Tests | | |
| 10. Judge Experience | | |

**Overall Verdict:** _______

**Blocking Issues Found:** _______

**Ready for Submission:** Yes / No
