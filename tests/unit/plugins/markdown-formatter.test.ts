import { describe, it, expect } from 'vitest';
import { createMarkdownFormatterPlugin } from '../../../src/plugins/optional/markdown-formatter.js';
import type { OutputFormatter, ScanResult, CodemapKernel, CodeAnalysis } from '../../../src/types.js';

function getFormatter(): OutputFormatter {
  let captured: OutputFormatter | undefined;
  const kernel = {
    registerFormatter(formatter: OutputFormatter) {
      captured = formatter;
    },
  } as unknown as CodemapKernel;

  const plugin = createMarkdownFormatterPlugin();
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
            methods: [
              {
                name: 'getById',
                params: [{ name: 'id', type: 'string' }],
                returnType: 'User',
                exported: true,
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
            name: 'Config',
            properties: [{ name: 'port', type: 'number' }],
            exported: true,
          },
        ],
        types: [
          {
            name: 'ID',
            type: 'string',
            exported: true,
          },
        ],
        enums: [
          {
            name: 'Color',
            members: ['Red', 'Blue'],
            exported: true,
          },
        ],
        constants: [
          {
            name: 'VERSION',
            type: 'string',
            exported: true,
          },
        ],
      },
    ],
    dependencyGraph: {
      'src/index.ts': ['src/utils.ts'],
    },
    externalDeps: {
      lodash: ['lodash'],
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

describe('Markdown formatter', () => {
  const formatter = getFormatter();

  it('should output markdown headers', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('# Codemap');
    expect(output).toContain('## Files');
    expect(output).toContain('### `src/index.ts`');
  });

  it('should contain bullet points with Unicode symbols', () => {
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

  it('should include root and date in header', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('/project');
    expect(output).toContain('2025-01-15');
  });

  it('should format classes with extends', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('UserService');
    expect(output).toContain('extends');
    expect(output).toContain('BaseService');
  });

  it('should include External Dependencies section', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## External Dependencies');
    expect(output).toContain('lodash');
  });

  it('should include Dependency Graph section', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## Dependency Graph');
    expect(output).toContain('src/index.ts');
    expect(output).toContain('src/utils.ts');
  });

  it('should not include External Dependencies section when empty', () => {
    const result = createMockScanResult({ externalDeps: {} });
    const output = formatter.format(result);

    expect(output).not.toContain('## External Dependencies');
  });

  it('should format function signatures', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('hello');
    expect(output).toContain('name: string');
  });

  it('should format structs with fields', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'main.rs',
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
          structs: [
            {
              name: 'Point',
              fields: [
                { name: 'x', type: 'f64' },
                { name: 'y', type: 'f64' },
              ],
              methods: [],
              exported: true,
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('✦ **Struct** `Point`');
    expect(output).toContain('`x: f64`');
    expect(output).toContain('`y: f64`');
  });

  it('should format traits with methods', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'lib.rs',
          language: 'rust',
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
            },
          ],
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('Δ **Trait** `Drawable`');
    expect(output).toContain('draw');
  });

  it('should format hooks', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'hooks.tsx',
          language: 'typescript',
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

    expect(output).toContain('🪝 **Hook**');
    expect(output).toContain('useAuth');
  });

  it('should format components', () => {
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

    expect(output).toContain('⚛ **Component**');
    expect(output).toContain('App');
  });

  it('should format class with abstract modifier', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'base.ts',
          language: 'typescript',
          loc: 20,
          estimatedTokens: 80,
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
              loc: 15,
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

    expect(output).toContain('*(abstract)*');
    expect(output).toContain('AbstractBase');
  });

  it('should format class with implements', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'impl.ts',
          language: 'typescript',
          loc: 20,
          estimatedTokens: 80,
          imports: [],
          exports: [],
          functions: [],
          classes: [
            {
              name: 'MyService',
              implements: ['Serializable', 'Comparable'],
              methods: [],
              properties: [],
              exported: true,
              loc: 15,
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

    expect(output).toContain('implements');
    expect(output).toContain('`Serializable`');
    expect(output).toContain('`Comparable`');
  });

  it('should format interface with extends', () => {
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
              name: 'Extended',
              extends: ['Base', 'Mixin'],
              properties: [{ name: 'id', type: 'string' }],
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

    expect(output).toContain('extends');
    expect(output).toContain('`Base`');
    expect(output).toContain('`Mixin`');
  });

  it('should format constants in output', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('κ `VERSION: string`');
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

    expect(output).toContain('+ `publicMethod');
    expect(output).toContain('- `privateMethod');
    expect(output).toContain('# `protectedMethod');
  });

  it('should show complexity when present on file', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'complex.ts',
          language: 'typescript',
          loc: 50,
          estimatedTokens: 200,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
          complexity: 7,
        },
      ],
    });
    const output = formatter.format(result);

    expect(output).toContain('Complexity: 7');
  });

  it('should format optional interface properties', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'opts.ts',
          language: 'typescript',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [
            {
              name: 'Opts',
              properties: [
                { name: 'debug', type: 'boolean', optional: true },
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

    expect(output).toContain('debug?: boolean');
  });

  it('should format async function signature', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'async.ts',
          language: 'typescript',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [],
          functions: [
            {
              name: 'fetchData',
              params: [{ name: 'url', type: 'string' }],
              returnType: 'Promise<Data>',
              exported: true,
              loc: 3,
              async: true,
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

    expect(output).toContain('async fetchData');
  });

  it('should format optional function params', () => {
    const result = createMockScanResult({
      files: [
        {
          path: 'opt.ts',
          language: 'typescript',
          loc: 5,
          estimatedTokens: 20,
          imports: [],
          exports: [],
          functions: [
            {
              name: 'greet',
              params: [{ name: 'name', type: 'string', optional: true }],
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
  });
});

describe('Markdown formatter - analysis sections', () => {
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

  it('should include Entry Points section with markers', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ entryPoints: ['src/index.ts', 'src/cli.ts'] }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## Entry Points');
    expect(output).toContain('▶ `src/index.ts`');
    expect(output).toContain('▶ `src/cli.ts`');
  });

  it('should omit Entry Points section when empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ entryPoints: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## Entry Points');
  });

  it('should include Reverse Dependencies section', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        reverseDeps: {
          'src/utils.ts': ['src/index.ts'],
          'src/empty.ts': [],
        },
      }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## Reverse Dependencies');
    expect(output).toContain('`src/utils.ts` ← `src/index.ts`');
    expect(output).not.toContain('`src/empty.ts`');
  });

  it('should omit Reverse Dependencies section when all empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        reverseDeps: { 'a.ts': [], 'b.ts': [] },
      }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## Reverse Dependencies');
  });

  it('should include Circular Dependencies section with cycle markers', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({
        circularDeps: [['a.ts', 'b.ts', 'a.ts']],
      }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## Circular Dependencies');
    expect(output).toContain('⟳');
    expect(output).toContain('`a.ts`');
    expect(output).toContain('`b.ts`');
  });

  it('should omit Circular Dependencies section when empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ circularDeps: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## Circular Dependencies');
  });

  it('should include Orphan Files section with warning markers', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ orphanFiles: ['src/dead.ts'] }),
    });
    const output = formatter.format(result);

    expect(output).toContain('## Orphan Files');
    expect(output).toContain('⚠ `src/dead.ts`');
  });

  it('should omit Orphan Files section when empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ orphanFiles: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## Orphan Files');
  });

  it('should include Unused Exports section grouped by file', () => {
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

    expect(output).toContain('## Unused Exports');
    expect(output).toContain('⚠ `lib.ts`: `foo`, `bar`');
    expect(output).toContain('⚠ `utils.ts`: `baz`');
  });

  it('should omit Unused Exports section when empty', () => {
    const result = createMockScanResult({
      analysis: makeAnalysis({ unusedExports: [] }),
    });
    const output = formatter.format(result);

    expect(output).not.toContain('## Unused Exports');
  });

  it('should omit all analysis sections when analysis is undefined', () => {
    const result = createMockScanResult();
    delete (result as any).analysis;
    const output = formatter.format(result);

    expect(output).not.toContain('## Entry Points');
    expect(output).not.toContain('## Reverse Dependencies');
    expect(output).not.toContain('## Circular Dependencies');
    expect(output).not.toContain('## Orphan Files');
    expect(output).not.toContain('## Unused Exports');
  });
});
