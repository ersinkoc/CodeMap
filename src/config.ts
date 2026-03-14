/**
 * Configuration loader with cascade resolution.
 *
 * Priority: CLI flags > codemap.config.ts > package.json#codemap > .codemaprc > defaults
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CodemapConfig, FormatType, ScanOptions } from './types.js';
import { ConfigError } from './errors.js';

/** Default configuration values */
export const DEFAULT_CONFIG: CodemapConfig = {
  root: './src',
  output: '.codemap',
  format: 'compact',
  incremental: false,
  complexity: false,
  tokenCounts: true,
  monorepo: false,
};

const VALID_FORMATS = new Set<string>(['compact', 'json', 'markdown', 'llms-txt']);
const VALID_LANGUAGES = new Set<string>([
  'typescript',
  'go',
  'python',
  'rust',
  'php',
  'java',
  'csharp',
]);

/**
 * Type-safe configuration helper.
 *
 * @param config - Partial configuration to validate and type
 * @returns Validated configuration
 *
 * @example
 * ```typescript
 * // codemap.config.ts
 * import { defineConfig } from '@oxog/codemap';
 * export default defineConfig({
 *   root: './src',
 *   format: ['compact', 'json'],
 * });
 * ```
 */
export function defineConfig(config: Partial<CodemapConfig>): Partial<CodemapConfig> {
  validateConfig(config);
  return config;
}

/**
 * Load and merge configuration from all sources.
 *
 * @param cwd - Current working directory
 * @param overrides - CLI flag overrides
 * @returns Fully resolved configuration
 */
export function loadConfig(
  cwd: string,
  overrides?: Partial<CodemapConfig>,
): CodemapConfig {
  const rcConfig = loadRcConfig(cwd);
  const pkgConfig = loadPackageJsonConfig(cwd);
  const fileConfig = loadConfigFile(cwd);

  const merged: CodemapConfig = {
    ...DEFAULT_CONFIG,
    ...rcConfig,
    ...pkgConfig,
    ...fileConfig,
    ...overrides,
  };

  // Resolve root to absolute path
  const resolvedRoot = resolve(cwd, merged.root);

  validateConfig(merged);

  return {
    ...merged,
    root: resolvedRoot,
    output: resolve(cwd, merged.output),
  };
}

/**
 * Convert ScanOptions to a partial CodemapConfig.
 */
export function scanOptionsToConfig(
  root: string,
  options?: ScanOptions,
): Partial<CodemapConfig> {
  if (!options) return { root };

  return {
    root,
    ...(options.format !== undefined && { format: options.format }),
    ...(options.incremental !== undefined && { incremental: options.incremental }),
    ...(options.complexity !== undefined && { complexity: options.complexity }),
    ...(options.tokenCounts !== undefined && { tokenCounts: options.tokenCounts }),
    ...(options.monorepo !== undefined && { monorepo: options.monorepo }),
    ...(options.ignore !== undefined && { ignore: options.ignore }),
    ...(options.languages !== undefined && { languages: options.languages }),
  } satisfies Partial<CodemapConfig>;
}

/**
 * Validate configuration values.
 */
function validateConfig(config: Partial<CodemapConfig>): void {
  if (config.format !== undefined) {
    const formats = Array.isArray(config.format) ? config.format : [config.format];
    for (const f of formats) {
      if (!VALID_FORMATS.has(f)) {
        throw new ConfigError(`Invalid format type: ${f}`, { validFormats: [...VALID_FORMATS] });
      }
    }
  }

  if (config.languages !== undefined) {
    for (const lang of config.languages) {
      if (!VALID_LANGUAGES.has(lang)) {
        throw new ConfigError(`Invalid language: ${lang}`, {
          validLanguages: [...VALID_LANGUAGES],
        });
      }
    }
  }
}

/**
 * Load .codemaprc (JSON format).
 */
function loadRcConfig(cwd: string): Partial<CodemapConfig> {
  const rcPath = join(cwd, '.codemaprc');
  if (!existsSync(rcPath)) return {};

  try {
    const content = readFileSync(rcPath, 'utf-8');
    return JSON.parse(content) as Partial<CodemapConfig>;
  } catch {
    return {};
  }
}

/**
 * Load package.json#codemap field.
 */
function loadPackageJsonConfig(cwd: string): Partial<CodemapConfig> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return {};

  try {
    const content = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const codemapConfig = pkg['codemap'];
    if (codemapConfig && typeof codemapConfig === 'object') {
      return codemapConfig as Partial<CodemapConfig>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Load codemap.config.js (JSON-compatible default export).
 * Falls back to empty config if the file cannot be parsed.
 */
function loadConfigFile(cwd: string): Partial<CodemapConfig> {
  const jsPath = join(cwd, 'codemap.config.js');
  if (!existsSync(jsPath)) return {};

  try {
    const content = readFileSync(jsPath, 'utf-8');
    // Extract a JSON object from: export default { ... };
    const match = content.match(/export\s+default\s+({[\s\S]*?})\s*;?\s*$/m);
    if (match?.[1]) {
      return JSON.parse(match[1]) as Partial<CodemapConfig>;
    }
  } catch {
    // Not JSON-compatible, skip
  }

  return {};
}

/**
 * Parse format string from CLI (comma-separated).
 */
export function parseFormatString(formatStr: string): FormatType[] {
  return formatStr
    .split(',')
    .map((f) => f.trim())
    .filter((f): f is FormatType => VALID_FORMATS.has(f));
}
