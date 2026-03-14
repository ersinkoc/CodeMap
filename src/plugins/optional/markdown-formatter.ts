/**
 * Markdown output formatter plugin.
 *
 * Produces human-readable Markdown output suitable for GitHub preview.
 * @module
 */

import type {
  CodemapPlugin,
  OutputFormatter,
  ScanResult,
  FileAnalysis,
  FunctionInfo,
} from '../../types.js';

function formatMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  const date = result.timestamp.split('T')[0] ?? result.timestamp;

  lines.push(`# Codemap — ${result.root}`);
  lines.push('');
  lines.push(
    `> Generated: ${date} | Files: ${result.stats.fileCount} | LOC: ${result.stats.totalLoc.toLocaleString()} | ~${result.stats.totalTokens.toLocaleString()} tokens`,
  );
  lines.push('');

  // External dependencies
  const extDeps = Object.entries(result.externalDeps);
  if (extDeps.length > 0) {
    lines.push('## External Dependencies');
    lines.push('');
    for (const [pkg, names] of extDeps) {
      lines.push(`- **${pkg}**: ${names.join(', ')}`);
    }
    lines.push('');
  }

  // Files
  lines.push('## Files');
  lines.push('');

  for (const file of result.files) {
    const complexity = file.complexity !== undefined ? ` | Complexity: ${file.complexity}` : '';
    lines.push(`### \`${file.path}\``);
    lines.push('');
    lines.push(`> ${file.loc} lines | ~${file.estimatedTokens} tokens${complexity}`);
    lines.push('');

    formatFileContent(file, lines);
    lines.push('');
  }

  // Dependency graph
  const deps = Object.entries(result.dependencyGraph);
  if (deps.length > 0) {
    lines.push('## Dependency Graph');
    lines.push('');
    for (const [file, fileDeps] of deps) {
      lines.push(`- \`${file}\` → ${fileDeps.map((d) => `\`${d}\``).join(', ')}`);
    }
    lines.push('');
  }

  // Code analysis
  if (result.analysis) {
    const a = result.analysis;

    if (a.entryPoints.length > 0) {
      lines.push('## Entry Points');
      lines.push('');
      for (const entry of a.entryPoints) {
        lines.push(`- ▶ \`${entry}\``);
      }
      lines.push('');
    }

    const reverseDepsEntries = Object.entries(a.reverseDeps).filter(([, v]) => v.length > 0);
    if (reverseDepsEntries.length > 0) {
      lines.push('## Reverse Dependencies');
      lines.push('');
      for (const [file, importers] of reverseDepsEntries) {
        lines.push(`- \`${file}\` ← ${importers.map((i) => `\`${i}\``).join(', ')}`);
      }
      lines.push('');
    }

    if (a.circularDeps.length > 0) {
      lines.push('## Circular Dependencies');
      lines.push('');
      for (const cycle of a.circularDeps) {
        lines.push(`- ⟳ ${cycle.map((c) => `\`${c}\``).join(' → ')}`);
      }
      lines.push('');
    }

    if (a.orphanFiles.length > 0) {
      lines.push('## Orphan Files');
      lines.push('');
      for (const file of a.orphanFiles) {
        lines.push(`- ⚠ \`${file}\``);
      }
      lines.push('');
    }

    if (a.unusedExports.length > 0) {
      lines.push('## Unused Exports');
      lines.push('');
      const grouped = new Map<string, string[]>();
      for (const { file, name } of a.unusedExports) {
        let names = grouped.get(file);
        if (!names) { names = []; grouped.set(file, names); }
        names.push(name);
      }
      for (const [file, names] of grouped) {
        lines.push(`- ⚠ \`${file}\`: ${names.map((n) => `\`${n}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatFileContent(file: FileAnalysis, lines: string[]): void {
  // Components
  if (file.components && file.components.length > 0) {
    for (const comp of file.components) {
      lines.push(`- ⚛ **Component** \`${formatFuncSig(comp)}\``);
    }
  }

  // Hooks
  if (file.hooks && file.hooks.length > 0) {
    for (const hook of file.hooks) {
      lines.push(`- 🪝 **Hook** \`${formatFuncSig(hook)}\``);
    }
  }

  // Classes
  for (const cls of file.classes) {
    let classLine = `- ◆ **Class** \`${cls.name}\``;
    if (cls.extends) classLine += ` extends \`${cls.extends}\``;
    if (cls.implements && cls.implements.length > 0) {
      classLine += ` implements ${cls.implements.map((i) => `\`${i}\``).join(', ')}`;
    }
    if (cls.abstract) classLine += ' *(abstract)*';
    lines.push(classLine);

    for (const method of cls.methods) {
      const prefix = method.scope === 'private' ? '-' : method.scope === 'protected' ? '#' : '+';
      lines.push(`  - ${prefix} \`${formatFuncSig(method)}\``);
    }
  }

  // Interfaces
  for (const iface of file.interfaces) {
    let ifaceLine = `- ◇ **Interface** \`${iface.name}\``;
    if (iface.extends && iface.extends.length > 0) {
      ifaceLine += ` extends ${iface.extends.map((e) => `\`${e}\``).join(', ')}`;
    }
    lines.push(ifaceLine);

    for (const prop of iface.properties) {
      lines.push(`  - \`${prop.name}${prop.optional ? '?' : ''}: ${prop.type}\``);
    }
  }

  // Types
  for (const type of file.types) {
    lines.push(`- τ **Type** \`${type.name}\` = \`${type.type}\``);
  }

  // Enums
  for (const en of file.enums) {
    lines.push(`- ε **Enum** \`${en.name}\` [${en.members.join(', ')}]`);
  }

  // Functions
  for (const func of file.functions) {
    lines.push(`- ƒ \`${formatFuncSig(func)}\``);
  }

  // Structs
  if (file.structs) {
    for (const struct of file.structs) {
      lines.push(`- ✦ **Struct** \`${struct.name}\``);
      for (const field of struct.fields) {
        lines.push(`  - \`${field.name}: ${field.type}\``);
      }
    }
  }

  // Traits
  if (file.traits) {
    for (const trait of file.traits) {
      lines.push(`- Δ **Trait** \`${trait.name}\``);
      for (const method of trait.methods) {
        lines.push(`  - \`${formatFuncSig(method)}\``);
      }
    }
  }

  // Constants
  for (const constant of file.constants) {
    lines.push(`- κ \`${constant.name}: ${constant.type}\``);
  }
}

function formatFuncSig(func: FunctionInfo): string {
  const async = func.async ? 'async ' : '';
  const params = func.params.map((p) => {
    const opt = p.optional ? '?' : '';
    return `${p.name}${opt}: ${p.type}`;
  }).join(', ');

  return `${async}${func.name}(${params}) → ${func.returnType}`;
}

const markdownFormatter: OutputFormatter = {
  name: 'markdown',
  extension: 'md',
  format: formatMarkdown,
};

/**
 * Create the Markdown formatter plugin.
 */
export function createMarkdownFormatterPlugin(): CodemapPlugin {
  return {
    name: 'markdown-formatter',
    version: '1.0.0',
    install(kernel) {
      kernel.registerFormatter(markdownFormatter);
    },
  };
}
