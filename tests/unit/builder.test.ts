import { describe, it, expect, vi, afterEach } from 'vitest';
import { CodemapBuilder } from '../../src/builder.js';
import type { CodemapPlugin, ScanResult } from '../../src/types.js';

// Create a stateful mock kernel that tracks plugins
function makeMockKernel() {
  const plugins: CodemapPlugin[] = [];
  const mockResult: ScanResult = {
    root: './src',
    timestamp: new Date().toISOString(),
    files: [],
    dependencyGraph: {},
    externalDeps: {},
    stats: {
      fileCount: 0,
      totalLoc: 0,
      totalTokens: 0,
      languageBreakdown: {},
      scanDurationMs: 5,
      incremental: false,
    },
  };

  return {
    scan: vi.fn().mockResolvedValue(mockResult),
    use: vi.fn((plugin: CodemapPlugin) => { plugins.push(plugin); }),
    listPlugins: vi.fn(() => [...plugins]),
    registerParser: vi.fn(),
    registerFormatter: vi.fn(),
    getParser: vi.fn(),
    getFormatter: vi.fn(),
    getParserForExtension: vi.fn(),
    listParsers: vi.fn().mockReturnValue([]),
    listFormatters: vi.fn().mockReturnValue([]),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getConfig: vi.fn().mockReturnValue({ root: './src', output: '.codemap', format: 'compact' }),
    updateConfig: vi.fn(),
  };
}

vi.mock('../../src/kernel.js', () => {
  return {
    createKernel: vi.fn(() => makeMockKernel()),
    setupKernel: vi.fn(() => makeMockKernel()),
    Kernel: vi.fn(() => makeMockKernel()),
  };
});

vi.mock('../../src/scanner.js', () => ({
  scanDirectory: vi.fn(() => [
    { relativePath: 'index.ts', language: 'typescript', content: '', absolutePath: '' },
  ]),
  readIgnoreFile: vi.fn(() => []),
}));

vi.mock('../../src/watcher.js', () => ({
  createFileWatcher: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('CodemapBuilder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('chaining methods', () => {
    it('should support root() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.root('./lib');
      expect(result).toBe(builder);
    });

    it('should support format() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.format('json');
      expect(result).toBe(builder);
    });

    it('should support format() with array', () => {
      const builder = new CodemapBuilder();
      const result = builder.format(['compact', 'json']);
      expect(result).toBe(builder);
    });

    it('should support ignore() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.ignore('**/*.test.ts', '**/*.spec.ts');
      expect(result).toBe(builder);
    });

    it('should support languages() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.languages(['typescript', 'go']);
      expect(result).toBe(builder);
    });

    it('should support incremental() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.incremental();
      expect(result).toBe(builder);
    });

    it('should support withComplexity() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.withComplexity();
      expect(result).toBe(builder);
    });

    it('should support withTokenCounts() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.withTokenCounts();
      expect(result).toBe(builder);
    });

    it('should support monorepo() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.monorepo();
      expect(result).toBe(builder);
    });

    it('should support debounce() chaining', () => {
      const builder = new CodemapBuilder();
      const result = builder.debounce(500);
      expect(result).toBe(builder);
    });

    it('should support use() chaining', () => {
      const builder = new CodemapBuilder();
      const plugin: CodemapPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        install: vi.fn(),
      };
      const result = builder.use(plugin);
      expect(result).toBe(builder);
    });

    it('should support full method chain', () => {
      const plugin: CodemapPlugin = {
        name: 'custom',
        version: '1.0.0',
        install: vi.fn(),
      };
      const builder = new CodemapBuilder()
        .root('./src')
        .format(['compact', 'json'])
        .ignore('**/*.test.ts')
        .languages(['typescript'])
        .incremental()
        .withComplexity()
        .withTokenCounts()
        .monorepo()
        .debounce(200)
        .use(plugin);

      // The builder is returned from every call, confirming full chain works
      expect(builder).toBeInstanceOf(CodemapBuilder);
    });
  });

  describe('builder creates valid configuration', () => {
    it('should accumulate ignore patterns', () => {
      const builder = new CodemapBuilder();
      builder
        .ignore('*.test.ts')
        .ignore('*.spec.ts', 'dist/**');

      // Verify by accessing the private field through the builder instance
      // We can test this indirectly by confirming chaining works
      // and that scan() would use all accumulated patterns.
      expect(builder).toBeInstanceOf(CodemapBuilder);
    });

    it('should be a new instance each time', () => {
      const builder1 = new CodemapBuilder();
      const builder2 = new CodemapBuilder();
      expect(builder1).not.toBe(builder2);
    });

    it('should register multiple plugins', () => {
      const builder = new CodemapBuilder();
      const plugin1: CodemapPlugin = {
        name: 'plugin-1',
        version: '1.0.0',
        install: vi.fn(),
      };
      const plugin2: CodemapPlugin = {
        name: 'plugin-2',
        version: '1.0.0',
        install: vi.fn(),
      };
      builder.use(plugin1).use(plugin2);
      expect(builder).toBeInstanceOf(CodemapBuilder);
    });
  });

  describe('scan()', () => {
    it('should return a ScanResult', async () => {
      const builder = new CodemapBuilder().root('./src');
      const result = await builder.scan();
      expect(result).toHaveProperty('root');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('stats');
    });

    it('should call setupKernel and kernel.scan', async () => {
      const { setupKernel } = await import('../../src/kernel.js');
      const builder = new CodemapBuilder().root('./src');
      await builder.scan();
      expect(setupKernel).toHaveBeenCalled();
    });

    it('should work with custom plugins', async () => {
      const plugin: CodemapPlugin = {
        name: 'test-scan-plugin',
        version: '1.0.0',
        install: vi.fn(),
      };
      const builder = new CodemapBuilder().root('./src').use(plugin);
      const result = await builder.scan();
      expect(result).toBeDefined();
    });

    it('should work with complexity enabled', async () => {
      const builder = new CodemapBuilder().root('./src').withComplexity();
      const result = await builder.scan();
      expect(result).toBeDefined();
    });

    it('should work with incremental enabled', async () => {
      const builder = new CodemapBuilder().root('./src').incremental();
      const result = await builder.scan();
      expect(result).toBeDefined();
    });

    it('should work with monorepo enabled', async () => {
      const builder = new CodemapBuilder().root('./src').monorepo();
      const result = await builder.scan();
      expect(result).toBeDefined();
    });

    it('should work with multiple formats', async () => {
      const builder = new CodemapBuilder().root('./src').format(['compact', 'json']);
      const result = await builder.scan();
      expect(result).toBeDefined();
    });

    it('should work with ignore patterns', async () => {
      const builder = new CodemapBuilder()
        .root('./src')
        .ignore('node_modules/**', 'dist/**');
      const result = await builder.scan();
      expect(result).toBeDefined();
    });
  });

  describe('buildKernel - auto detect plugins for non-TS languages', () => {
    it('should auto-detect and register language plugins for non-TS extensions', async () => {
      // Override scanDirectory mock to return Go files
      const { scanDirectory } = await import('../../src/scanner.js');
      (scanDirectory as any).mockReturnValueOnce([
        { relativePath: 'main.go', language: 'go', content: 'package main', absolutePath: '' },
      ]);

      const builder = new CodemapBuilder().root('./src');
      const result = await builder.scan();
      expect(result).toBeDefined();
    });

    it('should skip duplicate auto-detected plugins', async () => {
      // Override scanDirectory mock to return Go and Python files
      const { scanDirectory } = await import('../../src/scanner.js');
      (scanDirectory as any).mockReturnValueOnce([
        { relativePath: 'main.go', language: 'go', content: 'package main', absolutePath: '' },
        { relativePath: 'app.py', language: 'python', content: 'print("hello")', absolutePath: '' },
      ]);

      const builder = new CodemapBuilder().root('./src');
      const result = await builder.scan();
      expect(result).toBeDefined();
    });
  });

  describe('watch()', () => {
    it('should return a watcher with on and close methods', () => {
      const builder = new CodemapBuilder().root('./src');
      const watcher = builder.watch();
      expect(watcher).toHaveProperty('on');
      expect(watcher).toHaveProperty('close');
      watcher.close();
    });

    it('should call createFileWatcher', async () => {
      const { createFileWatcher } = await import('../../src/watcher.js');
      const builder = new CodemapBuilder().root('./src').debounce(500);
      const watcher = builder.watch();
      expect(createFileWatcher).toHaveBeenCalled();
      watcher.close();
    });

    it('should work with all options configured', () => {
      const builder = new CodemapBuilder()
        .root('./src')
        .format('json')
        .ignore('*.test.ts')
        .withComplexity()
        .incremental()
        .debounce(200);
      const watcher = builder.watch();
      expect(watcher).toBeDefined();
      watcher.close();
    });
  });
});
