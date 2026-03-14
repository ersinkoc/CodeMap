import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineConfig, loadConfig, parseFormatString, scanOptionsToConfig, DEFAULT_CONFIG } from '../../src/config.js';
import { ConfigError } from '../../src/errors.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('defineConfig', () => {
  it('should pass through valid config', () => {
    const config = { root: './src', format: 'compact' as const };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });

  it('should throw ConfigError for invalid format', () => {
    expect(() =>
      defineConfig({ format: 'yaml' as never }),
    ).toThrow(ConfigError);
  });

  it('should throw ConfigError for invalid language', () => {
    expect(() =>
      defineConfig({ languages: ['ruby' as never] }),
    ).toThrow(ConfigError);
  });

  it('should accept valid array of formats', () => {
    const config = { format: ['compact', 'json'] as const };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });

  it('should accept valid languages', () => {
    const config = { languages: ['typescript', 'go', 'python'] as const };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });
});

describe('parseFormatString', () => {
  it('should parse comma-separated formats', () => {
    const result = parseFormatString('compact,json');
    expect(result).toEqual(['compact', 'json']);
  });

  it('should filter invalid formats', () => {
    const result = parseFormatString('compact,yaml,json,xml');
    expect(result).toEqual(['compact', 'json']);
  });

  it('should handle whitespace around formats', () => {
    const result = parseFormatString(' compact , json ');
    expect(result).toEqual(['compact', 'json']);
  });

  it('should return empty array for all-invalid input', () => {
    const result = parseFormatString('yaml,xml,csv');
    expect(result).toEqual([]);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('should have correct defaults', () => {
    expect(DEFAULT_CONFIG.root).toBe('./src');
    expect(DEFAULT_CONFIG.output).toBe('.codemap');
    expect(DEFAULT_CONFIG.format).toBe('compact');
    expect(DEFAULT_CONFIG.incremental).toBe(false);
    expect(DEFAULT_CONFIG.complexity).toBe(false);
    expect(DEFAULT_CONFIG.tokenCounts).toBe(true);
    expect(DEFAULT_CONFIG.monorepo).toBe(false);
  });
});

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-'));
  });

  it('should use defaults when no config files exist', () => {
    const config = loadConfig(tempDir);
    expect(config.format).toBe('compact');
    expect(config.incremental).toBe(false);
    expect(config.complexity).toBe(false);
    expect(config.tokenCounts).toBe(true);
    expect(config.monorepo).toBe(false);
  });

  it('should load .codemaprc config', () => {
    writeFileSync(
      join(tempDir, '.codemaprc'),
      JSON.stringify({ format: 'json' }),
    );
    const config = loadConfig(tempDir);
    expect(config.format).toBe('json');
  });

  it('should load package.json codemap field', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', codemap: { complexity: true } }),
    );
    const config = loadConfig(tempDir);
    expect(config.complexity).toBe(true);
  });

  it('should apply CLI overrides over file configs', () => {
    writeFileSync(
      join(tempDir, '.codemaprc'),
      JSON.stringify({ format: 'json' }),
    );
    const config = loadConfig(tempDir, { format: 'markdown' });
    expect(config.format).toBe('markdown');
  });

  it('should resolve root to absolute path', () => {
    const config = loadConfig(tempDir);
    const { isAbsolute } = require('node:path') as typeof import('node:path');
    expect(isAbsolute(config.root)).toBe(true);
  });

  it('should ignore malformed .codemaprc file', () => {
    writeFileSync(join(tempDir, '.codemaprc'), 'not json{{{');
    const config = loadConfig(tempDir);
    // Should fall back to defaults, not throw
    expect(config.format).toBe('compact');
  });

  it('should ignore package.json without codemap field', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', version: '1.0.0' }),
    );
    const config = loadConfig(tempDir);
    expect(config.format).toBe('compact');
  });

  it('should ignore package.json with non-object codemap field', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test', codemap: 'not-an-object' }),
    );
    const config = loadConfig(tempDir);
    expect(config.format).toBe('compact');
  });

  it('should ignore malformed package.json', () => {
    writeFileSync(join(tempDir, 'package.json'), 'not json{{{');
    const config = loadConfig(tempDir);
    expect(config.format).toBe('compact');
  });

  it('should try to load codemap.config.js file', () => {
    writeFileSync(
      join(tempDir, 'codemap.config.js'),
      'export default { root: "./lib" };',
    );
    // loadConfigFile tries to parse it but can't eval safely, so returns {}
    const config = loadConfig(tempDir);
    // The JS config is effectively a no-op (can't be parsed), so defaults apply
    expect(config.format).toBe('compact');
  });

  it('should handle codemap.config.js that cannot be read', () => {
    // Create a directory named codemap.config.js so readFileSync throws
    const { mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(tempDir, 'codemap.config.js'));
    const config = loadConfig(tempDir);
    expect(config.format).toBe('compact');
  });

  it('should resolve output to absolute path', () => {
    const config = loadConfig(tempDir);
    const { isAbsolute } = require('node:path') as typeof import('node:path');
    expect(isAbsolute(config.output)).toBe(true);
  });
});

describe('scanOptionsToConfig', () => {
  it('should return only root when no options given', () => {
    const result = scanOptionsToConfig('/my/root');
    expect(result).toEqual({ root: '/my/root' });
  });

  it('should return only root when options is undefined', () => {
    const result = scanOptionsToConfig('/my/root', undefined);
    expect(result).toEqual({ root: '/my/root' });
  });

  it('should convert all scan options to config', () => {
    const result = scanOptionsToConfig('/my/root', {
      format: 'json',
      incremental: true,
      complexity: true,
      tokenCounts: false,
      monorepo: true,
      ignore: ['dist/**'],
      languages: ['typescript', 'go'],
    });
    expect(result).toEqual({
      root: '/my/root',
      format: 'json',
      incremental: true,
      complexity: true,
      tokenCounts: false,
      monorepo: true,
      ignore: ['dist/**'],
      languages: ['typescript', 'go'],
    });
  });

  it('should only include defined options', () => {
    const result = scanOptionsToConfig('/root', {
      format: 'compact',
    });
    expect(result).toEqual({
      root: '/root',
      format: 'compact',
    });
    expect(result).not.toHaveProperty('incremental');
    expect(result).not.toHaveProperty('complexity');
  });
});
