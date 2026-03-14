import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Store original implementations
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

// Mock node:fs to intercept readFileSync and statSync
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((...args: any[]) => (actual.readFileSync as any)(...args)),
    statSync: vi.fn((...args: any[]) => (actual.statSync as any)(...args)),
    readdirSync: vi.fn((...args: any[]) => (actual.readdirSync as any)(...args)),
  };
});

// Import scanDirectory AFTER the mock is set up
const { scanDirectory } = await import('../../src/scanner.js');
const fs = await import('node:fs');

describe('scanDirectory - error handling with mocks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Re-wire mocks to real implementations
    (fs.readFileSync as any).mockImplementation((...args: any[]) => (actualFs.readFileSync as any)(...args));
    (fs.statSync as any).mockImplementation((...args: any[]) => (actualFs.statSync as any)(...args));
    (fs.readdirSync as any).mockImplementation((...args: any[]) => (actualFs.readdirSync as any)(...args));
  });

  it('should skip files that throw on readFileSync', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'codemap-readfail-'));
    writeFileSync(join(tempDir, 'good.ts'), 'export const a = 1;');
    writeFileSync(join(tempDir, 'bad.ts'), 'export const b = 2;');

    const origReadFileSync = actualFs.readFileSync;
    (fs.readFileSync as any).mockImplementation((path: any, ...args: any[]) => {
      if (typeof path === 'string' && path.replace(/\\/g, '/').endsWith('bad.ts')) {
        throw new Error('Permission denied');
      }
      return (origReadFileSync as any)(path, ...args);
    });

    const files = scanDirectory(tempDir);
    // Only the good file should be returned
    expect(files.length).toBe(1);
    expect(files[0]!.relativePath).toBe('good.ts');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should skip entries that fail statSync', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'codemap-statfail-'));
    writeFileSync(join(tempDir, 'good.ts'), 'export const a = 1;');
    writeFileSync(join(tempDir, 'bad.ts'), 'export const b = 2;');

    const origStatSync = actualFs.statSync;
    (fs.statSync as any).mockImplementation((path: any, ...args: any[]) => {
      if (typeof path === 'string' && path.replace(/\\/g, '/').endsWith('bad.ts')) {
        throw new Error('Stat failed');
      }
      return (origStatSync as any)(path, ...args);
    });

    const files = scanDirectory(tempDir);
    // Only the good file should be returned
    expect(files.length).toBe(1);
    expect(files[0]!.relativePath).toBe('good.ts');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
