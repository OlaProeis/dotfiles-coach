/**
 * Frequency analysis engine.
 *
 * Counts exact command matches, detects command sequences via sliding window,
 * groups similar commands via Levenshtein distance, and ranks by frequency + recency.
 */

import levenshtein from 'fast-levenshtein';
import type { HistoryEntry, CommandPattern } from '../types/index.js';

// ── Options ─────────────────────────────────────────────────────────────────

/** Configuration for frequency analysis. */
export interface FrequencyOptions {
  /** Minimum frequency for a pattern to be reported. Default: 5 */
  minFrequency?: number;
  /** Maximum number of patterns to return. Default: 20 */
  top?: number;
  /** Levenshtein distance threshold for grouping similar commands. Default: 3 */
  similarityThreshold?: number;
  /** Minimum sliding window size for sequence detection. Default: 2 */
  minSequenceLength?: number;
  /** Maximum sliding window size for sequence detection. Default: 5 */
  maxSequenceLength?: number;
}

const DEFAULT_OPTIONS: Required<FrequencyOptions> = {
  minFrequency: 5,
  top: 20,
  similarityThreshold: 3,
  minSequenceLength: 2,
  maxSequenceLength: 5,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyse an array of parsed history entries and return ranked `CommandPattern[]`.
 *
 * Steps:
 *  1. Count exact command occurrences.
 *  2. Detect repeated command *sequences* via sliding window (2-5).
 *  3. Group similar commands via Levenshtein distance.
 *  4. Filter by `minFrequency`.
 *  5. Rank by frequency (primary) + recency (secondary).
 *  6. Return the top N results.
 */
export function analyzeFrequency(
  entries: HistoryEntry[],
  options?: FrequencyOptions,
): CommandPattern[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (entries.length === 0) return [];

  // Step 1 – exact command counts
  const exactCounts = countExactCommands(entries);

  // Step 2 – sequence detection
  const sequenceCounts = detectSequences(
    entries,
    opts.minSequenceLength,
    opts.maxSequenceLength,
  );

  // Step 3 – merge sequences into the exact counts map
  for (const [seq, info] of sequenceCounts) {
    if (!exactCounts.has(seq)) {
      exactCounts.set(seq, info);
    }
  }

  // Step 4 – group similar commands
  const grouped = groupSimilarCommands(exactCounts, opts.similarityThreshold);

  // Step 5 – filter by min frequency
  const filtered = grouped.filter((p) => p.frequency >= opts.minFrequency);

  // Step 6 – rank: by frequency desc, then by recency desc (most recent first)
  filtered.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    // More recent → higher rank
    const aTime = a.lastUsed?.getTime() ?? 0;
    const bTime = b.lastUsed?.getTime() ?? 0;
    return bTime - aTime;
  });

  // Step 7 – return top N
  return filtered.slice(0, opts.top);
}

// ── Internal helpers ────────────────────────────────────────────────────────

interface CountInfo {
  count: number;
  lastUsed?: Date;
}

/**
 * Count exact command occurrences and track the most recent usage.
 */
function countExactCommands(
  entries: HistoryEntry[],
): Map<string, CountInfo> {
  const counts = new Map<string, CountInfo>();

  for (const entry of entries) {
    const cmd = entry.command;
    const existing = counts.get(cmd);
    if (existing) {
      existing.count += 1;
      if (entry.timestamp && (!existing.lastUsed || entry.timestamp > existing.lastUsed)) {
        existing.lastUsed = entry.timestamp;
      }
    } else {
      counts.set(cmd, { count: 1, lastUsed: entry.timestamp });
    }
  }

  return counts;
}

/**
 * Detect repeated command sequences using a sliding window of size `min..max`.
 *
 * For each window size we join consecutive commands with ` && ` and count how
 * many times the same joined string appears.
 */
function detectSequences(
  entries: HistoryEntry[],
  minLen: number,
  maxLen: number,
): Map<string, CountInfo> {
  const sequences = new Map<string, CountInfo>();

  for (let windowSize = minLen; windowSize <= maxLen; windowSize++) {
    if (entries.length < windowSize) continue;

    for (let i = 0; i <= entries.length - windowSize; i++) {
      const window = entries.slice(i, i + windowSize);
      const seq = window.map((e) => e.command).join(' && ');

      const lastEntry = window[window.length - 1];
      const existing = sequences.get(seq);
      if (existing) {
        existing.count += 1;
        if (
          lastEntry.timestamp &&
          (!existing.lastUsed || lastEntry.timestamp > existing.lastUsed)
        ) {
          existing.lastUsed = lastEntry.timestamp;
        }
      } else {
        sequences.set(seq, { count: 1, lastUsed: lastEntry.timestamp });
      }
    }
  }

  return sequences;
}

/**
 * Group commands that are within `threshold` Levenshtein distance of each
 * other. The most frequent command becomes the representative "pattern";
 * the rest become "variations".
 */
function groupSimilarCommands(
  counts: Map<string, CountInfo>,
  threshold: number,
): CommandPattern[] {
  // Sort entries by count descending so the most frequent becomes the representative
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );

  const used = new Set<string>();
  const patterns: CommandPattern[] = [];

  for (const [cmd, info] of sorted) {
    if (used.has(cmd)) continue;
    used.add(cmd);

    const variations: string[] = [];
    let totalCount = info.count;
    let latestUsed = info.lastUsed;

    // Find all similar commands not yet consumed
    for (const [otherCmd, otherInfo] of sorted) {
      if (otherCmd === cmd || used.has(otherCmd)) continue;

      // Only compare commands of similar length to avoid expensive
      // Levenshtein on wildly different strings
      if (Math.abs(cmd.length - otherCmd.length) > threshold) continue;

      const distance = levenshtein.get(cmd, otherCmd);
      if (distance <= threshold) {
        used.add(otherCmd);
        variations.push(otherCmd);
        totalCount += otherInfo.count;
        if (
          otherInfo.lastUsed &&
          (!latestUsed || otherInfo.lastUsed > latestUsed)
        ) {
          latestUsed = otherInfo.lastUsed;
        }
      }
    }

    patterns.push({
      pattern: cmd,
      frequency: totalCount,
      lastUsed: latestUsed,
      variations,
    });
  }

  return patterns;
}
