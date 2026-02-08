import { describe, it, expect } from 'vitest';
import { scrubSecrets, scrubLines } from '../../src/utils/secret-scrubber.js';

const R = '[REDACTED]';

describe('scrubSecrets', () => {
  // ── Key-value assignments ───────────────────────────────────────────────

  it('redacts password=… assignments', () => {
    const { scrubbed, redactedCount } = scrubSecrets(
      'mysql -u root password=s3cretP@ss',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('s3cretP@ss');
    expect(redactedCount).toBeGreaterThanOrEqual(1);
  });

  it('redacts token= assignments', () => {
    const { scrubbed } = scrubSecrets('curl -H "token=abc123xyz789"');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('abc123xyz789');
  });

  it('redacts api_key= assignments', () => {
    const { scrubbed } = scrubSecrets('API_KEY=sk-1234567890abcdef');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('sk-1234567890abcdef');
  });

  it('redacts secret= with quotes', () => {
    const { scrubbed } = scrubSecrets("secret='my_super_secret_value'");
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('my_super_secret_value');
  });

  it('redacts client_secret: assignments', () => {
    const { scrubbed } = scrubSecrets('client_secret: deadbeef1234');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('deadbeef1234');
  });

  // ── Export statements ──────────────────────────────────────────────────

  it('redacts export SECRET_KEY=…', () => {
    const { scrubbed } = scrubSecrets('export SECRET_KEY=abcdefghijklmnop');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('abcdefghijklmnop');
  });

  it('redacts export MY_AUTH_TOKEN=…', () => {
    const { scrubbed } = scrubSecrets('export MY_AUTH_TOKEN="tok_live_xxxx"');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('tok_live_xxxx');
  });

  it('redacts export DATABASE_PASSWORD=…', () => {
    const { scrubbed } = scrubSecrets(
      'export DATABASE_PASSWORD=hunter2',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('hunter2');
  });

  // ── Docker login ───────────────────────────────────────────────────────

  it('redacts docker login commands', () => {
    const { scrubbed } = scrubSecrets(
      'docker login -u user -p s3cret registry.example.com',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('s3cret');
    expect(scrubbed).not.toContain('registry.example.com');
  });

  // ── SSH ────────────────────────────────────────────────────────────────

  it('redacts ssh -i key paths', () => {
    const { scrubbed } = scrubSecrets('ssh -i ~/.ssh/my_private_key user@host');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('my_private_key');
  });

  it('redacts ssh-add key paths', () => {
    const { scrubbed } = scrubSecrets('ssh-add ~/.ssh/id_rsa');
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('id_rsa');
  });

  // ── URLs with credentials ─────────────────────────────────────────────

  it('redacts URLs with embedded credentials', () => {
    const { scrubbed } = scrubSecrets(
      'git clone https://user:p@ssw0rd@github.com/repo.git',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('p@ssw0rd');
  });

  it('redacts http URLs with user:pass', () => {
    const { scrubbed } = scrubSecrets(
      'curl http://admin:secret123@localhost:8080/api',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('secret123');
  });

  // ── AWS access keys ───────────────────────────────────────────────────

  it('redacts AWS access keys', () => {
    const { scrubbed } = scrubSecrets(
      'aws configure set aws_access_key_id AKIAIOSFODNN7EXAMPLE',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  // ── GitHub / GitLab / npm tokens ──────────────────────────────────────

  it('redacts GitHub personal access tokens (ghp_)', () => {
    const { scrubbed } = scrubSecrets(
      'gh auth login --with-token ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('redacts GitLab tokens (glpat-)', () => {
    const { scrubbed } = scrubSecrets(
      'GITLAB_TOKEN=glpat-abcdefghij1234567890ABCD',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('glpat-abcdefghij1234567890ABCD');
  });

  it('redacts npm tokens', () => {
    const { scrubbed } = scrubSecrets(
      '//registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz1234567890',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain(
      'npm_abcdefghijklmnopqrstuvwxyz1234567890',
    );
  });

  it('redacts shorter npm tokens (npm config set format)', () => {
    const { scrubbed } = scrubSecrets(
      'npm config set //registry.npmjs.org/:_authToken npm_1234567890abcdef',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('npm_1234567890abcdef');
  });

  // ── Bearer / Authorization ────────────────────────────────────────────

  it('redacts Bearer tokens', () => {
    const { scrubbed } = scrubSecrets(
      'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def"',
    );
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  // ── Base64 blobs ──────────────────────────────────────────────────────

  it('redacts long base64 strings (≥ 40 chars)', () => {
    const b64 = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw';
    const { scrubbed } = scrubSecrets(`cert_data=${b64}`);
    expect(scrubbed).toContain(R);
    expect(scrubbed).not.toContain(b64);
  });

  // ── No false positives ────────────────────────────────────────────────

  it('does NOT redact normal commands', () => {
    const normalCommands = [
      'ls -la',
      'cd ~/projects',
      'git status',
      'npm install express',
      'echo "hello world"',
    ];
    for (const cmd of normalCommands) {
      const { scrubbed, redactedCount } = scrubSecrets(cmd);
      expect(scrubbed).toBe(cmd);
      expect(redactedCount).toBe(0);
    }
  });

  it('does NOT redact short strings that look key-ish but are too short', () => {
    // "key=ab" only has 2-char value → below our 4-char minimum
    const { scrubbed, redactedCount } = scrubSecrets('key=ab');
    expect(redactedCount).toBe(0);
    expect(scrubbed).toBe('key=ab');
  });

  // ── Multiple secrets in one line ──────────────────────────────────────

  it('redacts multiple secrets in a single line', () => {
    const input =
      'export SECRET_KEY=abc123 && docker login -u admin -p topsecret';
    const { scrubbed, redactedCount } = scrubSecrets(input);
    expect(scrubbed).not.toContain('abc123');
    expect(scrubbed).not.toContain('topsecret');
    expect(redactedCount).toBeGreaterThanOrEqual(2);
  });

  // ── Multi-line input ──────────────────────────────────────────────────

  it('scrubs multi-line text', () => {
    const input = [
      'echo "hello"',
      'export API_KEY=sk_test_1234567890',
      'curl https://user:pass@api.example.com',
      'ls -la',
    ].join('\n');
    const { scrubbed, redactedCount } = scrubSecrets(input);
    expect(scrubbed).not.toContain('sk_test_1234567890');
    expect(scrubbed).not.toContain('user:pass@');
    expect(scrubbed).toContain('echo "hello"');
    expect(scrubbed).toContain('ls -la');
    expect(redactedCount).toBeGreaterThanOrEqual(2);
  });
});

// ── scrubLines ──────────────────────────────────────────────────────────────

describe('scrubLines', () => {
  it('scrubs an array of lines and returns total count', () => {
    const lines = [
      'echo "ok"',
      'password=hunter2',
      'export MY_SECRET_TOKEN=abc',
    ];
    const { scrubbedLines, totalRedacted } = scrubLines(lines);
    expect(scrubbedLines).toHaveLength(3);
    expect(scrubbedLines[0]).toBe('echo "ok"');
    expect(scrubbedLines[1]).toContain(R);
    expect(scrubbedLines[2]).toContain(R);
    expect(totalRedacted).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 redactions for clean lines', () => {
    const { scrubbedLines, totalRedacted } = scrubLines([
      'git pull',
      'npm test',
    ]);
    expect(scrubbedLines).toEqual(['git pull', 'npm test']);
    expect(totalRedacted).toBe(0);
  });
});
