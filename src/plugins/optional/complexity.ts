/**
 * Cyclomatic complexity scoring plugin.
 *
 * Calculates complexity per function/method using heuristic counting
 * of branching keywords.
 * @module
 */

import type { CodemapPlugin, ScanResult, FileAnalysis, FunctionInfo } from '../../types.js';

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
 * Calculate average complexity for a file's functions.
 */
function calculateFileComplexity(file: FileAnalysis): number {
  const allFunctions: FunctionInfo[] = [
    ...file.functions,
    ...file.classes.flatMap((c) => c.methods),
  ];

  if (file.components) {
    allFunctions.push(...file.components);
  }
  if (file.hooks) {
    allFunctions.push(...file.hooks);
  }

  if (allFunctions.length === 0) return 1;

  const totalComplexity = allFunctions.reduce(
    (sum, fn) => sum + (fn.complexity ?? 1),
    0,
  );

  return Math.round(totalComplexity / allFunctions.length);
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
      // Add complexity scores to files
      for (const file of result.files) {
        const mutableFile = file as { complexity?: number };
        mutableFile.complexity = calculateFileComplexity(file);
      }
    },
  };
}
