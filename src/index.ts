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
import { setupKernel } from './kernel.js';

/**
 * Scan a codebase and produce a structural map.
 *
 * @param root - Root directory to scan (default: './src')
 * @param options - Scan configuration options
 * @returns Complete scan result with files, graph, and stats
 * @throws {CodemapError} When root directory is not found
 */
export async function scan(root?: string, options?: ScanOptions): Promise<ScanResult> {
  const resolvedRoot = resolve(root ?? './src');
  const cwd = process.cwd();
  const configOverrides = scanOptionsToConfig(resolvedRoot, options);
  const config = loadConfig(cwd, configOverrides);

  const kernel = setupKernel(config);
  return kernel.scan();
}

/**
 * Create a builder for complex codemap configuration.
 *
 * @returns New CodemapBuilder instance for method chaining
 */
export function codemap(): CodemapBuilder {
  return new CodemapBuilder();
}

/**
 * Create a custom plugin.
 *
 * @param config - Plugin configuration
 * @returns Plugin instance ready for registration
 */
export function createPlugin<T = import('./types.js').CodemapContext>(
  config: CodemapPlugin<T>,
): CodemapPlugin<T> {
  return config;
}

/**
 * Type-safe configuration helper.
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
  CodeAnalysis,
  UnusedExport,
} from './types.js';

// Re-export error classes
export {
  CodemapError,
  ParserError,
  ConfigError,
  PluginError,
  ScanError,
} from './errors.js';
