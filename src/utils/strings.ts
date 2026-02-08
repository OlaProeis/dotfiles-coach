/**
 * Shared string utility helpers.
 */

/** Capitalize the first letter of a string. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Truncate a string to `max` characters, appending `...` if truncated. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

/** Wrap text to a maximum line width (word-boundary aware). */
export function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}
