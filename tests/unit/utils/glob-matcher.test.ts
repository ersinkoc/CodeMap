import { describe, it, expect } from 'vitest';
import { globToRegex, matchGlob, shouldIgnore, DEFAULT_IGNORE_PATTERNS } from '../../../src/utils/glob-matcher.js';

describe('glob-matcher', () => {
  describe('globToRegex', () => {
    it('should convert simple wildcards', () => {
      const re = globToRegex('*.ts');
      expect(re.test('foo.ts')).toBe(true);
      expect(re.test('foo.js')).toBe(false);
    });

    it('should handle ** for directory matching', () => {
      const re = globToRegex('**/*.test.ts');
      expect(re.test('src/foo.test.ts')).toBe(true);
      expect(re.test('src/deep/bar.test.ts')).toBe(true);
      expect(re.test('foo.test.ts')).toBe(true);
    });

    it('should handle ? for single character', () => {
      const re = globToRegex('?.ts');
      expect(re.test('a.ts')).toBe(true);
      expect(re.test('ab.ts')).toBe(false);
    });

    it('should handle character classes', () => {
      const re = globToRegex('[abc].ts');
      expect(re.test('a.ts')).toBe(true);
      expect(re.test('d.ts')).toBe(false);
    });

    it('should handle character class with negation [!abc]', () => {
      const re = globToRegex('[!abc].ts');
      expect(re.test('d.ts')).toBe(true);
      expect(re.test('a.ts')).toBe(false);
    });

    it('should handle trailing slash in pattern (directory indicator)', () => {
      const re = globToRegex('dist/');
      expect(re.test('dist')).toBe(true);
    });

    it('should escape special regex characters like + ( ) { } | ^ $', () => {
      const re = globToRegex('file+name.ts');
      expect(re.test('file+name.ts')).toBe(true);
      expect(re.test('filename.ts')).toBe(false);
    });

    it('should escape parentheses in pattern', () => {
      const re = globToRegex('(test).ts');
      expect(re.test('(test).ts')).toBe(true);
    });

    it('should escape curly braces in pattern', () => {
      const re = globToRegex('file{1}.ts');
      expect(re.test('file{1}.ts')).toBe(true);
    });

    it('should escape pipe character in pattern', () => {
      const re = globToRegex('a|b.ts');
      expect(re.test('a|b.ts')).toBe(true);
    });

    it('should escape caret and dollar in pattern', () => {
      const re = globToRegex('^start$.ts');
      expect(re.test('^start$.ts')).toBe(true);
    });

    it('should handle **/ at start of pattern', () => {
      const re = globToRegex('**/test.ts');
      expect(re.test('src/deep/test.ts')).toBe(true);
      expect(re.test('test.ts')).toBe(true);
    });

    it('should handle ** at end of pattern (match everything)', () => {
      const re = globToRegex('src/**');
      expect(re.test('src/foo.ts')).toBe(true);
      expect(re.test('src/deep/bar.ts')).toBe(true);
    });

    it('should handle forward slash in pattern', () => {
      const re = globToRegex('src/utils');
      expect(re.test('src/utils')).toBe(true);
    });

    it('should handle backslash in pattern', () => {
      const re = globToRegex('src\\utils');
      expect(re.test('src/utils')).toBe(true);
      expect(re.test('src\\utils')).toBe(true);
    });
  });

  describe('matchGlob', () => {
    it('should match file names', () => {
      expect(matchGlob('foo.test.ts', '*.test.ts')).toBe(true);
      expect(matchGlob('foo.ts', '*.test.ts')).toBe(false);
    });

    it('should match directory patterns', () => {
      expect(matchGlob('node_modules/foo/bar.js', 'node_modules')).toBe(true);
    });

    it('should handle nested paths', () => {
      expect(matchGlob('src/utils/helper.test.ts', '**/*.test.ts')).toBe(true);
    });

    it('should normalize backslashes', () => {
      expect(matchGlob('src\\utils\\helper.test.ts', '**/*.test.ts')).toBe(true);
    });
  });

  describe('shouldIgnore', () => {
    it('should ignore matching patterns', () => {
      expect(shouldIgnore('foo.test.ts', ['*.test.ts'])).toBe(true);
    });

    it('should not ignore non-matching files', () => {
      expect(shouldIgnore('foo.ts', ['*.test.ts'])).toBe(false);
    });

    it('should handle negation patterns', () => {
      const patterns = ['*.test.ts', '!important.test.ts'];
      expect(shouldIgnore('foo.test.ts', patterns)).toBe(true);
      expect(shouldIgnore('important.test.ts', patterns)).toBe(false);
    });

    it('should skip comments and empty lines', () => {
      const patterns = ['# comment', '', '*.test.ts'];
      expect(shouldIgnore('foo.test.ts', patterns)).toBe(true);
    });

    it('should return false for empty patterns', () => {
      expect(shouldIgnore('foo.ts', [])).toBe(false);
    });
  });

  describe('DEFAULT_IGNORE_PATTERNS', () => {
    it('should include common patterns', () => {
      expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('.git');
      expect(DEFAULT_IGNORE_PATTERNS).toContain('dist');
    });
  });
});
