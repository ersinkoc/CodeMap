import { describe, it, expect } from 'vitest';
import { createCompactFormatterPlugin } from '../../../src/plugins/core/compact-formatter.js';
import type { OutputFormatter, ScanResult, CodemapKernel, CodeAnalysis } from '../../../src/types.js';

function getFormatter(): OutputFormatter {
  let captured: OutputFormatter | undefined;
  const kernel = {
    registerFormatter(formatter: OutputFormatter) {
      captured = formatter;
    },
  } as unknown as CodemapKernel;

  const plugin = createCompactFormatterPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Formatter was not registered');
  return captured;
}

function createMockScanResult(overrides?: Partial<ScanResult>): ScanResult {
  return {
    root: '/project',
    timestamp: '2025-01-15T10:00:00Z',
    files: [
      {
        path: 'src/index.ts',
        language: 'typescript',
        loc: 50,
        estimatedTokens: 200,
        imports: [],
        exports: [],
        functions: [
          {
            name: 'hello',
            params: [{ name: 'name', type: 'string' }],
            returnType: 'string',
            exported: true,
            loc: 3,
          },
        ],
        classes: [
          {
            name: 'UserService',
            extends: 'BaseService',
            implements: ['Cacheable'],
            methods: [
              {
                name: 'getById',
                params: [{ name: 'id', type: 'string' }],
                returnType: 'Promise<User>',
                exported: true,
                async: true,
                loc: 5,
              },
            ],
            properties: [],
            exported: true,
            loc: 20,
          },
        ],
        interfaces: [
          {
            name: 'User',
            properties: [
              { name: 'id', type: 'string' },
              { name: 'name', type: 'string' },
            ],
            exported: true,
          },
        ],
        types: [
          {
            name: 'UserRole',
            type: "'admin' | 'editor'",
            exported: true,
          },
        ],
        enums: [
          {
            name: 'Status',
            members: ['Active', 'Inactive'],
            exported: true,
          },
        ],
        constants: [
          {
            name: 'MAX',
            type: 'number',
            exported: true,
          },
        ],
      },
    ],
    dependencyGraph: {
      'src/index.ts': ['src/types.ts', 'src/utils.ts'],
    },
    externalDeps: {
      express: ['express', 'Router'],
    },
    stats: {
      fileCount: 1,
      totalLoc: 50,
      totalTokens: 200,
      languageBreakdown: { typescript: 1 },
      scanDurationMs: 100,
      incremental: false,
    },
    ...overrides,
  };
}

describe('Compact formatter', () => {
  const formatter = getFormatter();

  it('should output header with root, date, and file count', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('# CODEMAP');
    expect(output).toContain('/project');
    expect(output).toContain('2025-01-15');
    expect(output).toContain('Files: 1');
  });

  it('should contain file paths in output', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('src/index.ts');
  });

  it('should use Unicode symbols for structural elements', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    // Function symbol
    expect(output).toContain('\u0192'); // ƒ
    // Class symbol
    expect(output).toContain('\u25C6'); // ◆
    // Interface symbol
    expect(output).toContain('\u25C7'); // ◇
    // Type symbol
    expect(output).toContain('\u03C4'); // τ
    // Enum symbol
    expect(output).toContain('\u03B5'); // ε
    // Constant symbol
    expect(output).toContain('\u03BA'); // κ
  });

  it('should contain DEPENDENCY GRAPH section when deps exist', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## DEPENDENCY GRAPH');
    expect(output).toContain('src/index.ts');
    expect(output).toContain('src/types.ts');
  });

  it('should contain EXTERNAL DEPS section when external deps exist', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## EXTERNAL DEPS');
    expect(output).toContain('express');
  });

  it('should not contain DEPENDENCY GRAPH section when graph is empty', () => {
    const result = createMockScanResult({ dependencyGraph: {} });
    const output = formatter.format(result);

    expect(output).not.toContain('## DEPENDENCY GRAPH');
  });

  it('should not contain EXTERNAL DEPS section when external deps are empty', () => {
    const result = createMockScanResult({ externalDeps: {} });
    const output = formatter.format(result);

    expect(output).not.toContain('## EXTERNAL DEPS');
  });

  it('should format class with extends and implements', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('UserService');
    expect(output).toMatch(/←.*BaseService/);
    expect(output).toMatch(/⊳.*Cacheable/);
  });

  it('should format interface properties', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('User');
    expect(output).toContain('id: string');
  });

  it('should contain FILES section', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## FILES');
  });

  it('should format structs with embeds and derives', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'main.rs',
          language: 'rust',
          loc: 30,
          estimatedTokens: 100,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          structs: [
            {
              name: 'Point',
              fields: [
                { name: 'x', type: 'f64' },
                { name: 'y', type: 'f64' },
              ],
              methods: [
                {
                  name: 'distance',
                  params: [{ name: 'other', type: 'Point' }],
                  returnType: 'f64',
                  exported: true,
                  loc: 5,
                },
              ],
              exported: true,
              embeds: ['Base'],
              derives: ['Debug', 'Clone'],
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('✦ Point');
    expect(output).toContain('← Base');
    expect(output).toContain('[Debug, Clone]');
    expect(output).toContain('distance');
  });

  it('should format traits with superTraits', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'lib.rs',
          language: 'rust',
          loc: 20,
          estimatedTokens: 80,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          traits: [
            {
              name: 'Drawable',
              methods: [
                {
                  name: 'draw',
                  params: [],
                  returnType: 'void',
                  exported: true,
                  loc: 3,
                },
              ],
              exported: true,
              superTraits: ['Display', 'Debug'],
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('Δ Drawable');
    expect(output).toContain('← Display, Debug');
    expect(output).toContain('draw');
  });

  it('should format hooks with the hook symbol', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'hooks.tsx',
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
          hooks: [
            {
              name: 'useAuth',
              kind: 'hook' as const,
              params: [],
              returnType: 'AuthState',
              exported: true,
              loc: 5,
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('useAuth');
    expect(output).toContain('🪝');
  });

  it('should format components with the component symbol', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'App.tsx',
          language: 'typescript',
          loc: 15,
          estimatedTokens: 60,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          components: [
            {
              name: 'App',
              kind: 'component' as const,
              params: [{ name: 'props', type: 'AppProps' }],
              returnType: 'JSX.Element',
              exported: true,
              loc: 10,
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('⚛');
    expect(output).toContain('App');
    expect(output).toContain('props: AppProps');
  });

  it('should format packages/namespaces', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'main.go',
          language: 'go',
          loc: 10,
          estimatedTokens: 40,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          packages: [{ name: 'main' }],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('π main');
  });

  it('should format re-exports', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'index.ts',
          language: 'typescript',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [
            { names: ['Foo', 'Bar'], isReExport: true, from: './foo' },
          ],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('↗ Foo, Bar');
    expect(output).toContain('from ./foo');
  });

  it('should format decorators on functions', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'controller.ts',
          language: 'typescript',
          loc: 10,
          estimatedTokens: 40,
          imports: [],
          exports: [],
          functions: [
            {
              name: 'handleRequest',
              params: [],
              returnType: 'void',
              exported: true,
              loc: 5,
              decorators: ['Get', 'Auth'],
            },
          ],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('∂Get');
    expect(output).toContain('∂Auth');
  });

  it('should format class methods with scope prefixes', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'service.ts',
          language: 'typescript',
          loc: 20,
          estimatedTokens: 80,
          imports: [],
          exports: [],
          functions: [],
          classes: [
            {
              name: 'Service',
              methods: [
                {
                  name: 'publicMethod',
                  params: [],
                  returnType: 'void',
                  exported: true,
                  loc: 3,
                  scope: 'public',
                },
                {
                  name: 'privateMethod',
                  params: [],
                  returnType: 'void',
                  exported: false,
                  loc: 3,
                  scope: 'private',
                },
                {
                  name: 'protectedMethod',
                  params: [],
                  returnType: 'void',
                  exported: false,
                  loc: 3,
                  scope: 'protected',
                },
              ],
              properties: [],
              exported: true,
              loc: 20,
            },
          ],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('[private]');
    expect(output).toContain('[protected]');
    // public should not show scope prefix
    expect(output).not.toContain('[public]');
  });

  it('should format interface with methods', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'types.ts',
          language: 'typescript',
          loc: 10,
          estimatedTokens: 40,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [
            {
              name: 'Repository',
              extends: ['BaseRepo', 'Cacheable'],
              properties: [{ name: 'name', type: 'string' }],
              methods: [
                {
                  name: 'findById',
                  params: [{ name: 'id', type: 'string' }],
                  returnType: 'Promise<Entity>',
                  exported: true,
                  loc: 2,
                },
              ],
              exported: true,
            },
          ],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('◇ Repository');
    expect(output).toContain('← BaseRepo, Cacheable');
    expect(output).toContain('findById');
  });

  it('should handle empty dependency graph entries', () => {
    const result = createMockScanResult({
      dependencyGraph: {
        'src/a.ts': [],
        'src/b.ts': ['src/c.ts'],
      },
    });
    const output = formatter.format(result);

    // Empty dep arrays should not be listed
    expect(output).not.toContain('src/a.ts →');
    expect(output).toContain('src/b.ts → src/c.ts');
  });

  it('should format file header with complexity when present', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'complex.ts',
          language: 'typescript',
          loc: 100,
          estimatedTokens: 500,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          complexity: 8,
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('[C:8]');
  });

  it('should format class with decorators and abstract modifier', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'abstract.ts',
          language: 'typescript',
          loc: 15,
          estimatedTokens: 60,
          imports: [],
          exports: [],
          functions: [],
          classes: [
            {
              name: 'AbstractBase',
              abstract: true,
              methods: [],
              properties: [],
              exported: true,
              loc: 10,
              decorators: ['Injectable'],
            },
          ],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('abstract');
    expect(output).toContain('∂Injectable');
    expect(output).toContain('◆ AbstractBase');
  });

  it('should format function with generator and static modifiers', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'gen.ts',
          language: 'typescript',
          loc: 10,
          estimatedTokens: 40,
          imports: [],
          exports: [],
          functions: [
            {
              name: 'idGenerator',
              params: [],
              returnType: 'Generator<number>',
              exported: true,
              loc: 5,
              generator: true,
              async: true,
              static: true,
            },
          ],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('async');
    expect(output).toContain('*');
    expect(output).toContain('static');
    expect(output).toContain('idGenerator');
  });

  it('should format optional params and unknown-type params', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'utils.ts',
          language: 'typescript',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [],
          functions: [
            {
              name: 'greet',
              params: [
                { name: 'name', type: 'string', optional: true },
                { name: 'value', type: 'unknown' },
              ],
              returnType: 'void',
              exported: true,
              loc: 3,
            },
          ],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('name?: string');
    expect(output).toContain('value');
    // 'unknown' type should be omitted
    expect(output).not.toMatch(/value.*unknown/);
  });

  it('should format constants without type when type is unknown', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'const.ts',
          language: 'typescript',
          loc: 3,
          estimatedTokens: 10,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [
            { name: 'UNTYPED', type: 'unknown', exported: true },
            { name: 'TYPED', type: 'string', exported: true },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('κ UNTYPED');
    expect(output).toContain('κ TYPED: string');
    // UNTYPED should not show ': unknown'
    expect(output).not.toContain('UNTYPED: unknown');
  });

  it('should format re-exports without from', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'index.ts',
          language: 'typescript',
          loc: 3,
          estimatedTokens: 10,
          imports: [],
          exports: [
            { names: ['LocalExport'], isReExport: true },
          ],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('↗ LocalExport');
  });

  it('should handle empty files array', () => {
    const result = createMockScanResult({ files: [] });
    const output = formatter.format(result);

    expect(output).toContain('# CODEMAP');
    expect(output).not.toContain('## FILES');
  });

  it('should format interface with optional properties', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'types.ts',
          language: 'typescript',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [
            {
              name: 'Options',
              properties: [
                { name: 'verbose', type: 'boolean', optional: true },
                { name: 'level', type: 'number' },
              ],
              exported: true,
            },
          ],
          types: [],
          enums: [],
          constants: [],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('verbose?: boolean');
    expect(output).toContain('level: number');
  });

  it('should format struct without embeds or derives', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'simple.rs',
          language: 'rust',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          structs: [
            {
              name: 'Simple',
              fields: [{ name: 'val', type: 'i32' }],
              methods: [],
              exported: true,
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('✦ Simple');
    // No embeds, so no ← on the struct line
    const structLine = output.split('\n').find((l: string) => l.includes('✦ Simple'));
    expect(structLine).toBeDefined();
    expect(structLine).not.toContain('←');
    // No derives bracket on the struct line
    expect(structLine).not.toMatch(/\[.*\]/);

  });
});

describe('Compact formatter - analysis sections', () => {
  const formatter = getFormatter();

  function makeAnalysis(overrides?: Partial<CodeAnalysis>): CodeAnalysis {
    return {
      reverseDeps: {},
      orphanFiles: [],
      unusedExports: [],
      circularDeps: [],
      entryPoints: [],
      ...overrides,
    };
  }

  it('should include ENTRY POINTS section when entryPoints has items', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ entryPoints: ['src/index.ts', 'src/cli.ts'] }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## ENTRY POINTS');
    expect(output).toContain('▶ src/index.ts');
    expect(output).toContain('▶ src/cli.ts');
  });

  it('should omit ENTRY POINTS section when entryPoints is empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ entryPoints: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## ENTRY POINTS');
  });

  it('should include REVERSE DEPS section when there are importers', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        reverseDeps: {
          'src/utils.ts': ['src/index.ts', 'src/app.ts'],
          'src/empty.ts': [],
        },
      }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## REVERSE DEPS');
    expect(output).toContain('src/utils.ts ← src/index.ts, src/app.ts');
    // File with no importers should not appear
    expect(output).not.toContain('src/empty.ts ←');
  });

  it('should omit REVERSE DEPS section when all importers are empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        reverseDeps: { 'a.ts': [], 'b.ts': [] },
      }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## REVERSE DEPS');
  });

  it('should include CIRCULAR DEPS section when cycles exist', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        circularDeps: [['a.ts', 'b.ts', 'a.ts']],
      }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## CIRCULAR DEPS');
    expect(output).toContain('⟳ a.ts → b.ts → a.ts');
  });

  it('should omit CIRCULAR DEPS section when no cycles', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ circularDeps: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## CIRCULAR DEPS');
  });

  it('should include ORPHAN FILES section when orphanFiles has items', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ orphanFiles: ['src/dead.ts', 'src/unused.ts'] }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## ORPHAN FILES');
    expect(output).toContain('⚠ src/dead.ts');
    expect(output).toContain('⚠ src/unused.ts');
  });

  it('should omit ORPHAN FILES section when empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ orphanFiles: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## ORPHAN FILES');
  });

  it('should include UNUSED EXPORTS section grouped by file', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        unusedExports: [
          { file: 'lib.ts', name: 'foo' },
          { file: 'lib.ts', name: 'bar' },
          { file: 'utils.ts', name: 'baz' },
        ],
      }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## UNUSED EXPORTS');
    expect(output).toContain('⚠ lib.ts: foo, bar');
    expect(output).toContain('⚠ utils.ts: baz');
  });

  it('should omit UNUSED EXPORTS section when empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ unusedExports: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## UNUSED EXPORTS');
  });

  it('should omit all analysis sections when analysis is undefined', () => {
    const result = createMockScanResult();
    // Ensure no analysis property
    delete (result as any).analysis;
    const output = formatter.format(result);

    expect(output).not.toContain('## ENTRY POINTS');
    expect(output).not.toContain('## REVERSE DEPS');
    expect(output).not.toContain('## CIRCULAR DEPS');
    expect(output).not.toContain('## ORPHAN FILES');
    expect(output).not.toContain('## UNUSED EXPORTS');
  });
});
