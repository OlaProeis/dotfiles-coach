# Product Requirements Document: Dotfiles Coach

**Version:** 3.0  
**Date:** February 7, 2026  
**Author:** Development Team  
**Status:** Draft

---

## Executive Summary

**Dotfiles Coach** is a CLI tool that analyzes shell history across multiple platforms (Bash, Zsh, PowerShell) and uses GitHub Copilot CLI to intelligently suggest automation improvements. It identifies repetitive command patterns, proposes aliases and functions, detects potentially dangerous commands, and generates reusable scripts—helping developers maintain cleaner, safer, and more efficient terminal workflows.

**Target Competition:** GitHub Copilot CLI Challenge (DEV.to)  
**Submission Deadline:** February 15, 2026  
**Primary Goal:** Demonstrate meaningful use of GitHub Copilot CLI to solve real developer productivity problems

---

## Problem Statement

### The Pain Points

1. **Repetitive Command Sequences**  
   Developers type the same multi-step commands daily (e.g., `cd ~/projects/myapp && git pull && npm install && npm start`) without creating automation.

2. **Missing Shell Ergonomics**  
   Most developers don't systematically review their shell history to identify optimization opportunities.

3. **Hidden Dangerous Patterns**  
   Commands like `rm -rf`, `sudo`, and unquoted variable expansions hide in history, waiting to cause incidents.

4. **Cross-Platform Friction**  
   Users working across Linux, macOS, and Windows/PowerShell maintain inconsistent automation strategies.

5. **Knowledge Loss**  
   Clever one-liners and command patterns are forgotten or buried in history files.

### Opportunity

By combining **shell history analysis** with **GitHub Copilot CLI's reasoning capabilities**, we can automatically surface actionable insights and generate safe, idiomatic automation—tailored to the user's actual workflow rather than generic tips.

---

## Target Users

### Primary Persona: "DevOps Dan"

- **Role:** Infrastructure Engineer / SRE / DevOps Engineer
- **Environment:** Works across Linux servers, macOS laptop, Windows with PowerShell
- **Pain:** Repetitive Azure CLI commands, kubectl sequences, git workflows
- **Needs:** Safe automation, cross-platform consistency, auditability

### Secondary Persona: "Full-Stack Fiona"

- **Role:** Full-stack developer
- **Environment:** macOS or Linux, primarily Bash/Zsh
- **Pain:** Repetitive npm/yarn commands, git workflows, docker sequences
- **Needs:** Quick wins, easy-to-understand suggestions

### Tertiary Persona: "M365 Mike"

- **Role:** Microsoft 365 / Azure administrator
- **Environment:** Windows with PowerShell, some WSL
- **Pain:** Complex Azure CLI and Microsoft Graph PowerShell cmdlet sequences
- **Needs:** PowerShell-specific optimization, safe automation for production environments

---

## Core Features (MVP)

### 1. Multi-Platform History Analysis

**User Story:** As a developer working across multiple shells, I want Dotfiles Coach to understand my command history regardless of shell type.

**Acceptance Criteria:**
- ✅ Detect and parse `.bash_history`, `.zsh_history`, and PowerShell history
- ✅ Auto-detect active shell environment
- ✅ Support manual path specification via `--history-file` flag
- ✅ Handle different history file formats (plain text, timestamped, etc.)
- ✅ Filter out noise: single-character commands, `ls`, `cd` without context, `clear`, `exit`

**Technical Notes:**
- **Bash/Zsh:** `~/.bash_history`, `~/.zsh_history` (plain text, one command per line)
- **PowerShell:**
  - `(Get-PSReadlineOption).HistorySavePath` typically points to `~/.local/share/powershell/PSReadLine/ConsoleHost_history.txt` (Linux/macOS)
  - Windows: `$env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`
- **Normalization:** Trim whitespace, deduplicate exact consecutive matches, preserve multi-line commands

---

### 2. Pattern Recognition & Frequency Analysis

**User Story:** As a user, I want to see which command sequences I repeat most often, so I know where automation would help most.

**Acceptance Criteria:**
- ✅ Identify frequently repeated **exact commands** (e.g., `git status` x 847 times)
- ✅ Detect common **command sequences** (e.g., `cd ~/project && git pull && npm install` repeated 23 times)
- ✅ Group similar commands with minor variations (e.g., `docker ps`, `docker ps -a`)
- ✅ Rank patterns by frequency
- ✅ Support configurable minimum threshold (default: appeared ≥5 times)
- ✅ **Context-aware analysis:** Include detected OS/platform in analysis (e.g., flag `apt-get` on macOS as potential Dockerfile/container command)

**Technical Implementation:**
- **Pre-filter aggressively:** Analyze only last 1,000-5,000 lines (configurable) to manage performance and token limits
- Use **sliding window** to detect 2-5 command sequences
- Simple string similarity for grouping (Levenshtein distance or fuzzy matching)
- Track both absolute frequency and "time since last use" to prioritize active patterns
- **Platform detection:** Identify OS from history patterns (`apt-get`/`yum` = Linux, `brew` = macOS, `choco`/PowerShell cmdlets = Windows) and pass to Copilot for context-aware suggestions

---

### 3. Copilot-Powered Suggestion Engine

**User Story:** As a user, I want AI-generated suggestions for aliases, functions, and scripts that match my actual workflow and shell syntax.

**Acceptance Criteria:**
- ✅ Send top N patterns to **GitHub Copilot CLI** with structured prompt
- ✅ Generate shell-specific suggestions:
  - **Bash/Zsh:** POSIX-compatible aliases, functions, and scripts
  - **PowerShell:** PowerShell functions, aliases (with proper `Set-Alias` syntax), and `.ps1` scripts
- ✅ Include safety improvements for dangerous patterns
- ✅ Provide **explanations** for each suggestion (why it helps, what it does)
- ✅ Ensure suggestions are **idempotent** and safe to run multiple times

**Copilot CLI Integration Points:**

# Example: Sending patterns to Copilot CLI
gh copilot suggest --shell bash << EOF
You are a shell ergonomics and automation expert.

Given these frequently repeated command patterns from a user's shell history:

1. "cd ~/projects/app && git pull && npm install && npm start" (23 times)
2. "docker ps -a && docker logs <container>" (17 times)  
3. "az group list --query '[].name' -o tsv" (12 times)

Provide:
- Suggested bash aliases or functions
- Rationale for each suggestion
- Any safety improvements

Format output as JSON:
{
  "suggestions": [
    {
      "pattern": "original pattern",
      "type": "alias|function|script",
      "code": "suggested code",
      "name": "suggested name",
      "explanation": "why this helps"
    }
  ]
}
EOF

**PowerShell Example:**

# Similar but with PowerShell-specific prompt
gh copilot suggest --shell powershell

---

### 4. Safety & Dangerous Pattern Detection

**User Story:** As a user, I want to be warned about dangerous commands in my history and receive safer alternatives.

**Acceptance Criteria:**
- ✅ Detect high-risk patterns with **missing safety flags** (more actionable than just flagging commands):
  - `rm -rf` without `-i` (interactive mode)
  - `sudo rm` without confirmation prompts
  - Unquoted variable expansions (`rm $VAR/*` without quotes - high risk of word splitting)
  - PowerShell: `Remove-Item -Recurse -Force` without `-WhatIf` or `-Confirm`
  - `dd` without `status=progress` (silent data destruction)
  - `chmod -R 777` (overly permissive, security risk)
  - Credential or secret exposure (e.g., `export TOKEN=...` in history)
- ✅ **Specificity in detection:** Flag *what's missing* rather than just "this command is dangerous"
  - Example: "Detected `rm -rf` without `-i` flag - consider using `rm -rfi` for confirmation prompts"
- ✅ Generate **safer alternatives** via Copilot CLI with specific flag recommendations
- ✅ Flag for review in `analyze` output with actionable remediation
- ✅ Suggest preventive aliases (e.g., `alias rm='rm -i'`, `alias rmi='rm -i'`) or PowerShell wrapper functions

**Example Output:**

⚠️  DANGEROUS PATTERN DETECTED (used 3 times):
   rm -rf /var/log/*

   ❌ ISSUE: Missing `-i` (interactive) flag - no confirmation prompt
   ⚠️  RISK: Accidental deletion without review

   ✅ SAFER ALTERNATIVES:
   
   # Option 1: Add interactive flag for confirmation
   rm -rfi /var/log/*
   
   # Option 2: Preview files before deleting
   ls -la /var/log/* && rm -rf /var/log/*
   
   # Option 3: Create safe-by-default alias
   alias rm='rm -i'
   alias rmi='rm -i'  # Explicit "interactive" version

   💡 RECOMMENDATION: Add `alias rm='rm -i'` to ~/.bashrc to make interactive mode default

---

### 5. Command: `dotfiles-coach analyze`

**Purpose:** Analyze shell history and display insights.

**Usage:**

dotfiles-coach analyze [OPTIONS]

**Options:**
- `--shell <bash|zsh|powershell|auto>` (default: auto-detect)
- `--history-file <path>` (override default location)
- `--min-frequency <N>` (default: 5)
- `--top <N>` (show top N patterns, default: 20)
- `--format <table|json|markdown>` (default: table)

**Output Example (table format):**

╭───────────────────────────────────────────────────────────────────────╮
│ DOTFILES COACH - History Analysis                                    │
├───────────────────────────────────────────────────────────────────────┤
│ Shell: Zsh                                                            │
│ History file: /home/user/.zsh_history                                │
│ Total commands: 8,472                                                 │
│ Unique commands: 1,203                                                │
│ Analysis period: Last 30 days                                         │
╰───────────────────────────────────────────────────────────────────────╯

TOP REPEATED PATTERNS (min frequency: 5)

Rank  Count  Pattern
────────────────────────────────────────────────────────────────────────
1     247    git status
2     89     cd ~/projects/myapp && git pull && npm install
3     67     docker ps -a
4     45     az account show --query name -o tsv
5     34     kubectl get pods -n production
...

⚠️  SAFETY ALERTS: 2 dangerous patterns detected

Use 'dotfiles-coach suggest' to generate automation recommendations.

---

### 6. Command: `dotfiles-coach suggest`

**Purpose:** Generate Copilot-powered suggestions based on analysis.

**Usage:**

dotfiles-coach suggest [OPTIONS]

**Options:**
- `--shell <bash|zsh|powershell|auto>` (default: auto-detect)
- `--history-file <path>`
- `--min-frequency <N>`
- `--output <file>` (save suggestions to file instead of stdout)
- `--interactive` (review/approve each suggestion one by one)

**Output Example:**

╭───────────────────────────────────────────────────────────────────────╮
│ GENERATING SUGGESTIONS VIA GITHUB COPILOT CLI...                     │
╰───────────────────────────────────────────────────────────────────────╯

✅ Analysis complete. Found 8 optimization opportunities.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUGGESTION 1/8: Alias for repeated git status

📊 Pattern: "git status" (247 times)
💡 Type: Alias
🔧 Suggested Code:

    alias gs='git status'

📝 Explanation:
   You run 'git status' frequently. This 2-character alias will save 
   time and keystrokes while maintaining clarity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUGGESTION 2/8: Function for app startup workflow

📊 Pattern: "cd ~/projects/myapp && git pull && npm install" (89 times)
💡 Type: Function
🔧 Suggested Code:

    function dev-start() {
        cd ~/projects/myapp || return 1
        echo "🔄 Pulling latest changes..."
        git pull || return 1
        echo "📦 Installing dependencies..."
        npm install || return 1
        echo "✅ Ready to develop!"
    }

📝 Explanation:
   This function automates your common development startup workflow.
   Includes error handling (|| return 1) to stop on failures.
   Usage: dev-start

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

...

Use 'dotfiles-coach apply' to save these suggestions to a file.

---

### 7. Command: `dotfiles-coach apply`

**Purpose:** Write approved suggestions to shell configuration files.

**Usage:**

dotfiles-coach apply [OPTIONS]

**Options:**
- `--output <file>` (default: `~/.dotfiles_coach_aliases.sh` for Bash/Zsh, `~/.dotfiles_coach_profile.ps1` for PowerShell)
- `--append-to <file>` (append directly to existing profile, e.g., `~/.zshrc`)
- `--dry-run` (show what would be written without modifying files)
- `--backup` (create backup of existing file before modification)

**Behavior:**
1. Reads suggestions from most recent `suggest` run (cache in `~/.config/dotfiles-coach/last_suggestions.json`)
2. Formats suggestions as valid shell code with comments
3. Writes to target file
4. **Does NOT automatically source** the file (prints instructions instead)

**Output Example:**

╭───────────────────────────────────────────────────────────────────────╮
│ APPLYING SUGGESTIONS                                                  │
╰───────────────────────────────────────────────────────────────────────╯

✅ Created backup: ~/.dotfiles_coach_aliases.sh.backup
✅ Wrote 8 suggestions to: ~/.dotfiles_coach_aliases.sh

📋 File contents preview:

    # ============================================
    # Dotfiles Coach - Generated Aliases & Functions
    # Generated: 2026-02-07 20:30:15 CET
    # ============================================
    
    # Suggestion 1: git status shortcut
    alias gs='git status'
    
    # Suggestion 2: dev startup workflow
    function dev-start() {
        cd ~/projects/myapp || return 1
        git pull || return 1
        npm install || return 1
    }
    
    ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 NEXT STEPS:

To use these aliases and functions immediately:

    source ~/.dotfiles_coach_aliases.sh

To make them permanent, add this line to your ~/.zshrc:

    source ~/.dotfiles_coach_aliases.sh

Then reload your shell:

    exec zsh

---

### 8. Command: `dotfiles-coach report`

**Purpose:** Generate a markdown summary report of analysis and suggestions.

**Usage:**

dotfiles-coach report [OPTIONS]

**Options:**
- `--output <file>` (default: `dotfiles_coach_report.md`)
- `--format <markdown|html|json>`

**Output Example (Markdown):**

# Dotfiles Coach Report

**Generated:** 2026-02-07 20:35:22 CET  
**Shell:** Zsh  
**History File:** `/home/user/.zsh_history`  
**Analysis Period:** Last 30 days

---

## Summary

- **Total Commands:** 8,472
- **Unique Commands:** 1,203
- **Automation Opportunities Found:** 8
- **Safety Alerts:** 2

---

## Top 10 Repeated Patterns

| Rank | Count | Pattern |
|------|-------|---------|
| 1 | 247 | `git status` |
| 2 | 89 | `cd ~/projects/myapp && git pull && npm install` |
| 3 | 67 | `docker ps -a` |
| 4 | 45 | `az account show --query name -o tsv` |
| 5 | 34 | `kubectl get pods -n production` |
| ... | ... | ... |

---

## Suggested Automations

### 1. Alias: `gs` for `git status`

**Original Pattern:** `git status` (247 times)

alias gs='git status'

**Rationale:** Frequent command, 2-char alias maintains clarity.

---

### 2. Function: `dev-start` for development workflow

**Original Pattern:** `cd ~/projects/myapp && git pull && npm install` (89 times)

function dev-start() {
    cd ~/projects/myapp || return 1
    git pull || return 1
    npm install || return 1
}

**Rationale:** Automates repetitive startup sequence with error handling.

---

## ⚠️ Safety Alerts

### Alert 1: Dangerous recursive delete

**Pattern:** `rm -rf /var/log/*` (used 3 times)

**Risk:** Destructive operation without confirmation.

**Safer Alternative:**

# Preview before deleting
ls -la /var/log/* && rm -rf /var/log/*

# Or use interactive mode
alias rmi='rm -i'

---

## Recommendations

1. ✅ Apply the 8 suggested aliases and functions
2. ⚠️ Review and modify the 2 flagged dangerous patterns
3. 🔄 Run `dotfiles-coach analyze` monthly to identify new patterns

---

*Generated by [Dotfiles Coach](https://github.com/yourusername/dotfiles-coach)*

---

## Technical Architecture

### Technology Stack

**Language:** **Node.js (TypeScript)** - FINAL DECISION

**Rationale:**
- **Best CLI UI ecosystem:** Chalk, Ink, Ora, Boxen for beautiful terminal output (35% of judging weight)
- **Copilot integration:** Use `child_process.exec()` to wrap `gh copilot` commands (no standalone SDK exists)
- **Cross-platform:** Works seamlessly on Linux, macOS, Windows
- **Strong async support:** Better for handling Copilot API calls

**Why not Python:**
- CLI UI libraries less mature for "beautiful" output
- Challenge judges favor polished terminal UX


**Key Dependencies:**

| Package | Purpose |
|---------|---------|
| `commander` | CLI argument parsing |
| `chalk` | Terminal colors and formatting |
| `ora` | Loading spinners |
| `boxen` | Terminal boxes for output |
| `fs-extra` | File system utilities |
| `fast-levenshtein` | String similarity for pattern grouping |

### Project Structure

dotfiles-coach/
├── src/
│   ├── cli.ts                 # Main CLI entry point
│   ├── commands/
│   │   ├── analyze.ts         # analyze command
│   │   ├── suggest.ts         # suggest command
│   │   ├── apply.ts           # apply command
│   │   └── report.ts          # report command
│   ├── parsers/
│   │   ├── bash.ts            # Bash/Zsh history parser
│   │   ├── powershell.ts      # PowerShell history parser
│   │   └── common.ts          # Common parsing utilities
│   ├── analyzers/
│   │   ├── frequency.ts       # Frequency analysis
│   │   ├── patterns.ts        # Pattern detection (sequences)
│   │   └── safety.ts          # Dangerous pattern detection
│   ├── copilot/
│   │   ├── client.ts          # Copilot CLI client wrapper
│   │   ├── prompts.ts         # Prompt templates
│   │   └── response-parser.ts # Parse Copilot responses
│   ├── formatters/
│   │   ├── table.ts           # Table formatter
│   │   ├── markdown.ts        # Markdown formatter
│   │   └── json.ts            # JSON formatter
│   ├── utils/
│   │   ├── shell-detect.ts    # Auto-detect shell
│   │   ├── history-paths.ts   # Find history file locations
│   │   └── file-operations.ts # Safe file read/write
│   └── types/
│       └── index.ts           # TypeScript type definitions
├── tests/
│   ├── fixtures/              # Sample history files for testing
│   └── ...                    # Unit tests
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE

### Key Interfaces (TypeScript)

// Core types
interface HistoryEntry {
  command: string;
  timestamp?: Date;
  lineNumber: number;
}

interface CommandPattern {
  pattern: string;
  frequency: number;
  lastUsed?: Date;
  variations: string[];
}

interface Suggestion {
  pattern: string;
  type: 'alias' | 'function' | 'script';
  code: string;
  name: string;
  explanation: string;
  safety?: 'safe' | 'warning' | 'danger';
}

interface AnalysisResult {
  shell: 'bash' | 'zsh' | 'powershell';
  historyFile: string;
  totalCommands: number;
  uniqueCommands: number;
  patterns: CommandPattern[];
  safetyAlerts: SafetyAlert[];
}

interface SafetyAlert {
  pattern: string;
  frequency: number;
  risk: string;
  saferAlternative: string;
}

---

## Copilot CLI Integration Strategy

### Primary Integration Points

**IMPORTANT:** GitHub Copilot CLI is accessed via `gh copilot` extension, NOT a standalone Node SDK. Use `child_process.exec()` or `execa` to wrap commands.

1. **Suggestion Generation (Core Feature)**

// Example: Using gh copilot via child_process
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function generateSuggestions(
  patterns: CommandPattern[],
  shell: string
): Promise<Suggestion[]> {
  const prompt = buildPrompt(patterns, shell);
  
  // Write prompt to temp file for complex input
  const promptFile = `/tmp/dotfiles-coach-prompt-${Date.now()}.txt`;
  await fs.writeFile(promptFile, prompt);
  
  // Call gh copilot suggest
  const { stdout } = await execAsync(
    `gh copilot suggest --shell ${shell} < ${promptFile}`
  );
  
  // Parse response with lenient strategy
  return parseResponse(stdout);
}

// Lenient response parser
function parseResponse(stdout: string): Suggestion[] {
  // Strategy 1: Try to extract JSON block from markdown fences
  const jsonBlockMatch = stdout.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      return parsed.suggestions || [];
    } catch (e) {
      // Fall through to regex strategy
    }
  }
  
  // Strategy 2: Look for raw JSON object (Copilot may return without fences)
  const rawJsonMatch = stdout.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
  if (rawJsonMatch) {
    try {
      const parsed = JSON.parse(rawJsonMatch[0]);
      return parsed.suggestions || [];
    } catch (e) {
      // Fall through to fallback
    }
  }
  
  // Strategy 3: Regex fallback for conversational responses with structured content
  // (Parse "Alias:", "Function:", etc. sections if JSON parsing fails)
  return parseConversationalResponse(stdout);
}


2. **Safety Analysis Enhancement**

async function analyzeSafety(
  dangerousCommands: string[],
  shell: string
): Promise<SafetyAlert[]> {
  // Use Copilot to generate safer alternatives
  const prompt = `
You are a shell security expert.

These commands appear risky:
${dangerousCommands.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For each, provide:
1. Risk explanation
2. Safer alternative command

Format as JSON.
  `;
  
  // Call Copilot CLI...
}

3. **Command Explanation (Bonus Feature)**

// Optional: Explain what a pattern does
async function explainPattern(command: string): Promise<string> {
  // Use Copilot CLI to explain complex command sequences
}

### Fallback Strategy

If Copilot CLI API is unavailable or rate-limited:

1. **Local pattern matching** for common cases (e.g., `git status` → `alias gs`)
2. **Template-based suggestions** for known patterns
3. **Clear error messaging** explaining Copilot CLI requirement

---

## User Experience Design Principles

### 1. Safety First
- **Never** automatically apply suggestions without user review
- Always create backups before modifying files
- Clearly flag dangerous patterns
- Default to conservative suggestions

### 2. Transparency
- Show exactly what Copilot CLI is being asked (optional `--verbose` flag)
- Display raw suggestions before formatting
- Include explanations with every suggestion

### 3. Cross-Platform Consistency
- Same command structure across all shells
- Platform-specific help text
- Clear shell detection feedback

### 4. Progressive Enhancement
- Core features work offline (parsing, frequency analysis)
- Copilot features gracefully degrade
- Useful even without Copilot (basic pattern detection)

---

## Development Phases

### Phase 1: MVP (Target: 3-4 days)

**Goal:** Working demo for challenge submission

- ✅ Basic history parsing (Bash/Zsh only)
- ✅ Frequency analysis with aggressive pre-filtering (last 2,000 lines)
- ✅ **Local secret scrubbing** (mandatory, tested thoroughly)
- ✅ `analyze` command with table output
- ✅ Copilot CLI integration via `gh copilot` exec wrapper
- ✅ `suggest` command with formatted output
- ✅ Basic `apply` command (write to separate file)
- ✅ README with demo instructions + privacy section
- ✅ Sample history files for judges
- ✅ **Dogfooding meta-report:** Document using Dotfiles Coach on its own development workflow

**Out of Scope for MVP:**
- PowerShell support (nice-to-have)
- Interactive mode
- HTML report format
- Advanced pattern detection (sequences beyond 2 commands)


### Phase 2: Polish (Target: 2 days)

- ✅ PowerShell support
- ✅ Dangerous pattern detection + safety suggestions
- ✅ `report` command with markdown output
- ✅ Better error handling
- ✅ Improved terminal formatting (colors, boxes, spinners)
- ✅ Unit tests for core functions
- ✅ Demo video recording

### Phase 3: Submission (Target: 1 day)

- ✅ DEV.to post written (using template)
- ✅ Repository polished (README, LICENSE, examples)
- ✅ Demo video uploaded
- ✅ Screenshots prepared
- ✅ Submission published

---

## Success Metrics (Challenge Judging Criteria)

### 1. Use of GitHub Copilot CLI (35% weight)

**How We'll Demonstrate:**

- Core suggestion engine powered entirely by Copilot CLI
- Show prompt engineering in documentation
- Include before/after examples in submission
- Demo video shows Copilot CLI in action during development
- Explain in post how Copilot shaped the tool's evolution

### 2. Usability and User Experience (35% weight)

**How We'll Excel:**

- Clear, consistent command structure
- Beautiful terminal output (tables, colors, formatting)
- Helpful error messages
- Safe defaults (backups, no auto-apply)
- Works out-of-the-box with minimal setup
- Excellent README with quick start guide

### 3. Originality and Creativity (30% weight)

**Our Unique Angles:**

- First challenge entry focused on shell history analysis + automation
- Cross-platform support (Bash/Zsh/PowerShell)
- Safety-focused (dangerous pattern detection)
- Solves real developer pain (repetitive commands)
- Demonstrates non-obvious Copilot CLI use case (not just code generation)

---

## Risk Assessment & Mitigation

### Risk 1: Copilot CLI API Limitations

**Risk:** Free tier rate limits, API instability, limited context window

**Mitigation:**
- Batch patterns efficiently (send top 10-20 at once, not one-by-one)
- **Strict token management:** Truncate history to last 1,000-5,000 lines before analysis to avoid context window limits
- Cache Copilot responses locally
- Provide clear error messages if quota exceeded
- Fall back to basic pattern matching for common cases

**Note:** GitHub Copilot CLI is accessed via `gh copilot` extension commands (not a standalone `@github/copilot` SDK). Use Node.js `child_process.exec()` to wrap CLI calls or REST API directly.


### Risk 2: Shell Parsing Complexity

**Risk:** History file formats vary, edge cases in parsing

**Mitigation:**
- Start with simple cases (standard Bash/Zsh formats)
- Test against real-world history files from multiple users
- Handle parsing errors gracefully
- Provide `--history-file` override for non-standard locations

### Risk 3: Time Constraints (8 days to deadline)

**Risk:** Limited time to build, test, and polish

**Mitigation:**
- **Ruthless MVP scope** (Bash/Zsh only, basic features)
- Use Copilot CLI to accelerate development (dogfooding)
- Prepare demo with canned history files (no need for real user data)
- Record demo early, polish code later

### Risk 4: Security/Privacy Concerns

**Risk:** Shell history may contain secrets, personal info (API keys, passwords, tokens)

**Mitigation (CRITICAL - Privacy First):**
- **Local-first sanitization:** Run regex-based scrubber BEFORE any data leaves the machine
- **Never** send raw history to Copilot—only aggregated patterns (frequency counts, deduplicated commands)
- **Aggressive secret filtering** (enabled by default, cannot be disabled):
  - Patterns: `password=`, `token=`, `key=`, `secret=`, `export.*SECRET`, `docker login`, `ssh.*@`
  - Base64-looking strings in command arguments
  - URLs with embedded credentials (`https://user:pass@`)
- **Redaction in output:** Display `[REDACTED]` in analysis reports for filtered lines
- Document privacy approach prominently in README and submission post
- Provide `--privacy-report` flag to show what was filtered without revealing values


---

## Demo Strategy (For Judges)

### Provided Demo Assets

1. **Sample History Files**
   - `demo/sample_bash_history.txt` - Realistic but sanitized Bash history
   - `demo/sample_zsh_history.txt` - Zsh with timestamps
   - `demo/sample_powershell_history.txt` - PowerShell (Phase 2)

2. **Demo Script**
   - `demo/demo.sh` - Step-by-step walkthrough
   - Each command with expected output documented

3. **Video Walkthrough**
   - 2-3 minute screencast showing:
     - Installation
     - Running `analyze` on sample history
     - Reviewing suggestions
     - Applying aliases
     - Testing generated alias

### Judges Can Try

# Install
npm install -g dotfiles-coach

# Analyze sample history
dotfiles-coach analyze --history-file demo/sample_bash_history.txt

# Generate suggestions
dotfiles-coach suggest --history-file demo/sample_bash_history.txt

# Apply to a test file
dotfiles-coach apply --output /tmp/test_aliases.sh --dry-run

# View report
dotfiles-coach report --output /tmp/report.md
cat /tmp/report.md

---

## Submission Content Outline

### DEV.to Post Structure

#### Title
**"Dotfiles Coach: AI-Powered Shell Automation from Your History | GitHub Copilot CLI Challenge"**

#### Cover Image
Terminal screenshot with colorful analysis output + Copilot logo

#### Body (Following Template)

**What I Built**

> Dotfiles Coach is a CLI tool that analyzes your shell history and uses GitHub Copilot CLI to suggest smart automation—aliases, functions, and scripts tailored to your actual workflow. It works across Bash, Zsh, and PowerShell, helping developers eliminate repetitive commands and avoid dangerous patterns.
>
> **Privacy-first:** All analysis happens locally. Secrets are scrubbed before any data touches Copilot's API.

**The "Aha!" Moment**

> I was halfway through typing `cd ~/projects/dotfiles-coach && git pull && npm install && npm run dev` for the tenth time that day when it hit me: I'm literally building a tool to solve this problem... while experiencing the problem. That's when Dotfiles Coach went from "challenge entry" to "tool I actually need."

**Demo**

- GitHub repo link
- YouTube/Loom video (2-3 minutes) - **Use VHS (Charm) for terminal GIFs**
- High-quality GIF showing key workflow (`analyze` → `suggest` → `apply`)
- Screenshots of key commands with beautiful terminal output


**My Experience with GitHub Copilot CLI**

> I used Copilot CLI throughout development, not just as the tool's engine but as my pair programmer. Here's how it shaped the project:
>
> **1. Rapid Prototyping:** I started by asking Copilot CLI to scaffold the initial CLI structure. Within minutes, I had a working `commander` setup with placeholder commands.
>
> **2. Prompt Engineering:** The core suggestion engine went through 5 iterations. Copilot CLI helped me refine prompts to generate better aliases and functions. I'd feed it sample patterns, review output, then ask it to improve its own suggestions—meta-prompt engineering!
>
> **3. The "Ghost in the Machine":** I started thinking of Copilot CLI as a senior architect looking over my shoulder at my command history, saying *"Hey, you've done this three times today—here's a better way."* That mental model shaped the entire UX.
>
> **4. Cross-Platform Challenges:** When adding PowerShell support, I used Copilot CLI to explain PowerShell history format differences and generate parsing code. This saved hours of documentation reading.
>
> **5. Safety Features:** The dangerous pattern detection was enhanced by asking Copilot to list common risky shell patterns and their safe alternatives. It suggested things I hadn't considered (like unquoted variable expansion risks).
>
> **6. Meta-Moment - Dogfooding:** I ran Dotfiles Coach on its own development history. It suggested:
> ```bash
> alias dfc-dev='cd ~/projects/dotfiles-coach && npm run dev'
> alias dfc-test='npm test -- --watch'
> ```
> I immediately added both. The tool caught me repeating the exact patterns it was designed to solve. *That's* when I knew it worked.
>
> The most surprising moment: Copilot CLI suggested a more efficient pattern-matching algorithm than my initial approach, cutting analysis time by ~60%.


#### Code Snippets

- Show key Copilot integration code
- Example prompt sent to Copilot CLI
- Sample output

#### Call to Action

> Try Dotfiles Coach on your own shell history! Star the repo, open issues, or contribute improvements. Let's make terminal automation effortless.

---

## Decisions Made (Post-Gemini Review)

### ✅ LOCKED IN:

1. **Language:** Node.js/TypeScript (final decision - best CLI UI ecosystem)

2. **Copilot Integration:** Use `gh copilot` via `child_process.exec()` wrapper (no standalone SDK exists)

3. **Privacy Approach:** Local-first secret scrubbing (mandatory, aggressive, cannot be disabled)

4. **Token Management:** Hard limit analysis to last 1,000-5,000 history lines to avoid context window issues

5. **Platform Context:** Pass detected OS/platform to Copilot for context-aware suggestions (e.g., `apt-get` on macOS = likely Dockerfile)

6. **MVP Shell Support:** Bash/Zsh only (PowerShell Phase 2 if time permits)

7. **Copilot Response Format:** Request JSON from Copilot CLI for structured parsing

8. **Dogfooding Requirement:** Must include meta-report showing Dotfiles Coach used on its own development

9. **Demo Assets:** Use VHS (Charm) for high-quality terminal GIFs in submission

### 🔄 STILL TO VALIDATE:

1. **Pattern Detection Depth:** Start with 2-command sequences, expand if time allows?

2. **Suggestion Storage:** Cache in `~/.config/dotfiles-coach/cache.json` or always regenerate?

3. **Response Parsing Robustness:** Implement 3-tier parsing strategy (JSON blocks → raw JSON → conversational fallback) to handle Copilot CLI's variable output formats


---

## Appendix A: Example Copilot Prompts

### Prompt Template: Bash/Zsh Suggestions

You are a shell automation and ergonomics expert specializing in Bash and Zsh.

Below are frequently repeated command patterns from a developer's shell history:

{patterns}

For each pattern:
1. Determine if an alias, function, or script would be most appropriate
2. Generate idiomatic, safe code
3. Explain the benefit and rationale
4. Use POSIX-compatible syntax where possible

Return your response as JSON matching this schema:
{
  "suggestions": [
    {
      "pattern": "original command pattern",
      "type": "alias|function|script",
      "code": "suggested code",
      "name": "suggested name",
      "explanation": "rationale and usage notes"
    }
  ]
}

Guidelines:
- Aliases are best for simple 1:1 replacements
- Functions are best for multi-step workflows or commands needing arguments
- Include error handling in functions (|| return 1)
- Use descriptive but concise names
- Add comments for complex logic

### Prompt Template: PowerShell Suggestions

You are a PowerShell scripting expert focused on automation and best practices.

Below are frequently repeated command patterns from a developer's PowerShell history:

{patterns}

For each pattern:
1. Determine if a PowerShell alias, function, or .ps1 script is most appropriate
2. Generate idiomatic PowerShell code following best practices
3. Explain the benefit and rationale
4. Use approved verbs (Get-, Set-, etc.) for function names where applicable

Return your response as JSON matching this schema:
{
  "suggestions": [
    {
      "pattern": "original command pattern",
      "type": "alias|function|script",
      "code": "suggested PowerShell code",
      "name": "suggested name",
      "explanation": "rationale and usage notes"
    }
  ]
}

Guidelines:
- Use Set-Alias for simple command replacements
- Use functions for complex logic
- Include proper error handling (try/catch, -ErrorAction)
- Follow PowerShell naming conventions (Verb-Noun)
- Add [CmdletBinding()] for advanced functions
- Include parameter validation where appropriate

### Prompt Template: Safety Analysis

You are a system security expert specializing in shell command safety.

The following commands appear in a user's shell history and may pose risks:

{dangerous_commands}

For each command:
1. Explain the specific risk
2. Provide a safer alternative that achieves the same goal
3. Suggest preventive measures (aliases, wrappers, confirmation flags)

Return as JSON:
{
  "alerts": [
    {
      "command": "original command",
      "risk": "description of danger",
      "safer_alternative": "safer command or approach",
      "preventive_measure": "optional alias or wrapper suggestion"
    }
  ]
}

Focus on:
- Destructive operations (rm, dd, format)
- Privilege escalation (sudo, Run-As-Administrator)
- Unquoted variables and wildcards
- Exposure of credentials or secrets

---

## Appendix B: Installation & Quick Start (Draft README)

### Installation

npm install -g dotfiles-coach

Or use `npx` without installing:

npx dotfiles-coach analyze

### Quick Start

1. **Analyze your shell history:**

dotfiles-coach analyze

2. **Generate automation suggestions:**

dotfiles-coach suggest

3. **Apply suggestions to a file:**

dotfiles-coach apply

4. **Source the generated aliases:**

source ~/.dotfiles_coach_aliases.sh

5. **Make permanent** (add to `~/.bashrc` or `~/.zshrc`):

echo "source ~/.dotfiles_coach_aliases.sh" >> ~/.zshrc

### Requirements

- Node.js 18+
- GitHub Copilot CLI ([setup guide](https://github.com/features/copilot/cli))
- Active GitHub Copilot subscription (Free tier works)

---

## Appendix C: Competitive Analysis

### Existing Tools (Not Using Copilot CLI)

| Tool | Focus | Difference from Dotfiles Coach |
|------|-------|-------------------------------|
| [thefuck](https://github.com/nvbn/thefuck) | Command correction | Reactive (fixes errors), not proactive automation |
| [hstr](https://github.com/dvorka/hstr) | History search/management | Navigation tool, no suggestion engine |
| [atuin](https://github.com/ellie/atuin) | Shell history sync + search | Cloud sync focus, no automation suggestions |
| [fig](https://fig.io) | IDE-style autocomplete for terminal | Autocomplete, not pattern-based automation |

**Key Differentiator:** Dotfiles Coach is the only tool that combines **history pattern analysis + AI-powered suggestion generation** to create custom automation.

---

## Final Notes

This PRD is designed to be comprehensive yet flexible. As you develop:

- **Prioritize ruthlessly** for MVP—better to have 3 solid features than 10 half-done
- **Dogfood the tool** on your own history as you build
- **Use Copilot CLI** to build Dotfiles Coach (meta!)
- **Document the journey** for the DEV.to post

When discussing in Cursor, focus on:
1. Confirming language choice (Node.js vs Python)
2. Copilot CLI SDK integration approach
3. MVP scope refinement
4. Demo strategy

Good luck with the challenge! 🚀
