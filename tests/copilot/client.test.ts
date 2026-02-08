import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import {
  MockCopilotClient,
  createCopilotClient,
  RealCopilotClient,
  CopilotNotAvailableError,
} from '../../src/copilot/client.js';
import type { CommandPattern, ShellType } from '../../src/types/index.js';

// ── Fixtures path ──────────────────────────────────────────────────────────

const FIXTURES_DIR = join(
  process.cwd(),
  'tests',
  'fixtures',
  'copilot_responses',
);

// ── Sample patterns for testing ────────────────────────────────────────────

const samplePatterns: CommandPattern[] = [
  {
    pattern: 'git add . && git commit -m',
    frequency: 42,
    variations: ['git add -A && git commit -m'],
  },
  {
    pattern: 'docker compose up -d',
    frequency: 18,
    variations: ['docker-compose up -d'],
  },
];

const sampleCommands = ['rm -rf /', 'chmod 777 /var', 'curl | bash'];

// ── MockCopilotClient ──────────────────────────────────────────────────────

describe('MockCopilotClient', () => {
  let client: MockCopilotClient;

  beforeEach(() => {
    client = new MockCopilotClient(FIXTURES_DIR);
  });

  describe('generateSuggestions', () => {
    it('returns suggestions from fixture file for bash', async () => {
      const suggestions = await client.generateSuggestions(
        samplePatterns,
        'bash',
      );
      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
      // Validate shape of first suggestion
      const first = suggestions[0];
      expect(first).toHaveProperty('pattern');
      expect(first).toHaveProperty('type');
      expect(first).toHaveProperty('code');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('explanation');
      expect(['alias', 'function', 'script']).toContain(first.type);
    });

    it('returns suggestions for powershell', async () => {
      const suggestions = await client.generateSuggestions(
        samplePatterns,
        'powershell',
      );
      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('falls back to bash fixture for unknown shell', async () => {
      const suggestions = await client.generateSuggestions(
        samplePatterns,
        'zsh',
      );
      // zsh fixture doesn't exist → falls back to bash
      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('returns empty array when no fixtures exist', async () => {
      const noFixturesClient = new MockCopilotClient('/nonexistent/path');
      const suggestions = await noFixturesClient.generateSuggestions(
        samplePatterns,
        'bash',
      );
      expect(suggestions).toEqual([]);
    });
  });

  describe('analyzeSafety', () => {
    it('returns safety alerts from fixture file', async () => {
      const alerts = await client.analyzeSafety(sampleCommands, 'bash');
      expect(alerts).toBeInstanceOf(Array);
      expect(alerts.length).toBeGreaterThan(0);
      // Validate shape
      const first = alerts[0];
      expect(first).toHaveProperty('pattern');
      expect(first).toHaveProperty('frequency');
      expect(first).toHaveProperty('risk');
      expect(first).toHaveProperty('saferAlternative');
    });

    it('returns empty array when fixture is missing', async () => {
      const noFixturesClient = new MockCopilotClient('/nonexistent/path');
      const alerts = await noFixturesClient.analyzeSafety(
        sampleCommands,
        'bash',
      );
      expect(alerts).toEqual([]);
    });
  });
});

// ── createCopilotClient factory ────────────────────────────────────────────

describe('createCopilotClient', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns MockCopilotClient when DOTFILES_COACH_USE_MOCK_COPILOT=1', () => {
    process.env.DOTFILES_COACH_USE_MOCK_COPILOT = '1';
    const client = createCopilotClient(FIXTURES_DIR);
    expect(client).toBeInstanceOf(MockCopilotClient);
  });

  it('returns RealCopilotClient when env var is not set', () => {
    delete process.env.DOTFILES_COACH_USE_MOCK_COPILOT;
    const client = createCopilotClient();
    expect(client).toBeInstanceOf(RealCopilotClient);
  });

  it('returns RealCopilotClient when env var is "0"', () => {
    process.env.DOTFILES_COACH_USE_MOCK_COPILOT = '0';
    const client = createCopilotClient();
    expect(client).toBeInstanceOf(RealCopilotClient);
  });
});

// ── RealCopilotClient error handling ───────────────────────────────────────

describe('RealCopilotClient', () => {
  it('is instantiable', () => {
    const client = new RealCopilotClient();
    expect(client).toBeInstanceOf(RealCopilotClient);
  });

  // We don't call real Copilot in tests — just verify the class structure
  // and that methods exist as expected from the interface.
  it('implements generateSuggestions', () => {
    const client = new RealCopilotClient();
    expect(typeof client.generateSuggestions).toBe('function');
  });

  it('implements analyzeSafety', () => {
    const client = new RealCopilotClient();
    expect(typeof client.analyzeSafety).toBe('function');
  });
});

// ── Fixture JSON schema validation ─────────────────────────────────────────

describe('fixture schema validation', () => {
  let client: MockCopilotClient;

  beforeEach(() => {
    client = new MockCopilotClient(FIXTURES_DIR);
  });

  it('suggest_bash.json has valid Suggestion[] schema', async () => {
    const suggestions = await client.generateSuggestions([], 'bash');
    for (const s of suggestions) {
      expect(typeof s.pattern).toBe('string');
      expect(['alias', 'function', 'script']).toContain(s.type);
      expect(typeof s.code).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.explanation).toBe('string');
      if (s.safety !== undefined) {
        expect(['safe', 'warning', 'danger']).toContain(s.safety);
      }
    }
  });

  it('suggest_powershell.json has valid Suggestion[] schema', async () => {
    const suggestions = await client.generateSuggestions(
      [],
      'powershell',
    );
    for (const s of suggestions) {
      expect(typeof s.pattern).toBe('string');
      expect(['alias', 'function', 'script']).toContain(s.type);
      expect(typeof s.code).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.explanation).toBe('string');
    }
  });

  it('safety_alerts.json has valid SafetyAlert[] schema', async () => {
    const alerts = await client.analyzeSafety([], 'bash');
    for (const a of alerts) {
      expect(typeof a.pattern).toBe('string');
      expect(typeof a.frequency).toBe('number');
      expect(typeof a.risk).toBe('string');
      expect(typeof a.saferAlternative).toBe('string');
    }
  });
});
