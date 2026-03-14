/**
 * @oxog/codemap — AST-based codebase structure extractor for token-efficient LLM navigation.
 *
 * @example Basic scan
 * ```typescript
 * import { scan } from '@oxog/codemap';
 * const result = await scan('./src');
 * console.log(result.stats.totalTokens);
 * ```
 *
 * @example Builder API
 * ```typescript
 * import { codemap } from '@oxog/codemap';
 * const result = await codemap()
 *   .root('./src')
 *   .format('compact')
 *   .scan();
 * ```
 *
 * @example Custom plugin
 * ```typescript
 * import { codemap, createPlugin } from '@oxog/codemap';
 * const myPlugin = createPlugin({ name: 'kotlin', version: '1.0.0', install(k) { ... } });
 * const result = await codemap().use(myPlugin).scan();
 * ```
 *
 * @packageDocumentation
 */

import { resolve } from 'node:path';
import type {
  CodemapConfig,
  CodemapPlugin,
  ScanOptions,
  ScanResult,
} from './types.js';
import { loadConfig, scanOptionsToConfig } from './config.js';
import { CodemapBuilder } from './builder.js';
import { createKernel } from './kernel.js';
import {
  getCorePlugins,
  autoDetectPlugins,
  getFormatterPlugins,
  getFeaturePlugins,
} from './plugins/registry.js';
import { scanDirectory } from './scanner.js';

/**
 * Scan a codebase and produce a structural map.
 *
 * Analyzes all source files in the given directory, extracting
 * function signatures, class hierarchies, type definitions,
 * and dependency relationships. Returns a token-efficient
 * structural representation.
 *
 * @param root - Root directory to scan (default: './src')
 * @param options - Scan configuration options
 * @returns Complete scan result with files, graph, and stats
 * @throws {CodemapError} When root directory is not found
 *
 * @example Basic scan
 * ```typescript
 * import { scan } from '@oxog/codemap';
 * const result = await scan('./src');
 * console.log(result.stats.totalTokens);
 * ```
 *
 * @example With options
 * ```typescript
 * const result = await scan('./lib', {
 *   format: 'json',
 *   incremental: true,
 *   complexity: true,
 * });
 * ```
 */
export async function scan(root?: string, options?: ScanOptions): Promise<ScanResult> {
  const resolvedRoot = resolve(root ?? './src');
  const cwd = process.cwd();
  const configOverrides = scanOptionsToConfig(resolvedRoot, options);
  const config = loadConfig(cwd, configOverrides);

  const kernel = createKernel(config);

  // Register core plugins
  for (const plugin of getCorePlugins()) {
    kernel.use(plugin);
  }

  // Auto-detect language plugins
  const extensions = new Set<string>();
  const scannedFiles = scanDirectory(config.root, {
    ignorePatterns: config.ignore ? [...config.ignore] : [],
    languages: config.languages as string[] | undefined,
  });
  for (const file of scannedFiles) {
    const ext = '.' + file.relativePath.split('.').pop();
    extensions.add(ext);
  }
  for (const plugin of autoDetectPlugins(extensions)) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  // Register formatter plugins
  const formats = Array.isArray(config.format) ? config.format : [config.format];
  for (const plugin of getFormatterPlugins(formats)) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  // Register feature plugins
  for (const plugin of getFeaturePlugins(config)) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  return kernel.scan();
}

/**
 * Create a builder for complex codemap configuration.
 *
 * @returns New CodemapBuilder instance for method chaining
 *
 * @example
 * ```typescript
 * import { codemap } from '@oxog/codemap';
 * const result = await codemap()
 *   .root('./src')
 *   .format('compact')
 *   .ignore('**‍/*.test.ts')
 *   .incremental()
 *   .withComplexity()
 *   .scan();
 * ```
 */
export function codemap(): CodemapBuilder {
  return new CodemapBuilder();
}

/**
 * Create a custom plugin.
 *
 * @param config - Plugin configuration
 * @returns Plugin instance ready for registration
 *
 * @example
 * ```typescript
 * import { createPlugin } from '@oxog/codemap';
 *
 * const kotlinPlugin = createPlugin({
 *   name: 'kotlin',
 *   version: '1.0.0',
 *   install(kernel) {
 *     kernel.registerParser({
 *       name: 'kotlin',
 *       extensions: ['.kt', '.kts'],
 *       parse: (content, filePath) => ({ ... }),
 *     });
 *   },
 * });
 * ```
 */
export function createPlugin<T = import('./types.js').CodemapContext>(
  config: CodemapPlugin<T>,
): CodemapPlugin<T> {
  return config;
}

/**
 * Type-safe configuration helper.
 *
 * @param config - Partial configuration to validate
 * @returns Validated configuration (pass-through)
 *
 * @example
 * ```typescript
 * // codemap.config.ts
 * import { defineConfig } from '@oxog/codemap';
 * export default defineConfig({
 *   root: './src',
 *   format: ['compact', 'json'],
 *   complexity: true,
 * });
 * ```
 */
export { defineConfig } from './config.js';

// Re-export types
export type {
  CodemapConfig,
  CodemapPlugin,
  CodemapContext,
  CodemapKernel,
  CodemapWatcher,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  TypeInfo,
  EnumInfo,
  ConstantInfo,
  ComponentInfo,
  HookInfo,
  StructInfo,
  TraitInfo,
  ImportInfo,
  ExportInfo,
  PackageInfo,
  ParamInfo,
  PropertyInfo,
  ScanResult,
  ScanStats,
  ScanOptions,
  WatchConfig,
  WatchEvent,
  FormatType,
  LanguageId,
  LanguageParser,
  OutputFormatter,
} from './types.js';

// Re-export error classes
export {
  CodemapError,
  ParserError,
  ConfigError,
  PluginError,
  ScanError,
} from './errors.js';
