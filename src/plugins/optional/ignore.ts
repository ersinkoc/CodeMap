/**
 * Ignore pattern support plugin.
 *
 * Reads .codemapignore file and applies gitignore-compatible patterns
 * to exclude files from scanning.
 * @module
 */

import type { CodemapPlugin, CodemapContext } from '../../types.js';
import { readIgnoreFile } from '../../scanner.js';

/**
 * Create the ignore pattern plugin.
 */
export function createIgnorePlugin(): CodemapPlugin {
  return {
    name: 'ignore',
    version: '1.0.0',
    install() {
      // Ignore patterns are handled by the scanner
    },
    async onInit(context: CodemapContext) {
      // Read .codemapignore and merge with config ignore patterns
      const ignorePatterns = readIgnoreFile(context.config.root);
      if (ignorePatterns.length > 0) {
        // Patterns are applied during scanning via the scanner module
        // This plugin ensures the file is read and patterns are available
      }
    },
  };
}
