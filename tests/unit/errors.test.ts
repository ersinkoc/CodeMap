import { describe, it, expect } from 'vitest';
import {
  CodemapError,
  ParserError,
  ConfigError,
  PluginError,
  ScanError,
} from '../../src/errors.js';

describe('Error Classes', () => {
  describe('CodemapError', () => {
    it('should have correct name', () => {
      const err = new CodemapError('test message', 'TEST_CODE');
      expect(err.name).toBe('CodemapError');
    });

    it('should store message', () => {
      const err = new CodemapError('something failed', 'FAIL');
      expect(err.message).toBe('something failed');
    });

    it('should store code', () => {
      const err = new CodemapError('test', 'MY_CODE');
      expect(err.code).toBe('MY_CODE');
    });

    it('should store context', () => {
      const ctx = { key: 'value', num: 42 };
      const err = new CodemapError('test', 'CODE', ctx);
      expect(err.context).toEqual(ctx);
    });

    it('should be instanceof Error', () => {
      const err = new CodemapError('test', 'CODE');
      expect(err).toBeInstanceOf(Error);
    });

    it('should be instanceof CodemapError', () => {
      const err = new CodemapError('test', 'CODE');
      expect(err).toBeInstanceOf(CodemapError);
    });

    it('should have a stack trace', () => {
      const err = new CodemapError('test', 'CODE');
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe('string');
    });

    it('should have undefined context when not provided', () => {
      const err = new CodemapError('test', 'CODE');
      expect(err.context).toBeUndefined();
    });
  });

  describe('ParserError', () => {
    it('should have correct name', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err.name).toBe('ParserError');
    });

    it('should have PARSER_ERROR code', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err.code).toBe('PARSER_ERROR');
    });

    it('should store filePath', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err.filePath).toBe('src/index.ts');
    });

    it('should store language', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err.language).toBe('typescript');
    });

    it('should include filePath and language in context', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err.context).toHaveProperty('filePath', 'src/index.ts');
      expect(err.context).toHaveProperty('language', 'typescript');
    });

    it('should merge additional context', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript', { line: 42 });
      expect(err.context).toHaveProperty('line', 42);
      expect(err.context).toHaveProperty('filePath', 'src/index.ts');
    });

    it('should be instanceof CodemapError', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err).toBeInstanceOf(CodemapError);
    });

    it('should be instanceof Error', () => {
      const err = new ParserError('parse failed', 'src/index.ts', 'typescript');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('ConfigError', () => {
    it('should have correct name', () => {
      const err = new ConfigError('invalid config');
      expect(err.name).toBe('ConfigError');
    });

    it('should have CONFIG_ERROR code', () => {
      const err = new ConfigError('invalid config');
      expect(err.code).toBe('CONFIG_ERROR');
    });

    it('should store message', () => {
      const err = new ConfigError('invalid format type: yaml');
      expect(err.message).toBe('invalid format type: yaml');
    });

    it('should store context when provided', () => {
      const err = new ConfigError('bad config', { field: 'format' });
      expect(err.context).toEqual({ field: 'format' });
    });

    it('should be instanceof CodemapError', () => {
      const err = new ConfigError('bad config');
      expect(err).toBeInstanceOf(CodemapError);
    });
  });

  describe('PluginError', () => {
    it('should have correct name', () => {
      const err = new PluginError('plugin failed', 'my-plugin');
      expect(err.name).toBe('PluginError');
    });

    it('should have PLUGIN_ERROR code', () => {
      const err = new PluginError('plugin failed', 'my-plugin');
      expect(err.code).toBe('PLUGIN_ERROR');
    });

    it('should store pluginName', () => {
      const err = new PluginError('plugin failed', 'my-plugin');
      expect(err.pluginName).toBe('my-plugin');
    });

    it('should include pluginName in context', () => {
      const err = new PluginError('plugin failed', 'my-plugin');
      expect(err.context).toHaveProperty('pluginName', 'my-plugin');
    });

    it('should merge additional context', () => {
      const err = new PluginError('plugin failed', 'my-plugin', { reason: 'timeout' });
      expect(err.context).toHaveProperty('reason', 'timeout');
      expect(err.context).toHaveProperty('pluginName', 'my-plugin');
    });

    it('should be instanceof CodemapError', () => {
      const err = new PluginError('plugin failed', 'my-plugin');
      expect(err).toBeInstanceOf(CodemapError);
    });
  });

  describe('ScanError', () => {
    it('should have correct name', () => {
      const err = new ScanError('scan failed');
      expect(err.name).toBe('ScanError');
    });

    it('should have SCAN_ERROR code', () => {
      const err = new ScanError('scan failed');
      expect(err.code).toBe('SCAN_ERROR');
    });

    it('should store message', () => {
      const err = new ScanError('No scannable files found');
      expect(err.message).toBe('No scannable files found');
    });

    it('should store context when provided', () => {
      const err = new ScanError('scan failed', { root: '/path/to/root' });
      expect(err.context).toEqual({ root: '/path/to/root' });
    });

    it('should be instanceof CodemapError', () => {
      const err = new ScanError('scan failed');
      expect(err).toBeInstanceOf(CodemapError);
    });

    it('should be instanceof Error', () => {
      const err = new ScanError('scan failed');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('Error hierarchy and instanceof checks', () => {
    it('all custom errors should be catchable as CodemapError', () => {
      const errors: CodemapError[] = [
        new CodemapError('base', 'BASE'),
        new ParserError('parser', 'file.ts', 'typescript'),
        new ConfigError('config'),
        new PluginError('plugin', 'test-plugin'),
        new ScanError('scan'),
      ];

      for (const err of errors) {
        expect(err).toBeInstanceOf(CodemapError);
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('each error type should have a distinct name', () => {
      const names = new Set([
        new CodemapError('a', 'A').name,
        new ParserError('b', 'f', 'ts').name,
        new ConfigError('c').name,
        new PluginError('d', 'p').name,
        new ScanError('e').name,
      ]);
      expect(names.size).toBe(5);
    });
  });
});
