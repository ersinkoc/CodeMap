/**
 * File system scanner/walker with ignore pattern support.
 *
 * Recursively walks directories and returns files matching
 * supported language extensions, respecting ignore patterns.
 * @module
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { shouldIgnore, DEFAULT_IGNORE_PATTERNS } from './utils/glob-matcher.js';
import { EXTENSION_LANGUAGE_MAP } from './language-map.js';

/** Scanned file entry */
export interface ScannedFile {
  /** Absolute path to file */
  readonly absolutePath: string;
  /** Relative path from scan root */
  readonly relativePath: string;
  /** Detected language */
  readonly language: string;
  /** File content */
  readonly content: string;
}

/**
 * Get the language identifier for a file extension.
 *
 * @param ext - File extension (with dot)
 * @returns Language identifier or undefined
 */
export function getLanguageForExtension(ext: string): string | undefined {
  return EXTENSION_LANGUAGE_MAP[ext.toLowerCase()];
}

/**
 * Get all supported file extensions.
 *
 * @returns Array of supported extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_LANGUAGE_MAP);
}

/**
 * Scan a directory recursively and return all matching source files.
 *
 * @param root - Root directory to scan
 * @param options - Scan options
 * @returns Array of scanned file entries
 *
 * @example
 * ```typescript
 * const files = scanDirectory('./src');
 * for (const file of files) {
 *   console.log(file.relativePath, file.language);
 * }
 * ```
 */
export function scanDirectory(
  root: string,
  options: {
    readonly ignorePatterns?: readonly string[] | undefined;
    readonly languages?: readonly string[] | undefined;
    readonly changedFiles?: readonly string[] | undefined;
  } = {},
): ScannedFile[] {
  const {
    ignorePatterns = [],
    languages,
    changedFiles,
  } = options;

  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...ignorePatterns];
  const files: ScannedFile[] = [];
  const changedSet = changedFiles ? new Set(changedFiles.map((f) => f.replace(/\\/g, '/'))) : null;

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relPath = relative(root, fullPath).replace(/\\/g, '/');

      if (shouldIgnore(relPath, allPatterns)) {
        continue;
      }

      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (stats.isFile()) {
        const ext = extname(entry);
        const lang = getLanguageForExtension(ext);

        if (!lang) continue;

        // Filter by requested languages
        if (languages && !languages.includes(lang)) continue;

        // Filter by changed files (incremental mode)
        if (changedSet && !changedSet.has(relPath)) continue;

        try {
          const content = readFileSync(fullPath, 'utf-8');
          files.push({
            absolutePath: fullPath,
            relativePath: relPath,
            language: lang,
            content,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(root);
  return files;
}

/**
 * Read ignore patterns from a .codemapignore file.
 *
 * @param dir - Directory containing the .codemapignore file
 * @returns Array of ignore patterns, or empty array if file doesn't exist
 */
export function readIgnoreFile(dir: string): string[] {
  const filePath = join(dir, '.codemapignore');
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}
