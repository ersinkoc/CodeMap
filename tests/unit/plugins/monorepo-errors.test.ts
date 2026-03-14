import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';

// Store original implementations
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

// Mock node:fs to intercept readdirSync
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readdirSync: vi.fn((...args: any[]) => (actual.readdirSync as any)(...args)),
  };
});

// Import after mock is set up
const { detectWorkspaces } = await import('../../../src/plugins/optional/monorepo.js');
const mockedFs = await import('node:fs');

describe('Monorepo Plugin - error handling with mocks', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = actualFs.mkdtempSync(path.join(os.tmpdir(), 'codemap-mono-err-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    (mockedFs.readdirSync as any).mockImplementation(
      (...args: any[]) => (actualFs.readdirSync as any)(...args),
    );
    for (const dir of tempDirs) {
      try {
        actualFs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  it('should handle readdirSync failure on parent directory gracefully', () => {
    const dir = makeTempDir();

    // Create the packages directory so existsSync returns true
    const pkgDir = path.join(dir, 'packages');
    actualFs.mkdirSync(pkgDir, { recursive: true });

    // Make readdirSync throw for the packages directory
    const origReaddirSync = actualFs.readdirSync;
    (mockedFs.readdirSync as any).mockImplementation((p: any, ...args: any[]) => {
      if (typeof p === 'string' && p.replace(/\\/g, '/').includes('/packages')) {
        throw new Error('Permission denied');
      }
      return (origReaddirSync as any)(p, ...args);
    });

    actualFs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    );

    const result = detectWorkspaces(dir);
    // Should return empty since readdirSync failed
    expect(result).toEqual([]);
  });
});
