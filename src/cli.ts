/**
 * CLI entry point for @oxog/codemap.
 *
 * Accessible via `npx @oxog/codemap` or `codemap` if installed globally.
 * @module
 */

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { loadConfig, parseFormatString, DEFAULT_CONFIG } from './config.js';
import { createKernel } from './kernel.js';
import {
  getCorePlugins,
  autoDetectPlugins,
  getFormatterPlugins,
  getFeaturePlugins,
  createGitHooksPlugin,
  createClaudeMdPlugin,
} from './plugins/registry.js';
import { scanDirectory } from './scanner.js';
import { installHook, uninstallHook } from './plugins/optional/git-hooks.js';
import { injectIntoClaudeMd } from './plugins/optional/claude-md.js';
import { createFileWatcher } from './watcher.js';
import type { CodemapConfig, FormatType, ScanResult } from './types.js';

/** CLI argument parsing result */
interface CliArgs {
  root?: string;
  format?: string;
  watch?: boolean;
  incremental?: boolean;
  full?: boolean;
  debounce?: number;
  complexity?: boolean;
  monorepo?: boolean;
  command?: string;
  subcommand?: string;
  help?: boolean;
  version?: boolean;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--watch' || arg === '-w') {
      args.watch = true;
    } else if (arg === '--incremental' || arg === '-i') {
      args.incremental = true;
    } else if (arg === '--full') {
      args.full = true;
    } else if (arg === '--complexity') {
      args.complexity = true;
    } else if (arg === '--monorepo') {
      args.monorepo = true;
    } else if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length);
    } else if (arg === '--format' && i + 1 < argv.length) {
      args.format = argv[++i]!;
    } else if (arg.startsWith('--debounce=')) {
      args.debounce = parseInt(arg.slice('--debounce='.length), 10);
    } else if (arg === '--debounce' && i + 1 < argv.length) {
      args.debounce = parseInt(argv[++i]!, 10);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // First positional could be a command or a root path
  if (positional.length > 0) {
    const first = positional[0]!;
    if (['inject', 'hook', 'init', 'stats'].includes(first)) {
      args.command = first;
      if (positional.length > 1) {
        args.subcommand = positional[1]!;
      }
    } else {
      args.root = first;
    }
  }

  return args;
}

/**
 * Print help text.
 */
function printHelp(): void {
  console.log(`
@oxog/codemap - AST-based codebase structure extractor

Usage:
  codemap [root] [options]
  codemap <command> [options]

Commands:
  inject              Inject map into CLAUDE.md
  hook install        Install git pre-commit hook
  hook uninstall      Remove git pre-commit hook
  init                Generate .codemapignore + config
  stats               Show token counts and complexity

Options:
  --format=<type>     Output format: compact, json, markdown, llms-txt
  --watch, -w         Watch mode with auto-regeneration
  --incremental, -i   Only scan git-changed files
  --full              Force full rescan
  --complexity        Enable complexity scoring
  --monorepo          Enable workspace detection
  --debounce=<ms>     Watch debounce interval (default: 300)
  --help, -h          Show this help
  --version, -v       Show version
`);
}

/**
 * Get version from package.json.
 */
function getVersion(): string {
  // Try multiple paths to find package.json (works in both dev and installed contexts)
  const candidates = [
    join(import.meta.dirname ?? '.', '..', 'package.json'),
    join(import.meta.dirname ?? '.', 'package.json'),
  ];
  for (const pkgPath of candidates) {
    try {
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
        const version = pkg['version'];
        if (typeof version === 'string') return version;
      }
    } catch {
      // Try next
    }
  }
  return '0.0.1';
}

/**
 * Execute a full scan and write output files.
 */
async function runScan(config: CodemapConfig): Promise<ScanResult> {
  const kernel = createKernel(config);

  // Register core plugins
  for (const plugin of getCorePlugins()) {
    kernel.use(plugin);
  }

  // Auto-detect languages
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

  // Register formatters
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

  // Run scan
  const result = await kernel.scan();

  // Write output files
  const outputDir = config.output;
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const fmt of formats) {
    const formatter = kernel.getFormatter(fmt);
    if (formatter) {
      const output = formatter.format(result);
      const filePath = join(outputDir, `map.${formatter.extension}`);
      writeFileSync(filePath, output);
    }
  }

  // Write stats
  writeFileSync(
    join(outputDir, 'stats.json'),
    JSON.stringify(result.stats, null, 2),
  );

  return result;
}

/**
 * Initialize config files.
 */
function runInit(cwd: string): void {
  // Create .codemapignore
  const ignorePath = join(cwd, '.codemapignore');
  if (!existsSync(ignorePath)) {
    writeFileSync(
      ignorePath,
      `# .codemapignore
# Files and directories to exclude from codemap scanning

*.test.ts
*.spec.ts
*.stories.tsx
__mocks__/
__tests__/
fixtures/
generated/
`,
    );
    console.log('Created .codemapignore');
  }

  // Create codemap.config.ts template
  const configPath = join(cwd, 'codemap.config.ts');
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      `import { defineConfig } from '@oxog/codemap';

export default defineConfig({
  root: './src',
  output: '.codemap',
  format: ['compact'],
  complexity: true,
  tokenCounts: true,
});
`,
    );
    console.log('Created codemap.config.ts');
  }

  // Update .gitignore to exclude codemap cache but keep map.txt
  const gitignorePath = join(cwd, '.gitignore');
  const codemapGitignore = '\n# Codemap (keep map.txt for LLM access)\n.codemap/*\n!.codemap/map.txt\n';
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.codemap')) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + codemapGitignore);
      console.log('Updated .gitignore');
    }
  }
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(getVersion());
    return;
  }

  const cwd = process.cwd();

  // Handle commands
  if (args.command === 'init') {
    runInit(cwd);
    return;
  }

  if (args.command === 'hook') {
    if (args.subcommand === 'install') {
      const success = installHook(cwd);
      console.log(success ? 'Pre-commit hook installed.' : 'Failed to install hook (not a git repo?).');
    } else if (args.subcommand === 'uninstall') {
      const success = uninstallHook(cwd);
      console.log(success ? 'Pre-commit hook removed.' : 'Failed to remove hook.');
    } else {
      console.log('Usage: codemap hook install|uninstall');
    }
    return;
  }

  if (args.command === 'inject') {
    const config = loadConfig(cwd, { root: args.root ?? DEFAULT_CONFIG.root });
    const result = await runScan(config);
    if (result.output) {
      const success = injectIntoClaudeMd(cwd, result.output);
      console.log(success ? 'Map injected into CLAUDE.md.' : 'Failed to inject.');
    }
    return;
  }

  if (args.command === 'stats') {
    const config = loadConfig(cwd, { root: args.root ?? DEFAULT_CONFIG.root });
    const result = await runScan(config);
    console.log(`Files: ${result.stats.fileCount}`);
    console.log(`Lines: ${result.stats.totalLoc.toLocaleString()}`);
    console.log(`Tokens: ~${result.stats.totalTokens.toLocaleString()}`);
    console.log(`Scan time: ${result.stats.scanDurationMs}ms`);
    if (Object.keys(result.stats.languageBreakdown).length > 0) {
      console.log('Languages:');
      for (const [lang, count] of Object.entries(result.stats.languageBreakdown)) {
        console.log(`  ${lang}: ${count} files`);
      }
    }
    return;
  }

  // Default: run scan
  const overrides: Record<string, unknown> = {};
  if (args.root) overrides['root'] = args.root;
  if (args.format) overrides['format'] = parseFormatString(args.format);
  if (args.incremental) overrides['incremental'] = true;
  if (args.full) overrides['incremental'] = false;
  if (args.complexity) overrides['complexity'] = true;
  if (args.monorepo) overrides['monorepo'] = true;

  const config = loadConfig(cwd, overrides);

  if (args.watch) {
    console.log(`Watching ${config.root} for changes...`);
    const kernel = createKernel(config);

    for (const plugin of getCorePlugins()) {
      kernel.use(plugin);
    }

    const extensions = new Set<string>();
    const scannedFiles = scanDirectory(config.root, {
      ignorePatterns: config.ignore ? [...config.ignore] : [],
    });
    for (const file of scannedFiles) {
      extensions.add('.' + file.relativePath.split('.').pop());
    }
    for (const plugin of autoDetectPlugins(extensions)) {
      if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
        kernel.use(plugin);
      }
    }
    const formats = Array.isArray(config.format) ? config.format : [config.format];
    for (const plugin of getFormatterPlugins(formats)) {
      if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
        kernel.use(plugin);
      }
    }
    for (const plugin of getFeaturePlugins(config)) {
      if (!kernel.listPlugins().some((p) => p.name === plugin.name)) {
        kernel.use(plugin);
      }
    }

    const watcher = createFileWatcher(kernel, config, args.debounce ?? 300);

    watcher.on('change', (event) => {
      console.log(
        `Map updated: ${event.changedFiles.length} file(s) changed | ~${event.map.stats.totalTokens} tokens`,
      );
    });

    watcher.on('error', (err) => {
      console.error('Watch error:', err.message);
    });

    // Initial scan
    try {
      await runScan(config);
      console.log('Initial scan complete. Waiting for changes...');
    } catch (err) {
      console.error('Initial scan failed:', err instanceof Error ? err.message : err);
    }

    // Keep process alive
    process.on('SIGINT', () => {
      watcher.close();
      console.log('\nWatcher closed.');
      process.exit(0);
    });
  } else {
    try {
      const result = await runScan(config);
      console.log(
        `Scan complete: ${result.stats.fileCount} files | ${result.stats.totalLoc.toLocaleString()} LOC | ~${result.stats.totalTokens.toLocaleString()} tokens | ${result.stats.scanDurationMs}ms`,
      );
    } catch (err) {
      console.error('Scan failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
