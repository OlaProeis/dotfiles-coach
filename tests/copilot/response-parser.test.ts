import { describe, it, expect } from 'vitest';
import {
  extractJson,
  parseSuggestions,
  parseSafetyAlerts,
} from '../../src/copilot/response-parser.js';

// ── extractJson ─────────────────────────────────────────────────────────────

describe('extractJson', () => {
  it('extracts JSON from markdown code fences', () => {
    const input = `Here are some suggestions:

\`\`\`json
[{"pattern":"git status","type":"alias","code":"alias gs='git status'","name":"gs","explanation":"shortcut"}]
\`\`\`

Hope this helps!`;

    const result = extractJson(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed[0].pattern).toBe('git status');
  });

  it('extracts JSON from fences without language tag', () => {
    const input = `\`\`\`
{"suggestions": []}
\`\`\``;

    const result = extractJson(input);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toHaveProperty('suggestions');
  });

  it('extracts raw JSON object without fences', () => {
    const input = `Sure, here you go: {"suggestions": [{"pattern":"npm test","type":"alias","code":"alias nt='npm test'","name":"nt","explanation":"faster testing"}]}`;

    const result = extractJson(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.suggestions).toBeInstanceOf(Array);
  });

  it('extracts raw JSON array without fences', () => {
    const input = `[{"pattern":"ls","type":"alias","code":"alias l='ls -la'","name":"l","explanation":"detailed listing"}]`;

    const result = extractJson(input);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toBeInstanceOf(Array);
  });

  it('returns null for text with no JSON', () => {
    const input = 'This is just a conversational response with no JSON content.';
    expect(extractJson(input)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const input = '```json\n{broken json\n```';
    expect(extractJson(input)).toBeNull();
  });
});

// ── parseSuggestions ────────────────────────────────────────────────────────

describe('parseSuggestions', () => {
  it('parses suggestions from a JSON array', () => {
    const raw = JSON.stringify([
      {
        pattern: 'git status',
        type: 'alias',
        code: "alias gs='git status'",
        name: 'gs',
        explanation: 'Quick git status shortcut',
        safety: 'safe',
      },
    ]);

    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('git status');
    expect(result[0].type).toBe('alias');
    expect(result[0].safety).toBe('safe');
  });

  it('parses suggestions from a wrapped { suggestions: [...] } object', () => {
    const raw = JSON.stringify({
      suggestions: [
        {
          pattern: 'npm test',
          type: 'alias',
          code: "alias nt='npm test'",
          name: 'nt',
          explanation: 'Fast test alias',
        },
      ],
    });

    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('npm test');
  });

  it('handles markdown-fenced JSON response', () => {
    const raw = `Sure! Here are my suggestions:

\`\`\`json
{
  "suggestions": [
    {
      "pattern": "docker compose up -d",
      "type": "alias",
      "code": "alias dcu='docker compose up -d'",
      "name": "dcu",
      "explanation": "Start compose in detached mode"
    }
  ]
}
\`\`\``;

    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('dcu');
  });

  it('provides defaults for missing fields', () => {
    const raw = JSON.stringify([
      { pattern: 'git push', code: 'alias gp="git push"' },
    ]);

    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('function'); // default
    expect(result[0].name).toBe('');
    expect(result[0].explanation).toBe('');
    expect(result[0].safety).toBeUndefined();
  });

  it('skips items without pattern and code', () => {
    const raw = JSON.stringify([
      { name: 'invalid' },
      { pattern: 'valid', code: 'echo valid' },
    ]);

    const result = parseSuggestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('valid');
  });

  it('handles conversational response with code blocks', () => {
    const raw = `Here are some suggestions for your workflow:

### Alias: git status shortcut

\`\`\`bash
alias gs='git status'
\`\`\`

### Function: dev startup

\`\`\`bash
function dev-start() {
    cd ~/projects/app || return 1
    git pull || return 1
    npm install || return 1
}
\`\`\`
`;

    const result = parseSuggestions(raw);
    // Should find at least the code blocks
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for completely unparseable text', () => {
    const result = parseSuggestions('I cannot help with that request.');
    expect(result).toEqual([]);
  });
});

// ── parseSafetyAlerts ───────────────────────────────────────────────────────

describe('parseSafetyAlerts', () => {
  it('parses alerts from a raw JSON array', () => {
    const raw = JSON.stringify([
      {
        pattern: 'rm -rf /',
        frequency: 1,
        risk: 'Catastrophic deletion',
        saferAlternative: 'Use trash-cli',
      },
    ]);

    const result = parseSafetyAlerts(raw);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('rm -rf /');
    expect(result[0].risk).toBe('Catastrophic deletion');
  });

  it('parses alerts from wrapped { alerts: [...] } object', () => {
    const raw = JSON.stringify({
      alerts: [
        {
          command: 'chmod 777 /var',
          risk: 'Overly permissive',
          safer_alternative: 'chmod 755',
          frequency: 3,
        },
      ],
    });

    const result = parseSafetyAlerts(raw);
    expect(result).toHaveLength(1);
    // Should map "command" → "pattern" and "safer_alternative" → "saferAlternative"
    expect(result[0].pattern).toBe('chmod 777 /var');
    expect(result[0].saferAlternative).toBe('chmod 755');
  });

  it('handles markdown-fenced JSON', () => {
    const raw = `\`\`\`json
{
  "alerts": [
    {
      "command": "dd if=/dev/zero of=/dev/sdb",
      "risk": "Data destruction",
      "safer_alternative": "Add status=progress",
      "frequency": 2
    }
  ]
}
\`\`\``;

    const result = parseSafetyAlerts(raw);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('dd if=/dev/zero of=/dev/sdb');
  });

  it('returns empty array for non-JSON response', () => {
    const result = parseSafetyAlerts('No alerts found.');
    expect(result).toEqual([]);
  });

  it('skips items without pattern or command', () => {
    const raw = JSON.stringify([
      { risk: 'bad' },
      { pattern: 'valid', risk: 'something', saferAlternative: 'alt', frequency: 1 },
    ]);

    const result = parseSafetyAlerts(raw);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe('valid');
  });
});
