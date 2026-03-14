import { describe, it, expect } from 'vitest';
import { createJsonFormatterPlugin } from '../../../src/plugins/optional/json-formatter.js';
import type { OutputFormatter, ScanResult, CodemapKernel } from '../../../src/types.js';

function getFormatter(): OutputFormatter {
  let captured: OutputFormatter | undefined;
  const kernel = {
    registerFormatter(formatter: OutputFormatter) {
      captured = formatter;
    },
  } as unknown as CodemapKernel;

  const plugin = createJsonFormatterPlugin();
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
        imports: [{ from: 'express', names: ['express'], kind: 'external' }],
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
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      },
    ],
    dependencyGraph: {
      'src/index.ts': ['src/types.ts'],
    },
    externalDeps: {
      express: ['express'],
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

describe('JSON formatter', () => {
  const formatter = getFormatter();

  it('should output valid JSON', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should include root and timestamp in output', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed.root).toBe('/project');
    expect(parsed.timestamp).toBe('2025-01-15T10:00:00Z');
  });

  it('should include stats object', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed.stats).toBeDefined();
    expect(parsed.stats.fileCount).toBe(1);
    expect(parsed.stats.totalLoc).toBe(50);
    expect(parsed.stats.totalTokens).toBe(200);
  });

  it('should include files array with correct structure', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed.files).toBeInstanceOf(Array);
    expect(parsed.files).toHaveLength(1);
    const file = parsed.files[0];
    expect(file.path).toBe('src/index.ts');
    expect(file.language).toBe('typescript');
    expect(file.loc).toBe(50);
    expect(file.functions).toHaveLength(1);
    expect(file.functions[0].name).toBe('hello');
  });

  it('should include dependency graph', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed.dependencyGraph).toBeDefined();
    expect(parsed.dependencyGraph['src/index.ts']).toContain('src/types.ts');
  });

  it('should include external deps', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    expect(parsed.externalDeps).toBeDefined();
    expect(parsed.externalDeps.express).toContain('express');
  });

  it('should produce indented output (2 spaces)', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);

    // Indented JSON will have lines starting with spaces
    const lines = output.split('\n');
    const indentedLines = lines.filter((line) => line.startsWith('  '));
    expect(indentedLines.length).toBeGreaterThan(0);
  });

  it('should include imports in file data', () => {
    const result = createMockScanResult();
    const output = formatter.format(result);
    const parsed = JSON.parse(output);

    const file = parsed.files[0];
    expect(file.imports).toHaveLength(1);
    expect(file.imports[0].from).toBe('express');
  });
});
