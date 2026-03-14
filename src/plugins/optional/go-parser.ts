/**
 * Go language regex/heuristic parser.
 *
 * Extracts structural information from Go files including:
 * functions, methods, structs, interfaces, packages, and imports.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  InterfaceInfo,
  ImportInfo,
  ConstantInfo,
  ParamInfo,
  PropertyInfo,
  StructInfo,
  PackageInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

/**
 * Check whether a Go identifier is exported (starts with uppercase letter).
 */
function isExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Parse Go parameters string into ParamInfo array.
 * Handles: (a int, b string), (a, b int), (a int, b ...string)
 */
function parseGoParams(paramsStr: string): ParamInfo[] {
  const trimmed = paramsStr.trim();
  if (!trimmed) return [];

  const params: ParamInfo[] = [];
  // Split by comma, but respect nested parens/brackets
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

  // Go allows grouped params: (a, b int) means both are int
  // Process in reverse to propagate types backwards
  let lastType = 'unknown';
  const parsed: { name: string; type: string }[] = [];

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!.trim();
    if (!seg) continue;

    // Check for variadic: ...Type
    const variadicMatch = seg.match(/^(\w+)\s+\.\.\.(.+)$/);
    if (variadicMatch) {
      lastType = '...' + variadicMatch[2]!.trim();
      parsed.unshift({ name: variadicMatch[1]!, type: lastType });
      continue;
    }

    // name type
    const namedMatch = seg.match(/^(\w+)\s+(.+)$/);
    if (namedMatch) {
      lastType = namedMatch[2]!.trim();
      parsed.unshift({ name: namedMatch[1]!, type: lastType });
      continue;
    }

    // Might be just a name (type comes from the next param to the right)
    // or just a type (for return values)
    if (/^\w+$/.test(seg)) {
      // Could be a grouped param name sharing the type with the next one
      parsed.unshift({ name: seg, type: lastType });
    } else {
      // Likely a type-only param (unnamed)
      parsed.unshift({ name: '', type: seg });
    }
  }

  for (const p of parsed) {
    params.push({
      name: p.name,
      type: truncateType(simplifyType(p.type)),
    });
  }

  return params;
}

/**
 * Parse Go return type string.
 * Handles: int, (int, error), (result int, err error)
 */
function parseGoReturnType(returnStr: string): string {
  const trimmed = returnStr.trim();
  if (!trimmed) return 'void';

  // Remove opening brace if present at end
  const cleaned = trimmed.replace(/\s*\{?\s*$/, '').trim();
  if (!cleaned) return 'void';

  return truncateType(simplifyType(cleaned));
}

/**
 * Extract fields from a struct body.
 */
function extractStructFields(bodyLines: readonly string[]): {
  fields: PropertyInfo[];
  embeds: string[];
} {
  const fields: PropertyInfo[] = [];
  const embeds: string[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}') continue;

    // Embedded type: just a type name (possibly with *)
    const embedMatch = trimmed.match(/^(\*?\w+(?:\.\w+)?)\s*(?:$|\/\/|\/\*)/);
    // Field: name type `tags`
    const fieldMatch = trimmed.match(/^(\w+)\s+(.+?)(?:\s+`[^`]*`)?\s*(?:$|\/\/|\/\*)/);

    if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
      const name = fieldMatch[1];
      const typeStr = fieldMatch[2].trim().replace(/\s+`[^`]*`$/, '').trim();

      // If it's a single word with no space, it might be an embed
      if (!typeStr || typeStr === name) {
        embeds.push(name);
      } else {
        fields.push({
          name,
          type: truncateType(simplifyType(typeStr)),
          readonly: false,
        });
      }
    } else if (embedMatch && embedMatch[1]) {
      embeds.push(embedMatch[1]);
    }
  }

  return { fields, embeds };
}

/**
 * Extract method signatures from an interface body.
 */
function extractInterfaceMethods(bodyLines: readonly string[]): {
  methods: FunctionInfo[];
  embeds: string[];
} {
  const methods: FunctionInfo[] = [];
  const embeds: string[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}') continue;

    // Method: MethodName(params) ReturnType
    const methodMatch = trimmed.match(/^(\w+)\s*\(([^)]*)\)\s*(.*)/);
    if (methodMatch) {
      const name = methodMatch[1]!;
      const paramsStr = methodMatch[2] ?? '';
      const returnStr = methodMatch[3] ?? '';

      methods.push({
        name,
        params: parseGoParams(paramsStr),
        returnType: parseGoReturnType(returnStr),
        exported: isExported(name),
        loc: 1,
      });
      continue;
    }

    // Embedded interface: just a name
    const embedMatch = trimmed.match(/^(\w+(?:\.\w+)?)\s*$/);
    if (embedMatch) {
      embeds.push(embedMatch[1]!);
    }
  }

  return { methods, embeds };
}

/**
 * Parse Go source file.
 */
function parseGo(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'go');
  const lines = stripped.split('\n');
  const rawLines = content.split('\n');

  const functions: FunctionInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const structs: StructInfo[] = [];
  const imports: ImportInfo[] = [];
  const constants: ConstantInfo[] = [];
  const packages: PackageInfo[] = [];

  // Track methods by receiver type to attach to structs later
  const methodsByReceiver: Record<string, FunctionInfo[]> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // ─── Package declaration ──────────────────────────────
    const pkgMatch = trimmed.match(/^package\s+(\w+)/);
    if (pkgMatch) {
      packages.push({
        name: pkgMatch[1]!,
        path: filePath,
      });
      continue;
    }

    // ─── Single import ────────────────────────────────────
    // Use raw lines for imports because the comment stripper removes string literals
    const rawTrimmed = rawLines[i]!.trim();
    const singleImportMatch = rawTrimmed.match(/^import\s+"([^"]+)"/);
    if (singleImportMatch) {
      const from = singleImportMatch[1]!;
      const parts = from.split('/');
      const name = parts[parts.length - 1]!;
      imports.push({
        from,
        names: [name],
        kind: from.includes('.') ? 'external' : 'internal',
      });
      continue;
    }

    // ─── Grouped imports ──────────────────────────────────
    const groupImportMatch = trimmed.match(/^import\s*\(/);
    if (groupImportMatch) {
      let j = i + 1;
      while (j < lines.length) {
        // Use raw lines for grouped imports too
        const importLine = rawLines[j]!.trim();
        if (importLine === ')') break;

        // Handle aliased imports: alias "pkg/path"
        const aliasedMatch = importLine.match(/^(\w+)\s+"([^"]+)"/);
        const plainMatch = importLine.match(/^"([^"]+)"/);

        if (aliasedMatch) {
          const from = aliasedMatch[2]!;
          imports.push({
            from,
            names: [aliasedMatch[1]!],
            kind: from.includes('.') ? 'external' : 'internal',
          });
        } else if (plainMatch) {
          const from = plainMatch[1]!;
          const parts = from.split('/');
          const name = parts[parts.length - 1]!;
          imports.push({
            from,
            names: [name],
            kind: from.includes('.') ? 'external' : 'internal',
          });
        }

        j++;
      }
      i = j;
      continue;
    }

    // ─── Single const ────────────────────────────────────
    const singleConstMatch = trimmed.match(/^const\s+(\w+)(?:\s+\w+)?\s*=/);
    if (singleConstMatch) {
      constants.push({
        name: singleConstMatch[1]!,
        type: 'unknown',
        exported: isExported(singleConstMatch[1]!),
      });
      continue;
    }

    // ─── Grouped const block ───────────────────────────────
    const groupConstMatch = trimmed.match(/^const\s*\(/);
    if (groupConstMatch) {
      let j = i + 1;
      while (j < lines.length) {
        const constLine = lines[j]!.trim();
        if (constLine === ')') break;

        const constEntryMatch = constLine.match(/^(\w+)(?:\s+\w+)?\s*=/);
        if (constEntryMatch) {
          constants.push({
            name: constEntryMatch[1]!,
            type: 'unknown',
            exported: isExported(constEntryMatch[1]!),
          });
        }

        j++;
      }
      i = j;
      continue;
    }

    // ─── Struct type ──────────────────────────────────────
    const structMatch = trimmed.match(/^type\s+(\w+)(?:\[.*?\])?\s+struct\s*\{/);
    if (structMatch) {
      const name = structMatch[1]!;
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const { fields, embeds } = extractStructFields(bodyLines);

      structs.push({
        name,
        fields,
        methods: [], // Will be populated after all methods are collected
        exported: isExported(name),
        embeds: embeds.length > 0 ? embeds : undefined,
      });
      i = endLine;
      continue;
    }

    // ─── Interface type ───────────────────────────────────
    const ifaceMatch = trimmed.match(/^type\s+(\w+)(?:\[.*?\])?\s+interface\s*\{/);
    if (ifaceMatch) {
      const name = ifaceMatch[1]!;
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const { methods, embeds } = extractInterfaceMethods(bodyLines);

      interfaces.push({
        name,
        properties: [],
        methods,
        exported: isExported(name),
        extends: embeds.length > 0 ? embeds : undefined,
      });
      i = endLine;
      continue;
    }

    // ─── Methods (func with receiver) ─────────────────────
    const methodMatch = trimmed.match(
      /^func\s+\(\s*(\w+)\s+(\*?\w+(?:\[.*?\])?)\s*\)\s+(\w+)\s*\(([^)]*)\)\s*(.*)/,
    );
    if (methodMatch) {
      const receiverType = methodMatch[2]!.replace(/^\*/, '').replace(/\[.*?\]$/, '');
      const name = methodMatch[3]!;
      const paramsStr = methodMatch[4] ?? '';
      const returnStr = methodMatch[5] ?? '';
      const endLine = findBlockEnd(lines, i);

      const funcInfo: FunctionInfo = {
        name,
        params: parseGoParams(paramsStr),
        returnType: parseGoReturnType(returnStr),
        exported: isExported(name),
        loc: endLine - i + 1,
      };

      if (!methodsByReceiver[receiverType]) {
        methodsByReceiver[receiverType] = [];
      }
      methodsByReceiver[receiverType]!.push(funcInfo);
      i = endLine;
      continue;
    }

    // ─── Functions ────────────────────────────────────────
    const funcMatch = trimmed.match(
      /^func\s+(\w+)(?:\[.*?\])?\s*\(([^)]*)\)\s*(.*)/,
    );
    if (funcMatch) {
      const name = funcMatch[1]!;
      const paramsStr = funcMatch[2] ?? '';
      const returnStr = funcMatch[3] ?? '';
      const endLine = findBlockEnd(lines, i);

      functions.push({
        name,
        params: parseGoParams(paramsStr),
        returnType: parseGoReturnType(returnStr),
        exported: isExported(name),
        loc: endLine - i + 1,
      });
      i = endLine;
      continue;
    }
  }

  // Attach methods to their receiver structs
  for (const struct of structs) {
    const receiverMethods = methodsByReceiver[struct.name];
    if (receiverMethods && receiverMethods.length > 0) {
      // Replace the struct with one that includes methods
      const idx = structs.indexOf(struct);
      structs[idx] = {
        ...struct,
        methods: receiverMethods,
      };
    }
  }

  // Methods that don't belong to any struct go as standalone functions
  for (const [receiverType, methods] of Object.entries(methodsByReceiver)) {
    const hasStruct = structs.some((s) => s.name === receiverType);
    if (!hasStruct) {
      for (const method of methods) {
        functions.push(method);
      }
    }
  }

  return {
    path: filePath,
    language: 'go',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'go'),
    imports,
    exports: [],
    functions,
    classes: [],
    interfaces,
    types: [],
    enums: [],
    constants,
    structs: structs.length > 0 ? structs : undefined,
    packages: packages.length > 0 ? packages : undefined,
  };
}

// ─── Plugin Factory ──────────────────────────────────────────────

const goParser: LanguageParser = {
  name: 'go',
  extensions: ['.go'],
  parse: parseGo,
};

/**
 * Create the Go language parser plugin.
 */
export function createGoParserPlugin(): CodemapPlugin {
  return {
    name: 'go-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(goParser);
    },
  };
}
