/**
 * JSON formatter for the analyze command.
 *
 * Serialises the AnalysisResult to pretty-printed JSON for piping
 * or downstream consumption by other tools / commands.
 */

import type { AnalysisResult } from '../types/index.js';

/**
 * Format analysis results as pretty-printed JSON.
 *
 * @param result - The structured analysis data.
 * @returns A JSON string (2-space indented).
 */
export function formatAnalysisJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
