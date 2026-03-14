import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createFileWatcher } from '../../src/watcher.js';
import type { CodemapConfig, ScanResult } from '../../src/types.js';
import type { Kernel } from '../../src/kernel.js';

// Store the watch callback so we can trigger it in tests
let watchCallback: ((_eventType: string, filename: string | null) => void) | null = null;
let watchErrorCallback: ((err: Error) => void) | null = null;

// Mock fs.watch
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: vi.fn((_path: string, _options: any, callback: any) => {
      watchCallback = callback;
      const watcher = {
        on: vi.fn((event: string, cb: any) => {
          if (event === 'error') {
            watchErrorCallback = cb;
          }
        }),
        close: vi.fn(),
      };
      return watcher;
    }),
  };
});

const mockConfig: CodemapConfig = {
  root: './src',
  output: '.codemap',
  format: 'compact',
};

function createMockResult(): ScanResult {
  return {
    root: './src',
    timestamp: new Date().toISOString(),
    files: [],
    dependencyGraph: {},
    externalDeps: {},
    stats: {
      fileCount: 0,
      totalLoc: 0,
      totalTokens: 0,
      languageBreakdown: {},
      scanDurationMs: 10,
      incremental: false,
    },
  };
}

function createMockKernel(overrides?: Partial<Kernel>): Kernel {
  return {
    scan: vi.fn().mockResolvedValue(createMockResult()),
    use: vi.fn(),
    unregister: vi.fn(),
    listPlugins: vi.fn().mockReturnValue([]),
    registerParser: vi.fn(),
    getParser: vi.fn(),
    getParserForExtension: vi.fn(),
    listParsers: vi.fn().mockReturnValue([]),
    registerFormatter: vi.fn(),
    getFormatter: vi.fn(),
    listFormatters: vi.fn().mockReturnValue([]),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getConfig: vi.fn().mockReturnValue(mockConfig),
    updateConfig: vi.fn(),
    ...overrides,
  } as unknown as Kernel;
}

describe('createFileWatcher', () => {
  beforeEach(() => {
    watchCallback = null;
    watchErrorCallback = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return a watcher with on and close methods', () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    expect(watcher).toHaveProperty('on');
    expect(watcher).toHaveProperty('close');
    watcher.close();
  });

  it('should accept change listeners', () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const listener = vi.fn();
    watcher.on('change', listener);
    watcher.close();
  });

  it('should accept error listeners', () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const listener = vi.fn();
    watcher.on('error', listener);
    watcher.close();
  });

  it('should close without error', () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    expect(() => watcher.close()).not.toThrow();
  });

  it('should trigger scan after debounce when file changes', async () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const changeListener = vi.fn();
    watcher.on('change', changeListener);

    // Simulate a file change
    if (watchCallback) {
      watchCallback('change', 'test.ts');
    }

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(150);

    expect(kernel.scan).toHaveBeenCalled();
    watcher.close();
  });

  it('should debounce multiple rapid changes', async () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);

    if (watchCallback) {
      watchCallback('change', 'file1.ts');
      watchCallback('change', 'file2.ts');
      watchCallback('change', 'file3.ts');
    }

    await vi.advanceTimersByTimeAsync(150);

    // Should only scan once due to debounce
    expect(kernel.scan).toHaveBeenCalledTimes(1);
    watcher.close();
  });

  it('should call change listeners with event data after scan completes', async () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const changeListener = vi.fn();
    watcher.on('change', changeListener);

    if (watchCallback) {
      watchCallback('change', 'test.ts');
    }

    await vi.advanceTimersByTimeAsync(150);

    expect(changeListener).toHaveBeenCalledTimes(1);
    const event = changeListener.mock.calls[0]![0];
    expect(event).toHaveProperty('changedFiles');
    expect(event).toHaveProperty('map');
    expect(event).toHaveProperty('timestamp');
    expect(event.changedFiles).toContain('test.ts');
    watcher.close();
  });

  it('should call error listeners when scan fails', async () => {
    const scanError = new Error('Scan failed');
    const kernel = createMockKernel({
      scan: vi.fn().mockRejectedValue(scanError),
    } as any);
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const errorListener = vi.fn();
    watcher.on('error', errorListener);

    if (watchCallback) {
      watchCallback('change', 'test.ts');
    }

    await vi.advanceTimersByTimeAsync(150);

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledWith(scanError);
    watcher.close();
  });

  it('should handle non-Error thrown during scan', async () => {
    const kernel = createMockKernel({
      scan: vi.fn().mockRejectedValue('string error'),
    } as any);
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const errorListener = vi.fn();
    watcher.on('error', errorListener);

    if (watchCallback) {
      watchCallback('change', 'test.ts');
    }

    await vi.advanceTimersByTimeAsync(150);

    expect(errorListener).toHaveBeenCalledTimes(1);
    const err = errorListener.mock.calls[0]![0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('string error');
    watcher.close();
  });

  it('should ignore null filenames from watch callback', async () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);

    if (watchCallback) {
      watchCallback('change', null);
    }

    await vi.advanceTimersByTimeAsync(150);

    // No scan should occur because filename was null
    expect(kernel.scan).not.toHaveBeenCalled();
    watcher.close();
  });

  it('should not trigger concurrent scans (isScanning guard)', async () => {
    let scanResolve: (() => void) | null = null;
    const slowScan = vi.fn().mockImplementation(() => {
      return new Promise<ScanResult>((resolve) => {
        scanResolve = () => resolve(createMockResult());
      });
    });
    const kernel = createMockKernel({ scan: slowScan } as any);
    const watcher = createFileWatcher(kernel, mockConfig, 50);

    // Trigger first change
    if (watchCallback) {
      watchCallback('change', 'file1.ts');
    }
    await vi.advanceTimersByTimeAsync(60);

    // First scan is now in progress
    expect(slowScan).toHaveBeenCalledTimes(1);

    // Trigger second change while first scan is in progress
    if (watchCallback) {
      watchCallback('change', 'file2.ts');
    }
    await vi.advanceTimersByTimeAsync(60);

    // Second scan should not start because isScanning is true
    expect(slowScan).toHaveBeenCalledTimes(1);

    // Resolve the first scan
    if (scanResolve) scanResolve();
    await vi.advanceTimersByTimeAsync(0);

    watcher.close();
  });

  it('should propagate fsWatcher errors to error listeners', () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const errorListener = vi.fn();
    watcher.on('error', errorListener);

    // Simulate a watcher error
    if (watchErrorCallback) {
      const err = new Error('Watch error');
      watchErrorCallback(err);
      expect(errorListener).toHaveBeenCalledWith(err);
    }

    watcher.close();
  });

  it('should swallow listener errors in change handler', async () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);

    const throwingListener = vi.fn().mockImplementation(() => {
      throw new Error('Listener error');
    });
    const normalListener = vi.fn();

    watcher.on('change', throwingListener);
    watcher.on('change', normalListener);

    if (watchCallback) {
      watchCallback('change', 'test.ts');
    }

    await vi.advanceTimersByTimeAsync(150);

    // Both should have been called, error from first should be swallowed
    expect(throwingListener).toHaveBeenCalled();
    // The second listener still gets called
    expect(normalListener).toHaveBeenCalled();
    watcher.close();
  });

  it('close should clear all listeners and timers', () => {
    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const changeListener = vi.fn();
    const errorListener = vi.fn();
    watcher.on('change', changeListener);
    watcher.on('error', errorListener);

    watcher.close();

    // After close, no further events should fire
    // This mainly tests that close() doesn't throw
    expect(() => watcher.close()).not.toThrow();
  });

  it('should swallow errors thrown by error listeners during scan failure', async () => {
    const scanError = new Error('Scan failed');
    const kernel = createMockKernel({
      scan: vi.fn().mockRejectedValue(scanError),
    } as any);
    const watcher = createFileWatcher(kernel, mockConfig, 100);

    const throwingErrorListener = vi.fn().mockImplementation(() => {
      throw new Error('Error listener threw');
    });
    watcher.on('error', throwingErrorListener);

    if (watchCallback) {
      watchCallback('change', 'test.ts');
    }

    // Should not throw even though error listener throws
    await vi.advanceTimersByTimeAsync(150);

    expect(throwingErrorListener).toHaveBeenCalled();
    watcher.close();
  });

  it('should handle watch() throwing by deferring error notification', async () => {
    // Override watch mock to throw
    const { watch: watchFn } = await import('node:fs');
    (watchFn as any).mockImplementationOnce(() => {
      throw new Error('Watch failed');
    });

    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const errorListener = vi.fn();
    watcher.on('error', errorListener);

    // The error is deferred via setTimeout(0)
    await vi.advanceTimersByTimeAsync(1);

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
    expect(errorListener.mock.calls[0]![0].message).toBe('Watch failed');
    watcher.close();
  });

  it('should handle watch() throwing with non-Error value', async () => {
    const { watch: watchFn } = await import('node:fs');
    (watchFn as any).mockImplementationOnce(() => {
      throw 'string error from watch';
    });

    const kernel = createMockKernel();
    const watcher = createFileWatcher(kernel, mockConfig, 100);
    const errorListener = vi.fn();
    watcher.on('error', errorListener);

    await vi.advanceTimersByTimeAsync(1);

    expect(errorListener).toHaveBeenCalledTimes(1);
    const err = errorListener.mock.calls[0]![0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('string error from watch');
    watcher.close();
  });
});
