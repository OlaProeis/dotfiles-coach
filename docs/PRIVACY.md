# Privacy & Security

> How Dotfiles Coach protects your data, what leaves your machine, and how secret scrubbing works.

---

## Privacy Model

Dotfiles Coach follows a **privacy-first** design principle. The tool was built with the understanding that shell history files can contain highly sensitive data: API keys, passwords, database credentials, SSH keys, and personal information.

### Core Guarantees

1. **Local-first analysis.** The `analyze`, `apply`, and `report` commands make **zero network calls**. All processing happens entirely on your machine.

2. **Mandatory secret scrubbing.** Before any data is sent to GitHub Copilot CLI (the `suggest` command), it passes through a mandatory secret scrubber that cannot be disabled. This is architecturally enforced, not opt-in.

3. **No direct HTTP calls.** The tool never makes HTTP requests itself. The only external communication is through the GitHub Copilot CLI binary (`copilot` or `gh`), which uses your existing authenticated session.

4. **No telemetry.** Dotfiles Coach collects no usage data, sends no analytics, and has no phone-home behavior.

5. **No raw history sent to Copilot.** Only aggregated, scrubbed patterns (frequency counts and deduplicated commands) are sent. Individual history lines are never transmitted.

---

## Data Flow

### What stays on your machine (always)

- Your raw shell history file contents
- All parsing and frequency analysis results
- Safety detection results
- The suggestion cache file (`~/.config/dotfiles-coach/last_suggestions.json`)
- Applied alias/function files
- Generated reports

### What is sent to Copilot CLI (only during `suggest`)

- **Scrubbed** command patterns (with all secrets replaced by `[REDACTED]`)
- Pattern frequency counts
- Shell type (bash/zsh/powershell)
- A structured prompt requesting alias/function suggestions

### Visual Flow

```
┌─────────────────────────────────────────────────────┐
│                YOUR MACHINE (Local)                  │
│                                                      │
│  ~/.bash_history ──► Parser ──► Analyzer             │
│                                    │                 │
│                              CommandPattern[]        │
│                                    │                 │
│                          ┌─────────▼──────────┐      │
│                          │  SECRET SCRUBBER    │      │
│                          │  (mandatory, 13+    │      │
│                          │   regex patterns)   │      │
│                          └─────────┬──────────┘      │
│                                    │                 │
│                          Scrubbed patterns only      │
│                                    │                 │
└────────────────────────────────────┼─────────────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │  GitHub Copilot   │
                          │  CLI binary       │
                          │  (copilot -p -s)  │
                          └──────────────────┘
```

---

## Secret Scrubbing Details

The secret scrubber (`src/utils/secret-scrubber.ts`) runs 13+ regex-based detection patterns against all data before it leaves your machine. Every match is replaced with `[REDACTED]`.

### Detection Categories

| # | Category | What It Catches | Example |
|---|----------|----------------|---------|
| 1 | **Key-value assignments** | `password=`, `token=`, `api_key=`, `secret=`, `credentials=` and variations | `export API_KEY=sk-abc123` |
| 2 | **Export statements** | Any `export` with SECRET, TOKEN, KEY, PASSWORD, CREDENTIALS, AUTH in the variable name | `export AWS_SECRET_ACCESS_KEY=...` |
| 3 | **Docker login** | Any `docker login` command (entire line) | `docker login -p mypassword123` |
| 4 | **SSH key paths** | `ssh -i <path>` and `ssh-add <path>` | `ssh -i ~/.ssh/id_rsa user@host` |
| 5 | **SSH agent** | `ssh-add <path>` (generic) | `ssh-add ~/.ssh/deploy_key` |
| 6 | **URL credentials** | Any protocol URL with embedded `user:pass@` | `https://admin:s3cret@db.example.com` |
| 7 | **curl auth** | `curl` with `-u` or `--user` flags | `curl -u admin:password https://api.example.com` |
| 8 | **AWS access keys** | 16-character strings starting with `AKIA` | `AKIAIOSFODNN7EXAMPLE` |
| 9 | **GitHub tokens** | Tokens with `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` prefixes | `ghp_1234567890abcdefghij...` |
| 10 | **GitLab tokens** | Tokens with `glpat-` prefix | `glpat-xxxxxxxxxxxxxxxxxxxx` |
| 11 | **npm tokens** | Tokens with `npm_` prefix | `npm_1234567890abcdef` |
| 12 | **npm config auth** | `npm config set` with `_auth`, `_authToken`, `_password` | `npm config set //registry.npmjs.org/:_authToken npm_abc123` |
| 13 | **Bearer tokens** | `Bearer <token>` and `Authorization: Bearer <token>` | `curl -H "Authorization: Bearer eyJ..."` |
| 14 | **Authorization headers** | `Authorization: <value>` or `Authorization=<value>` | `Authorization: Basic dXNlcjpwYXNz` |
| 15 | **Base64 blobs** | 40+ character Base64-encoded strings (typical of secrets) | Long Base64 strings in command arguments |
| 16 | **Hex secrets** | 32+ hex characters in assignment context (`key=<hex>`) | `token=a1b2c3d4e5f6...` (32+ chars) |

### How Scrubbing Works

```typescript
import { scrubSecrets } from './utils/secret-scrubber.js';

const input = 'curl -H "Authorization: Bearer ghp_abc123def456" https://api.github.com';
const { scrubbed, redactedCount } = scrubSecrets(input);

// scrubbed: 'curl -H "[REDACTED]" https://api.github.com'
// redactedCount: 1
```

Each regex pattern is applied sequentially. The `[REDACTED]` placeholder is used consistently. The scrubber also provides a `scrubLines()` convenience function for processing arrays of history lines.

### Architectural Enforcement

Secret scrubbing is not a flag or option -- it is **hardwired into the suggest pipeline**:

```typescript
// In src/commands/suggest.ts, step 7:
// Secret scrubbing (mandatory)
spinner.text = 'Scrubbing secrets from patterns...';
const scrubbedPatterns = scrubPatterns(patterns);
const scrubbedDangerous = dangerousCommands.map(
  (cmd) => scrubSecrets(cmd).scrubbed,
);

// Step 8: Only scrubbed data reaches Copilot
const suggestions = await client.generateSuggestions(scrubbedPatterns, shell);
```

There is no code path that bypasses this step. The `CopilotClient.generateSuggestions()` method only ever receives pre-scrubbed data.

---

## Apply Command Safety

The `apply` command has its own safety guarantees:

1. **Never auto-sources files.** After writing suggestions, it prints `source <file>` instructions for you to run manually. It never executes them.

2. **Automatic backups.** Before overwriting any file, a `.backup` copy is created (with timestamped naming if a backup already exists). Use `--no-backup` to opt out.

3. **Dry-run mode.** Use `--dry-run` to preview exactly what would be written without modifying any files.

4. **Explicit append.** The `--append-to` flag must be used explicitly to modify an existing shell profile. The default behavior writes to a separate file (`~/.dotfiles_coach_aliases.sh`).

---

## What the Copilot CLI Sees

When you run `dotfiles-coach suggest`, the Copilot CLI receives a prompt like this:

```
You are a shell automation and ergonomics expert specializing in Bash and Zsh.

Below are frequently repeated command patterns from a developer's shell history:

1. "git status" (247 times)
2. "npm test" (89 times)
3. "[REDACTED]" (15 times)

For each pattern:
1. Determine if an alias, function, or script would be most appropriate
2. Generate idiomatic, safe code
...
```

Note that any patterns containing secrets are replaced with `[REDACTED]` before reaching this point. The Copilot CLI binary then processes this prompt using your authenticated GitHub Copilot session.

---

## Recommendations

- **Review suggestions before applying.** Always use `--dry-run` first to inspect what would be written.
- **Run `analyze` first.** The analyze command is 100% offline and shows you what patterns were detected without any external communication.
- **Check the cache.** Suggestions are cached at `~/.config/dotfiles-coach/last_suggestions.json`. You can inspect this file at any time.
- **Use fixture data for demos.** The bundled `tests/fixtures/sample_bash_history.txt` file contains sanitized sample data suitable for demonstrations without exposing real history.
