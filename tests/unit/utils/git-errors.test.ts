import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Store original implementations
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
const actualChildProcess = await vi.importActual<typeof import('node:child_process')>('node:child_process');

// Mock child_process to control execFileSync
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFileSync: vi.fn((...args: any[]) => (actual.execFileSync as any)(...args)),
  };
});

// Mock node:fs for chmodSync
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    chmodSync: vi.fn((...args: any[]) => (actual.chmodSync as any)(...args)),
  };
});

// Import after mocks are set up
const { isGitAvailable, installPreCommitHook } = await import('../../../src/utils/git.js');
const childProcess = await import('node:child_process');
const fs = await import('node:fs');

describe('git utils - error handling with mocks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    (childProcess.execFileSync as any).mockImplementation(
      (...args: any[]) => (actualChildProcess.execFileSync as any)(...args),
    );
    (fs.chmodSync as any).mockImplementation(
      (...args: any[]) => (actualFs.chmodSync as any)(...args),
    );
  });

  it('should return false when git is not available', () => {
    (childProcess.execFileSync as any).mockImplementation(() => {
      throw new Error('git not found');
    });

    const result = isGitAvailable();
    expect(result).toBe(false);
  });

  it('should handle chmodSync failure in installPreCommitHook', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'codemap-chmod-'));
    mkdirSync(join(tempDir, '.git'), { recursive: true });

    // Make chmodSync throw
    (fs.chmodSync as any).mockImplementation(() => {
      throw new Error('chmod not supported');
    });

    const result = installPreCommitHook(tempDir);
    expect(result).toBe(true);

    // Hook should still be installed despite chmod failure
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    const hookContent = actualFs.readFileSync(hookPath, 'utf-8');
    expect(hookContent).toContain('@oxog/codemap');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
