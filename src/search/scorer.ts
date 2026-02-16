/**
 * Search scorer – ranks history commands by relevance to a natural-language query.
 *
 * Scoring strategy (V1 – no external dependencies beyond `fast-levenshtein`):
 *  1. Tokenize both query and command into lowercase words.
 *  2. Exact token overlap score (Jaccard-like).
 *  3. Fuzzy token matching via Levenshtein distance for near-misses.
 *  4. Substring / prefix bonus for partial matches.
 *  5. Frequency and recency boosts.
 *
 * All scoring is local — no Copilot calls.
 */

import levenshtein from 'fast-levenshtein';
import type { HistoryEntry, SearchResult } from '../types/index.js';

// ── Configuration ───────────────────────────────────────────────────────────

/** Maximum Levenshtein distance for a "fuzzy match" between two tokens. */
const FUZZY_THRESHOLD = 2;

/** Weight for exact token overlap (0–1 contribution). */
const WEIGHT_EXACT = 0.50;
/** Weight for fuzzy token matching. */
const WEIGHT_FUZZY = 0.20;
/** Weight for substring / prefix match bonus. */
const WEIGHT_SUBSTRING = 0.20;
/** Weight for frequency boost. */
const WEIGHT_FREQUENCY = 0.05;
/** Weight for recency boost. */
const WEIGHT_RECENCY = 0.05;

/** Minimum score threshold — results below this are dropped. */
const MIN_SCORE = 0.05;

// ── Tokenizer ───────────────────────────────────────────────────────────────

/**
 * Tokenize a string into lowercase alphanumeric words.
 *
 * Splits on whitespace, slashes, dashes, dots, equals, and common
 * shell punctuation so that e.g. `docker-compose up -d` yields
 * `['docker', 'compose', 'up', 'd']`.
 */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s/\-_.=|;:&"'`<>(){}[\]]+/)
    .filter((t) => t.length > 0);
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

/**
 * Exact overlap ratio: how many query tokens appear verbatim in the
 * command tokens? Returns a value in [0, 1].
 */
export function exactOverlap(queryTokens: string[], cmdTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const cmdSet = new Set(cmdTokens);
  const matches = queryTokens.filter((t) => cmdSet.has(t)).length;
  return matches / queryTokens.length;
}

/**
 * Fuzzy overlap: for query tokens that did NOT match exactly, check if
 * any command token is within `FUZZY_THRESHOLD` Levenshtein distance.
 * Returns a value in [0, 1].
 */
export function fuzzyOverlap(queryTokens: string[], cmdTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const cmdSet = new Set(cmdTokens);
  // Only consider tokens that were NOT exact matches.
  const unmatched = queryTokens.filter((t) => !cmdSet.has(t));
  if (unmatched.length === 0) return 1; // all already matched exactly

  let fuzzyMatches = 0;
  for (const qt of unmatched) {
    for (const ct of cmdTokens) {
      // Skip tokens whose lengths differ by more than the threshold.
      if (Math.abs(qt.length - ct.length) > FUZZY_THRESHOLD) continue;
      if (levenshtein.get(qt, ct) <= FUZZY_THRESHOLD) {
        fuzzyMatches++;
        break;
      }
    }
  }
  return fuzzyMatches / queryTokens.length;
}

/**
 * Substring bonus: does the full query (as a lowercase substring) appear
 * inside the command? Also checks if any query token is a prefix of a
 * command token or vice-versa. Returns [0, 1].
 */
export function substringScore(query: string, command: string, queryTokens: string[], cmdTokens: string[]): number {
  const q = query.toLowerCase();
  const c = command.toLowerCase();

  // Full query is a substring of the command → strong signal.
  if (c.includes(q)) return 1.0;

  // Check prefix matches between tokens.
  let prefixHits = 0;
  for (const qt of queryTokens) {
    for (const ct of cmdTokens) {
      if (ct.startsWith(qt) || qt.startsWith(ct)) {
        prefixHits++;
        break;
      }
    }
  }
  return queryTokens.length > 0 ? prefixHits / queryTokens.length : 0;
}

/**
 * Frequency boost: log-scale score based on how often the command
 * appeared. Returns [0, 1] where high-frequency commands score higher.
 */
export function frequencyScore(frequency: number, maxFrequency: number): number {
  if (maxFrequency <= 1) return 0;
  return Math.log(1 + frequency) / Math.log(1 + maxFrequency);
}

/**
 * Recency boost: how recently the command was used relative to the
 * newest entry in the dataset. Returns [0, 1].
 */
export function recencyScore(timestamp: Date | undefined, newestTimestamp: Date): number {
  if (!timestamp) return 0;
  const age = newestTimestamp.getTime() - timestamp.getTime();
  if (age <= 0) return 1;
  // Decay over 30 days — entries older than ~30d get minimal boost.
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, 1 - age / thirtyDays);
}

// ── Main search function ────────────────────────────────────────────────────

/**
 * Search history entries by a natural-language query and return scored results.
 *
 * @param entries     – Parsed history entries.
 * @param query       – The user's search query (free text).
 * @param maxResults  – Maximum number of results to return (default 10).
 * @returns Ranked `SearchResult[]` sorted by descending score.
 */
export function searchHistory(
  entries: HistoryEntry[],
  query: string,
  maxResults = 10,
): SearchResult[] {
  if (entries.length === 0 || !query.trim()) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // ── Aggregate: deduplicate commands, track frequency + recency ────────
  const commandMap = new Map<
    string,
    { frequency: number; lastUsed?: Date; lineNumber: number }
  >();

  for (const entry of entries) {
    const existing = commandMap.get(entry.command);
    if (existing) {
      existing.frequency++;
      if (entry.timestamp && (!existing.lastUsed || entry.timestamp > existing.lastUsed)) {
        existing.lastUsed = entry.timestamp;
      }
      existing.lineNumber = Math.max(existing.lineNumber, entry.lineNumber);
    } else {
      commandMap.set(entry.command, {
        frequency: 1,
        lastUsed: entry.timestamp,
        lineNumber: entry.lineNumber,
      });
    }
  }

  // Pre-compute dataset-wide stats for normalisation.
  let maxFreq = 1;
  let newestTimestamp = new Date(0);
  for (const meta of commandMap.values()) {
    if (meta.frequency > maxFreq) maxFreq = meta.frequency;
    if (meta.lastUsed && meta.lastUsed > newestTimestamp) {
      newestTimestamp = meta.lastUsed;
    }
  }

  // ── Score each unique command ─────────────────────────────────────────
  const scored: SearchResult[] = [];

  for (const [command, meta] of commandMap) {
    const cmdTokens = tokenize(command);

    const exact = exactOverlap(queryTokens, cmdTokens);
    const fuzzy = fuzzyOverlap(queryTokens, cmdTokens);
    const substr = substringScore(query, command, queryTokens, cmdTokens);
    const freq = frequencyScore(meta.frequency, maxFreq);
    const recent = recencyScore(meta.lastUsed, newestTimestamp);

    const score =
      WEIGHT_EXACT * exact +
      WEIGHT_FUZZY * fuzzy +
      WEIGHT_SUBSTRING * substr +
      WEIGHT_FREQUENCY * freq +
      WEIGHT_RECENCY * recent;

    if (score >= MIN_SCORE) {
      scored.push({
        command,
        score: Math.round(score * 1000) / 1000, // 3 decimal places
        lastUsed: meta.lastUsed,
        frequency: meta.frequency,
        lineNumber: meta.lineNumber,
      });
    }
  }

  // ── Sort by score desc, then frequency desc as tiebreaker ─────────────
  scored.sort((a, b) => b.score - a.score || b.frequency - a.frequency);

  return scored.slice(0, maxResults);
}
