/**
 * File system watcher using Node.js native fs.watch.
 *
 * Watches for file changes and triggers automatic map regeneration
 * with configurable debounce.
 * @module
 */

import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type {
  CodemapConfig,
  CodemapWatcher,
  ScanResult,
  WatchEvent,
} from './types.js';
import type { Kernel } from './kernel.js';

type WatchChangeListener = (event: WatchEvent) => void;
type WatchErrorListener = (error: Error) => void;

/**
 * Create a file system watcher that auto-regenerates the codemap on changes.
 *
 * @param kernel - Configured kernel instance
 * @param config - Codemap configuration
 * @param debounceMs - Debounce interval in milliseconds
 * @returns Watcher instance with event handling
 *
 * @example
 * ```typescript
 * const watcher = createFileWatcher(kernel, config, 300);
 * watcher.on('change', (event) => {
 *   console.log(`Map updated: ${event.changedFiles.length} files changed`);
 * });
 * watcher.on('error', console.error);
 * watcher.close();
 * ```
 */
export function createFileWatcher(
  kernel: Kernel,
  config: CodemapConfig,
  debounceMs: number = 300,
): CodemapWatcher {
  const changeListeners: Set<WatchChangeListener> = new Set();
  const errorListeners: Set<WatchErrorListener> = new Set();
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const changedFiles: Set<string> = new Set();
  let isScanning = false;

  async function handleChange(): Promise<void> {
    if (isScanning) return;
    isScanning = true;

    try {
      const files = [...changedFiles];
      changedFiles.clear();

      const result = await kernel.scan();

      const event: WatchEvent = {
        changedFiles: files,
        map: result,
        timestamp: new Date().toISOString(),
      };

      for (const listener of changeListeners) {
        try {
          listener(event);
        } catch {
          // Swallow listener errors
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const listener of errorListeners) {
        try {
          listener(error);
        } catch {
          // Swallow
        }
      }
    } finally {
      isScanning = false;
    }
  }

  function scheduleRegen(filename: string): void {
    changedFiles.add(filename);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      void handleChange();
    }, debounceMs);
  }

  // Start watching
  try {
    const fsWatcher = watch(
      config.root,
      { recursive: true },
      (_eventType, filename) => {
        if (filename) {
          scheduleRegen(filename);
        }
      },
    );

    fsWatcher.on('error', (err) => {
      for (const listener of errorListeners) {
        listener(err);
      }
    });

    watchers.push(fsWatcher);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    // Defer error notification
    setTimeout(() => {
      for (const listener of errorListeners) {
        listener(error);
      }
    }, 0);
  }

  const watcher: CodemapWatcher = {
    on(event: 'change' | 'error', listener: unknown): void {
      if (event === 'change') {
        changeListeners.add(listener as WatchChangeListener);
      } else if (event === 'error') {
        errorListeners.add(listener as WatchErrorListener);
      }
    },
    close(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      for (const w of watchers) {
        w.close();
      }
      watchers.length = 0;
      changeListeners.clear();
      errorListeners.clear();
    },
  };

  return watcher;
}
