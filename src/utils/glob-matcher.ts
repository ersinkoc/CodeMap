/**
 * Gitignore-compatible glob matching for file path filtering.
 *
 * Supports: *, **, ?, [abc], negation (!), directory markers (/)
 * @module
 */

/**
 * Convert a gitignore-style glob pattern to a RegExp.
 *
 * @param pattern - Gitignore-style glob pattern
 * @returns Compiled RegExp for matching
 *
 * @example
 * ```typescript
 * const re = globToRegex('*.test.ts');
 * re.test('foo.test.ts'); // true
 * re.test('foo.ts');      // false
 * ```
 */
export function globToRegex(pattern: string): RegExp {
  let p = pattern;

  // Remove trailing slash (directory indicator) - we match paths without trailing slash
  if (p.endsWith('/')) {
    p = p.slice(0, -1);
  }

  let regex = '';
  let i = 0;

  while (i < p.length) {
    const ch = p[i]!;

    if (ch === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          // **/ matches zero or more directories
          regex += '(?:.+/)?';
          i += 3;
        } else {
          // ** at end matches everything
          regex += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /
        regex += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      regex += '[^/]';
      i++;
    } else if (ch === '[') {
      // Character class
      let cls = '[';
      i++;
      if (i < p.length && p[i] === '!') {
        cls += '^';
        i++;
      }
      while (i < p.length && p[i] !== ']') {
        cls += p[i];
        i++;
      }
      cls += ']';
      regex += cls;
      i++; // skip ]
    } else if (ch === '.') {
      regex += '\\.';
      i++;
    } else if (ch === '/' || ch === '\\') {
      regex += '[/\\\\]';
      i++;
    } else if ('+(){}|^$'.includes(ch)) {
      regex += '\\' + ch;
      i++;
    } else {
      regex += ch;
      i++;
    }
  }

  return new RegExp('^(?:.*[/\\\\])?' + regex + '$', 'i');
}

/**
 * Check if a file path matches a glob pattern.
 *
 * @param filePath - File path to test (forward slashes)
 * @param pattern - Gitignore-style glob pattern
 * @returns True if path matches pattern
 *
 * @example
 * ```typescript
 * matchGlob('src/utils/helper.test.ts', '*.test.ts');  // true
 * matchGlob('src/utils/helper.ts', '*.test.ts');       // false
 * matchGlob('node_modules/foo/bar.js', 'node_modules'); // true
 * ```
 */
export function matchGlob(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const re = globToRegex(pattern);
  if (re.test(normalized)) return true;

  // For bare directory patterns (no glob characters), also match if the path
  // contains the pattern as a directory component (e.g., 'node_modules' matches
  // 'node_modules/foo/bar.js' or 'src/node_modules/pkg/index.js').
  if (!/[*?[\]]/.test(pattern)) {
    const clean = pattern.replace(/\/$/, '');
    if (
      normalized === clean ||
      normalized.startsWith(clean + '/') ||
      normalized.includes('/' + clean + '/') ||
      normalized.endsWith('/' + clean)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a file path should be ignored based on a list of patterns.
 * Supports negation patterns (starting with !).
 *
 * @param filePath - File path to test
 * @param patterns - Array of gitignore-style patterns
 * @returns True if the file should be ignored
 *
 * @example
 * ```typescript
 * const patterns = ['*.test.ts', '!important.test.ts'];
 * shouldIgnore('foo.test.ts', patterns);       // true
 * shouldIgnore('important.test.ts', patterns); // false
 * shouldIgnore('foo.ts', patterns);            // false
 * ```
 */
export function shouldIgnore(filePath: string, patterns: readonly string[]): boolean {
  let ignored = false;

  for (const pattern of patterns) {
    if (!pattern || pattern.startsWith('#')) {
      continue;
    }

    const trimmed = pattern.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('!')) {
      const negPattern = trimmed.slice(1);
      if (matchGlob(filePath, negPattern)) {
        ignored = false;
      }
    } else {
      if (matchGlob(filePath, trimmed)) {
        ignored = true;
      }
    }
  }

  return ignored;
}

/** Built-in ignore patterns that are always applied */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.codemap',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  'bin',
  'obj',
  '.idea',
  '.vscode',
  '.DS_Store',
  'Thumbs.db',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.d.ts',
];
