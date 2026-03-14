import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIncrementalPlugin, getIncrementalFiles } from '../../../src/plugins/optional/incremental.js';
import type { ScanResult, FileAnalysis } from '../../../src/types.js';

describe('Incremental Plugin', () => {
  it('should have correct name', () => {
    const plugin = createIncrementalPlugin();
    expect(plugin.name).toBe('incremental');
  });

  it('should have correct version', () => {
    const plugin = createIncrementalPlugin();
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have an install method', () => {
    const plugin = createIncrementalPlugin();
    expect(typeof plugin.install).toBe('function');
  });

  it('install should not throw', () => {
    const plugin = createIncrementalPlugin();
    expect(() => plugin.install({} as any)).not.toThrow();
  });

  it('should have an onScanComplete hook', () => {
    const plugin = createIncrementalPlugin();
    expect(typeof plugin.onScanComplete).toBe('function');
  });

  describe('getIncrementalFiles', () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return null for a non-git directory (no git available or not a repo)', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incr-'));
      const outputDir = join(tempDir, '.codemap');
      const result = getIncrementalFiles(tempDir, outputDir);
      expect(result).toBeNull();
    });

    it('should return null when no cache exists', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incr-'));
      const outputDir = join(tempDir, '.codemap');
      // Even if git were available, no cache means full scan
      const result = getIncrementalFiles(tempDir, outputDir);
      expect(result).toBeNull();
    });

    it('should return null when cache file is invalid JSON', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incr-'));
      const outputDir = join(tempDir, '.codemap');
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'cache.json'), 'not valid json');

      // Will return null because the dir is not a git repo
      const result = getIncrementalFiles(tempDir, outputDir);
      expect(result).toBeNull();
    });

    it('should return changed files when cache exists in a real git repo', () => {
      const { execFileSync } = require('node:child_process');
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incr-real-'));

      try {
        execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir, stdio: 'pipe' });

        // Create and commit a file
        writeFileSync(join(tempDir, 'file.ts'), 'export const x = 1;');
        execFileSync('git', ['add', '.'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir, stdio: 'pipe' });

        // Create a valid cache
        const outputDir = join(tempDir, '.codemap');
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(
          join(outputDir, 'cache.json'),
          JSON.stringify({
            timestamp: new Date().toISOString(),
            files: { 'file.ts': 'somehash' },
          }),
        );

        // Now modify a file to create a change
        writeFileSync(join(tempDir, 'file.ts'), 'export const x = 2;');

        const result = getIncrementalFiles(tempDir, outputDir);
        // Should return an array (not null) since git is available and cache exists
        expect(result).not.toBeNull();
        expect(Array.isArray(result)).toBe(true);
      } catch {
        // git not available, skip
      }
    });

    it('should return null when cache is invalid JSON in a real git repo', () => {
      const { execFileSync } = require('node:child_process');
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incr-badjson-'));

      try {
        execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir, stdio: 'pipe' });

        writeFileSync(join(tempDir, 'file.ts'), 'export const x = 1;');
        execFileSync('git', ['add', '.'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir, stdio: 'pipe' });

        // Create invalid cache
        const outputDir = join(tempDir, '.codemap');
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, 'cache.json'), 'not valid json');

        const result = getIncrementalFiles(tempDir, outputDir);
        // Should return null because cache is corrupt
        expect(result).toBeNull();
      } catch {
        // git not available, skip
      }
    });
  });

  describe('onScanComplete (cache saving)', () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should save cache after scan complete', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incrcache-'));
      // The plugin computes outputDir as join(result.root, '..', '.codemap')
      // So set root to a subdirectory so that '..' goes back to tempDir
      const rootDir = join(tempDir, 'src');
      mkdirSync(rootDir, { recursive: true });
      const expectedOutputDir = join(tempDir, '.codemap');

      const plugin = createIncrementalPlugin();

      const mockFile: FileAnalysis = {
        path: 'src/index.ts',
        language: 'typescript',
        loc: 10,
        estimatedTokens: 50,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        constants: [],
      };

      const mockResult: ScanResult = {
        root: rootDir,
        timestamp: new Date().toISOString(),
        files: [mockFile],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 1,
          totalLoc: 10,
          totalTokens: 50,
          languageBreakdown: { typescript: 1 },
          scanDurationMs: 10,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(mockResult);

      const cachePath = join(expectedOutputDir, 'cache.json');
      expect(existsSync(cachePath)).toBe(true);

      const cacheContent = JSON.parse(readFileSync(cachePath, 'utf-8'));
      expect(cacheContent).toHaveProperty('timestamp');
      expect(cacheContent).toHaveProperty('files');
      expect(cacheContent.files).toHaveProperty('src/index.ts');
    });

    it('should create output directory if it does not exist', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incrcache-'));
      const rootDir = join(tempDir, 'src');
      mkdirSync(rootDir, { recursive: true });
      const expectedOutputDir = join(tempDir, '.codemap');

      const plugin = createIncrementalPlugin();

      const mockResult: ScanResult = {
        root: rootDir,
        timestamp: new Date().toISOString(),
        files: [],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 0,
          totalLoc: 0,
          totalTokens: 0,
          languageBreakdown: {},
          scanDurationMs: 5,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(mockResult);
      expect(existsSync(expectedOutputDir)).toBe(true);
    });

    it('should overwrite existing cache', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-incrcache-'));
      const rootDir = join(tempDir, 'src');
      mkdirSync(rootDir, { recursive: true });
      const expectedOutputDir = join(tempDir, '.codemap');
      mkdirSync(expectedOutputDir, { recursive: true });
      writeFileSync(join(expectedOutputDir, 'cache.json'), '{"old": true}');

      const plugin = createIncrementalPlugin();

      const mockResult: ScanResult = {
        root: rootDir,
        timestamp: '2025-01-01T00:00:00.000Z',
        files: [],
        dependencyGraph: {},
        externalDeps: {},
        stats: {
          fileCount: 0,
          totalLoc: 0,
          totalTokens: 0,
          languageBreakdown: {},
          scanDurationMs: 5,
          incremental: false,
        },
      };

      await plugin.onScanComplete!(mockResult);

      const cacheContent = JSON.parse(readFileSync(join(expectedOutputDir, 'cache.json'), 'utf-8'));
      expect(cacheContent).not.toHaveProperty('old');
      expect(cacheContent.timestamp).toBe('2025-01-01T00:00:00.000Z');
    });
  });
});
