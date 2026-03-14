/**
 * Strip comments and string literals from source code to prevent false regex matches.
 *
 * Replaces content with whitespace to preserve line numbers and character positions.
 * @module
 */

/**
 * Strip single-line comments, block comments, and string literals from source code.
 * Preserves line structure by replacing content with spaces (keeps newlines intact).
 *
 * @param content - Raw source code
 * @param language - Language identifier for language-specific comment syntax
 * @returns Source with comments and strings replaced by spaces
 *
 * @example
 * ```typescript
 * const stripped = stripComments('const x = "hello"; // comment', 'typescript');
 * // 'const x =         ;           '
 * ```
 */
export function stripComments(content: string, language: string): string {
  if (language === 'python') {
    return stripPythonComments(content);
  }
  if (language === 'ruby') {
    return stripRubyComments(content);
  }

  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i]!;
    const next = i + 1 < len ? content[i + 1] : '';

    // Single-line comment: // (most languages) or # (python/shell in strings)
    if (ch === '/' && next === '/') {
      while (i < len && content[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && next === '*') {
      result += '  ';
      i += 2;
      while (i < len) {
        if (content[i] === '*' && i + 1 < len && content[i + 1] === '/') {
          result += '  ';
          i += 2;
          break;
        }
        result += content[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // PHP single-line comment: #
    if (ch === '#' && (language === 'php' || language === 'python')) {
      while (i < len && content[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Rust line doc comments are handled by // above
    // C# XML doc comments are handled by // above

    // Template literals (backtick strings for TS/JS)
    if (ch === '`' && (language === 'typescript' || language === 'javascript')) {
      result += ' ';
      i++;
      let depth = 0;
      while (i < len) {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '$' && i + 1 < len && content[i + 1] === '{') {
          depth++;
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '}' && depth > 0) {
          depth--;
          result += ' ';
          i++;
          continue;
        }
        if (content[i] === '`' && depth === 0) {
          result += ' ';
          i++;
          break;
        }
        result += content[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      result += ' ';
      i++;
      while (i < len && content[i] !== '"') {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '\n') {
          // Unterminated string at end of line — stop
          break;
        }
        result += ' ';
        i++;
      }
      if (i < len && content[i] === '"') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Single-quoted string (but not Rust lifetime params like 'a)
    if (ch === "'") {
      // In Rust, 'a is a lifetime, not a string. Only treat 'X' (char literal) as string.
      if (language === 'rust') {
        // Rust char literal: 'x' or '\n' (exactly one char or escape + char between quotes)
        if (i + 2 < len && content[i + 1] === '\\' && i + 3 < len && content[i + 3] === "'") {
          result += '    ';
          i += 4;
          continue;
        }
        if (i + 2 < len && content[i + 2] === "'") {
          result += '   ';
          i += 3;
          continue;
        }
        // Otherwise it's a lifetime — keep it
        result += ch;
        i++;
        continue;
      }
      result += ' ';
      i++;
      while (i < len && content[i] !== "'") {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '\n') {
          break;
        }
        result += ' ';
        i++;
      }
      if (i < len && content[i] === "'") {
        result += ' ';
        i++;
      }
      continue;
    }

    // Go raw strings: `...`
    if (ch === '`' && language === 'go') {
      result += ' ';
      i++;
      while (i < len && content[i] !== '`') {
        result += content[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < len) {
        result += ' ';
        i++;
      }
      continue;
    }

    // Rust raw strings: r"..." or r#"..."#
    if (
      ch === 'r' &&
      language === 'rust' &&
      i + 1 < len &&
      (content[i + 1] === '"' || content[i + 1] === '#')
    ) {
      let hashes = 0;
      let j = i + 1;
      while (j < len && content[j] === '#') {
        hashes++;
        j++;
      }
      if (j < len && content[j] === '"') {
        // Found r#..."..."# pattern
        const closePattern = '"' + '#'.repeat(hashes);
        result += ' '.repeat(j - i + 1);
        i = j + 1;
        while (i < len) {
          const remaining = content.slice(i, i + closePattern.length);
          if (remaining === closePattern) {
            result += ' '.repeat(closePattern.length);
            i += closePattern.length;
            break;
          }
          result += content[i] === '\n' ? '\n' : ' ';
          i++;
        }
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Strip Python comments and string literals.
 * Handles # comments, triple-quoted strings (""" and '''), and regular strings.
 */
function stripPythonComments(content: string): string {
  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i]!;

    // Triple-quoted strings
    if (
      (ch === '"' || ch === "'") &&
      i + 2 < len &&
      content[i + 1] === ch &&
      content[i + 2] === ch
    ) {
      const quote = ch;
      result += '   ';
      i += 3;
      while (i < len) {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (
          content[i] === quote &&
          i + 2 < len &&
          content[i + 1] === quote &&
          content[i + 2] === quote
        ) {
          result += '   ';
          i += 3;
          break;
        }
        result += content[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // # comment
    if (ch === '#') {
      while (i < len && content[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Regular strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      result += ' ';
      i++;
      while (i < len && content[i] !== quote) {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '\n') {
          break;
        }
        result += ' ';
        i++;
      }
      if (i < len && content[i] === quote) {
        result += ' ';
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Strip Ruby comments and string literals.
 * Handles # comments, =begin...=end block comments, and regular strings.
 */
function stripRubyComments(content: string): string {
  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i]!;

    // =begin...=end block comment (must be at start of line)
    if (
      ch === '=' &&
      (i === 0 || content[i - 1] === '\n') &&
      content.slice(i, i + 6) === '=begin'
    ) {
      while (i < len) {
        if (content[i] === '\n') {
          result += '\n';
          i++;
          if (content.slice(i, i + 4) === '=end') {
            while (i < len && content[i] !== '\n') {
              result += ' ';
              i++;
            }
            break;
          }
        } else {
          result += ' ';
          i++;
        }
      }
      continue;
    }

    // # comment
    if (ch === '#') {
      while (i < len && content[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      result += ' ';
      i++;
      while (i < len && content[i] !== '"') {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '\n') break;
        result += ' ';
        i++;
      }
      if (i < len && content[i] === '"') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Single-quoted string
    if (ch === "'") {
      result += ' ';
      i++;
      while (i < len && content[i] !== "'") {
        if (content[i] === '\\') {
          result += '  ';
          i += 2;
          continue;
        }
        if (content[i] === '\n') break;
        result += ' ';
        i++;
      }
      if (i < len && content[i] === "'") {
        result += ' ';
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}
