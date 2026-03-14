/**
 * llms.txt spec compliant output formatter plugin.
 *
 * Produces output following the llms.txt specification for LLM consumption.
 * @module
 */

import type {
  CodemapPlugin,
  OutputFormatter,
  ScanResult,
  FileAnalysis,
  FunctionInfo,
} from '../../types.js';

function formatLlmsTxt(result: ScanResult): string {
  const lines: string[] = [];
  const date = result.timestamp.split('T')[0] ?? result.timestamp;

  lines.push('# Codebase Map');
  lines.push('');
  lines.push(`> Structural map of ${result.root}`);
  lines.push(`> ${result.stats.fileCount} files | ${result.stats.totalLoc.toLocaleString()} LOC | ~${result.stats.totalTokens.toLocaleString()} tokens`);
  lines.push(`> Generated: ${date}`);
  lines.push('');

  // External deps
  const extDeps = Object.entries(result.externalDeps);
  if (extDeps.length > 0) {
    lines.push('## Dependencies');
    lines.push('');
    for (const [pkg, names] of extDeps) {
      lines.push(`- ${pkg}: ${names.join(', ')}`);
    }
    lines.push('');
  }

  // Files
  lines.push('## Structure');
  lines.push('');

  for (const file of result.files) {
    lines.push(`### ${file.path}`);
    lines.push(`${file.loc} lines, ~${file.estimatedTokens} tokens`);
    lines.push('');

    formatFileStructure(file, lines);
    lines.push('');
  }

  // Dependency graph
  const deps = Object.entries(result.dependencyGraph);
  if (deps.length > 0) {
    lines.push('## Internal Dependencies');
    lines.push('');
    for (const [file, fileDeps] of deps) {
      lines.push(`- ${file} → ${fileDeps.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatFileStructure(file: FileAnalysis, lines: string[]): void {
  // Components
  if (file.components) {
    for (const comp of file.components) {
      lines.push(`- Component: ${formatSig(comp)}`);
    }
  }

  // Hooks
  if (file.hooks) {
    for (const hook of file.hooks) {
      lines.push(`- Hook: ${formatSig(hook)}`);
    }
  }

  // Classes
  for (const cls of file.classes) {
    let line = `- Class: ${cls.name}`;
    if (cls.extends) line += ` extends ${cls.extends}`;
    if (cls.implements && cls.implements.length > 0) line += ` implements ${cls.implements.join(', ')}`;
    lines.push(line);
    for (const method of cls.methods) {
      lines.push(`  - ${formatSig(method)}`);
    }
  }

  // Interfaces
  for (const iface of file.interfaces) {
    lines.push(`- Interface: ${iface.name} { ${iface.properties.map((p) => `${p.name}: ${p.type}`).join(', ')} }`);
  }

  // Types
  for (const type of file.types) {
    lines.push(`- Type: ${type.name} = ${type.type}`);
  }

  // Enums
  for (const en of file.enums) {
    lines.push(`- Enum: ${en.name} [${en.members.join(', ')}]`);
  }

  // Functions
  for (const func of file.functions) {
    lines.push(`- Function: ${formatSig(func)}`);
  }

  // Structs
  if (file.structs) {
    for (const struct of file.structs) {
      lines.push(`- Struct: ${struct.name} { ${struct.fields.map((f) => `${f.name}: ${f.type}`).join(', ')} }`);
    }
  }

  // Traits
  if (file.traits) {
    for (const trait of file.traits) {
      lines.push(`- Trait: ${trait.name}`);
      for (const method of trait.methods) {
        lines.push(`  - ${formatSig(method)}`);
      }
    }
  }

  // Constants
  for (const constant of file.constants) {
    lines.push(`- Constant: ${constant.name}: ${constant.type}`);
  }
}

function formatSig(func: FunctionInfo): string {
  const async = func.async ? 'async ' : '';
  const params = func.params
    .map((p) => `${p.name}: ${p.type}`)
    .join(', ');
  return `${async}${func.name}(${params}) → ${func.returnType}`;
}

const llmsTxtFormatter: OutputFormatter = {
  name: 'llms-txt',
  extension: 'txt',
  format: formatLlmsTxt,
};

/**
 * Create the llms.txt formatter plugin.
 */
export function createLlmsTxtFormatterPlugin(): CodemapPlugin {
  return {
    name: 'llms-txt-formatter',
    version: '1.0.0',
    install(kernel) {
      kernel.registerFormatter(llmsTxtFormatter);
    },
  };
}
