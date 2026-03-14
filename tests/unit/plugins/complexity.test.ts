import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateComplexity } from '../../../src/plugins/optional/complexity.js';
import type { ScanResult, FileAnalysis } from '../../../src/types.js';

// Store actual fs for cleanup
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

// Mock node:fs so that complexity plugin's readFileSync can be controlled
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((...args: any[]) => (actual.readFileSync as any)(...args)),
  };
});

const fs = await import('node:fs');

// Import createComplexityPlugin AFTER mock is set up
const { createComplexityPlugin } = await import('../../../src/plugins/optional/complexity.js');

describe('calculateComplexity', () => {
  it('should return 1 for a simple function with no branches', () => {
    const code = `function hello() {
  return "world";
}`;
    expect(calculateComplexity(code)).toBe(1);
  });

  it('should return > 1 for a function with an if statement', () => {
    const code = `function check(x) {
  if (x > 0) {
    return true;
  }
  return false;
}`;
    expect(calculateComplexity(code)).toBeGreaterThan(1);
  });

  it('should return higher complexity for multiple if/else branches', () => {
    const simpleCode = `function a(x) {
  if (x) { return 1; }
}`;
    const complexCode = `function b(x) {
  if (x > 0) { return 1; }
  else if (x < 0) { return -1; }
  else { return 0; }
}`;
    expect(calculateComplexity(complexCode)).toBeGreaterThan(calculateComplexity(simpleCode));
  });

  it('should count switch/case statements', () => {
    const code = `function process(action) {
  switch (action) {
    case "start":
      return 1;
    case "stop":
      return 2;
    case "pause":
      return 3;
  }
}`;
    const complexity = calculateComplexity(code);
    // switch + 3 cases = 4 additional
    expect(complexity).toBeGreaterThan(1);
  });

  it('should count for and while loops', () => {
    const code = `function loop(items) {
  for (let i = 0; i < items.length; i++) {
    while (items[i] > 0) {
      items[i]--;
    }
  }
}`;
    const complexity = calculateComplexity(code);
    // for + while = 2 additional
    expect(complexity).toBeGreaterThanOrEqual(3);
  });

  it('should count && and || operators', () => {
    const code = `function validate(a, b, c) {
  if (a && b || c) {
    return true;
  }
}`;
    const complexity = calculateComplexity(code);
    // if + && + || = 3 additional
    expect(complexity).toBeGreaterThanOrEqual(4);
  });

  it('should count ternary operator (?)', () => {
    const code = `function pick(x) {
  return x > 0 ? "positive" : "non-positive";
}`;
    const complexity = calculateComplexity(code);
    // ? = 1 additional
    expect(complexity).toBeGreaterThan(1);
  });

  it('should count ?? (nullish coalescing) operator', () => {
    const code = `function fallback(x) {
  return x ?? "default";
}`;
    const complexity = calculateComplexity(code);
    // ?? = 1 additional
    expect(complexity).toBeGreaterThan(1);
  });

  it('should handle do...while loops', () => {
    const code = `function doLoop() {
  do {
    x++;
  } while (x < 10);
}`;
    const complexity = calculateComplexity(code);
    // do + while = 2 additional
    expect(complexity).toBeGreaterThanOrEqual(3);
  });

  it('should count catch blocks', () => {
    const code = `function tryCatch() {
  try {
    doSomething();
  } catch (e) {
    handleError(e);
  }
}`;
    const complexity = calculateComplexity(code);
    expect(complexity).toBeGreaterThan(1);
  });

  it('should count throw statements', () => {
    const code = `function throwError() {
  throw new Error("fail");
}`;
    const complexity = calculateComplexity(code);
    expect(complexity).toBeGreaterThan(1);
  });

  it('should skip optional chaining (?.) as not adding complexity', () => {
    const code = `function optChain(obj) {
  return obj?.value;
}`;
    const complexity = calculateComplexity(code);
    // ?. should not count as ternary
    expect(complexity).toBe(1);
  });

  it('should handle empty code', () => {
    const complexity = calculateComplexity('');
    expect(complexity).toBe(1);
  });

  it('should handle deeply nested branches', () => {
    const code = `function deep(a, b, c) {
  if (a) {
    if (b) {
      if (c) {
        return true;
      }
    }
  }
}`;
    const complexity = calculateComplexity(code);
    // 3 if statements
    expect(complexity).toBeGreaterThanOrEqual(4);
  });
});

describe('createComplexityPlugin', () => {
  it('should have correct name', () => {
    const plugin = createComplexityPlugin();
    expect(plugin.name).toBe('complexity');
  });

  it('should have correct version', () => {
    const plugin = createComplexityPlugin();
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have an install method that does not throw', () => {
    const plugin = createComplexityPlugin();
    expect(() => plugin.install({} as any)).not.toThrow();
  });

  it('should have an onScanComplete hook', () => {
    const plugin = createComplexityPlugin();
    expect(typeof plugin.onScanComplete).toBe('function');
  });

  describe('onScanComplete', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      // Re-wire mock to real implementation
      (fs.readFileSync as any).mockImplementation((...args: any[]) => (actualFs.readFileSync as any)(...args));
    });

    it('should add complexity scores to files by reading source from disk', async () => {
      const plugin = createComplexityPlugin();

      // Mock readFileSync to return code with branching
      const code = `function hello(x: string) {
  if (x) { return x; }
  return "world";
}`;
      (fs.readFileSync as any).mockReturnValue(code);

      const mockFile: FileAnalysis = {
        path: 'src/index.ts',
        language: 'typescript',
        loc: 20,
        estimatedTokens: 100,
        imports: [],
        exports: [],
        functions: [
          {
            name: 'hello',
            params: [],
            returnType: 'string',
            exported: true,
            loc: 5,
          },
        ],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      };

      const result: ScanResult = {
        root: '/project',
        timestamp: new Date().toISOString(),
        files: [mockFile],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 1,
          totalLoc: 20,
          totalTokens: 100,
          languageBreakdown: { typescript: 1 },
          scanDurationMs: 10,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(result);

      // The plugin mutates the file object to add complexity
      const mutableFile = mockFile as { complexity?: number };
      expect(mutableFile.complexity).toBeDefined();
      expect(typeof mutableFile.complexity).toBe('number');
      // The code has an `if` keyword so complexity > 1
      expect(mutableFile.complexity).toBeGreaterThan(1);
    });

    it('should set complexity to 1 for simple files with no branching', async () => {
      const plugin = createComplexityPlugin();

      // Mock readFileSync to return simple code with no branching
      const code = `const FOO = "bar";`;
      (fs.readFileSync as any).mockReturnValue(code);

      const mockFile: FileAnalysis = {
        path: 'src/constants.ts',
        language: 'typescript',
        loc: 5,
        estimatedTokens: 20,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [{ name: 'FOO', type: 'string', exported: true }],
      };

      const result: ScanResult = {
        root: '/project',
        timestamp: new Date().toISOString(),
        files: [mockFile],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 1,
          totalLoc: 5,
          totalTokens: 20,
          languageBreakdown: { typescript: 1 },
          scanDurationMs: 5,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(result);

      const mutableFile = mockFile as { complexity?: number };
      expect(mutableFile.complexity).toBe(1);
    });

    it('should calculate complexity from source code with multiple branches', async () => {
      const plugin = createComplexityPlugin();

      // Mock readFileSync to return code with multiple branches
      const code = `class MyService {
  doWork(x: number) {
    if (x > 0) {
      if (x > 10) {
        return "big";
      }
      return "small";
    }
    return "none";
  }
  helper() {
    return 42;
  }
}`;
      (fs.readFileSync as any).mockReturnValue(code);

      const mockFile: FileAnalysis = {
        path: 'src/service.ts',
        language: 'typescript',
        loc: 30,
        estimatedTokens: 150,
        imports: [],
        exports: [],
        functions: [],
        classes: [
          {
            name: 'MyService',
            methods: [
              {
                name: 'doWork',
                params: [],
                returnType: 'void',
                exported: false,
                loc: 10,
              },
              {
                name: 'helper',
                params: [],
                returnType: 'void',
                exported: false,
                loc: 8,
              },
            ],
            properties: [],
            exported: true,
            loc: 30,
          },
        ],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      };

      const result: ScanResult = {
        root: '/project',
        timestamp: new Date().toISOString(),
        files: [mockFile],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 1,
          totalLoc: 30,
          totalTokens: 150,
          languageBreakdown: { typescript: 1 },
          scanDurationMs: 10,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(result);

      const mutableFile = mockFile as { complexity?: number };
      expect(mutableFile.complexity).toBeDefined();
      // Code has 2 if statements, so complexity = 1 + 2 = 3
      expect(mutableFile.complexity).toBe(3);
    });

    it('should return 1 when file cannot be read from disk', async () => {
      const plugin = createComplexityPlugin();

      // Mock readFileSync to throw (file not found)
      (fs.readFileSync as any).mockImplementation(() => { throw new Error('ENOENT'); });

      const mockFile: FileAnalysis = {
        path: 'src/missing.ts',
        language: 'typescript',
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [
          {
            name: 'simple',
            params: [],
            returnType: 'void',
            exported: true,
            loc: 5,
          },
        ],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      };

      const result: ScanResult = {
        root: '/project',
        timestamp: new Date().toISOString(),
        files: [mockFile],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 1,
          totalLoc: 10,
          totalTokens: 50,
          languageBreakdown: { typescript: 1 },
          scanDurationMs: 5,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(result);

      const mutableFile = mockFile as { complexity?: number };
      // Falls back to 1 when file can't be read
      expect(mutableFile.complexity).toBe(1);
    });

    it('should handle multiple files with different complexity', async () => {
      const plugin = createComplexityPlugin();

      const simpleCode = `function fn1() { return 1; }`;
      const complexCode = `function fn2(x: number) {
  if (x > 0) {
    if (x > 5) {
      for (let i = 0; i < x; i++) {
        if (i % 2 === 0) {
          console.log(i);
        }
      }
    }
  }
}`;

      // Return different code for different file paths
      (fs.readFileSync as any).mockImplementation((path: string) => {
        if (path.includes('a.ts')) return simpleCode;
        if (path.includes('b.ts')) return complexCode;
        throw new Error('ENOENT');
      });

      const mockFile1: FileAnalysis = {
        path: 'src/a.ts',
        language: 'typescript',
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [
          { name: 'fn1', params: [], returnType: 'void', exported: true, loc: 5 },
        ],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      };

      const mockFile2: FileAnalysis = {
        path: 'src/b.ts',
        language: 'typescript',
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [
          { name: 'fn2', params: [], returnType: 'void', exported: true, loc: 5 },
        ],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      };

      const result: ScanResult = {
        root: '/project',
        timestamp: new Date().toISOString(),
        files: [mockFile1, mockFile2],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 2,
          totalLoc: 20,
          totalTokens: 100,
          languageBreakdown: { typescript: 2 },
          scanDurationMs: 10,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(result);

      // Simple code: complexity 1 (no branches)
      expect((mockFile1 as any).complexity).toBe(1);
      // Complex code: has multiple if + for = higher complexity
      expect((mockFile2 as any).complexity).toBeGreaterThan(1);
    });
  });
});
