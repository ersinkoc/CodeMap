/**
 * Plugin system exports for @oxog/codemap.
 *
 * @example
 * ```typescript
 * import { createGoParserPlugin, createJsonFormatterPlugin } from '@oxog/codemap/plugins';
 * ```
 *
 * @packageDocumentation
 */

// Core plugins
export { createTypescriptParserPlugin } from './core/typescript-parser.js';
export { createCompactFormatterPlugin } from './core/compact-formatter.js';

// Optional language parsers
export { createGoParserPlugin } from './optional/go-parser.js';
export { createPythonParserPlugin } from './optional/python-parser.js';
export { createRustParserPlugin } from './optional/rust-parser.js';
export { createPhpParserPlugin } from './optional/php-parser.js';
export { createJavaParserPlugin } from './optional/java-parser.js';
export { createCsharpParserPlugin } from './optional/csharp-parser.js';
export { createKotlinParserPlugin } from './optional/kotlin-parser.js';
export { createSwiftParserPlugin } from './optional/swift-parser.js';
export { createRubyParserPlugin } from './optional/ruby-parser.js';
export { createDartParserPlugin } from './optional/dart-parser.js';

// Optional formatters
export { createJsonFormatterPlugin } from './optional/json-formatter.js';
export { createMarkdownFormatterPlugin } from './optional/markdown-formatter.js';
export { createLlmsTxtFormatterPlugin } from './optional/llms-txt-formatter.js';

// Feature plugins
export { createComplexityPlugin, calculateComplexity } from './optional/complexity.js';
export { createIgnorePlugin } from './optional/ignore.js';
export { createIncrementalPlugin } from './optional/incremental.js';
export { createGitHooksPlugin, installHook, uninstallHook } from './optional/git-hooks.js';
export { createClaudeMdPlugin, injectIntoClaudeMd } from './optional/claude-md.js';
export { createMonorepoPlugin, detectWorkspaces } from './optional/monorepo.js';
export { createCodeAnalysisPlugin, analyzeCode } from './optional/code-analysis.js';

// Registry
export {
  getCorePlugins,
  autoDetectPlugins,
  getFormatterPlugins,
  getFeaturePlugins,
} from './registry.js';
