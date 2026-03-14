import { describe, it, expect } from 'vitest';
import {
  createBraceState,
  updateBraceState,
  countBraceDepth,
  countParenDepth,
  findBlockEnd,
  extractBraceContent,
  isClosingBraceLine,
} from '../../../src/utils/brace-counter.js';

describe('brace-counter', () => {
  describe('createBraceState', () => {
    it('should create zero-initialized state', () => {
      const state = createBraceState();
      expect(state.braces).toBe(0);
      expect(state.parens).toBe(0);
      expect(state.brackets).toBe(0);
    });
  });

  describe('updateBraceState', () => {
    it('should increment braces on {', () => {
      const state = createBraceState();
      updateBraceState(state, '{');
      expect(state.braces).toBe(1);
    });

    it('should decrement braces on }', () => {
      const state = createBraceState();
      state.braces = 1;
      updateBraceState(state, '}');
      expect(state.braces).toBe(0);
    });

    it('should handle parens', () => {
      const state = createBraceState();
      updateBraceState(state, '(');
      expect(state.parens).toBe(1);
      updateBraceState(state, ')');
      expect(state.parens).toBe(0);
    });

    it('should handle brackets', () => {
      const state = createBraceState();
      updateBraceState(state, '[');
      expect(state.brackets).toBe(1);
      updateBraceState(state, ']');
      expect(state.brackets).toBe(0);
    });

    it('should ignore other characters', () => {
      const state = createBraceState();
      updateBraceState(state, 'a');
      expect(state.braces).toBe(0);
      expect(state.parens).toBe(0);
      expect(state.brackets).toBe(0);
    });
  });

  describe('countBraceDepth', () => {
    it('should return positive for opening braces', () => {
      expect(countBraceDepth('class Foo {')).toBe(1);
    });

    it('should return negative for closing braces', () => {
      expect(countBraceDepth('}')).toBe(-1);
    });

    it('should return 0 for balanced braces', () => {
      expect(countBraceDepth('{ a: { b } }')).toBe(0);
    });

    it('should handle empty string', () => {
      expect(countBraceDepth('')).toBe(0);
    });
  });

  describe('countParenDepth', () => {
    it('should count parentheses', () => {
      expect(countParenDepth('fn(a, b)')).toBe(0);
      expect(countParenDepth('fn(')).toBe(1);
      expect(countParenDepth(')')).toBe(-1);
    });
  });

  describe('findBlockEnd', () => {
    it('should find closing brace of a block', () => {
      const lines = ['class Foo {', '  method() {}', '}'];
      expect(findBlockEnd(lines, 0)).toBe(2);
    });

    it('should handle nested blocks', () => {
      const lines = ['class Foo {', '  if (x) {', '    y();', '  }', '}'];
      expect(findBlockEnd(lines, 0)).toBe(4);
    });

    it('should return last line if unmatched', () => {
      const lines = ['class Foo {', '  method()'];
      expect(findBlockEnd(lines, 0)).toBe(1);
    });

    it('should handle single-line blocks', () => {
      const lines = ['function f() { return 1; }'];
      expect(findBlockEnd(lines, 0)).toBe(0);
    });
  });

  describe('extractBraceContent', () => {
    it('should extract content between braces', () => {
      expect(extractBraceContent('{ a, b, c }', 0)).toBe(' a, b, c ');
    });

    it('should handle nested braces', () => {
      expect(extractBraceContent('{ a: { b } }', 0)).toBe(' a: { b } ');
    });

    it('should return empty for non-brace start', () => {
      expect(extractBraceContent('no braces', 0)).toBe('');
    });

    it('should return remaining content when closing brace is missing', () => {
      expect(extractBraceContent('{ a, b, c', 0)).toBe(' a, b, c');
    });
  });

  describe('isClosingBraceLine', () => {
    it('should match closing brace', () => {
      expect(isClosingBraceLine('}')).toBe(true);
      expect(isClosingBraceLine('  }')).toBe(true);
      expect(isClosingBraceLine('  };')).toBe(true);
    });

    it('should not match non-closing lines', () => {
      expect(isClosingBraceLine('const x = {};')).toBe(false);
      expect(isClosingBraceLine('{ }')).toBe(false);
    });
  });
});
