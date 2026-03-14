import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../../../src/plugins/optional/code-analysis.js';
import type { ScanResult, FileAnalysis } from '../../../src/types.js';

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
});
