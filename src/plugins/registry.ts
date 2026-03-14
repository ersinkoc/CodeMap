/**
 * Plugin registry — auto-detection and management of plugins.
 * @module
 */

import type { CodemapPlugin, LanguageId } from '../types.js';
import { createTypescriptParserPlugin } from './core/typescript-parser.js';
import { createCompactFormatterPlugin } from './core/compact-formatter.js';
import { createGoParserPlugin } from './optional/go-parser.js';
import { createPythonParserPlugin } from './optional/python-parser.js';
import { createRustParserPlugin } from './optional/rust-parser.js';
import { createPhpParserPlugin } from './optional/php-parser.js';
import { createJavaParserPlugin } from './optional/java-parser.js';
import { createCsharpParserPlugin } from './optional/csharp-parser.js';
import { createJsonFormatterPlugin } from './optional/json-formatter.js';
import { createMarkdownFormatterPlugin } from './optional/markdown-formatter.js';
import { createLlmsTxtFormatterPlugin } from './optional/llms-txt-formatter.js';
import { createComplexityPlugin } from './optional/complexity.js';
import { createIgnorePlugin } from './optional/ignore.js';
import { createIncrementalPlugin } from './optional/incremental.js';
import { createGitHooksPlugin } from './optional/git-hooks.js';
import { createClaudeMdPlugin } from './optional/claude-md.js';
import { createMonorepoPlugin } from './optional/monorepo.js';

/** Extension to language mapping for auto-detection */
const EXTENSION_LANGUAGE_MAP: Record<string, LanguageId> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mjs': 'typescript',
  '.mts': 'typescript',
  '.go': 'go',
  '.py': 'python',
  '.rs': 'rust',
  '.php': 'php',
  '.java': 'java',
  '.cs': 'csharp',
};

/** Language to parser plugin factory mapping */
const LANGUAGE_PLUGIN_MAP: Record<LanguageId, () => CodemapPlugin> = {
  typescript: createTypescriptParserPlugin,
  go: createGoParserPlugin,
  python: createPythonParserPlugin,
  rust: createRustParserPlugin,
  php: createPhpParserPlugin,
  java: createJavaParserPlugin,
  csharp: createCsharpParserPlugin,
};

/**
 * Get core plugins that are always loaded.
 */
export function getCorePlugins(): CodemapPlugin[] {
  return [createTypescriptParserPlugin(), createCompactFormatterPlugin()];
}

/**
 * Get parser plugin for a specific language.
 */
export function getParserPlugin(language: LanguageId): CodemapPlugin {
  const factory = LANGUAGE_PLUGIN_MAP[language];
  return factory();
}

/**
 * Auto-detect which language parser plugins are needed based on file extensions
 * found in the scanned files.
 *
 * @param extensions - Set of file extensions found (with dots)
 * @returns Array of plugins to register
 */
export function autoDetectPlugins(extensions: Set<string>): CodemapPlugin[] {
  const neededLanguages = new Set<LanguageId>();

  for (const ext of extensions) {
    const lang = EXTENSION_LANGUAGE_MAP[ext];
    if (lang) {
      neededLanguages.add(lang);
    }
  }

  const plugins: CodemapPlugin[] = [];
  for (const lang of neededLanguages) {
    // TypeScript is already a core plugin
    if (lang === 'typescript') continue;
    plugins.push(getParserPlugin(lang));
  }

  return plugins;
}

/**
 * Get formatter plugins based on requested formats.
 */
export function getFormatterPlugins(
  formats: readonly string[],
): CodemapPlugin[] {
  const plugins: CodemapPlugin[] = [];

  for (const format of formats) {
    switch (format) {
      case 'compact':
        // Already a core plugin
        break;
      case 'json':
        plugins.push(createJsonFormatterPlugin());
        break;
      case 'markdown':
        plugins.push(createMarkdownFormatterPlugin());
        break;
      case 'llms-txt':
        plugins.push(createLlmsTxtFormatterPlugin());
        break;
    }
  }

  return plugins;
}

/**
 * Get feature plugins based on configuration.
 */
export function getFeaturePlugins(config: {
  complexity?: boolean | undefined;
  incremental?: boolean | undefined;
  monorepo?: boolean | undefined;
}): CodemapPlugin[] {
  const plugins: CodemapPlugin[] = [createIgnorePlugin()];

  if (config.complexity) {
    plugins.push(createComplexityPlugin());
  }
  if (config.incremental) {
    plugins.push(createIncrementalPlugin());
  }
  if (config.monorepo) {
    plugins.push(createMonorepoPlugin());
  }

  return plugins;
}

export {
  createGitHooksPlugin,
  createClaudeMdPlugin,
};
