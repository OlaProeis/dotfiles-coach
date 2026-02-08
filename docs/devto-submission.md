---
title: "Dotfiles Coach: Your Shell History is Full of Automation Gold (You Just Don't Know It Yet)"
published: false
tags: devchallenge, githubchallenge, cli, githubcopilot
---

*This is a submission for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21)*

## What I Built

**[Dotfiles Coach](https://github.com/OlaProeis/dotfiles-coach)** is a CLI tool that mines your shell history for repeated patterns and uses GitHub Copilot CLI to generate smart aliases, functions, and safety improvements -- tailored to *your* actual workflow.

Every developer types the same commands hundreds of times. `git add . && git commit -m "..." && git push`. `docker compose up -d && docker compose logs -f`. `cd ~/projects/thing && npm run dev`. We all know we *should* create aliases and shell functions for these, but who has the time to audit their own history?

Dotfiles Coach does it for you:

1. **`analyze`** -- Reads your shell history (Bash, Zsh, or PowerShell) and identifies the most repeated command patterns using frequency analysis with Levenshtein-based grouping. It also flags dangerous commands like `rm -rf` without safeguards, `chmod 777`, or `sudo` with wildcards. This step is 100% local -- no network, no AI.

2. **`suggest`** -- Takes the top patterns, scrubs all secrets locally, and sends them to `gh copilot suggest` to generate shell-specific aliases, functions, and one-liners. This is where Copilot shines -- it understands your workflow context and produces suggestions that actually make sense for *your* habits.

3. **`apply`** -- Writes approved suggestions to a dedicated shell config file (`~/.dotfiles_coach_aliases.sh` or `~/.dotfiles_coach_profile.ps1`). It creates backups automatically, supports dry-run previews, and **never** auto-sources anything -- you stay in control.

4. **`report`** -- Generates a shareable Markdown or JSON report combining analysis results and Copilot suggestions. Great for documentation or team sharing.

### Why I built this

I realized I was typing `git status`, `git add .`, `git commit -m` as three separate commands dozens of times a day. My `.zshrc` was a graveyard of aliases I copied from Stack Overflow that didn't match how I actually work. I wanted something that looks at *my* real behavior and suggests automation that fits *me* -- and I wanted Copilot to be the brain behind those suggestions.

### Privacy-first design

The part I'm most proud of: **mandatory secret scrubbing**. Before any shell history data touches Copilot, it passes through 13 regex-based filters that catch passwords, API tokens, SSH keys, AWS credentials, GitHub/GitLab/npm tokens, Bearer headers, URLs with embedded credentials, `npm config set` auth commands, Base64 blobs, and more. Every match is replaced with `[REDACTED]`. This layer cannot be disabled -- it's architecturally enforced, not opt-in.

![Privacy Flow](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/privacy-flow.png)

### The numbers

- **291 automated tests** across 20 test files
- **13 secret-scrubbing patterns** (all unit tested)
- **Multi-shell support** -- Bash, Zsh, and PowerShell with auto-detection
- **3-tier response parser** for Copilot output (JSON fences, raw JSON, regex fallback)
- **Zero API tokens required** -- piggybacks on your existing `gh auth` session

## Demo

**GitHub repo:** [https://github.com/OlaProeis/dotfiles-coach](https://github.com/OlaProeis/dotfiles-coach)

### How it works

![Dotfiles Coach Workflow](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/workflow.png)

### Quick start

```bash
# Install
git clone https://github.com/OlaProeis/dotfiles-coach.git
cd dotfiles-coach
npm install && npm run build

# 1. Analyze your shell history (100% offline)
node dist/cli.js analyze

# 2. Get Copilot-powered suggestions
node dist/cli.js suggest

# 3. Preview what would be written (dry-run)
node dist/cli.js apply --dry-run

# 4. Apply suggestions to a file
node dist/cli.js apply

# 5. Generate a report
node dist/cli.js report --output report.md
```

### Try it without Copilot (mock mode)

You can test the full pipeline without a Copilot subscription using bundled fixture data:

```bash
# PowerShell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
node dist/cli.js analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
node dist/cli.js apply --dry-run

# Bash/Zsh
DOTFILES_COACH_USE_MOCK_COPILOT=1 node dist/cli.js suggest --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1
```

### Architecture

![Dotfiles Coach Architecture](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/architecture.png)

The pipeline flows through clearly separated layers: **parsers** (one per shell) feed into **analyzers** (frequency + safety), which are scrubbed by the **secret scrubber**, then passed to the **Copilot client** (real or mock), and finally formatted by **formatters** (table, markdown, JSON) or written safely by **file operations**.

### Tech stack

| Area | Choice |
|------|--------|
| Runtime | Node.js 18+ (ESM) |
| Language | TypeScript (strict mode) |
| CLI framework | `commander` |
| Terminal UI | `chalk`, `ora`, `boxen` |
| Copilot integration | `execa` wrapping `gh copilot suggest` |
| String similarity | `fast-levenshtein` |
| File I/O | `fs-extra` |
| Tests | `vitest` (291 tests) |

## My Experience with GitHub Copilot CLI

### How Copilot CLI powers the tool itself

Dotfiles Coach doesn't use an npm SDK or REST API for Copilot -- there isn't one for Copilot CLI. Instead, it wraps `gh copilot suggest` as a child process via `execa`:

```typescript
const result = await execa('gh', ['copilot', subcommand, prompt], {
  timeout: 30_000,
  env: { ...process.env, GH_PROMPT_DISABLED: '1' },
});
```

The tool builds structured prompts from your history patterns (frequency data, command sequences, shell type) and sends them to Copilot. Copilot's response is then parsed through a 3-tier strategy:

1. **JSON extraction from markdown fences** -- Copilot often wraps structured output in ` ```json ` blocks
2. **Raw JSON detection** -- Sometimes it returns bare JSON arrays
3. **Regex fallback** -- For conversational responses, we extract suggestions via pattern matching

This approach was born out of necessity: Copilot CLI's output format isn't guaranteed to be machine-readable, so the parser had to be resilient.

### How Copilot CLI helped during development

Beyond being *in* the tool, Copilot CLI was my constant companion *building* the tool. Some examples:

**Designing the secret scrubber:**
I used `gh copilot suggest` to brainstorm regex patterns for detecting secrets in shell history. Copilot caught edge cases I hadn't considered -- like AWS access keys always starting with `AKIA`, or GitLab tokens starting with `glpat-`. The final scrubber has 13 battle-tested patterns.

**Shell compatibility:**
When implementing PowerShell history parsing (which stores plain-text commands in `ConsoleHost_history.txt` via PSReadLine, a different location and convention than Bash/Zsh `~/.bash_history`), Copilot CLI helped me understand the format differences and platform-specific path resolution logic.

**Safety rules:**
The dangerous pattern detection module flags commands like `rm -rf /` without `-i`, `chmod 777`, `sudo` with wildcards, and unquoted variable expansion in `rm` commands. Copilot helped me think through edge cases -- like catching `rm -rfi` (which *does* have `-i`) versus `rm -rf` (which doesn't).

### What surprised me

The biggest surprise was how well Copilot CLI handles *context*. When I feed it a set of command patterns like:

```
git add . (47 times)
git commit -m "..." (45 times)
git push origin main (38 times)
```

It doesn't just suggest three separate aliases -- it recognizes the *sequence* and suggests a single `gcp` function that does all three with a commit message argument. That kind of workflow-aware intelligence is what makes this tool genuinely useful rather than just a fancy `alias` generator.

### The testing story

With 291 tests across 20 files, testability was a core design goal. The `MockCopilotClient` returns canned fixture data, which means:

- Every test runs without network access
- CI/CD doesn't need Copilot credentials
- Contributors can run the full suite without a subscription
- The mock is toggled by a single env var: `DOTFILES_COACH_USE_MOCK_COPILOT=1`

This pattern made development incredibly fast -- I could iterate on the suggestion formatting, caching, and apply logic without hitting Copilot every time.

---

**Try it out:** [github.com/OlaProeis/dotfiles-coach](https://github.com/OlaProeis/dotfiles-coach)

Your shell history is full of automation gold. Let Copilot help you find it.
