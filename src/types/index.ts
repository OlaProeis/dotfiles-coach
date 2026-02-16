/**
 * Core types for Dotfiles Coach (per PRD).
 */

/** Single line from shell history (after parsing). */
export interface HistoryEntry {
  command: string;
  timestamp?: Date;
  lineNumber: number;
}

/** A repeated command or sequence with frequency and optional variations. */
export interface CommandPattern {
  pattern: string;
  frequency: number;
  lastUsed?: Date;
  variations: string[];
}

/** Suggestion type from Copilot (alias, function, or script). */
export type SuggestionType = 'alias' | 'function' | 'script';

/** One automation suggestion from the Copilot suggestion engine. */
export interface Suggestion {
  pattern: string;
  type: SuggestionType;
  code: string;
  name: string;
  explanation: string;
  safety?: 'safe' | 'warning' | 'danger';
}

/** Result of running the analyze command. */
export interface AnalysisResult {
  shell: 'bash' | 'zsh' | 'powershell';
  historyFile: string;
  totalCommands: number;
  uniqueCommands: number;
  patterns: CommandPattern[];
  safetyAlerts: SafetyAlert[];
}

/** Detected dangerous pattern with risk and safer alternative. */
export interface SafetyAlert {
  pattern: string;
  frequency: number;
  risk: string;
  saferAlternative: string;
}

/** Supported shell for analysis/suggestions. */
export type ShellType = AnalysisResult['shell'];

/** Output format for analyze/report. */
export type OutputFormat = 'table' | 'json' | 'markdown';

/** Options for analyze command. */
export interface AnalyzeOptions {
  shell?: ShellType | 'auto';
  historyFile?: string;
  minFrequency?: number;
  top?: number;
  format?: OutputFormat;
}

/** Options for suggest command. */
export interface SuggestOptions {
  shell?: ShellType | 'auto';
  historyFile?: string;
  minFrequency?: number;
  output?: string;
  interactive?: boolean;
}

/** Options for apply command. */
export interface ApplyOptions {
  output?: string;
  appendTo?: string;
  dryRun?: boolean;
  backup?: boolean;
  interactive?: boolean;
}

/** Options for report command. */
export interface ReportOptions {
  shell?: ShellType | 'auto';
  historyFile?: string;
  minFrequency?: number;
  top?: number;
  output?: string;
  format?: 'markdown' | 'json';
}

/** Shape of the JSON cache written after a successful `suggest` run. */
export interface SuggestionsCache {
  shell: ShellType;
  generatedAt: string;
  suggestions: Suggestion[];
}

/** A single search result from the RAG search feature. */
export interface SearchResult {
  /** The original command string from history. */
  command: string;
  /** Relevance score (0–1, higher is better). */
  score: number;
  /** Timestamp of last usage, if available. */
  lastUsed?: Date;
  /** How many times this command appeared in history. */
  frequency: number;
  /** Line number in history file where the command last appeared. */
  lineNumber: number;
}

/** Options for the search command. */
export interface SearchOptions {
  shell?: ShellType | 'auto';
  historyFile?: string;
  query: string;
  maxResults?: number;
  format?: OutputFormat;
  explain?: boolean;
}
