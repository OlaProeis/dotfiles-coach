# Product Requirements Document: RAG, Team Dotfiles & TUI

**Version:** 1.0  
**Date:** February 9, 2026  
**Status:** Draft  
**Parent:** Dotfiles Coach (`docs/prd.md`) — extension features

---

## Executive Summary

This document defines three new capabilities for **Dotfiles Coach**:

1. **RAG for shell history** — Semantic (or semantic-style) search over the user’s shell history so they can find past commands by description (e.g. “that ffmpeg command to convert video”).
2. **Team Dotfiles Coach** — Export anonymized, team-friendly aliases and functions derived from analysis so teams can share onboarding shortcuts.
3. **Interactive TUI** — An in-terminal UI for browsing, editing, applying, or ignoring suggestions (arrow keys, Enter, Space) instead of plain CLI output.

All three are **CLI-only**; no MCP or server component. Team and TUI keep the existing Copilot-powered `suggest` pipeline; RAG is a local search feature with an optional Copilot “explain” hook.

---

## Scope & Copilot Usage

| Feature           | Uses GitHub Copilot CLI? | Notes |
|-------------------|--------------------------|--------|
| RAG / search      | Optional                 | Core search is local. Optional: “explain this command” via Copilot. |
| Team Dotfiles     | Yes                      | Same analyze → suggest (Copilot) → anonymize → export. |
| Interactive TUI   | Yes                      | Same suggest pipeline; TUI is the front-end. |

---

## Feature 1: RAG for Shell History

### Problem

Users forget exact commands or flags. They remember intent (“convert video with ffmpeg”, “that long kubectl one”) but not the literal string. Current `analyze` is frequency-based, not intent-based search.

### User Stories

- As a user, I want to search my history by **natural-language-style query** so I can find a command I used weeks ago without remembering the exact syntax.
- As a user, I want results **ranked by relevance** to my query, not only by frequency, so the best match appears first.

### Acceptance Criteria

- **CLI surface:** New command or subcommand, e.g. `dotfiles-coach search "<query>"` or `dotfiles-coach suggest --search "query"`.
- **Input:** One required argument: the search query (string). Optional: `--shell`, `--history-file`, `--max-results <n>` (default e.g. 10).
- **Output:** List of matching commands (and optionally context: timestamp, frequency) in a readable format (table or markdown). At least one output format (e.g. `--format table`).
- **Search behavior:**
  - **V1 (MVP):** Keyword / fuzzy text matching over parsed history (e.g. tokenize query and history, score by overlap + Levenshtein). No external API; reuses existing parsers and history loading.
  - **V2 (optional):** Local embeddings (e.g. small sentence-transformers-style model via a lightweight library) + cosine similarity for semantic ranking. Still 100% local; no Copilot for the search itself.
- **Optional Copilot integration:** If `--explain` is passed, for the top result (or a user-selected index), call Copilot CLI to “explain this command in one sentence” and append to output. Keeps RAG usable without Copilot while showcasing Copilot for explanation.
- **Performance:** Search over the same history window as `analyze` (e.g. last 5,000 lines by default) with configurable limit; response time target &lt; 5s for typical history size on V1.

### Technical Notes

- Reuse: `history-paths`, `shell-detect`, Bash/Zsh/PowerShell parsers, `readFile` + line limit.
- New module: `src/search/` or `src/commands/search.ts` with a scorer (keyword + optional Levenshtein). Optional: `src/search/embeddings.ts` for V2 with a local model.
- Secret scrubbing: **Do not** send full history to Copilot. If `--explain` is used, send only the single scrubbed command string in the prompt.
- No new dependencies for V1 (use existing `fast-levenshtein` and string utils). V2 may add a small embedding dependency (e.g. `@xenova/transformers` or similar); document and keep optional.

### CLI Specification (draft)

```text
dotfiles-coach search <query> [OPTIONS]

Options:
  --shell <bash|zsh|powershell|auto>   Default: auto
  --history-file <path>               Override history file
  --max-results <n>                   Default: 10
  --format <table|json|markdown>      Default: table
  --explain                           Use Copilot to explain top result (optional)
```

---

## Feature 2: Team Dotfiles Coach

### Problem

Teams have tribal knowledge: “run this Gradle command with these flags,” “we use this alias for our deploy.” New joiners don’t have it. Sharing full personal dotfiles is noisy and may expose machine-specific paths or habits.

### User Stories

- As a team lead, I want to **export anonymized automation suggestions** so new developers can get the same aliases and functions without sharing private history.
- As a developer, I want to **import a team-aliases file** so I can source it and get the team’s common shortcuts.

### Acceptance Criteria

- **CLI surface:** New command or mode, e.g. `dotfiles-coach export-team [OPTIONS]` or `dotfiles-coach suggest --team` that produces a team-oriented export.
- **Pipeline:** Run the same flow as today: analyze → suggest (Copilot) → then **anonymize** → write to a team file. Copilot is used exactly as in current `suggest`.
- **Anonymization (mandatory):**
  - Replace user-specific paths (e.g. `~/projects/myapp`, `C:\Users\jane\...`) with placeholders (e.g. `~/projects/<PROJECT>`, `<HOME>\...`).
  - Strip usernames, hostnames, and repo names from suggested code/comments where detectable.
  - Do not include raw history lines; only Copilot-generated alias/function/script text after anonymization.
- **Output:** A single file (e.g. `team-aliases.sh` for Bash/Zsh, `team-aliases.ps1` for PowerShell) with:
  - Header comment: “Generated by Dotfiles Coach (team export). Anonymized. Review before use.”
  - One block per suggestion: comment with pattern description (anonymized), then code.
  - Option to output to stdout or `--output <file>`.
- **Options:** `--shell`, `--history-file`, `--min-frequency`, `--output`, `--dry-run`. Reuse existing suggest cache behavior or run suggest internally and then anonymize.
- **Safety:** Anonymization runs **after** secret scrubbing; no secrets in team export. Document that teams should review the file before committing to a repo.

### Technical Notes

- New module: `src/utils/anonymizer.ts` (or `src/analyzers/anonymize.ts`) with rules: path placeholders, strip known username/hostname patterns. May need a small allowlist of placeholder names (e.g. `<PROJECT>`, `<HOME>`).
- Reuse: full `analyze` + `suggest` pipeline (Copilot client, prompts, response parser), then pass suggestions through anonymizer and format for team output.
- Formatter: reuse or extend markdown/shell formatting to write valid `.sh` / `.ps1` with comments.

### CLI Specification (draft)

```text
dotfiles-coach export-team [OPTIONS]

Options:
  --shell <bash|zsh|powershell|auto>   Default: auto
  --history-file <path>
  --min-frequency <n>                  Default: 5
  --output <file>                     Default: team-aliases.sh / team-aliases.ps1
  --dry-run                           Print anonymized result to stdout without writing
```

---

## Feature 3: Interactive TUI Mode

### Problem

Current flow is: run `suggest`, read long stdout, then run `apply` (all or nothing from cache). Users want to **choose** which suggestions to apply, **edit** them, and **ignore** others without editing config by hand.

### User Stories

- As a user, I want to **see suggestions in an interactive list** so I can scroll and focus on one at a time.
- As a user, I want to **press Enter to apply** (or “add to apply list”), **Space to ignore** (and optionally “ignore this pattern forever”), and **E to edit** the suggestion before applying.
- As a user, I want the TUI to **use the same Copilot-backed suggestions** as the non-interactive flow so behavior is consistent.

### Acceptance Criteria

- **CLI surface:** Existing commands gain an interactive mode, e.g. `dotfiles-coach suggest --interactive` and/or `dotfiles-coach apply --interactive`. If `apply --interactive` is used without prior suggest, run suggest internally first (same as current apply when cache exists).
- **Flow:**
  1. Run analysis + suggest (Copilot) — same as today; optionally show a “Generating suggestions…” state in the TUI.
  2. Display list of suggestions in the TUI (title/pattern, type, code preview).
  3. Keys: **Up/Down** — move selection; **Enter** — mark for apply (or apply immediately, design choice); **Space** — ignore (and optionally persist to “ignore list”); **E** — open editor to edit the suggested code; **Q** — quit (and optionally run apply for selected, or just exit).
  4. On “apply”, write only the selected suggestions to the same target as current `apply` (e.g. `~/.dotfiles_coach_aliases.sh`), with same backup/dry-run semantics if exposed.
- **Tech stack:** Use a terminal UI library such as **ink** (React for CLI) or **blessed** / **blessed-contrib**. Choice should support: list, focus, key handling, optional inline editor or `$EDITOR` launch.
- **Fallback:** If TUI cannot start (e.g. not a TTY, CI), fall back to non-interactive output and print a one-line note that interactive mode was skipped.
- **Accessibility:** Ensure key bindings are documented in `--help` and in the TUI (e.g. footer: “↑/↓ move, Enter apply, Space ignore, E edit, Q quit”).

### Technical Notes

- New entry: e.g. `src/commands/suggest-interactive.ts` and/or `src/tui/` with components for list, detail view, and key handling. The “apply” step can reuse existing `apply` logic (read suggestions from cache or from in-memory selection, then write).
- “Ignore forever”: optional file e.g. `~/.config/dotfiles-coach/ignored-patterns.json` (pattern strings or hashes). Future `suggest` runs filter these out before display. Can be V1 or follow-up.
- Copilot: **fully used** — same `runSuggest` path; only the presentation layer changes from stdout to TUI.
- Dependencies: add `ink` (and possibly `react` if not already present) or `blessed`; document in README and keep bundle size reasonable.

### CLI Specification (draft)

```text
dotfiles-coach suggest --interactive [OPTIONS]
dotfiles-coach apply --interactive [OPTIONS]

(Other options inherited from suggest/apply: --shell, --history-file, --min-frequency,
 --output, --dry-run, --no-backup, etc.)
```

---

## Non-Goals (this PRD)

- **MCP server:** Not in scope for this PRD; can be a later initiative.
- **RAG using Copilot for search:** Core search is local; Copilot is optional for “explain” only.
- **Multi-user or server-side team aggregation:** Team export is one-user → one file; no server or shared database.
- **TUI for analyze or report:** TUI is for suggest/apply only in this version.

---

## Implementation Order (suggested)

1. **Team Dotfiles** — Reuses pipeline; adds anonymizer + export. Small surface; clear Copilot usage.
2. **RAG search (V1)** — New command, keyword/fuzzy only; no new heavy deps. Optional `--explain` in a second step.
3. **TUI** — New dependency and UI layer; build on top of stable suggest/apply so behavior is consistent.

---

## Success Metrics

- **RAG:** Users can run `dotfiles-coach search "ffmpeg convert"` and get relevant past commands in &lt; 5s.
- **Team:** Users can run `dotfiles-coach export-team --output team-aliases.sh` and get a reviewable, anonymized shell file with no user paths or secrets.
- **TUI:** Users can run `dotfiles-coach suggest --interactive`, move through suggestions with keyboard, and apply or ignore without editing files by hand.

---

## References

- Main product PRD: `docs/prd.md`
- Current commands: `src/cli.ts`, `src/commands/`
- Copilot integration: `src/copilot/client.ts`, `src/copilot/prompts.ts`
- Secret scrubbing: `src/utils/secret-scrubber.ts` (must remain in pipeline before any Copilot call)
