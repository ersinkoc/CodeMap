import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateOutputTokens, countLoc } from '../../src/token-estimator.js';

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should return reasonable estimates for code', () => {
    const code = 'function hello() { return "world"; }';
    const tokens = estimateTokens(code);
    // 36 chars / 3.5 (default ratio) ≈ 10
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(code.length);
  });

  it('should use language-specific ratios', () => {
    // Use a long enough string so rounding differences are visible
    const code = 'const x = 1; const y = 2; const z = 3; const w = 4; const v = 5; const u = 6; const t = 7; const s = 8;';
    const tsTokens = estimateTokens(code, 'typescript');
    const goTokens = estimateTokens(code, 'go');
    const javaTokens = estimateTokens(code, 'java');

    // Go has a higher chars-per-token ratio (4.0) than TypeScript (3.5),
    // so Go should estimate fewer tokens for the same string.
    expect(goTokens).toBeLessThan(tsTokens);

    // Java (3.3) has a lower ratio than TypeScript (3.5),
    // so Java should estimate more tokens.
    expect(javaTokens).toBeGreaterThan(tsTokens);
  });

  it('should fall back to default ratio for unknown language', () => {
    const code = 'some code content here that is long enough to produce a non-zero result';
    const unknownTokens = estimateTokens(code, 'brainfuck' as any);
    const defaultTokens = estimateTokens(code);
    // Both should use the default ratio (3.5)
    expect(unknownTokens).toBe(defaultTokens);
    expect(unknownTokens).toBeGreaterThan(0);
  });
});

describe('estimateOutputTokens', () => {
  it('should estimate map output tokens', () => {
    const output = 'src/index.ts: fn hello(name: string): void';
    const tokens = estimateOutputTokens(output);
    // 43 chars / 4 = ~11
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.round(output.length / 4));
  });

  it('should return 0 for empty string', () => {
    expect(estimateOutputTokens('')).toBe(0);
  });
});

describe('countLoc', () => {
  it('should count non-empty, non-comment lines', () => {
    const code = [
      'const x = 1;',
      'const y = 2;',
      'const z = 3;',
    ].join('\n');
    expect(countLoc(code)).toBe(3);
  });

  it('should skip comment-only lines (// and #)', () => {
    const code = [
      '// this is a comment',
      'const x = 1;',
      '# this is a hash comment',
      'const y = 2;',
      '  // indented comment',
      '  # indented hash comment',
    ].join('\n');
    expect(countLoc(code)).toBe(2);
  });

  it('should skip empty lines', () => {
    const code = [
      'const x = 1;',
      '',
      '   ',
      'const y = 2;',
    ].join('\n');
    expect(countLoc(code)).toBe(2);
  });

  it('should skip lines starting with *', () => {
    const code = [
      '/**',
      ' * JSDoc comment',
      ' */',
      'function hello() {}',
    ].join('\n');
    // Lines starting with * (after trim) are skipped
    // '/**' starts with '/' not '*' but is not //, so it counts
    // ' * JSDoc comment' starts with '*' → skipped
    // ' */' starts with '*' → skipped
    // 'function hello() {}' → counts
    expect(countLoc(code)).toBe(2);
  });
});
