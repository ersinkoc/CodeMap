/**
 * Builder API for chainable codemap configuration.
 *
 * Provides a fluent interface for complex scan configurations.
 * @module
 */

import { resolve } from 'node:path';
import type {
  CodemapConfig,
  CodemapPlugin,
  FormatType,
  LanguageId,
  ScanResult,
  CodemapWatcher,
} from './types.js';
import { setupKernel } from './kernel.js';
import { createFileWatcher } from './watcher.js';

/**
 * Codemap builder class for chainable configuration.
 *
 * @example
 * ```typescript
 * const map = await codemap()
 *   .root('./src')
 *   .format('compact')
 *   .ignore('**‍/*.test.ts')
 *   .scan();
 * ```
 */
export class CodemapBuilder {
  private _root: string = './src';
  private _format: FormatType[] = ['compact'];
  private _ignore: string[] = [];
  private _languages?: LanguageId[];
  private _incremental = false;
  private _complexity = false;
  private _tokenCounts = true;
  private _monorepo = false;
  private _debounce = 300;
  private _plugins: CodemapPlugin[] = [];

  /**
   * Set the root directory to scan.
   */
  root(path: string): this {
    this._root = path;
    return this;
  }

  /**
   * Set the output format(s).
   */
  format(type: FormatType | FormatType[]): this {
    this._format = Array.isArray(type) ? type : [type];
    return this;
  }

  /**
   * Add ignore patterns.
   */
  ignore(...patterns: string[]): this {
    this._ignore.push(...patterns);
    return this;
  }

  /**
   * Restrict to specific languages.
   */
  languages(langs: LanguageId[]): this {
    this._languages = langs;
    return this;
  }

  /**
   * Enable incremental scanning.
   */
  incremental(): this {
    this._incremental = true;
    return this;
  }

  /**
   * Enable complexity scoring.
   */
  withComplexity(): this {
    this._complexity = true;
    return this;
  }

  /**
   * Enable token count estimation.
   */
  withTokenCounts(): this {
    this._tokenCounts = true;
    return this;
  }

  /**
   * Enable monorepo workspace detection.
   */
  monorepo(): this {
    this._monorepo = true;
    return this;
  }

  /**
   * Set debounce interval for watch mode.
   */
  debounce(ms: number): this {
    this._debounce = ms;
    return this;
  }

  /**
   * Register a custom plugin.
   */
  use(plugin: CodemapPlugin): this {
    this._plugins.push(plugin);
    return this;
  }

  /**
   * Execute the scan.
   */
  async scan(): Promise<ScanResult> {
    const config = this.buildConfig();
    const kernel = setupKernel(config, this._plugins);
    return kernel.scan();
  }

  /**
   * Start watching for file changes.
   */
  watch(): CodemapWatcher {
    const config = this.buildConfig();
    const kernel = setupKernel(config, this._plugins);
    return createFileWatcher(kernel, config, this._debounce);
  }

  /**
   * Build the resolved configuration.
   */
  private buildConfig(): CodemapConfig {
    return {
      root: resolve(this._root),
      output: resolve('.codemap'),
      format: this._format.length === 1 ? this._format[0]! : this._format,
      languages: this._languages,
      ignore: this._ignore.length > 0 ? this._ignore : undefined,
      incremental: this._incremental,
      complexity: this._complexity,
      tokenCounts: this._tokenCounts,
      monorepo: this._monorepo,
      watch: { debounce: this._debounce },
    };
  }
}
