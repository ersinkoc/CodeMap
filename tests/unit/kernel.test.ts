import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKernel, Kernel, setupKernel } from '../../src/kernel.js';
import type {
  CodemapConfig,
  CodemapPlugin,
  LanguageParser,
  OutputFormatter,
  FileAnalysis,
} from '../../src/types.js';
import { PluginError } from '../../src/errors.js';

function makeConfig(overrides?: Partial<CodemapConfig>): CodemapConfig {
  return {
    root: '/tmp/test',
    output: '/tmp/test/.codemap',
    format: 'compact',
    incremental: false,
    complexity: false,
    tokenCounts: true,
    monorepo: false,
    ...overrides,
  };
}

function makePlugin(name: string, overrides?: Partial<CodemapPlugin>): CodemapPlugin {
  return {
    name,
    version: '1.0.0',
    install: vi.fn(),
    ...overrides,
  };
}

function makeParser(name: string, extensions: string[]): LanguageParser {
  return {
    name,
    extensions,
    parse: vi.fn().mockReturnValue({
      path: 'test.ts',
      language: 'typescript',
      loc: 10,
      estimatedTokens: 50,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
      enums: [],
      constants: [],
    } satisfies FileAnalysis),
  };
}

function makeFormatter(name: string): OutputFormatter {
  return {
    name,
    extension: `.${name}`,
    format: vi.fn().mockReturnValue('formatted output'),
  };
}

describe('createKernel', () => {
  it('should create a kernel instance', () => {
    const config = makeConfig();
    const kernel = createKernel(config);
    expect(kernel).toBeInstanceOf(Kernel);
  });
});

describe('kernel.use', () => {
  it('should register plugins', () => {
    const kernel = createKernel(makeConfig());
    const plugin = makePlugin('test-plugin');
    kernel.use(plugin);
    expect(plugin.install).toHaveBeenCalledWith(kernel);
    expect(kernel.listPlugins()).toContainEqual(plugin);
  });

  it('should throw for duplicate plugins', () => {
    const kernel = createKernel(makeConfig());
    const plugin = makePlugin('test-plugin');
    kernel.use(plugin);
    expect(() => kernel.use(plugin)).toThrow(PluginError);
  });

  it('should throw for missing dependencies', () => {
    const kernel = createKernel(makeConfig());
    const plugin = makePlugin('dependent-plugin', {
      dependencies: ['missing-dep'],
    });
    expect(() => kernel.use(plugin)).toThrow(PluginError);
  });

  it('should allow plugins with satisfied dependencies', () => {
    const kernel = createKernel(makeConfig());
    const dep = makePlugin('dep-plugin');
    const plugin = makePlugin('dependent-plugin', {
      dependencies: ['dep-plugin'],
    });
    kernel.use(dep);
    kernel.use(plugin);
    expect(kernel.listPlugins()).toHaveLength(2);
  });
});

describe('kernel.registerParser / getParser / getParserForExtension', () => {
  it('should register a parser', () => {
    const kernel = createKernel(makeConfig());
    const parser = makeParser('typescript', ['.ts', '.tsx']);
    kernel.registerParser(parser);
    expect(kernel.listParsers()).toContainEqual(parser);
  });

  it('should return registered parser by name', () => {
    const kernel = createKernel(makeConfig());
    const parser = makeParser('typescript', ['.ts', '.tsx']);
    kernel.registerParser(parser);
    expect(kernel.getParser('typescript')).toBe(parser);
  });

  it('should return undefined for unregistered parser', () => {
    const kernel = createKernel(makeConfig());
    expect(kernel.getParser('nonexistent')).toBeUndefined();
  });

  it('should return parser by extension', () => {
    const kernel = createKernel(makeConfig());
    const parser = makeParser('typescript', ['.ts', '.tsx']);
    kernel.registerParser(parser);
    expect(kernel.getParserForExtension('.ts')).toBe(parser);
    expect(kernel.getParserForExtension('.tsx')).toBe(parser);
  });

  it('should return undefined for unregistered extension', () => {
    const kernel = createKernel(makeConfig());
    expect(kernel.getParserForExtension('.xyz')).toBeUndefined();
  });
});

describe('kernel.registerFormatter / getFormatter', () => {
  it('should register a formatter', () => {
    const kernel = createKernel(makeConfig());
    const formatter = makeFormatter('compact');
    kernel.registerFormatter(formatter);
    expect(kernel.listFormatters()).toContainEqual(formatter);
  });

  it('should return registered formatter by name', () => {
    const kernel = createKernel(makeConfig());
    const formatter = makeFormatter('compact');
    kernel.registerFormatter(formatter);
    expect(kernel.getFormatter('compact')).toBe(formatter);
  });

  it('should return undefined for unregistered formatter', () => {
    const kernel = createKernel(makeConfig());
    expect(kernel.getFormatter('nonexistent')).toBeUndefined();
  });
});

describe('kernel.on / off / emit', () => {
  it('should handle events', () => {
    const kernel = createKernel(makeConfig());
    const listener = vi.fn();
    kernel.on('scan:start', listener);
    kernel.emit('scan:start');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to listeners', () => {
    const kernel = createKernel(makeConfig());
    const listener = vi.fn();
    kernel.on('scan:file', listener);
    kernel.emit('scan:file', 'src/index.ts');
    expect(listener).toHaveBeenCalledWith('src/index.ts');
  });

  it('should remove listeners with off', () => {
    const kernel = createKernel(makeConfig());
    const listener = vi.fn();
    kernel.on('scan:start', listener);
    kernel.off('scan:start', listener);
    kernel.emit('scan:start');
    expect(listener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners for same event', () => {
    const kernel = createKernel(makeConfig());
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    kernel.on('scan:start', listener1);
    kernel.on('scan:start', listener2);
    kernel.emit('scan:start');
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should not throw when emitting with no listeners', () => {
    const kernel = createKernel(makeConfig());
    expect(() => kernel.emit('scan:start')).not.toThrow();
  });

  it('should swallow listener errors', () => {
    const kernel = createKernel(makeConfig());
    const badListener = vi.fn(() => {
      throw new Error('listener error');
    });
    const goodListener = vi.fn();
    kernel.on('scan:start', badListener);
    kernel.on('scan:start', goodListener);
    expect(() => kernel.emit('scan:start')).not.toThrow();
    expect(goodListener).toHaveBeenCalled();
  });
});

describe('kernel.getConfig', () => {
  it('should return config', () => {
    const config = makeConfig({ root: '/my/project' });
    const kernel = createKernel(config);
    expect(kernel.getConfig()).toEqual(config);
  });

  it('should return updated config after updateConfig', () => {
    const kernel = createKernel(makeConfig());
    const newConfig = makeConfig({ root: '/updated/path' });
    kernel.updateConfig(newConfig);
    expect(kernel.getConfig().root).toBe('/updated/path');
  });
});

describe('kernel.unregister', () => {
  it('should remove a registered plugin', async () => {
    const kernel = createKernel(makeConfig());
    const plugin = makePlugin('removable');
    kernel.use(plugin);
    expect(kernel.listPlugins()).toHaveLength(1);
    await kernel.unregister('removable');
    expect(kernel.listPlugins()).toHaveLength(0);
  });

  it('should call onDestroy when unregistering', async () => {
    const kernel = createKernel(makeConfig());
    const onDestroy = vi.fn();
    const plugin = makePlugin('destroyable', { onDestroy });
    kernel.use(plugin);
    await kernel.unregister('destroyable');
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it('should emit plugin:unregistered event', async () => {
    const kernel = createKernel(makeConfig());
    const plugin = makePlugin('evt-plugin');
    kernel.use(plugin);
    const listener = vi.fn();
    kernel.on('plugin:unregistered', listener);
    await kernel.unregister('evt-plugin');
    expect(listener).toHaveBeenCalledWith('evt-plugin');
  });

  it('should do nothing for unknown plugin name', async () => {
    const kernel = createKernel(makeConfig());
    await expect(kernel.unregister('nonexistent')).resolves.toBeUndefined();
  });
});

describe('kernel.use error handling', () => {
  it('should call plugin.onError and throw PluginError when install throws', () => {
    const kernel = createKernel(makeConfig());
    const onError = vi.fn();
    const plugin = makePlugin('bad-install', {
      install: () => { throw new Error('install failed'); },
      onError,
    });
    expect(() => kernel.use(plugin)).toThrow(PluginError);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    // Plugin should be removed after failure
    expect(kernel.listPlugins()).toHaveLength(0);
  });

  it('should throw PluginError when install throws non-Error', () => {
    const kernel = createKernel(makeConfig());
    const plugin = makePlugin('bad-install-str', {
      install: () => { throw 'string error'; },
    });
    expect(() => kernel.use(plugin)).toThrow(PluginError);
    expect(kernel.listPlugins()).toHaveLength(0);
  });

  it('should not call onError when install throws non-Error', () => {
    const kernel = createKernel(makeConfig());
    const onError = vi.fn();
    const plugin = makePlugin('bad-install-non-err', {
      install: () => { throw 42; },
      onError,
    });
    expect(() => kernel.use(plugin)).toThrow(PluginError);
    // onError is only called for Error instances
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('kernel.scan', () => {
  it('should scan files using registered parsers and formatters', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir, format: 'compact' }));

    // Register a real-ish parser
    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: content.split('\n').length,
        estimatedTokens: Math.round(content.length / 3.5),
        imports: [
          { from: 'express', names: ['Request', 'Response'], kind: 'external' as const },
          { from: './types', names: ['BaseService'], kind: 'internal' as const },
        ],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const formatter: OutputFormatter = {
      name: 'compact',
      extension: '.compact',
      format: vi.fn().mockReturnValue('compact output'),
    };
    kernel.registerFormatter(formatter);

    const result = await kernel.scan();

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.stats.fileCount).toBeGreaterThan(0);
    expect(result.stats.totalLoc).toBeGreaterThan(0);
    expect(result.stats.totalTokens).toBeGreaterThan(0);
    expect(result.output).toBe('compact output');
    expect(formatter.format).toHaveBeenCalled();
  });

  it('should build dependency graph from internal imports', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [
          { from: './utils', names: ['helper'], kind: 'internal' as const },
        ],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();

    // Each parsed file should have a dependency graph entry
    const depKeys = Object.keys(result.dependencyGraph);
    expect(depKeys.length).toBeGreaterThan(0);
    for (const key of depKeys) {
      expect(result.dependencyGraph[key]).toContain('./utils');
    }
  });

  it('should collect external deps and deduplicate names', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    let callCount = 0;
    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => {
        callCount++;
        // First file imports 'map' and 'filter', second file imports 'map' and 'reduce'
        const names = callCount === 1 ? ['map', 'filter'] : ['map', 'reduce'];
        return {
          path: filePath,
          language: 'typescript' as const,
          loc: 10,
          estimatedTokens: 50,
          imports: [
            { from: 'lodash', names, kind: 'external' as const },
          ],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        };
      },
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();

    // Both files import from lodash, names should be deduplicated
    expect(result.externalDeps['lodash']).toBeDefined();
    expect(result.externalDeps['lodash']).toContain('map');
    expect(result.externalDeps['lodash']).toContain('filter');
    expect(result.externalDeps['lodash']).toContain('reduce');
    // 'map' should appear only once despite being imported from both files
    const lodashNames = result.externalDeps['lodash'] as string[];
    expect(lodashNames.filter(n => n === 'map').length).toBe(1);
  });

  it('should handle parser errors gracefully (error boundary)', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const errorListener = vi.fn();
    kernel.on('scan:error', errorListener);

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: () => { throw new Error('Parse failed'); },
    };
    kernel.registerParser(parser);

    // Should not throw despite parse error
    const result = await kernel.scan();

    // Files should still be in the result with fallback analysis
    expect(result.files.length).toBeGreaterThan(0);
    expect(errorListener).toHaveBeenCalled();
    expect(result.stats.totalLoc).toBeGreaterThan(0);
  });

  it('should throw ScanError when no scannable files found', async () => {
    const emptyDir = require('node:path').join(require('node:os').tmpdir(), 'codemap-empty-' + Date.now());
    require('node:fs').mkdirSync(emptyDir, { recursive: true });
    const kernel = createKernel(makeConfig({ root: emptyDir }));

    const { ScanError } = await import('../../src/errors.js');
    await expect(kernel.scan()).rejects.toThrow(ScanError);

    require('node:fs').rmSync(emptyDir, { recursive: true, force: true });
  });

  it('should call plugin onInit and onScanComplete lifecycle hooks', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const onInit = vi.fn();
    const onScanComplete = vi.fn();
    const plugin = makePlugin('lifecycle-plugin', { onInit, onScanComplete });
    kernel.use(plugin);

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    await kernel.scan();

    expect(onInit).toHaveBeenCalledTimes(1);
    expect(onInit).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.any(Object),
      files: expect.any(Array),
      dependencyGraph: expect.any(Object),
      externalDeps: expect.any(Object),
    }));
    expect(onScanComplete).toHaveBeenCalledTimes(1);
    expect(onScanComplete).toHaveBeenCalledWith(expect.objectContaining({
      root: expect.any(String),
      files: expect.any(Array),
      stats: expect.any(Object),
    }));
  });

  it('should skip files without a matching parser', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'mixed-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    // Only register typescript parser, not go or python
    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();
    // Only TS files should be parsed
    expect(result.files.every(f => f.language === 'typescript')).toBe(true);
  });

  it('should emit scan:start and scan:complete events', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const startListener = vi.fn();
    const completeListener = vi.fn();
    kernel.on('scan:start', startListener);
    kernel.on('scan:complete', completeListener);

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    await kernel.scan();

    expect(startListener).toHaveBeenCalledTimes(1);
    expect(completeListener).toHaveBeenCalledTimes(1);
  });

  it('should handle scan with format as array', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir, format: ['compact', 'json'] as any }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const compactFormatter: OutputFormatter = {
      name: 'compact',
      extension: '.compact',
      format: vi.fn().mockReturnValue('compact out'),
    };
    kernel.registerFormatter(compactFormatter);

    const result = await kernel.scan();
    expect(result.output).toBe('compact out');
  });

  it('should produce result with no output when formatter is not registered', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();
    expect(result.output).toBeUndefined();
  });

  it('should handle config.ignore as extra ignore patterns', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({
      root: fixtureDir,
      ignore: ['**/*.tsx'],
    }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();
    // .tsx files should be excluded
    expect(result.files.every(f => !f.path.endsWith('.tsx'))).toBe(true);
  });

  it('should append to existing dependency graph entries for same file', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [
          { from: './a', names: ['a'], kind: 'internal' as const },
          { from: './b', names: ['b'], kind: 'internal' as const },
        ],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();

    // Each file should have both internal deps
    for (const file of result.files) {
      const deps = result.dependencyGraph[file.path];
      expect(deps).toBeDefined();
      expect(deps).toContain('./a');
      expect(deps).toContain('./b');
    }
  });

  it('should track language breakdown in stats', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const result = await kernel.scan();
    expect(result.stats.languageBreakdown['typescript']).toBeGreaterThan(0);
  });

  it('should fall back to compact format when format array is empty', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir, format: [] as any }));

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    const compactFormatter: OutputFormatter = {
      name: 'compact',
      extension: '.compact',
      format: vi.fn().mockReturnValue('fallback compact'),
    };
    kernel.registerFormatter(compactFormatter);

    const result = await kernel.scan();
    // With empty format array, should fall back to 'compact'
    expect(result.output).toBe('fallback compact');
  });

  it('should emit scan:file for each file being processed', async () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const kernel = createKernel(makeConfig({ root: fixtureDir }));

    const fileListener = vi.fn();
    kernel.on('scan:file', fileListener);

    const parser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts', '.tsx'],
      parse: (_content: string, filePath: string) => ({
        path: filePath,
        language: 'typescript' as const,
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      }),
    };
    kernel.registerParser(parser);

    await kernel.scan();
    expect(fileListener).toHaveBeenCalled();
  });
});

describe('setupKernel', () => {
  it('should return a Kernel instance', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const config = makeConfig({ root: fixtureDir });
    const kernel = setupKernel(config);

    expect(kernel).toBeInstanceOf(Kernel);
  });

  it('should register core plugins (typescript-parser, compact-formatter)', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const config = makeConfig({ root: fixtureDir });
    const kernel = setupKernel(config);

    const pluginNames = kernel.listPlugins().map((p) => p.name);
    expect(pluginNames).toContain('typescript-parser');
    expect(pluginNames).toContain('compact-formatter');
  });

  it('should register feature plugins (ignore, code-analysis)', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const config = makeConfig({ root: fixtureDir });
    const kernel = setupKernel(config);

    const pluginNames = kernel.listPlugins().map((p) => p.name);
    expect(pluginNames).toContain('ignore');
    expect(pluginNames).toContain('code-analysis');
  });

  it('should accept and register extra custom plugins', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const config = makeConfig({ root: fixtureDir });
    const customPlugin = makePlugin('my-custom-plugin');

    const kernel = setupKernel(config, [customPlugin]);

    const pluginNames = kernel.listPlugins().map((p) => p.name);
    expect(pluginNames).toContain('my-custom-plugin');
    expect(customPlugin.install).toHaveBeenCalled();
  });

  it('should not register duplicate extra plugins', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const config = makeConfig({ root: fixtureDir });
    // ignore plugin is already registered by getFeaturePlugins
    const duplicatePlugin = makePlugin('ignore');

    const kernel = setupKernel(config, [duplicatePlugin]);

    // Should not throw, and ignore should appear only once
    const ignorePlugins = kernel.listPlugins().filter((p) => p.name === 'ignore');
    expect(ignorePlugins.length).toBe(1);
    // The custom duplicate's install should NOT have been called
    expect(duplicatePlugin.install).not.toHaveBeenCalled();
  });

  it('should register formatter plugins based on config.format', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'typescript-project', 'src');
    const config = makeConfig({ root: fixtureDir, format: ['compact', 'markdown'] as any });
    const kernel = setupKernel(config);

    const pluginNames = kernel.listPlugins().map((p) => p.name);
    expect(pluginNames).toContain('markdown-formatter');
  });

  it('should auto-detect language plugins based on file extensions', () => {
    const fixtureDir = require('node:path').join(__dirname, '..', 'fixtures', 'mixed-project', 'src');
    const config = makeConfig({ root: fixtureDir });
    const kernel = setupKernel(config);

    const pluginNames = kernel.listPlugins().map((p) => p.name);
    // mixed-project has .go and .py files, so auto-detect should register those parsers
    expect(pluginNames).toContain('go-parser');
    expect(pluginNames).toContain('python-parser');
  });
});
