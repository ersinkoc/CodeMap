import { describe, it, expect } from 'vitest';
import { createLlmsTxtFormatterPlugin } from '../../../src/plugins/optional/llms-txt-formatter.js';
import type { OutputFormatter, ScanResult, CodemapKernel } from '../../../src/types.js';

function getFormatter(): OutputFormatter {
  let captured: OutputFormatter | undefined;
  const kernel = {
    registerFormatter(formatter: OutputFormatter) {
      captured = formatter;
    },
  } as unknown as CodemapKernel;

  const plugin = createLlmsTxtFormatterPlugin();
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
            name: 'App',
            methods: [
              {
                name: 'start',
                params: [],
                returnType: 'void',
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
            name: 'Options',
            properties: [{ name: 'verbose', type: 'boolean' }],
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
            name: 'Level',
            members: ['Info', 'Warn', 'Error'],
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
      chalk: ['chalk'],
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

describe('llms-txt formatter', () => {
  const formatter = getFormatter();

  it('should follow llms.txt structure with top-level heading', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('# Codebase Map');
  });

  it('should include blockquote summary with stats', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('> Structural map of /project');
    expect(output).toContain('1 files');
    expect(output).toContain('50 LOC');
    expect(output).toContain('Generated: 2025-01-15');
  });

  it('should have a Structure section with files', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## Structure');
    expect(output).toContain('### src/index.ts');
    expect(output).toContain('50 lines');
  });

  it('should list functions, classes, interfaces, types, enums, constants', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('- Function: hello');
    expect(output).toContain('- Class: App');
    expect(output).toContain('- Interface: Options');
    expect(output).toContain('- Type: ID = string');
    expect(output).toContain('- Enum: Level');
    expect(output).toContain('- Constant: VERSION');
  });

  it('should include Dependencies section when external deps exist', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## Dependencies');
    expect(output).toContain('chalk');
  });

  it('should not include Dependencies section when external deps are empty', () => {
    const result = createMockScanResult({ externalDeps: {} });
    const output = formatter.format(result);

    expect(output).not.toContain('## Dependencies');
  });

  it('should include Internal Dependencies section when graph exists', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('## Internal Dependencies');
    expect(output).toContain('src/index.ts');
    expect(output).toContain('src/utils.ts');
  });

  it('should format function signatures with params and return types', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('hello(name: string)');
    expect(output).toMatch(/hello\(name: string\).*string/);
  });

  it('should list class methods indented under the class', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    const lines = output.split('\n');
    const classLine = lines.findIndex((l) => l.includes('- Class: App'));
    expect(classLine).toBeGreaterThan(-1);
    // The method should be indented on a subsequent line
    const methodLine = lines.findIndex((l, idx) => idx > classLine && l.includes('start'));
    expect(methodLine).toBeGreaterThan(classLine);
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

    expect(output).toContain('- Struct: Point');
    expect(output).toContain('x: f64');
    expect(output).toContain('y: f64');
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

    expect(output).toContain('- Trait: Drawable');
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

    expect(output).toContain('- Hook: useAuth');
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

    expect(output).toContain('- Component: App');
  });

  it('should format class with extends and implements', () => {
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
              name: 'UserService',
              extends: 'BaseService',
              implements: ['Cacheable', 'Serializable'],
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

    expect(output).toContain('Class: UserService extends BaseService implements Cacheable, Serializable');
  });

  it('should format constants', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(output).toContain('- Constant: VERSION: string');
  });

  it('should not include Internal Dependencies when graph is empty', () => {
    const result = createMockScanResult({ dependencyGraph: {} });
    const output = formatter.format(result);

    expect(output).not.toContain('## Internal Dependencies');
  });

  it('should format async function signatures', () => {
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
});
