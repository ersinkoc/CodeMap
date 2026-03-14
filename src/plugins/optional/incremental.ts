/**
 * Incremental scanning plugin.
 *
 * Uses git diff to only re-parse changed files.
 * Maintains a cache in .codemap/cache.json with file hashes.
 * @module
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CodemapPlugin, ScanResult } from '../../types.js';
import { isGitAvailable, isGitRepo, getChangedFiles, hashContent } from '../../utils/git.js';

/** Cache file structure */
interface CacheData {
  readonly timestamp: string;
  readonly files: Record<string, string>; // path -> hash
}

/**
 * Load the incremental cache.
 */
function loadCache(outputDir: string): CacheData | null {
  const cachePath = join(outputDir, 'cache.json');
  if (!existsSync(cachePath)) return null;

  try {
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as CacheData;
  } catch {
    return null;
  }
}

/**
 * Save the incremental cache.
 * Reads actual file content from disk to compute hashes.
 */
function saveCache(outputDir: string, result: ScanResult): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const files: Record<string, string> = {};
  for (const file of result.files) {
    const absPath = join(result.root, file.path);
    try {
      const content = readFileSync(absPath, 'utf-8');
      files[file.path] = hashContent(content);
    } catch {
      // File may have been deleted between scan and cache save
      files[file.path] = '';
    }
  }

  const cache: CacheData = {
    timestamp: result.timestamp,
    files,
  };

  writeFileSync(
    join(outputDir, 'cache.json'),
    JSON.stringify(cache, null, 2),
  );
}

/**
 * Get list of changed files for incremental scanning.
 */
export function getIncrementalFiles(rootDir: string, outputDir: string): string[] | null {
  if (!isGitAvailable() || !isGitRepo(rootDir)) {
    return null; // Fall back to full scan
  }

  const cache = loadCache(outputDir);
  if (!cache) {
    return null; // No cache, full scan needed
  }

  return getChangedFiles(rootDir);
}

/**
 * Create the incremental scanning plugin.
 */
export function createIncrementalPlugin(): CodemapPlugin {
  return {
    name: 'incremental',
    version: '1.0.0',
    install() {
      // Incremental logic is applied during scanning
    },
    async onScanComplete(result: ScanResult) {
      // Save cache after each scan
      const outputDir = join(result.root, '..', '.codemap');
      saveCache(outputDir, result);
    },
  };
}
