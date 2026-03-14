/**
 * Token count estimation engine.
 *
 * Estimates token counts using character-based heuristics.
 * Different languages have different token-to-character ratios.
 * @module
 */

import type { LanguageId } from './types.js';

/** Characters per token ratio by language */
const CHARS_PER_TOKEN: Record<string, number> = {
  typescript: 3.5,
  javascript: 3.5,
  go: 4.0,
  python: 3.8,
  rust: 3.5,
  php: 3.5,
  java: 3.3,
  csharp: 3.3,
  default: 3.5,
};

/**
 * Estimate the token count for a piece of source code.
 *
 * Uses language-specific character-to-token ratios based on empirical
 * measurements against common LLM tokenizers.
 *
 * @param content - Source code content
 * @param language - Language identifier for ratio selection
 * @returns Estimated token count (rounded to nearest integer)
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens('function hello() { return "world"; }', 'typescript');
 * console.log(tokens); // ~10
 * ```
 */
export function estimateTokens(content: string, language?: LanguageId | string): number {
  if (!content) return 0;

  const ratio = CHARS_PER_TOKEN[language ?? 'default'] ?? CHARS_PER_TOKEN['default']!;
  return Math.round(content.length / ratio);
}

/**
 * Estimate tokens for formatted map output.
 * Map output tends to be denser than source code.
 *
 * @param output - Formatted map output string
 * @returns Estimated token count
 */
export function estimateOutputTokens(output: string): number {
  if (!output) return 0;
  // Map output is denser, ~4 chars per token
  return Math.round(output.length / 4);
}

/**
 * Count lines of code (excluding empty lines and comment-only lines).
 *
 * @param content - Source code content
 * @returns Number of non-empty, non-comment lines
 */
export function countLoc(content: string): number {
  const lines = content.split('\n');
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#') && !trimmed.startsWith('*')) {
      count++;
    }
  }

  return count;
}
