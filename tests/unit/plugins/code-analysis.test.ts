import { describe, it, expect, vi } from 'vitest';
import { analyzeCode, createCodeAnalysisPlugin } from '../../../src/plugins/optional/code-analysis.js';
import type { ScanResult, FileAnalysis, CodemapKernel, CodeAnalysis } from '../../../src/types.js';

function makeFile(path: string, overrides: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    path,
    language: 'typescript',
    loc: 10,
    estimatedTokens: 100,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    enums: [],
    constants: [],
    ...overrides,
  };
}

function makeResult(files: FileAnalysis[], overrides: Partial<ScanResult> = {}): ScanResult {
  const depGraph: Record<string, string[]> = {};
  const extDeps: Record<string, string[]> = {};

  for (const file of files) {
    for (const imp of file.imports) {
      if (imp.kind === 'internal') {
        if (!depGraph[file.path]) depGraph[file.path] = [];
        depGraph[file.path]!.push(imp.from);
      } else {
        if (!extDeps[imp.from]) extDeps[imp.from] = [];
        for (const name of imp.names) {
          if (!extDeps[imp.from]!.includes(name)) {
            extDeps[imp.from]!.push(name);
          }
        }
      }
    }
  }

  return {
    root: '/test',
    timestamp: '2026-01-01T00:00:00.000Z',
    files,
    dependencyGraph: depGraph,
    externalDeps: extDeps,
    stats: {
      fileCount: files.length,
      totalLoc: files.reduce((s, f) => s + f.loc, 0),
      totalTokens: files.reduce((s, f) => s + f.estimatedTokens, 0),
      languageBreakdown: { typescript: files.length },
      scanDurationMs: 1,
      incremental: false,
    },
    ...overrides,
  };
}

describe('Code Analysis Plugin', () => {
  describe('reverse dependency graph', () => {
    it('should build reverse deps from imports', () => {
      const files = [
        makeFile('index.ts', {
          imports: [{ from: './utils.js', names: ['helper'], kind: 'internal' }],
        }),
        makeFile('utils.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.reverseDeps['utils.ts']).toContain('index.ts');
    });

    it('should handle files with no importers', () => {
      const files = [
        makeFile('a.ts'),
        makeFile('b.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.reverseDeps['a.ts']).toEqual([]);
      expect(analysis.reverseDeps['b.ts']).toEqual([]);
    });

    it('should handle multiple importers for one file', () => {
      const files = [
        makeFile('a.ts', {
          imports: [{ from: './shared.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('b.ts', {
          imports: [{ from: './shared.js', names: ['y'], kind: 'internal' }],
        }),
        makeFile('shared.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.reverseDeps['shared.ts']).toContain('a.ts');
      expect(analysis.reverseDeps['shared.ts']).toContain('b.ts');
      expect(analysis.reverseDeps['shared.ts']!.length).toBe(2);
    });
  });

  describe('orphan file detection', () => {
    it('should detect orphan files (not imported by anyone)', () => {
      const files = [
        makeFile('index.ts', {
          imports: [{ from: './used.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('used.ts'),
        makeFile('orphan.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.orphanFiles).toContain('orphan.ts');
      expect(analysis.orphanFiles).not.toContain('used.ts');
      expect(analysis.orphanFiles).not.toContain('index.ts'); // entry point
    });

    it('should not flag entry points as orphans', () => {
      const files = [
        makeFile('index.ts'),
        makeFile('cli.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.orphanFiles).not.toContain('index.ts');
      expect(analysis.orphanFiles).not.toContain('cli.ts');
    });

    it('should not flag barrel index files as orphans', () => {
      const files = [
        makeFile('index.ts'),
        makeFile('utils/index.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.orphanFiles).not.toContain('utils/index.ts');
    });
  });

  describe('unused export detection', () => {
    it('should detect exported functions that are never imported', () => {
      const files = [
        makeFile('index.ts', {
          imports: [{ from: './utils.js', names: ['usedFn'], kind: 'internal' }],
        }),
        makeFile('utils.ts', {
          functions: [
            { name: 'usedFn', params: [], returnType: 'void', exported: true, loc: 1 },
            { name: 'unusedFn', params: [], returnType: 'void', exported: true, loc: 1 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      const unusedNames = analysis.unusedExports.map((u) => u.name);
      expect(unusedNames).toContain('unusedFn');
      expect(unusedNames).not.toContain('usedFn');
    });

    it('should not flag non-exported functions as unused', () => {
      const files = [
        makeFile('utils.ts', {
          functions: [
            { name: 'privateFn', params: [], returnType: 'void', exported: false, loc: 1 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.unusedExports.length).toBe(0);
    });

    it('should skip entry point files from unused analysis', () => {
      const files = [
        makeFile('index.ts', {
          functions: [
            { name: 'publicApi', params: [], returnType: 'void', exported: true, loc: 1 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      const unusedNames = analysis.unusedExports.map((u) => u.name);
      expect(unusedNames).not.toContain('publicApi');
    });

    it('should treat star imports as using all exports', () => {
      const files = [
        makeFile('consumer.ts', {
          imports: [{ from: './lib.js', names: ['* as lib'], kind: 'internal' }],
        }),
        makeFile('lib.ts', {
          functions: [
            { name: 'fn1', params: [], returnType: 'void', exported: true, loc: 1 },
            { name: 'fn2', params: [], returnType: 'void', exported: true, loc: 1 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.unusedExports.filter((u) => u.file === 'lib.ts')).toEqual([]);
    });

    it('should consider re-exports from entry points as used', () => {
      const files = [
        makeFile('index.ts', {
          exports: [
            { from: './types.js', names: ['MyType'], isReExport: true },
          ],
        }),
        makeFile('types.ts', {
          types: [{ name: 'MyType', type: 'string', exported: true }],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      const unusedNames = analysis.unusedExports.map((u) => u.name);
      expect(unusedNames).not.toContain('MyType');
    });
  });

  describe('circular dependency detection', () => {
    it('should detect simple circular dependencies (A → B → A)', () => {
      const files = [
        makeFile('a.ts', {
          imports: [{ from: './b.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('b.ts', {
          imports: [{ from: './a.js', names: ['y'], kind: 'internal' }],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.circularDeps.length).toBeGreaterThan(0);
      const cycle = analysis.circularDeps[0]!;
      expect(cycle).toContain('a.ts');
      expect(cycle).toContain('b.ts');
    });

    it('should detect transitive circular dependencies (A → B → C → A)', () => {
      const files = [
        makeFile('a.ts', {
          imports: [{ from: './b.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('b.ts', {
          imports: [{ from: './c.js', names: ['y'], kind: 'internal' }],
        }),
        makeFile('c.ts', {
          imports: [{ from: './a.js', names: ['z'], kind: 'internal' }],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.circularDeps.length).toBeGreaterThan(0);
    });

    it('should return empty array when no circular dependencies exist', () => {
      const files = [
        makeFile('a.ts', {
          imports: [{ from: './b.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('b.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.circularDeps.length).toBe(0);
    });
  });

  describe('entry point detection', () => {
    it('should detect common entry point filenames', () => {
      const files = [
        makeFile('index.ts'),
        makeFile('cli.ts'),
        makeFile('utils.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.entryPoints).toContain('index.ts');
      expect(analysis.entryPoints).toContain('cli.ts');
      expect(analysis.entryPoints).not.toContain('utils.ts');
    });
  });

  describe('resolveImportPath', () => {
    it('should resolve imports with .js extension (ESM-style)', () => {
      const files = [
        makeFile('src/index.ts', {
          imports: [{ from: './utils.js', names: ['helper'], kind: 'internal' }],
        }),
        makeFile('src/utils.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.reverseDeps['src/utils.ts']).toContain('src/index.ts');
    });

    it('should resolve imports in nested directories', () => {
      const files = [
        makeFile('src/index.ts', {
          imports: [{ from: './plugins/optional/foo.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('src/plugins/optional/foo.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.reverseDeps['src/plugins/optional/foo.ts']).toContain('src/index.ts');
    });

    it('should resolve index file imports (./utils → utils/index.ts)', () => {
      const files = [
        makeFile('src/app.ts', {
          imports: [{ from: './utils', names: ['helper'], kind: 'internal' }],
        }),
        makeFile('src/utils/index.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.reverseDeps['src/utils/index.ts']).toContain('src/app.ts');
    });

    it('should return null for unresolvable relative imports', () => {
      const files = [
        makeFile('src/app.ts', {
          imports: [{ from: './nonexistent', names: ['x'], kind: 'internal' }],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      // The import to ./nonexistent can't be resolved, so no reverse deps are created
      expect(Object.keys(analysis.reverseDeps)).toEqual(['src/app.ts']);
      expect(analysis.reverseDeps['src/app.ts']).toEqual([]);
    });
  });

  describe('findUnusedExports - additional types', () => {
    it('should detect unused exported classes', () => {
      const files = [
        makeFile('lib.ts', {
          classes: [
            { name: 'UnusedClass', methods: [], properties: [], exported: true, loc: 10 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.unusedExports.map((u) => u.name)).toContain('UnusedClass');
    });

    it('should detect unused exported interfaces', () => {
      const files = [
        makeFile('lib.ts', {
          interfaces: [
            { name: 'UnusedIface', properties: [], exported: true },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.unusedExports.map((u) => u.name)).toContain('UnusedIface');
    });

    it('should detect unused exported enums', () => {
      const files = [
        makeFile('lib.ts', {
          enums: [
            { name: 'UnusedEnum', members: ['A', 'B'], exported: true },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.unusedExports.map((u) => u.name)).toContain('UnusedEnum');
    });

    it('should detect unused exported constants', () => {
      const files = [
        makeFile('lib.ts', {
          constants: [
            { name: 'UNUSED_CONST', type: 'string', exported: true },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.unusedExports.map((u) => u.name)).toContain('UNUSED_CONST');
    });

    it('should treat re-exports from barrel files as used', () => {
      const files = [
        makeFile('utils/index.ts', {
          exports: [
            { from: './helpers.js', names: ['doStuff'], isReExport: true },
          ],
        }),
        makeFile('utils/helpers.ts', {
          functions: [
            { name: 'doStuff', params: [], returnType: 'void', exported: true, loc: 1 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      const unusedNames = analysis.unusedExports.map((u) => u.name);
      expect(unusedNames).not.toContain('doStuff');
    });

    it('should detect unused exported components and hooks', () => {
      const files = [
        makeFile('ui.ts', {
          components: [
            { name: 'UnusedComp', kind: 'component' as const, params: [], returnType: 'JSX.Element', exported: true, loc: 5 },
          ],
          hooks: [
            { name: 'useUnused', kind: 'hook' as const, params: [], returnType: 'void', exported: true, loc: 3 },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      const unusedNames = analysis.unusedExports.map((u) => u.name);
      expect(unusedNames).toContain('UnusedComp');
      expect(unusedNames).toContain('useUnused');
    });

    it('should include non-reexport named exports in unused check', () => {
      const files = [
        makeFile('lib.ts', {
          exports: [
            { names: ['namedExport'], isReExport: false },
          ],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      const unusedNames = analysis.unusedExports.map((u) => u.name);
      expect(unusedNames).toContain('namedExport');
    });
  });

  describe('findCircularDeps - deduplication', () => {
    it('should deduplicate identical cycles found from different start nodes', () => {
      // A → B → A forms the same cycle regardless of starting from A or B
      const files = [
        makeFile('a.ts', {
          imports: [{ from: './b.js', names: ['x'], kind: 'internal' }],
        }),
        makeFile('b.ts', {
          imports: [{ from: './a.js', names: ['y'], kind: 'internal' }],
        }),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      // Should have exactly 1 cycle, not 2
      expect(analysis.circularDeps.length).toBe(1);
    });

    it('should handle nodes already visited (seen set prevents revisit)', () => {
      // A → B → C, A → C (no cycle)
      const files = [
        makeFile('a.ts', {
          imports: [
            { from: './b.js', names: ['x'], kind: 'internal' },
            { from: './c.js', names: ['y'], kind: 'internal' },
          ],
        }),
        makeFile('b.ts', {
          imports: [{ from: './c.js', names: ['z'], kind: 'internal' }],
        }),
        makeFile('c.ts'),
      ];
      const result = makeResult(files);
      const analysis = analyzeCode(result);

      expect(analysis.circularDeps.length).toBe(0);
    });
  });

  describe('detectEntryPoints - package.json fields', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const os = require('node:os');

    function withTempPkg(pkg: Record<string, unknown>, filePaths: string[], fn: (tmpDir: string) => void): void {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-'));
      try {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg));
        fn(tmpDir);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    it('should detect entry points from package.json main field', () => {
      withTempPkg({ main: './dist/index.js' }, ['index.ts'], (tmpDir) => {
        const files = [makeFile('index.ts')];
        const result = makeResult(files, { root: tmpDir });
        const analysis = analyzeCode(result);

        expect(analysis.entryPoints).toContain('index.ts');
      });
    });

    it('should detect entry points from package.json module field', () => {
      withTempPkg({ module: './dist/lib.js' }, ['lib.ts'], (tmpDir) => {
        const files = [makeFile('lib.ts')];
        const result = makeResult(files, { root: tmpDir });
        const analysis = analyzeCode(result);

        expect(analysis.entryPoints).toContain('lib.ts');
      });
    });

    it('should detect entry points from package.json bin as string', () => {
      withTempPkg({ bin: './dist/cli.js' }, ['cli.ts'], (tmpDir) => {
        const files = [makeFile('cli.ts')];
        const result = makeResult(files, { root: tmpDir });
        const analysis = analyzeCode(result);

        expect(analysis.entryPoints).toContain('cli.ts');
      });
    });

    it('should detect entry points from package.json bin as object', () => {
      withTempPkg({ bin: { codemap: './dist/cli.js' } }, ['cli.ts'], (tmpDir) => {
        const files = [makeFile('cli.ts')];
        const result = makeResult(files, { root: tmpDir });
        const analysis = analyzeCode(result);

        expect(analysis.entryPoints).toContain('cli.ts');
      });
    });

    it('should detect entry points from package.json exports field (nested)', () => {
      withTempPkg({
        exports: {
          '.': { import: './dist/index.js', require: './dist/index.cjs' },
          './utils': './dist/utils.mjs',
        },
      }, ['index.ts', 'utils.ts'], (tmpDir) => {
        const files = [makeFile('index.ts'), makeFile('utils.ts')];
        const result = makeResult(files, { root: tmpDir });
        const analysis = analyzeCode(result);

        expect(analysis.entryPoints).toContain('index.ts');
        expect(analysis.entryPoints).toContain('utils.ts');
      });
    });

    it('should handle malformed package.json gracefully', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-'));
      try {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{ invalid json');

        const files = [makeFile('index.ts')];
        const result = makeResult(files, { root: tmpDir });
        const analysis = analyzeCode(result);

        // Should not throw, still detect common entry points
        expect(analysis.entryPoints).toContain('index.ts');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('createCodeAnalysisPlugin', () => {
    it('should create a plugin with correct name and version', () => {
      const plugin = createCodeAnalysisPlugin();
      expect(plugin.name).toBe('code-analysis');
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have install method that does not throw', () => {
      const plugin = createCodeAnalysisPlugin();
      const kernel = {} as CodemapKernel;
      expect(() => plugin.install(kernel)).not.toThrow();
    });

    it('should attach analysis to result on onScanComplete', async () => {
      const plugin = createCodeAnalysisPlugin();
      const files = [
        makeFile('index.ts'),
        makeFile('utils.ts'),
      ];
      const result = makeResult(files) as ScanResult & { analysis?: CodeAnalysis };

      await plugin.onScanComplete!(result);

      expect(result.analysis).toBeDefined();
      expect(result.analysis!.reverseDeps).toBeDefined();
      expect(result.analysis!.orphanFiles).toBeDefined();
      expect(result.analysis!.unusedExports).toBeDefined();
      expect(result.analysis!.circularDeps).toBeDefined();
      expect(result.analysis!.entryPoints).toBeDefined();
    });
  });
});
