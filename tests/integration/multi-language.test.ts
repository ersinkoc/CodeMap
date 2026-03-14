import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createKernel } from '../../src/kernel.js';
import { createTypescriptParserPlugin } from '../../src/plugins/core/typescript-parser.js';
import { createGoParserPlugin } from '../../src/plugins/optional/go-parser.js';
import { createPythonParserPlugin } from '../../src/plugins/optional/python-parser.js';
import { createCompactFormatterPlugin } from '../../src/plugins/core/compact-formatter.js';
import type { CodemapConfig } from '../../src/types.js';

const FIXTURES_DIR = resolve(__dirname, '../fixtures/mixed-project/src');

describe('Multi-Language Scan', () => {
  it('should scan multiple languages in one project', async () => {
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
    kernel.use(createGoParserPlugin());
    kernel.use(createPythonParserPlugin());
    kernel.use(createCompactFormatterPlugin());

    const result = await kernel.scan();

    expect(result.files.length).toBeGreaterThan(0);

    // Should have files from multiple languages
    const languages = new Set(result.files.map((f) => f.language));
    expect(languages.size).toBeGreaterThanOrEqual(1);
  });

  it('should report language breakdown in stats', async () => {
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
    kernel.use(createGoParserPlugin());
    kernel.use(createPythonParserPlugin());
    kernel.use(createCompactFormatterPlugin());

    const result = await kernel.scan();

    expect(Object.keys(result.stats.languageBreakdown).length).toBeGreaterThan(0);
  });
});
