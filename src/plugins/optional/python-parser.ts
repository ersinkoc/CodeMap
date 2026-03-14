/**
 * Python language regex/heuristic parser.
 *
 * Extracts structural information from Python files including:
 * functions, classes, decorators, type hints, imports, and exports.
 * Uses indentation-based scope detection for class methods.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ParamInfo,
  PropertyInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

/**
 * Get the indentation level of a line (number of leading spaces).
 * Tabs are counted as 4 spaces.
 */
function getIndent(line: string): number {
  let indent = 0;
  for (const ch of line) {
    if (ch === ' ') indent++;
    else if (ch === '\t') indent += 4;
    else break;
  }
  return indent;
}

/**
 * Parse Python parameters from a function signature.
 * Handles: (self, a: int, b: str = "default", *args, **kwargs)
 */
function parsePythonParams(paramsStr: string): ParamInfo[] {
  const trimmed = paramsStr.trim();
  if (!trimmed) return [];

  const params: ParamInfo[] = [];
  let depth = 0;
  let current = '';
  const segments: string[] = [];

  for (const ch of trimmed) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;

    if (ch === ',' && depth === 0) {
      segments.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) segments.push(current.trim());

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;

    // Skip 'self' and 'cls' as they are implicit
    if (s === 'self' || s === 'cls') continue;

    // *args or **kwargs
    const splatMatch = s.match(/^(\*{1,2})(\w+)(?:\s*:\s*(.+))?$/);
    if (splatMatch) {
      params.push({
        name: splatMatch[1]! + splatMatch[2]!,
        type: splatMatch[3] ? truncateType(simplifyType(splatMatch[3])) : 'unknown',
      });
      continue;
    }

    // name: Type = default
    const typedDefaultMatch = s.match(/^(\w+)\s*:\s*(.+?)\s*=\s*(.+)$/);
    if (typedDefaultMatch) {
      params.push({
        name: typedDefaultMatch[1]!,
        type: truncateType(simplifyType(typedDefaultMatch[2]!)),
        optional: true,
        defaultValue: typedDefaultMatch[3]!.trim(),
      });
      continue;
    }

    // name: Type
    const typedMatch = s.match(/^(\w+)\s*:\s*(.+)$/);
    if (typedMatch) {
      params.push({
        name: typedMatch[1]!,
        type: truncateType(simplifyType(typedMatch[2]!)),
      });
      continue;
    }

    // name = default
    const defaultMatch = s.match(/^(\w+)\s*=\s*(.+)$/);
    if (defaultMatch) {
      params.push({
        name: defaultMatch[1]!,
        type: 'unknown',
        optional: true,
        defaultValue: defaultMatch[2]!.trim(),
      });
      continue;
    }

    // bare name, or /, or *
    if (s === '/' || s === '*') continue;
    if (/^\w+$/.test(s)) {
      params.push({ name: s, type: 'unknown' });
    }
  }

  return params;
}

/**
 * Find the end of an indentation-based block.
 * Returns the last line index that belongs to the block.
 */
function findIndentBlockEnd(
  lines: readonly string[],
  startLine: number,
  blockIndent: number,
): number {
  let lastNonEmpty = startLine;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    const indent = getIndent(line);
    if (indent <= blockIndent) {
      // This line is at or before the block indentation, block has ended
      return lastNonEmpty;
    }

    lastNonEmpty = i;
  }

  return lastNonEmpty;
}

/**
 * Collect decorators preceding a line.
 */
function collectDecorators(lines: readonly string[], lineIdx: number): string[] {
  const decorators: string[] = [];
  let j = lineIdx - 1;

  while (j >= 0) {
    const prev = lines[j]!.trim();
    const decMatch = prev.match(/^@([\w.]+)/);
    if (decMatch) {
      decorators.unshift(decMatch[1]!);
      j--;
    } else if (!prev) {
      // Allow blank lines between decorators
      j--;
    } else {
      break;
    }
  }

  return decorators;
}

/**
 * Extract __all__ list from source for export detection.
 * Returns null if __all__ is not defined.
 */
function extractAllList(content: string): Set<string> | null {
  // Match __all__ = ["name1", "name2", ...] or __all__ = ('name1', 'name2')
  const match = content.match(/__all__\s*=\s*[\[({]([\s\S]*?)[\])}]/);
  if (!match) return null;

  const names = new Set<string>();
  const nameRegex = /['"](\w+)['"]/g;
  let m;
  while ((m = nameRegex.exec(match[1]!)) !== null) {
    names.add(m[1]!);
  }

  return names.size > 0 ? names : null;
}

/**
 * Determine if a Python name is exported.
 * If __all__ is defined, only names in __all__ are exported.
 * Otherwise, names not starting with _ are exported.
 */
function isPythonExported(name: string, allList: Set<string> | null): boolean {
  if (allList) {
    return allList.has(name);
  }
  return !name.startsWith('_');
}

/**
 * Extract class methods from lines within a class body.
 */
function extractClassMethods(
  lines: readonly string[],
  classStartLine: number,
  classEndLine: number,
  classIndent: number,
  allList: Set<string> | null,
): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  const methodIndent = classIndent + 4; // Expect methods indented one level deeper

  for (let i = classStartLine + 1; i <= classEndLine; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = getIndent(line);

    // Methods should be at exactly one indent level deeper than the class
    // (or at least deeper than the class level)
    if (indent < methodIndent) continue;

    // Match def method_name(params) -> ReturnType:
    const methodMatch = trimmed.match(
      /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(.+?))?\s*:/,
    );
    if (methodMatch) {
      const name = methodMatch[2]!;
      const paramsStr = methodMatch[3] ?? '';
      const returnType = methodMatch[4]
        ? truncateType(simplifyType(methodMatch[4].trim()))
        : 'void';
      const endLine = findIndentBlockEnd(lines, i, indent);
      const decorators = collectDecorators(lines, i);

      let scope: 'public' | 'protected' | 'private' = 'public';
      if (name.startsWith('__') && name.endsWith('__')) {
        scope = 'public'; // dunder methods are public
      } else if (name.startsWith('__')) {
        scope = 'private';
      } else if (name.startsWith('_')) {
        scope = 'protected';
      }

      const isStatic = decorators.includes('staticmethod');
      const isClassMethod = decorators.includes('classmethod');

      methods.push({
        name,
        params: parsePythonParams(paramsStr),
        returnType,
        exported: true, // Methods are accessible via the class
        async: !!methodMatch[1],
        static: isStatic || isClassMethod || undefined,
        scope,
        loc: endLine - i + 1,
        decorators: decorators.length > 0 ? decorators : undefined,
      });

      i = endLine;
    }
  }

  return methods;
}

/**
 * Extract class properties from the __init__ method or class body annotations.
 */
function extractClassProperties(
  lines: readonly string[],
  classStartLine: number,
  classEndLine: number,
  classIndent: number,
): PropertyInfo[] {
  const properties: PropertyInfo[] = [];
  const seen = new Set<string>();
  const bodyIndent = classIndent + 4;

  for (let i = classStartLine + 1; i <= classEndLine; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = getIndent(line);

    // Class-level type annotations: name: Type or name: Type = value / field(...)
    if (indent === bodyIndent) {
      const annotationMatch = trimmed.match(/^(\w+)\s*:\s*(.+?)(?:\s*=\s*(.+))?$/);
      if (annotationMatch && !trimmed.startsWith('def ') && !trimmed.startsWith('class ')) {
        const name = annotationMatch[1]!;
        const defaultPart = annotationMatch[3];
        const hasDefault = !!defaultPart;
        if (!seen.has(name)) {
          seen.add(name);
          properties.push({
            name,
            type: truncateType(simplifyType(annotationMatch[2]!)),
            optional: hasDefault || undefined,
          });
        }
      }
    }

    // self.name = ... inside __init__
    if (indent > bodyIndent) {
      const selfMatch = trimmed.match(/^self\.(\w+)\s*(?::\s*(.+?))?\s*=/);
      if (selfMatch) {
        const name = selfMatch[1]!;
        if (!seen.has(name)) {
          seen.add(name);
          properties.push({
            name,
            type: selfMatch[2] ? truncateType(simplifyType(selfMatch[2])) : 'unknown',
          });
        }
      }
    }
  }

  return properties;
}

/**
 * Parse Python source file.
 */
function parsePython(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'python');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];

  // Track class ranges so we can exclude nested functions inside class bodies
  const classRanges: { start: number; end: number }[] = [];

  // Use original content for __all__ detection because the comment stripper
  // removes string literals, which are the names in __all__.
  const allList = extractAllList(content);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    const indent = getIndent(line);

    // ─── Imports: import module ───────────────────────────
    const importMatch = trimmed.match(/^import\s+(\S+)(?:\s+as\s+(\w+))?/);
    if (importMatch && !trimmed.startsWith('import (')) {
      const from = importMatch[1]!;
      const alias = importMatch[2];
      imports.push({
        from,
        names: [alias ?? from],
        kind: from.startsWith('.') ? 'internal' : 'external',
      });
      continue;
    }

    // ─── Imports: from module import names ────────────────
    const fromImportMatch = trimmed.match(/^from\s+(\S+)\s+import\s+(.+)/);
    if (fromImportMatch) {
      const from = fromImportMatch[1]!;
      let namesStr = fromImportMatch[2]!;

      // Handle multi-line imports: from module import (
      if (namesStr.trim() === '(' || namesStr.includes('(')) {
        // Collect until closing paren
        if (!namesStr.includes(')')) {
          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j]!.trim();
            namesStr += ' ' + nextLine;
            if (nextLine.includes(')')) break;
            j++;
          }
          i = j;
        }
        namesStr = namesStr.replace(/[()]/g, '');
      }

      const names = namesStr
        .split(',')
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return (parts[parts.length - 1] ?? '').trim();
        })
        .filter((n) => n && n !== '');

      if (names.length > 0) {
        imports.push({
          from,
          names,
          kind: from.startsWith('.') ? 'internal' : 'external',
        });
      }
      continue;
    }

    // ─── Classes (top-level only, indent === 0) ───────────
    const classMatch = trimmed.match(
      /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/,
    );
    if (classMatch && indent === 0) {
      const name = classMatch[1]!;
      const basesStr = classMatch[2] ?? '';
      const endLine = findIndentBlockEnd(lines, i, indent);
      const decorators = collectDecorators(lines, i);

      // Parse base classes
      let extendsClass: string | undefined;
      const implementsList: string[] = [];

      if (basesStr.trim()) {
        const bases = basesStr.split(',').map((b) => b.trim()).filter(Boolean);
        for (const base of bases) {
          // Skip metaclass=..., keyword arguments
          if (base.includes('=')) continue;
          if (!extendsClass) {
            extendsClass = base;
          } else {
            implementsList.push(base);
          }
        }
      }

      const methods = extractClassMethods(lines, i, endLine, indent, allList);
      const properties = extractClassProperties(lines, i, endLine, indent);

      classes.push({
        name,
        extends: extendsClass,
        implements: implementsList.length > 0 ? implementsList : undefined,
        methods,
        properties,
        exported: isPythonExported(name, allList),
        abstract: decorators.includes('abstractmethod') ||
          (basesStr.includes('ABC') || basesStr.includes('ABCMeta')) || undefined,
        decorators: decorators.length > 0 ? decorators : undefined,
        loc: endLine - i + 1,
      });

      classRanges.push({ start: i, end: endLine });
      i = endLine;
      continue;
    }

    // ─── Functions (any indent, but not inside a class body) ─────────
    const funcMatch = trimmed.match(
      /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(.+?))?\s*:/,
    );
    if (funcMatch) {
      // Check if this line is inside a class body
      const insideClass = classRanges.some((r) => i > r.start && i <= r.end);
      if (!insideClass) {
        const name = funcMatch[2]!;
        const paramsStr = funcMatch[3] ?? '';
        const returnType = funcMatch[4]
          ? truncateType(simplifyType(funcMatch[4].trim()))
          : 'void';
        const endLine = findIndentBlockEnd(lines, i, indent);
        const decorators = collectDecorators(lines, i);

        functions.push({
          name,
          params: parsePythonParams(paramsStr),
          returnType,
          exported: indent === 0 ? isPythonExported(name, allList) : false,
          async: !!funcMatch[1],
          loc: endLine - i + 1,
          decorators: decorators.length > 0 ? decorators : undefined,
        });

        i = endLine;
        continue;
      }
    }
  }

  return {
    path: filePath,
    language: 'python',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'python'),
    imports,
    exports: [],
    functions,
    classes,
    interfaces: [],
    types: [],
    enums: [],
    constants: [],
  };
}

// ─── Plugin Factory ──────────────────────────────────────────────

const pythonParser: LanguageParser = {
  name: 'python',
  extensions: ['.py'],
  parse: parsePython,
};

/**
 * Create the Python language parser plugin.
 */
export function createPythonParserPlugin(): CodemapPlugin {
  return {
    name: 'python-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(pythonParser);
    },
  };
}
