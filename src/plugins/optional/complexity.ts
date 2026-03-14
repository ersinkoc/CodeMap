/**
 * Cyclomatic complexity scoring plugin.
 *
 * Calculates complexity per file using heuristic counting
 * of branching keywords on actual source code.
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodemapPlugin, ScanResult, FileAnalysis } from '../../types.js';

/** Keywords that increase cyclomatic complexity */
const COMPLEXITY_KEYWORDS = [
  'if', 'else', 'switch', 'case', 'for', 'while', 'do',
  'catch', 'throw', '&&', '||', '??', '?',
];

/**
 * Calculate cyclomatic complexity for a block of code.
 *
 * @param code - Source code block
 * @returns Complexity score (minimum 1)
 */
export function calculateComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Count branching keywords
  for (const keyword of COMPLEXITY_KEYWORDS) {
    if (keyword === '?' || keyword === '&&' || keyword === '||' || keyword === '??') {
      // Count operator occurrences
      let idx = 0;
      while ((idx = code.indexOf(keyword, idx)) !== -1) {
        // Skip ternary ? that's part of optional chaining ?.
        if (keyword === '?' && code[idx + 1] === '.') {
          idx += 2;
          continue;
        }
        // Skip ?? inside ?.
        if (keyword === '?' && idx > 0 && code[idx - 1] === '?') {
          idx += 1;
          continue;
        }
        complexity++;
        idx += keyword.length;
      }
    } else {
      // Count keyword occurrences (word boundary check)
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }
  }

  return complexity;
}

/**
 * Calculate complexity for a file by reading its actual source code.
 */
function calculateFileComplexityFromSource(rootDir: string, file: FileAnalysis): number {
  try {
    const absPath = join(rootDir, file.path);
    const content = readFileSync(absPath, 'utf-8');
    return calculateComplexity(content);
  } catch {
    return 1;
  }
}

/**
 * Create the complexity scoring plugin.
 */
export function createComplexityPlugin(): CodemapPlugin {
  return {
    name: 'complexity',
    version: '1.0.0',
    install() {
      // No kernel registration needed
    },
    async onScanComplete(result: ScanResult) {
      // Add complexity scores by reading actual source files
      for (const file of result.files) {
        const mutableFile = file as { complexity?: number };
        mutableFile.complexity = calculateFileComplexityFromSource(result.root, file);
      }
    },
  };
}
