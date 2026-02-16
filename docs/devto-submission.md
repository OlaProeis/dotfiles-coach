---
title: "Dotfiles Coach: AI-Powered Shell Automation From Your Command History"
published: false
tags: devchallenge, githubchallenge, cli, githubcopilot
---

*This is a submission for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21)*

## What I Built

**[Dotfiles Coach](https://github.com/OlaProeis/dotfiles-coach)** is a CLI tool that digs through your shell history, finds the commands you type over and over, and uses GitHub Copilot CLI to generate aliases and functions tailored to how *you* actually work.

We all type the same things hundreds of times a day. `git add . && git commit -m "..." && git push`. `docker compose up -d && docker compose logs -f`. You know you should make aliases for these, but who actually sits down and audits their own history?

That's what Dotfiles Coach does. It has six main features:

**`analyze`** reads your shell history (Bash, Zsh, or PowerShell) and finds the most repeated patterns. It also flags dangerous commands like `rm -rf` without safeguards. This runs 100% locally, no network needed.

**`search`** lets you find forgotten commands by describing what they did. "That docker compose command from last week" or "kubernetes pods" and it returns ranked matches using fuzzy and keyword matching. Also completely local.

**`suggest`** takes your top patterns, scrubs any secrets out of them, and sends them to Copilot CLI to generate shell-specific aliases and functions. This is where Copilot really shines. It understands your workflow context and produces suggestions that actually make sense for your habits.

**`suggest --interactive`** launches a full terminal UI where you can scroll through suggestions, approve or ignore each one, and even open them in your editor to tweak the code before applying. Built with ink (React for terminals).

**`apply`** writes your approved suggestions to a config file. It creates backups, supports dry-run previews, and never auto-sources anything. You stay in control.

**`report`** generates a shareable Markdown or JSON report combining everything.

![Dotfiles Coach Workflow](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/workflow.png)

### Why I built this

I was typing `git status`, `git add .`, `git commit -m` as three separate commands dozens of times a day. My `.zshrc` was full of aliases I copied from Stack Overflow that didn't match how I actually work. I wanted something that looks at my real behavior and suggests automation that fits me, with Copilot as the brain behind those suggestions.

### The search feature

This was one of the later additions and quickly became my favorite. Ever typed a really useful command three weeks ago and have no idea what it was? Instead of scrolling through thousands of history lines or piping `history | grep`, you just:

```bash
dotfiles-coach search "that ffmpeg command"
```

It tokenizes your query and every command in your history, then scores them with a weighted mix of exact keyword overlap (50%), fuzzy Levenshtein matching (20%), substring/prefix matching (20%), frequency (5%), and recency (5%). Top results come back ranked in a clean table.

![Search Pipeline](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/search-flow.png)

If you add `--explain`, it sends just the top result (scrubbed of secrets first) to Copilot for a plain-English explanation of what the command does.

### The interactive TUI

When you run `suggest --interactive` or `apply --interactive`, you get a scrollable terminal UI instead of a wall of text. You can:

- Arrow through suggestions one by one
- Press Enter to mark one for apply, or Space to ignore it
- Press `e` to open the code in your editor, edit it, and come back
- Press `a` to approve everything, or `q` to finish

The TUI re-renders after each editor session so you can keep reviewing. If you're in a CI pipeline or piping output, it falls back to non-interactive mode automatically.

### Privacy-first design

The part I'm most proud of: mandatory secret scrubbing. Before any shell history data touches Copilot, it passes through 13 regex filters that catch passwords, API tokens, SSH keys, AWS credentials, GitHub/GitLab/npm tokens, Bearer headers, URLs with embedded credentials, and more. Every match gets replaced with `[REDACTED]`. This layer cannot be disabled. It's architecturally enforced, not opt-in.

![Privacy Flow](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/privacy-flow.png)

### The numbers

- **425 automated tests** across 22 test files
- **13 secret-scrubbing patterns** (all unit tested)
- **6 commands**: analyze, search, suggest, apply, report, plus the interactive TUI
- **Multi-shell**: Bash, Zsh, and PowerShell with auto-detection
- **Zero API tokens needed**: uses your existing Copilot CLI authentication

## Demo

**GitHub repo:** [github.com/OlaProeis/dotfiles-coach](https://github.com/OlaProeis/dotfiles-coach)

You can try the full pipeline without a Copilot subscription. Everything uses bundled sample data:

```bash
git clone https://github.com/OlaProeis/dotfiles-coach.git
cd dotfiles-coach
npm install && npm run build && npm link

# Analyze (100% local)
dotfiles-coach analyze --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# Search (100% local)
dotfiles-coach search "docker" --shell bash --history-file tests/fixtures/sample_bash_history.txt

# Suggest (needs Copilot, or use mock mode below)
dotfiles-coach suggest --interactive --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1

# Apply (dry run, no files modified)
dotfiles-coach apply --interactive --dry-run

# Report
dotfiles-coach report --shell bash --history-file tests/fixtures/sample_bash_history.txt --min-frequency 1 --output report.md
```

No Copilot installed? Set the mock flag first:

```bash
# Bash/Zsh
export DOTFILES_COACH_USE_MOCK_COPILOT=1

# PowerShell
$env:DOTFILES_COACH_USE_MOCK_COPILOT = "1"
```

Then run the suggest and report commands above. The mock returns realistic sample suggestions so you can see the full flow.

### Architecture

![Dotfiles Coach Architecture](https://raw.githubusercontent.com/OlaProeis/dotfiles-coach/main/docs/images/architecture.png)

The pipeline flows through clearly separated layers. Parsers (one per shell) feed into analyzers (frequency + safety), which are scrubbed by the secret scrubber, then passed to the Copilot client (real or mock), and finally formatted for output or written safely to config files. The search module sits alongside as a separate branch that goes straight from the parser to the tokenizer/scorer without touching Copilot at all.

### Tech stack

| Area | Choice |
|------|--------|
| Runtime | Node.js 18+ (ESM) |
| Language | TypeScript (strict mode) |
| CLI framework | commander |
| Terminal UI | chalk, ora, boxen, ink |
| Copilot integration | execa wrapping `copilot -p -s` |
| Fuzzy matching | fast-levenshtein |
| File I/O | fs-extra |
| Tests | vitest (425 tests) |

## My Experience with GitHub Copilot CLI

### How Copilot CLI powers the tool

Dotfiles Coach wraps the standalone Copilot CLI as a child process. The new CLI supports a scripting mode with `-p` (non-interactive), `-s` (silent, output only), and `--allow-all` (skip permission prompts). That combination is perfect for piping structured prompts in and getting clean responses back.

```typescript
const result = await execa('copilot', ['-p', prompt, '-s', '--allow-all'], {
  timeout: 30_000,
});
```

The tool builds structured prompts from your history patterns (frequency data, command sequences, shell type) and sends them to Copilot. The response gets parsed through a 3-tier strategy:

1. JSON extraction from markdown fences, since Copilot often wraps output in code blocks
2. Raw JSON detection for when it returns bare arrays
3. Regex fallback for conversational responses

This approach was born out of necessity. Copilot's output format isn't guaranteed to be machine-readable, so the parser had to be resilient.

### How Copilot CLI helped during development

Beyond being in the tool, Copilot CLI was a constant companion while building it.

When designing the secret scrubber, I used Copilot to brainstorm regex patterns for detecting secrets in shell history. It caught edge cases I hadn't considered, like AWS access keys always starting with `AKIA`, or GitLab tokens starting with `glpat-`. The final scrubber has 13 battle-tested patterns.

For the search scoring algorithm, Copilot helped me think through the weighting system. Getting the balance right between exact matches, fuzzy matches, and recency took a few iterations, and having Copilot suggest approaches for the Levenshtein threshold tuning saved a lot of trial and error.

### What surprised me

The biggest surprise was how well Copilot handles context. When I feed it a set of command patterns like:

```
git add . (47 times)
git commit -m "..." (45 times)
git push origin main (38 times)
```

It doesn't just suggest three separate aliases. It recognizes the sequence and suggests a single `gcp` function that does all three with a commit message argument. That kind of workflow-aware intelligence is what makes this tool genuinely useful rather than just a fancy alias generator.

### The testing story

With 425 tests across 22 files, testability was a core design goal. The `MockCopilotClient` returns canned fixture data, which means every test runs without network access, CI doesn't need Copilot credentials, and contributors can run the full suite without a subscription. The mock is toggled by a single env var: `DOTFILES_COACH_USE_MOCK_COPILOT=1`.

This pattern made development fast. I could iterate on suggestion formatting, caching, and apply logic without hitting Copilot every time.

---

**Try it out:** [github.com/OlaProeis/dotfiles-coach](https://github.com/OlaProeis/dotfiles-coach)

Your shell history is full of automation gold. Let Copilot help you find it.
