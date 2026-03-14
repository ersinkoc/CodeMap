/**
 * JSON output formatter plugin.
 *
 * Produces structured JSON output of scan results for programmatic consumption.
 * @module
 */

import type { CodemapPlugin, OutputFormatter, ScanResult } from '../../types.js';

/**
 * Format scan result as indented JSON.
 */
function formatJson(result: ScanResult): string {
  return JSON.stringify(
    {
      root: result.root,
      timestamp: result.timestamp,
      stats: result.stats,
      externalDeps: result.externalDeps,
      files: result.files.map((f) => ({
        path: f.path,
        language: f.language,
        loc: f.loc,
        estimatedTokens: f.estimatedTokens,
        complexity: f.complexity,
        imports: f.imports,
        exports: f.exports,
        functions: f.functions,
        classes: f.classes,
        interfaces: f.interfaces,
        types: f.types,
        enums: f.enums,
        constants: f.constants,
        components: f.components,
        hooks: f.hooks,
        structs: f.structs,
        traits: f.traits,
        packages: f.packages,
      })),
      dependencyGraph: result.dependencyGraph,
      ...(result.analysis && { analysis: result.analysis }),
    },
    null,
    2,
  );
}

const jsonFormatter: OutputFormatter = {
  name: 'json',
  extension: 'json',
  format: formatJson,
};

/**
 * Create the JSON formatter plugin.
 */
export function createJsonFormatterPlugin(): CodemapPlugin {
  return {
    name: 'json-formatter',
    version: '1.0.0',
    install(kernel) {
      kernel.registerFormatter(jsonFormatter);
    },
  };
}
