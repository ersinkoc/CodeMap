/**
 * Deep code analysis plugin.
 *
 * Performs structural analysis on scan results:
 * - Reverse dependency graph (who imports me?)
 * - Orphan file detection (files not imported by anyone)
 * - Unused export detection (exported symbols never imported)
 * - Circular dependency detection
 * - Entry point detection from package.json
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  CodemapPlugin,
  ScanResult,
  CodeAnalysis,
  UnusedExport,
  FileAnalysis,
} from '../../types.js';

// ─── Dependency Path Resolution ──────────────────────────────────────

/**
 * Resolve a relative import path to the canonical file path used in the scan.
 * Handles './foo', '../bar', and extension-less imports.
 */
function resolveImportPath(
  importFrom: string,
  importerPath: string,
  allPaths: Set<string>,
): string | null {
  // Only handle internal (relative) imports
  if (!importFrom.startsWith('.')) return null;

  const importerDir = dirname(importerPath);
  // Normalize: join and convert backslashes
  let resolved = join(importerDir, importFrom).replace(/\\/g, '/');

  // Try exact match first
  if (allPaths.has(resolved)) return resolved;

  // Try with common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.go', '.py', '.rs', '.php', '.java', '.cs'];
  for (const ext of extensions) {
    // Strip .js suffix that TypeScript uses for ESM imports
    const withoutJs = resolved.replace(/\.js$/, '');
    if (allPaths.has(withoutJs + ext)) return withoutJs + ext;
    if (allPaths.has(resolved + ext)) return resolved + ext;
  }

  // Try index files
  for (const ext of extensions) {
    const indexPath = resolved + '/index' + ext;
    if (allPaths.has(indexPath)) return indexPath;
  }

  return null;
}

// ─── Reverse Dependency Graph ────────────────────────────────────────

function buildReverseDeps(
  files: readonly FileAnalysis[],
  allPaths: Set<string>,
): Record<string, string[]> {
  const reverse: Record<string, string[]> = {};

  // Initialize all files with empty arrays
  for (const path of allPaths) {
    reverse[path] = [];
  }

  for (const file of files) {
    for (const imp of file.imports) {
      if (imp.kind !== 'internal') continue;

      const resolved = resolveImportPath(imp.from, file.path, allPaths);
      if (resolved && reverse[resolved]) {
        reverse[resolved]!.push(file.path);
      }
    }
  }

  return reverse;
}

// ─── Orphan File Detection ───────────────────────────────────────────

function findOrphanFiles(
  reverseDeps: Record<string, string[]>,
  entryPoints: readonly string[],
): string[] {
  const entrySet = new Set(entryPoints);

  return Object.entries(reverseDeps)
    .filter(([file, importers]) => {
      if (importers.length > 0) return false;
      if (entrySet.has(file)) return false;
      // Barrel/index files are public API re-export points, not orphans
      if (file.endsWith('/index.ts') || file === 'index.ts') return false;
      return true;
    })
    .map(([file]) => file)
    .sort();
}

// ─── Unused Export Detection ─────────────────────────────────────────

function findUnusedExports(
  files: readonly FileAnalysis[],
  allPaths: Set<string>,
  entryPoints: readonly string[],
): UnusedExport[] {
  const entrySet = new Set(entryPoints);
  // Barrel files (index.ts) that only re-export are excluded from unused analysis
  const barrelFiles = new Set(
    files
      .filter((f) => f.path.endsWith('/index.ts') || f.path === 'index.ts')
      .map((f) => f.path),
  );
  // Build a map of all imported names per resolved file
  const importedNames = new Map<string, Set<string>>();

  function addUsedNames(resolved: string, names: readonly string[]): void {
    let set = importedNames.get(resolved);
    if (!set) {
      set = new Set();
      importedNames.set(resolved, set);
    }
    for (const name of names) {
      if (name === '*' || name.startsWith('* as ')) {
        set.add('*');
      } else {
        set.add(name);
      }
    }
  }

  for (const file of files) {
    // Regular imports
    for (const imp of file.imports) {
      if (imp.kind !== 'internal') continue;
      const resolved = resolveImportPath(imp.from, file.path, allPaths);
      if (!resolved) continue;
      addUsedNames(resolved, imp.names);
    }

    // Re-exports from entry points and barrel files count as "used"
    // e.g., index.ts: export type { Foo } from './types.js' → Foo is used in types.ts
    if (entrySet.has(file.path) || barrelFiles.has(file.path)) {
      for (const exp of file.exports) {
        if (exp.isReExport && exp.from) {
          const resolved = resolveImportPath(exp.from, file.path, allPaths);
          if (resolved) {
            addUsedNames(resolved, exp.names);
          }
        }
      }
    }
  }

  const unused: UnusedExport[] = [];

  for (const file of files) {
    // Skip entry points and barrel files — their exports are the public API
    if (entrySet.has(file.path) || barrelFiles.has(file.path)) continue;

    const usedNames = importedNames.get(file.path);
    // If '*' is imported, all exports are considered used
    if (usedNames?.has('*')) continue;

    // Collect all exported symbol names from this file
    const exportedNames: string[] = [];

    for (const fn of file.functions) {
      if (fn.exported) exportedNames.push(fn.name);
    }
    for (const cls of file.classes) {
      if (cls.exported) exportedNames.push(cls.name);
    }
    for (const iface of file.interfaces) {
      if (iface.exported) exportedNames.push(iface.name);
    }
    for (const t of file.types) {
      if (t.exported) exportedNames.push(t.name);
    }
    for (const e of file.enums) {
      if (e.exported) exportedNames.push(e.name);
    }
    for (const c of file.constants) {
      if (c.exported) exportedNames.push(c.name);
    }
    if (file.components) {
      for (const comp of file.components) {
        if (comp.exported) exportedNames.push(comp.name);
      }
    }
    if (file.hooks) {
      for (const hook of file.hooks) {
        if (hook.exported) exportedNames.push(hook.name);
      }
    }

    // Check re-exports too
    for (const exp of file.exports) {
      if (!exp.isReExport) {
        for (const name of exp.names) {
          if (!exportedNames.includes(name)) {
            exportedNames.push(name);
          }
        }
      }
    }

    // Find which exports are never imported
    for (const name of exportedNames) {
      if (!usedNames || !usedNames.has(name)) {
        unused.push({ file: file.path, name });
      }
    }
  }

  return unused;
}

// ─── Circular Dependency Detection ───────────────────────────────────

function findCircularDeps(
  _depGraph: Readonly<Record<string, readonly string[]>>,
  allPaths: Set<string>,
  files: readonly FileAnalysis[],
): string[][] {
  // Build a resolved dependency graph (import paths → actual file paths)
  const resolvedGraph = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = new Set<string>();
    for (const imp of file.imports) {
      if (imp.kind !== 'internal') continue;
      const resolved = resolveImportPath(imp.from, file.path, allPaths);
      if (resolved) deps.add(resolved);
    }
    resolvedGraph.set(file.path, deps);
  }

  const seen = new Set<string>();
  const cycleKeys = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, stack: string[], stackSet: Set<string>): void {
    if (stackSet.has(node)) {
      // Extract the cycle
      const cycleStart = stack.indexOf(node);
      if (cycleStart === -1) return;
      const cycle = stack.slice(cycleStart);

      // Normalize: rotate so lexicographically smallest node is first
      let minIdx = 0;
      for (let i = 1; i < cycle.length; i++) {
        if (cycle[i]! < cycle[minIdx]!) minIdx = i;
      }
      const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
      normalized.push(normalized[0]!); // Close the loop

      const key = normalized.join(' → ');
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(normalized);
      }
      return;
    }

    if (seen.has(node)) return;
    seen.add(node);

    stackSet.add(node);
    stack.push(node);

    const deps = resolvedGraph.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep, stack, stackSet);
      }
    }

    stack.pop();
    stackSet.delete(node);
  }

  for (const node of resolvedGraph.keys()) {
    seen.clear();
    dfs(node, [], new Set());
  }

  return cycles;
}

// ─── Entry Point Detection ───────────────────────────────────────────

function detectEntryPoints(rootDir: string, allPaths: Set<string>): string[] {
  const entries: string[] = [];

  // Try to find package.json at root (or parent)
  const candidates = [
    join(rootDir, 'package.json'),
    join(rootDir, '..', 'package.json'),
  ];

  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;

      // main field
      if (typeof pkg['main'] === 'string') {
        addEntryIfExists(pkg['main'], rootDir, allPaths, entries);
      }

      // module field
      if (typeof pkg['module'] === 'string') {
        addEntryIfExists(pkg['module'], rootDir, allPaths, entries);
      }

      // bin field
      const bin = pkg['bin'];
      if (typeof bin === 'string') {
        addEntryIfExists(bin, rootDir, allPaths, entries);
      } else if (bin && typeof bin === 'object') {
        for (const val of Object.values(bin as Record<string, string>)) {
          addEntryIfExists(val, rootDir, allPaths, entries);
        }
      }

      // exports field
      const exp = pkg['exports'];
      if (exp && typeof exp === 'object') {
        collectExportPaths(exp as Record<string, unknown>, rootDir, allPaths, entries);
      }

      break; // Only use first found package.json
    } catch {
      continue;
    }
  }

  // Also consider common entry point filenames
  const commonEntries = ['index.ts', 'index.tsx', 'index.js', 'main.ts', 'main.js', 'cli.ts', 'cli.js', 'app.ts', 'app.js'];
  for (const entry of commonEntries) {
    if (allPaths.has(entry) && !entries.includes(entry)) {
      entries.push(entry);
    }
  }

  return entries;
}

function addEntryIfExists(
  path: string,
  rootDir: string,
  allPaths: Set<string>,
  entries: string[],
): void {
  // Convert dist/foo.js to src/foo.ts style
  const normalized = path
    .replace(/^\.\//, '')
    .replace(/^dist\//, '')
    .replace(/\.js$/, '.ts')
    .replace(/\.cjs$/, '.ts')
    .replace(/\.mjs$/, '.ts');

  if (allPaths.has(normalized) && !entries.includes(normalized)) {
    entries.push(normalized);
  }
}

function collectExportPaths(
  obj: Record<string, unknown>,
  rootDir: string,
  allPaths: Set<string>,
  entries: string[],
): void {
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      addEntryIfExists(value, rootDir, allPaths, entries);
    } else if (value && typeof value === 'object') {
      collectExportPaths(value as Record<string, unknown>, rootDir, allPaths, entries);
    }
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────

/**
 * Perform full code analysis on a scan result.
 */
export function analyzeCode(result: ScanResult): CodeAnalysis {
  const allPaths = new Set(result.files.map((f) => f.path));

  const reverseDeps = buildReverseDeps(result.files, allPaths);
  const entryPoints = detectEntryPoints(result.root, allPaths);
  const orphanFiles = findOrphanFiles(reverseDeps, entryPoints);
  const unusedExports = findUnusedExports(result.files, allPaths, entryPoints);
  const circularDeps = findCircularDeps(result.dependencyGraph, allPaths, result.files);

  return {
    reverseDeps,
    orphanFiles,
    unusedExports,
    circularDeps,
    entryPoints,
  };
}

/**
 * Create the code analysis plugin.
 *
 * Adds reverse dependencies, orphan detection, unused exports,
 * and circular dependency detection to scan results.
 */
export function createCodeAnalysisPlugin(): CodemapPlugin {
  return {
    name: 'code-analysis',
    version: '1.0.0',
    install() {
      // Analysis runs after scan
    },
    async onScanComplete(result: ScanResult) {
      const analysis = analyzeCode(result);
      (result as { analysis?: CodeAnalysis }).analysis = analysis;
    },
  };
}
