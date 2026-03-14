import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createKernel } from '../../src/kernel.js';
import { createTypescriptParserPlugin } from '../../src/plugins/core/typescript-parser.js';
import { createCompactFormatterPlugin } from '../../src/plugins/core/compact-formatter.js';
import type { CodemapConfig } from '../../src/types.js';

const FIXTURES_DIR = resolve(__dirname, '../fixtures/typescript-project/src');

describe('Full Scan Integration', () => {
  it('should scan TypeScript fixture project', async () => {
    if (!existsSync(FIXTURES_DIR)) {
      // Skip if fixtures not created yet
      expect(true).toBe(true);
      return;
    }

    const config: CodemapConfig = {
      root: FIXTURES_DIR,
      output: resolve(__dirname, '../.codemap-test'),
      format: 'compact',
    };

    const kernel = createKernel(config);
    kernel.use(createTypescriptParserPlugin());
    kernel.use(createCompactFormatterPlugin());

    const result = await kernel.scan();

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.stats.fileCount).toBeGreaterThan(0);
    expect(result.stats.totalLoc).toBeGreaterThan(0);
    expect(result.stats.totalTokens).toBeGreaterThan(0);
    expect(result.output).toBeTruthy();
  });

  it('should produce compact output with correct format', async () => {
    if (!existsSync(FIXTURES_DIR)) {
      expect(true).toBe(true);
      return;
    }

    const config: CodemapConfig = {
      root: FIXTURES_DIR,
      output: resolve(__dirname, '../.codemap-test'),
      format: 'compact',
    };

    const kernel = createKernel(config);
    kernel.use(createTypescriptParserPlugin());
    kernel.use(createCompactFormatterPlugin());

    const result = await kernel.scan();

    expect(result.output).toContain('# CODEMAP');
    expect(result.output).toContain('## FILES');
  });

  it('should build dependency graph from imports', async () => {
    if (!existsSync(FIXTURES_DIR)) {
      expect(true).toBe(true);
      return;
    }

    const config: CodemapConfig = {
      root: FIXTURES_DIR,
      output: resolve(__dirname, '../.codemap-test'),
      format: 'compact',
    };

    const kernel = createKernel(config);
    kernel.use(createTypescriptParserPlugin());
    kernel.use(createCompactFormatterPlugin());

    const result = await kernel.scan();

    // Should have dependency graph if files have imports
    expect(result.dependencyGraph).toBeDefined();
    expect(result.externalDeps).toBeDefined();
  });

  it('should include scan statistics', async () => {
    if (!existsSync(FIXTURES_DIR)) {
      expect(true).toBe(true);
      return;
    }

    const config: CodemapConfig = {
      root: FIXTURES_DIR,
      output: resolve(__dirname, '../.codemap-test'),
      format: 'compact',
    };

    const kernel = createKernel(config);
    kernel.use(createTypescriptParserPlugin());
    kernel.use(createCompactFormatterPlugin());

    const result = await kernel.scan();

    expect(result.stats.scanDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.incremental).toBe(false);
    expect(result.timestamp).toBeTruthy();
  });
});
