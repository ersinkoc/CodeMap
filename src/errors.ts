/**
 * Custom error classes for @oxog/codemap.
 *
 * All errors extend CodemapError with a machine-readable `code` field.
 * @module
 */

/**
 * Base error class for all codemap errors.
 *
 * @example
 * ```typescript
 * try {
 *   await scan('./nonexistent');
 * } catch (err) {
 *   if (err instanceof CodemapError) {
 *     console.log(err.code); // 'ROOT_NOT_FOUND'
 *   }
 * }
 * ```
 */
export class CodemapError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CodemapError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error thrown when a language parser fails to process a file.
 *
 * @example
 * ```typescript
 * throw new ParserError('Unexpected token', 'src/index.ts', 'typescript');
 * ```
 */
export class ParserError extends CodemapError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly language: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'PARSER_ERROR', { ...context, filePath, language });
    this.name = 'ParserError';
  }
}

/**
 * Error thrown when configuration is invalid.
 *
 * @example
 * ```typescript
 * throw new ConfigError('Invalid format type: yaml');
 * ```
 */
export class ConfigError extends CodemapError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

/**
 * Error thrown when a plugin encounters an issue.
 *
 * @example
 * ```typescript
 * throw new PluginError('Failed to initialize', 'my-plugin');
 * ```
 */
export class PluginError extends CodemapError {
  constructor(
    message: string,
    public readonly pluginName: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'PLUGIN_ERROR', { ...context, pluginName });
    this.name = 'PluginError';
  }
}

/**
 * Error thrown when a scan operation fails.
 *
 * @example
 * ```typescript
 * throw new ScanError('No scannable files found');
 * ```
 */
export class ScanError extends CodemapError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SCAN_ERROR', context);
    this.name = 'ScanError';
  }
}
