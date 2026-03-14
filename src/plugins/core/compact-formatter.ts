/**
 * Compact output formatter — token-optimized output using Unicode symbols.
 *
 * Produces maximum information density output suitable for LLM context windows.
 * Uses a symbol legend for structural elements to minimize token usage.
 * @module
 */

import type {
  CodemapPlugin,
  OutputFormatter,
  ScanResult,
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
} from '../../types.js';

// ─── Symbol Legend ────────────────────────────────────────────────────
//  ⚛  React Component     🪝 React Hook
//  ƒ  Function             ◆  Class
//  ◇  Interface            τ  Type alias
//  ε  Enum                 κ  Constant
//  ↗  Re-export            ←  extends
//  ⊳  implements           ✦  Struct
//  Δ  Trait/Protocol       λ  Method
//  π  Package/Namespace    ∂  Decorator/Annotation

// ─── Helpers ─────────────────────────────────────────────────────────

/** Format a number with thousands separators */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format params list into compact string */
function fmtParams(params: readonly { name: string; type: string; optional?: boolean | undefined }[]): string {
  if (params.length === 0) return '()';
  const parts = params.map((p) => {
    const opt = p.optional ? '?' : '';
    return p.type && p.type !== 'unknown'
      ? `${p.name}${opt}: ${p.type}`
      : `${p.name}${opt}`;
  });
  return `(${parts.join(', ')})`;
}

/** Format a return type suffix */
function fmtReturn(returnType: string): string {
  if (!returnType || returnType === 'void') return '';
  return ` → ${returnType}`;
}

/** Format decorators as prefix */
function fmtDecorators(decorators?: readonly string[]): string {
  if (!decorators || decorators.length === 0) return '';
  return decorators.map((d) => `∂${d}`).join(' ') + ' ';
}

/** Format a function/method with modifiers */
function fmtFunction(fn: FunctionInfo, indent: string, symbol: string): string {
  const parts: string[] = [indent];
  parts.push(fmtDecorators(fn.decorators));
  parts.push(symbol);
  if (fn.async) parts.push('async ');
  if (fn.generator) parts.push('* ');
  if (fn.static) parts.push('static ');
  parts.push(fn.name);
  parts.push(fmtParams(fn.params));
  parts.push(fmtReturn(fn.returnType));
  return parts.join('');
}

// ─── Section Formatters ──────────────────────────────────────────────

function formatHeader(result: ScanResult): string {
  const { root, timestamp, stats } = result;
  const date = timestamp.slice(0, 10);
  const lines: string[] = [];

  lines.push(`# CODEMAP — ${root}`);
  lines.push(
    `# Generated: ${date} | Files: ${fmtNum(stats.fileCount)} | LOC: ${fmtNum(stats.totalLoc)} | ~${fmtNum(stats.totalTokens)} tokens`,
  );

  return lines.join('\n');
}

function formatExternalDeps(externalDeps: Readonly<Record<string, readonly string[]>>): string {
  const entries = Object.entries(externalDeps);
  if (entries.length === 0) return '';

  const lines: string[] = ['', '## EXTERNAL DEPS'];

  for (const [pkg, names] of entries) {
    lines.push(`  ${pkg}: ${names.join(', ')}`);
  }

  return lines.join('\n');
}

function formatFunctions(functions: readonly FunctionInfo[]): string[] {
  const lines: string[] = [];
  for (const fn of functions) {
    lines.push(fmtFunction(fn, '  ', 'ƒ '));
  }
  return lines;
}

function formatClasses(classes: readonly ClassInfo[]): string[] {
  const lines: string[] = [];

  for (const cls of classes) {
    const parts: string[] = ['  '];
    parts.push(fmtDecorators(cls.decorators));
    if (cls.abstract) parts.push('abstract ');
    parts.push(`◆ ${cls.name}`);
    if (cls.extends) parts.push(` ← ${cls.extends}`);
    if (cls.implements && cls.implements.length > 0) {
      parts.push(` ⊳ ${cls.implements.join(', ')}`);
    }
    parts.push(` (${cls.loc}L)`);
    lines.push(parts.join(''));

    // Methods
    for (const method of cls.methods) {
      const scope = method.scope && method.scope !== 'public' ? `[${method.scope}] ` : '';
      lines.push(fmtFunction(method, '    .', `${scope}`));
    }
  }

  return lines;
}

function formatInterfaces(interfaces: readonly InterfaceInfo[]): string[] {
  const lines: string[] = [];

  for (const iface of interfaces) {
    const props = iface.properties
      .map((p) => {
        const opt = p.optional ? '?' : '';
        return `${p.name}${opt}: ${p.type}`;
      })
      .join(', ');

    let line = `  ◇ ${iface.name}`;
    if (iface.extends && iface.extends.length > 0) {
      line += ` ← ${iface.extends.join(', ')}`;
    }
    if (props) {
      line += ` { ${props} }`;
    }
    lines.push(line);

    // Interface methods
    if (iface.methods && iface.methods.length > 0) {
      for (const method of iface.methods) {
        lines.push(fmtFunction(method, '    .', ''));
      }
    }
  }

  return lines;
}

function formatTypes(types: readonly TypeInfo[]): string[] {
  return types.map((t) => `  τ ${t.name} = ${t.type}`);
}

function formatEnums(enums: readonly EnumInfo[]): string[] {
  return enums.map((e) => `  ε ${e.name} [${e.members.join(', ')}]`);
}

function formatConstants(constants: readonly ConstantInfo[]): string[] {
  return constants.map((c) => {
    const type = c.type && c.type !== 'unknown' ? `: ${c.type}` : '';
    return `  κ ${c.name}${type}`;
  });
}

function formatComponents(components: readonly ComponentInfo[]): string[] {
  const lines: string[] = [];
  for (const comp of components) {
    lines.push(fmtFunction(comp, '  ', '⚛ '));
  }
  return lines;
}

function formatHooks(hooks: readonly HookInfo[]): string[] {
  const lines: string[] = [];
  for (const hook of hooks) {
    lines.push(fmtFunction(hook, '  ', '🪝 '));
  }
  return lines;
}

function formatStructs(structs: readonly StructInfo[]): string[] {
  const lines: string[] = [];

  for (const s of structs) {
    let line = `  ✦ ${s.name}`;
    if (s.embeds && s.embeds.length > 0) {
      line += ` ← ${s.embeds.join(', ')}`;
    }
    if (s.derives && s.derives.length > 0) {
      line += ` [${s.derives.join(', ')}]`;
    }
    lines.push(line);

    for (const method of s.methods) {
      lines.push(fmtFunction(method, '    .', ''));
    }
  }

  return lines;
}

function formatTraits(traits: readonly TraitInfo[]): string[] {
  const lines: string[] = [];

  for (const t of traits) {
    let line = `  Δ ${t.name}`;
    if (t.superTraits && t.superTraits.length > 0) {
      line += ` ← ${t.superTraits.join(', ')}`;
    }
    lines.push(line);

    for (const method of t.methods) {
      lines.push(fmtFunction(method, '    .', ''));
    }
  }

  return lines;
}

function formatReExports(file: FileAnalysis): string[] {
  const reExports = file.exports.filter((e) => e.isReExport);
  if (reExports.length === 0) return [];

  return reExports.map((e) => {
    const from = e.from ? ` from ${e.from}` : '';
    return `  ↗ ${e.names.join(', ')}${from}`;
  });
}

function formatPackages(file: FileAnalysis): string[] {
  if (!file.packages || file.packages.length === 0) return [];
  return file.packages.map((p) => `  π ${p.name}`);
}

function formatFile(file: FileAnalysis): string {
  const fileLines: string[] = [];

  // File header: path, LOC, token estimate, complexity
  const parts: string[] = [
    `━━ ${file.path} (${file.loc}L) [~${fmtNum(file.estimatedTokens)}T]`,
  ];
  if (file.complexity != null) {
    parts.push(` [C:${file.complexity}]`);
  }
  fileLines.push(parts.join(''));

  // Components (React)
  if (file.components && file.components.length > 0) {
    fileLines.push(...formatComponents(file.components));
  }

  // Hooks (React)
  if (file.hooks && file.hooks.length > 0) {
    fileLines.push(...formatHooks(file.hooks));
  }

  // Functions
  if (file.functions.length > 0) {
    fileLines.push(...formatFunctions(file.functions));
  }

  // Classes
  if (file.classes.length > 0) {
    fileLines.push(...formatClasses(file.classes));
  }

  // Interfaces
  if (file.interfaces.length > 0) {
    fileLines.push(...formatInterfaces(file.interfaces));
  }

  // Types
  if (file.types.length > 0) {
    fileLines.push(...formatTypes(file.types));
  }

  // Enums
  if (file.enums.length > 0) {
    fileLines.push(...formatEnums(file.enums));
  }

  // Constants
  if (file.constants.length > 0) {
    fileLines.push(...formatConstants(file.constants));
  }

  // Structs
  if (file.structs && file.structs.length > 0) {
    fileLines.push(...formatStructs(file.structs));
  }

  // Traits
  if (file.traits && file.traits.length > 0) {
    fileLines.push(...formatTraits(file.traits));
  }

  // Re-exports
  fileLines.push(...formatReExports(file));

  // Packages/namespaces
  fileLines.push(...formatPackages(file));

  return fileLines.join('\n');
}

function formatDependencyGraph(graph: Readonly<Record<string, readonly string[]>>): string {
  const entries = Object.entries(graph);
  if (entries.length === 0) return '';

  const lines: string[] = ['', '## DEPENDENCY GRAPH'];

  for (const [file, deps] of entries) {
    if (deps.length > 0) {
      lines.push(`  ${file} → ${deps.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ─── Main Formatter ──────────────────────────────────────────────────

/**
 * Format a scan result into compact, token-optimized output.
 *
 * @param result - Complete scan result
 * @param _options - Formatter-specific options (reserved for future use)
 * @returns Formatted compact output string
 */
export function formatCompact(result: ScanResult, _options?: Record<string, unknown>): string {
  const sections: string[] = [];

  // Header
  sections.push(formatHeader(result));

  // External dependencies
  const depsSection = formatExternalDeps(result.externalDeps);
  if (depsSection) {
    sections.push(depsSection);
  }

  // Files section
  if (result.files.length > 0) {
    const fileLines: string[] = ['', '## FILES', ''];
    for (const file of result.files) {
      fileLines.push(formatFile(file));
      fileLines.push('');
    }
    sections.push(fileLines.join('\n'));
  }

  // Dependency graph
  const graphSection = formatDependencyGraph(result.dependencyGraph);
  if (graphSection) {
    sections.push(graphSection);
  }

  return sections.join('\n').trimEnd() + '\n';
}

// ─── Output Formatter Object ─────────────────────────────────────────

const compactFormatter: OutputFormatter = {
  name: 'compact',
  extension: 'txt',
  format: formatCompact,
};

// ─── Plugin Factory ──────────────────────────────────────────────────

/**
 * Create the compact formatter plugin.
 *
 * Registers the compact output formatter which produces token-optimized
 * output using Unicode symbols for maximum information density.
 *
 * @returns CodemapPlugin that registers the compact formatter
 *
 * @example
 * ```typescript
 * import { createCompactFormatterPlugin } from '@oxog/codemap';
 *
 * const plugin = createCompactFormatterPlugin();
 * kernel.use(plugin);
 * ```
 */
export function createCompactFormatterPlugin(): CodemapPlugin {
  return {
    name: 'compact-formatter',
    version: '1.0.0',
    install(kernel) {
      kernel.registerFormatter(compactFormatter);
    },
  };
}
