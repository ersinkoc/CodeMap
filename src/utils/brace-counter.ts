/**
 * Brace/parenthesis counting for multi-line construct detection.
 *
 * Tracks depth of braces, brackets, and parentheses to determine
 * scope boundaries for classes, functions, and interfaces.
 * @module
 */

/** Counter state for brace tracking */
export interface BraceState {
  braces: number; // { }
  parens: number; // ( )
  brackets: number; // [ ]
}

/**
 * Create a fresh brace counter state.
 *
 * @returns New zero-initialized BraceState
 *
 * @example
 * ```typescript
 * const state = createBraceState();
 * updateBraceState(state, '{');
 * console.log(state.braces); // 1
 * ```
 */
export function createBraceState(): BraceState {
  return { braces: 0, parens: 0, brackets: 0 };
}

/**
 * Update brace state for a single character.
 *
 * @param state - Mutable brace state to update
 * @param ch - Character to process
 */
export function updateBraceState(state: BraceState, ch: string): void {
  switch (ch) {
    case '{':
      state.braces++;
      break;
    case '}':
      state.braces--;
      break;
    case '(':
      state.parens++;
      break;
    case ')':
      state.parens--;
      break;
    case '[':
      state.brackets++;
      break;
    case ']':
      state.brackets--;
      break;
  }
}

/**
 * Count brace depth changes in a line of code.
 * Returns the net change in brace depth.
 *
 * @param line - Line of code (should be comment-stripped)
 * @returns Net brace depth change (positive = more opens, negative = more closes)
 *
 * @example
 * ```typescript
 * countBraceDepth('class Foo {'); // 1
 * countBraceDepth('}');          // -1
 * countBraceDepth('{ a: { b } }'); // 0
 * ```
 */
export function countBraceDepth(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth;
}

/**
 * Count parenthesis depth changes in a line of code.
 *
 * @param line - Line of code
 * @returns Net paren depth change
 */
export function countParenDepth(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth;
}

/**
 * Find the end line of a block that starts at startLine.
 * Tracks brace depth to find matching closing brace.
 *
 * @param lines - Array of source code lines (comment-stripped)
 * @param startLine - Zero-based line index where the block starts
 * @returns Zero-based line index of the closing brace, or last line if unmatched
 *
 * @example
 * ```typescript
 * const lines = ['class Foo {', '  method() {}', '}'];
 * findBlockEnd(lines, 0); // 2
 * ```
 */
export function findBlockEnd(lines: readonly string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        foundOpen = true;
      } else if (ch === '}') {
        depth--;
        if (foundOpen && depth === 0) {
          return i;
        }
      }
    }
  }

  return lines.length - 1;
}

/**
 * Extract content between matching braces starting from a position in text.
 *
 * @param text - Source text
 * @param startPos - Position of the opening brace
 * @returns Content between braces (excluding the braces themselves), or empty string
 */
export function extractBraceContent(text: string, startPos: number): string {
  if (text[startPos] !== '{') return '';

  let depth = 0;
  let i = startPos;

  while (i < text.length) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(startPos + 1, i);
      }
    }
    i++;
  }

  return text.slice(startPos + 1);
}

/**
 * Check if a line contains only a closing brace (with optional whitespace).
 *
 * @param line - Line to check
 * @returns True if line is just a closing brace
 */
export function isClosingBraceLine(line: string): boolean {
  return /^\s*\}\s*;?\s*$/.test(line);
}
