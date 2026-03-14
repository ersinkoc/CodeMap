import { describe, it, expect, vi } from 'vitest';
import { createFileWatcher } from '../../src/watcher.js';
import type { CodemapConfig } from '../../src/types.js';
import type { Kernel } from '../../src/kernel.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
  };
});

describe('Watch Mode Integration', () => {
  it('should create watcher and close gracefully', () => {
    const mockKernel = {
      scan: vi.fn().mockResolvedValue({
        root: './src',
        timestamp: new Date().toISOString(),
        files: [],
        dependencyGraph: {},
        externalDeps: {},
        stats: { fileCount: 0, totalLoc: 0, totalTokens: 0, languageBreakdown: {}, scanDurationMs: 0, incremental: false },
      }),
    } as unknown as Kernel;

    const config: CodemapConfig = {
      root: './src',
      output: '.codemap',
      format: 'compact',
    };

    const watcher = createFileWatcher(mockKernel, config, 100);
    expect(watcher).toBeDefined();
    watcher.close();
  });

  it('should register listeners without error', () => {
    const mockKernel = {
      scan: vi.fn().mockResolvedValue({
        root: './src',
        timestamp: new Date().toISOString(),
        files: [],
        dependencyGraph: {},
        externalDeps: {},
        stats: { fileCount: 0, totalLoc: 0, totalTokens: 0, languageBreakdown: {}, scanDurationMs: 0, incremental: false },
      }),
    } as unknown as Kernel;

    const config: CodemapConfig = {
      root: './src',
      output: '.codemap',
      format: 'compact',
    };

    const watcher = createFileWatcher(mockKernel, config, 100);
    watcher.on('change', () => {});
    watcher.on('error', () => {});
    watcher.close();
  });
});
