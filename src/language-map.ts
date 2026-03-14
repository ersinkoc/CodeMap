/**
 * Single source of truth for file extension → language mapping.
 *
 * Kept in its own module to avoid circular dependencies between
 * scanner.ts and plugins/registry.ts.
 * @module
 */

import type { LanguageId } from './types.js';

/** Map of file extensions to language identifiers */
export const EXTENSION_LANGUAGE_MAP: Readonly<Record<string, LanguageId>> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mjs': 'typescript',
  '.mts': 'typescript',
  '.go': 'go',
  '.py': 'python',
  '.rs': 'rust',
  '.php': 'php',
  '.java': 'java',
  '.cs': 'csharp',
};
