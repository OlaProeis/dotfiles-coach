# Testing Without Real Copilot Calls

**Goal:** Build and test Dotfiles Coach on the free Copilot plan without burning real `gh copilot` API calls.

## Strategy

### 1. Copilot client abstraction

- **Interface:** Define a `CopilotClient` interface (e.g. `generateSuggestions(patterns, shell)`, `analyzeSafety(commands, shell)`).
- **Real implementation:** Wraps `gh copilot` via `child_process` / `execa`. Used only when explicitly enabled.
- **Mock implementation:** Returns canned JSON from fixture files. Used by default in tests and optional in local dev.

### 2. When each implementation is used

| Context        | Implementation   | How |
|----------------|------------------|-----|
| **Unit / integration tests** | Always mock | Test harness injects `MockCopilotClient`; no `gh` calls. |
| **Local dev (default)**      | Mock (optional) | Set `DOTFILES_COACH_USE_MOCK_COPILOT=1` to use fixture responses. |
| **Local dev (real Copilot)** | Real            | Unset the env var (or `=0`); requires `gh copilot` auth. |
| **CI**                       | Mock            | Env set in CI so builds/tests never call Copilot. |

### 3. Fixture layout

```
tests/
  fixtures/
    copilot_responses/
      suggest_bash.json      # Canned response for suggestion (Bash) prompts
      suggest_powershell.json
      safety_alerts.json    # Canned response for safety analysis prompts
```

Mock client reads these files and returns parsed `Suggestion[]` or `SafetyAlert[]` so the rest of the app (suggest, apply, report) can be tested end-to-end without Copilot.

### 4. Env var

- **`DOTFILES_COACH_USE_MOCK_COPILOT=1`**  
  Use mock client instead of real `gh copilot`. Safe for local dev and CI.

Add to `.env.example` and use in dev; CI sets it automatically in test runs.

### 5. Task 8 implementation order

1. Define `CopilotClient` interface in `src/copilot/types.ts` (or next to client).
2. Implement `MockCopilotClient` that loads from `tests/fixtures/copilot_responses/*.json`.
3. Implement `RealCopilotClient` (wraps `gh copilot`).
4. Factory or CLI wiring: if `DOTFILES_COACH_USE_MOCK_COPILOT=1`, use mock; else use real. Tests always inject mock.

This keeps “easy” work (parsers, analyzers, formatters, commands) testable with Auto/lower models and no Copilot usage until you choose to enable it.
