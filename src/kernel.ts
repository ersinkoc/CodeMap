/**
 * Micro kernel core — plugin management, event bus, error boundaries.
 *
 * The kernel is the central coordinator for all codemap operations.
 * It manages plugin lifecycle, provides an event bus for inter-plugin
 * communication, and wraps operations in error boundaries.
 * @module
 */

import type {
  CodemapConfig,
  CodemapContext,
  CodemapKernel,
  CodemapPlugin,
  EventListener,
  FileAnalysis,
  KernelEvent,
  LanguageParser,
  OutputFormatter,
  ScanResult,
  ScanStats,
} from './types.js';
import { PluginError, ScanError } from './errors.js';
import { scanDirectory, readIgnoreFile } from './scanner.js';
import { estimateTokens, countLoc } from './token-estimator.js';
import {
  getCorePlugins,
  autoDetectPlugins,
  getFormatterPlugins,
  getFeaturePlugins,
} from './plugins/registry.js';

/**
 * Create a new micro kernel instance.
 *
 * @param config - Resolved configuration
 * @returns Kernel instance with plugin management and scan capabilities
 */
export function createKernel(config: CodemapConfig): Kernel {
  return new Kernel(config);
}

/**
 * Create and fully configure a kernel with all needed plugins.
 *
 * This is the single entry point for kernel setup — replaces the duplicated
 * setup logic that was previously in index.ts, builder.ts, and cli.ts.
 * Also pre-scans files to detect languages, avoiding double directory traversal.
 *
 * @param config - Resolved configuration
 * @param extraPlugins - Additional custom plugins to register
 * @returns Fully configured Kernel ready to scan
 */
export function setupKernel(
  config: CodemapConfig,
  extraPlugins: readonly CodemapPlugin[] = [],
): Kernel {
  const kernel = new Kernel(config);

  // 1. Core plugins (TypeScript parser + compact formatter)
  for (const plugin of getCorePlugins()) {
    kernel.use(plugin);
  }

  // 2. Pre-scan to detect file extensions (single pass — kernel.scan() reuses this)
  const scannedFiles = scanDirectory(config.root, {
    ignorePatterns: config.ignore ? [...config.ignore] : [],
    languages: config.languages as string[] | undefined,
  });
  const extensions = new Set<string>();
  for (const file of scannedFiles) {
    const ext = '.' + file.relativePath.split('.').pop();
    extensions.add(ext);
  }

  // 3. Auto-detect language plugins
  for (const plugin of autoDetectPlugins(extensions)) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  // 4. Formatter plugins
  const formats = Array.isArray(config.format) ? config.format : [config.format];
  for (const plugin of getFormatterPlugins(formats)) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  // 5. Feature plugins (ignore, complexity, incremental, monorepo)
  for (const plugin of getFeaturePlugins(config)) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  // 6. Custom plugins
  for (const plugin of extraPlugins) {
    if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
      kernel.use(plugin);
    }
  }

  return kernel;
}

/**
 * Internal kernel implementation.
 */
export class Kernel implements CodemapKernel<CodemapContext> {
  private readonly parsers = new Map<string, LanguageParser>();
  private readonly formatters = new Map<string, OutputFormatter>();
  private readonly plugins = new Map<string, CodemapPlugin>();
  private readonly extensionMap = new Map<string, LanguageParser>();
  private readonly listeners = new Map<KernelEvent, Set<EventListener>>();
  private _config: CodemapConfig;

  constructor(config: CodemapConfig) {
    this._config = config;
  }

  // ─── Plugin Management ──────────────────────────────────────────

  /**
   * Register a plugin with the kernel.
   */
  use(plugin: CodemapPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new PluginError(
        `Plugin "${plugin.name}" is already registered`,
        plugin.name,
      );
    }

    // Check dependencies
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new PluginError(
            `Plugin "${plugin.name}" requires "${dep}" which is not registered`,
            plugin.name,
            { missingDependency: dep },
          );
        }
      }
    }

    this.plugins.set(plugin.name, plugin);

    try {
      plugin.install(this);
      this.emit('plugin:registered', plugin.name);
    } catch (err) {
      this.plugins.delete(plugin.name);
      if (plugin.onError && err instanceof Error) {
        plugin.onError(err);
      }
      throw new PluginError(
        `Failed to install plugin "${plugin.name}": ${err instanceof Error ? err.message : String(err)}`,
        plugin.name,
      );
    }
  }

  /**
   * Unregister a plugin.
   */
  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    if (plugin.onDestroy) {
      await plugin.onDestroy();
    }

    this.plugins.delete(name);
    this.emit('plugin:unregistered', name);
  }

  /**
   * List all registered plugins.
   */
  listPlugins(): readonly CodemapPlugin[] {
    return [...this.plugins.values()];
  }

  // ─── Parser Management ──────────────────────────────────────────

  registerParser(parser: LanguageParser): void {
    this.parsers.set(parser.name, parser);
    for (const ext of parser.extensions) {
      this.extensionMap.set(ext, parser);
    }
  }

  getParser(name: string): LanguageParser | undefined {
    return this.parsers.get(name);
  }

  getParserForExtension(ext: string): LanguageParser | undefined {
    return this.extensionMap.get(ext);
  }

  listParsers(): readonly LanguageParser[] {
    return [...this.parsers.values()];
  }

  // ─── Formatter Management ───────────────────────────────────────

  registerFormatter(formatter: OutputFormatter): void {
    this.formatters.set(formatter.name, formatter);
  }

  getFormatter(name: string): OutputFormatter | undefined {
    return this.formatters.get(name);
  }

  listFormatters(): readonly OutputFormatter[] {
    return [...this.formatters.values()];
  }

  // ─── Event Bus ──────────────────────────────────────────────────

  emit(event: KernelEvent, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(...args);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }

  on(event: KernelEvent, listener: EventListener): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off(event: KernelEvent, listener: EventListener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  // ─── Configuration ─────────────────────────────────────────────

  getConfig(): CodemapConfig {
    return this._config;
  }

  updateConfig(config: CodemapConfig): void {
    this._config = config;
  }

  // ─── Scan ──────────────────────────────────────────────────────

  /**
   * Execute a full scan of the configured root directory.
   */
  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    this.emit('scan:start');

    const config = this._config;
    const ignorePatterns = readIgnoreFile(config.root);
    const extraIgnore = config.ignore ? [...config.ignore] : [];

    // Scan files
    const scannedFiles = scanDirectory(config.root, {
      ignorePatterns: [...ignorePatterns, ...extraIgnore],
      languages: config.languages as string[] | undefined,
    });

    if (scannedFiles.length === 0) {
      throw new ScanError('No scannable files found in root directory', {
        root: config.root,
      });
    }

    // Build context
    const context: CodemapContext = {
      config,
      files: [],
      dependencyGraph: {},
      externalDeps: {},
    };

    // Initialize plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.onInit) {
        await plugin.onInit(context);
      }
    }

    // Parse each file
    const languageBreakdown: Record<string, number> = {};
    let totalLoc = 0;
    let totalTokens = 0;

    for (const file of scannedFiles) {
      const parser = this.parsers.get(file.language);
      if (!parser) continue;

      this.emit('scan:file', file.relativePath);

      let analysis: FileAnalysis;
      try {
        analysis = parser.parse(file.content, file.relativePath);
      } catch (err) {
        // Error boundary: skip file on parse error
        this.emit('scan:error', file.relativePath, err);
        analysis = {
          path: file.relativePath,
          language: file.language as FileAnalysis['language'],
          loc: countLoc(file.content),
          estimatedTokens: estimateTokens(file.content, file.language),
          imports: [],
          exports: [],
          functions: [],
          classes: [],
          interfaces: [],
          types: [],
          enums: [],
          constants: [],
        };
      }

      (context.files as FileAnalysis[]).push(analysis);

      // Update stats
      const langCount = languageBreakdown[file.language];
      languageBreakdown[file.language] = (langCount ?? 0) + 1;
      totalLoc += analysis.loc;
      totalTokens += analysis.estimatedTokens;

      // Build dependency graph from imports
      for (const imp of analysis.imports) {
        if (imp.kind === 'internal') {
          const deps = context.dependencyGraph[analysis.path];
          if (!deps) {
            context.dependencyGraph[analysis.path] = [imp.from];
          } else {
            deps.push(imp.from);
          }
        } else {
          const extDeps = context.externalDeps[imp.from];
          if (!extDeps) {
            context.externalDeps[imp.from] = [...imp.names];
          } else {
            for (const name of imp.names) {
              if (!extDeps.includes(name)) {
                extDeps.push(name);
              }
            }
          }
        }
      }
    }

    const stats: ScanStats = {
      fileCount: context.files.length,
      totalLoc,
      totalTokens,
      languageBreakdown,
      scanDurationMs: Date.now() - startTime,
      incremental: false,
    };

    // Format output
    const formats = Array.isArray(config.format)
      ? config.format
      : [config.format];
    const primaryFormat = formats[0] ?? 'compact';
    const formatter = this.formatters.get(primaryFormat);

    const result: ScanResult = {
      root: config.root,
      timestamp: new Date().toISOString(),
      files: context.files,
      dependencyGraph: context.dependencyGraph,
      externalDeps: context.externalDeps,
      stats,
      output: formatter ? formatter.format({ root: config.root, timestamp: new Date().toISOString(), files: context.files, dependencyGraph: context.dependencyGraph, externalDeps: context.externalDeps, stats }) : undefined,
    };

    // Notify plugins of scan completion
    for (const plugin of this.plugins.values()) {
      if (plugin.onScanComplete) {
        await plugin.onScanComplete(result);
      }
    }

    this.emit('scan:complete', result);
    return result;
  }
}
