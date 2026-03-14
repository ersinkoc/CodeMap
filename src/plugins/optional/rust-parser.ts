/**
 * Rust regex/heuristic parser.
 *
 * Extracts structural information from Rust source files including:
 * functions, structs, enums, traits, impl blocks, modules,
 * use statements, and derive macros.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ImportInfo,
  ExportInfo,
  EnumInfo,
  ParamInfo,
  PropertyInfo,
  StructInfo,
  TraitInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse Rust source file.
 */
function parseRust(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'rust');
  const lines = stripped.split('\n');
  const rawLines = content.split('\n');

  const functions: FunctionInfo[] = [];
  const structs: StructInfo[] = [];
  const enums: EnumInfo[] = [];
  const traits: TraitInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // ─── Use statements ────────────────────────────────────
    const useMatch = trimmed.match(
      /^(pub\s+)?use\s+(.+?)\s*;\s*$/,
    );
    if (useMatch) {
      parseUseStatement(useMatch[2]!, !!useMatch[1], imports, exports);
      continue;
    }

    // ─── Modules ───────────────────────────────────────────
    const modMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?mod\s+(\w+)\s*;\s*$/,
    );
    if (modMatch) {
      const isPub = !!modMatch[1];
      imports.push({
        from: modMatch[2]!,
        names: [modMatch[2]!],
        kind: 'internal',
      });
      if (isPub) {
        exports.push({
          names: [modMatch[2]!],
          isReExport: false,
        });
      }
      continue;
    }

    // Inline module: mod name { ... }
    const inlineModMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?mod\s+(\w+)\s*\{/,
    );
    if (inlineModMatch) {
      const endLine = findBlockEnd(lines, i);
      if (inlineModMatch[1]) {
        exports.push({
          names: [inlineModMatch[2]!],
          isReExport: false,
        });
      }
      i = endLine;
      continue;
    }

    // ─── Derive macros (collect for next struct/enum) ──────
    // We look ahead from struct/enum parsers instead

    // ─── Structs ───────────────────────────────────────────
    const structMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?struct\s+(\w+)(?:<[^>]*>)?\s*(?:\{|;|\()/,
    );
    if (structMatch) {
      const derives = collectDerives(lines, i);
      const isPub = !!structMatch[1];
      const name = structMatch[2]!;

      if (trimmed.includes('{')) {
        const endLine = findBlockEnd(lines, i);
        const bodyLines = lines.slice(i + 1, endLine);
        const fields = extractStructFields(bodyLines);

        structs.push({
          name,
          fields,
          methods: [],
          exported: isPub,
          derives: derives.length > 0 ? derives : undefined,
        });
        i = endLine;
      } else {
        // Tuple struct or unit struct (e.g., `struct Foo;` or `struct Foo(u32);`)
        structs.push({
          name,
          fields: [],
          methods: [],
          exported: isPub,
          derives: derives.length > 0 ? derives : undefined,
        });
      }
      continue;
    }

    // ─── Enums ─────────────────────────────────────────────
    const enumMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?enum\s+(\w+)(?:<[^>]*>)?\s*\{/,
    );
    if (enumMatch) {
      const derives = collectDerives(lines, i);
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const members = extractEnumVariants(bodyLines);
      const isPub = !!enumMatch[1];

      enums.push({
        name: enumMatch[2]!,
        members,
        exported: isPub,
      });
      i = endLine;
      continue;
    }

    // ─── Traits ────────────────────────────────────────────
    const traitMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?(?:unsafe\s+)?trait\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*(.+?))?\s*\{/,
    );
    if (traitMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const methods = extractTraitMethods(bodyLines);
      const isPub = !!traitMatch[1];
      const superTraitsStr = traitMatch[3];
      const superTraits = superTraitsStr
        ? superTraitsStr.split('+').map((s) => s.trim()).filter(Boolean)
        : undefined;

      traits.push({
        name: traitMatch[2]!,
        methods,
        exported: isPub,
        superTraits,
      });
      i = endLine;
      continue;
    }

    // ─── Impl blocks ──────────────────────────────────────
    const implMatch = trimmed.match(
      /^(unsafe\s+)?impl(?:<[^>]*>)?\s+(?:(\w+(?:<[^>]*>)?)\s+for\s+)?(\w+)(?:<[^>]*>)?\s*\{/,
    );
    if (implMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const typeName = implMatch[3]!;
      const traitName = implMatch[2];
      const methods = extractImplMethods(bodyLines, typeName);

      // Attach methods to existing struct if found
      const existingStruct = structs.find((s) => s.name === typeName);
      if (existingStruct) {
        const combined = [...existingStruct.methods, ...methods];
        const idx = structs.indexOf(existingStruct);
        structs[idx] = { ...existingStruct, methods: combined };
      } else {
        // Standalone impl block — might be for an enum or a type we haven't seen
        // Store methods as functions with the type name prefix
        for (const method of methods) {
          const qualifiedName = traitName
            ? `<${typeName} as ${traitName}>::${method.name}`
            : `${typeName}::${method.name}`;
          functions.push({ ...method, name: qualifiedName });
        }
      }
      i = endLine;
      continue;
    }

    // ─── Free functions ────────────────────────────────────
    const fnMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?(const\s+)?(async\s+)?(unsafe\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(/,
    );
    if (fnMatch) {
      const endLine = findBlockEnd(lines, i);
      const fullSig = collectRustSignature(lines, i);
      const params = parseRustParams(fullSig);
      const returnType = extractRustReturnType(fullSig);
      const isPub = !!fnMatch[1];

      functions.push({
        name: fnMatch[5]!,
        params,
        returnType,
        exported: isPub,
        async: !!fnMatch[3],
        loc: endLine - i + 1,
      });
      i = endLine;
      continue;
    }
  }

  return {
    path: filePath,
    language: 'rust',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'rust'),
    imports,
    exports,
    functions,
    classes: [],
    interfaces: [],
    types: [],
    enums,
    constants: [],
    structs: structs.length > 0 ? structs : undefined,
    traits: traits.length > 0 ? traits : undefined,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────

/**
 * Parse a Rust `use` statement into import/export info.
 */
function parseUseStatement(
  path: string,
  isPub: boolean,
  imports: ImportInfo[],
  exports: ExportInfo[],
): void {
  // Determine the module path and imported names
  // e.g., "crate::module::Item" or "std::collections::HashMap"
  // e.g., "crate::module::{Item, OtherItem}"
  const braceMatch = path.match(/^(.+?)::\{(.+)\}$/);
  let from: string;
  let names: string[];

  if (braceMatch) {
    from = braceMatch[1]!;
    names = braceMatch[2]!
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        // Handle `Foo as Bar`
        const asMatch = n.match(/^(.+?)\s+as\s+(.+)$/);
        return asMatch ? asMatch[2]!.trim() : n;
      });
  } else {
    // Single item: use crate::module::Item
    const parts = path.split('::');
    const lastName = parts[parts.length - 1]!;
    // Handle `Foo as Bar`
    const asMatch = lastName.match(/^(.+?)\s+as\s+(.+)$/);
    const importedName = asMatch ? asMatch[2]!.trim() : lastName;
    from = parts.slice(0, -1).join('::');
    names = [importedName];
  }

  const isExternal = !from.startsWith('crate') && !from.startsWith('self') && !from.startsWith('super');

  imports.push({
    from: from || path,
    names,
    kind: isExternal ? 'external' : 'internal',
  });

  if (isPub) {
    exports.push({
      names,
      isReExport: true,
      from: from || path,
    });
  }
}

/**
 * Collect #[derive(...)] attributes from lines above the current line.
 */
function collectDerives(lines: readonly string[], lineIdx: number): string[] {
  const derives: string[] = [];
  let j = lineIdx - 1;

  while (j >= 0) {
    const prev = lines[j]!.trim();
    if (!prev || prev.startsWith('#[')) {
      const deriveMatch = prev.match(/#\[derive\((.+?)\)\]/);
      if (deriveMatch) {
        const items = deriveMatch[1]!
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        derives.unshift(...items);
      }
      // Continue looking for more attributes
      if (prev.startsWith('#[')) {
        j--;
        continue;
      }
    }
    if (!prev) {
      j--;
      continue;
    }
    break;
  }

  return derives;
}

/**
 * Extract fields from a struct body.
 */
function extractStructFields(bodyLines: readonly string[]): PropertyInfo[] {
  const fields: PropertyInfo[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '}') continue;

    const fieldMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?(\w+)\s*:\s*(.+?)\s*,?\s*$/,
    );
    if (fieldMatch) {
      const isPub = !!fieldMatch[1];
      fields.push({
        name: fieldMatch[2]!,
        type: truncateType(simplifyType(fieldMatch[3]!)),
        scope: isPub ? 'public' : 'private',
      });
    }
  }

  return fields;
}

/**
 * Extract enum variant names.
 */
function extractEnumVariants(bodyLines: readonly string[]): string[] {
  const variants: string[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '}') continue;

    // Match variant name (possibly with tuple/struct fields)
    const variantMatch = trimmed.match(/^(\w+)/);
    if (variantMatch) {
      variants.push(variantMatch[1]!);
    }
  }

  return variants;
}

/**
 * Extract method signatures from a trait body.
 */
function extractTraitMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();

    const fnMatch = trimmed.match(
      /^(async\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(/,
    );
    if (fnMatch) {
      const endLine = trimmed.includes(';')
        ? i
        : findBlockEnd(bodyLines as string[], i);
      const fullSig = collectRustSignature(bodyLines as string[], i);
      const params = parseRustParams(fullSig);
      const returnType = extractRustReturnType(fullSig);

      methods.push({
        name: fnMatch[2]!,
        params,
        returnType,
        exported: true,
        async: !!fnMatch[1],
        loc: endLine - i + 1,
      });
      i = endLine;
    }
  }

  return methods;
}

/**
 * Extract methods from an impl block body.
 */
function extractImplMethods(bodyLines: readonly string[], _typeName: string): FunctionInfo[] {
  const methods: FunctionInfo[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();

    const fnMatch = trimmed.match(
      /^(pub(?:\(crate\))?\s+)?(const\s+)?(async\s+)?(unsafe\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(/,
    );
    if (fnMatch) {
      const endLine = findBlockEnd(bodyLines as string[], i);
      const fullSig = collectRustSignature(bodyLines as string[], i);
      const params = parseRustParams(fullSig);
      const returnType = extractRustReturnType(fullSig);
      const isPub = !!fnMatch[1];

      methods.push({
        name: fnMatch[5]!,
        params,
        returnType,
        exported: isPub,
        async: !!fnMatch[3],
        scope: isPub ? 'public' : 'private',
        loc: endLine - i + 1,
      });
      i = endLine;
    }
  }

  return methods;
}

/**
 * Collect a function/method signature across multiple lines until we find
 * the opening brace or a semicolon (trait methods).
 */
function collectRustSignature(lines: readonly string[], startLine: number): string {
  let sig = '';
  let parenDepth = 0;
  let foundOpen = false;

  for (let i = startLine; i < lines.length && i < startLine + 15; i++) {
    const line = lines[i]!;
    sig += (sig ? ' ' : '') + line.trim();

    for (const ch of line) {
      if (ch === '(') {
        parenDepth++;
        foundOpen = true;
      } else if (ch === ')') {
        parenDepth--;
        if (foundOpen && parenDepth === 0) {
          // Collect return type after closing paren
          const rest = line.slice(line.lastIndexOf(')') + 1);
          if (rest.includes('{') || rest.includes(';')) {
            return sig;
          }
          // Return type may be on next line
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1]!.trim();
            sig += ' ' + nextLine;
          }
          return sig;
        }
      }
    }

  }

  return sig;
}

/**
 * Parse Rust function parameters from a signature string.
 */
function parseRustParams(signature: string): ParamInfo[] {
  const parenMatch = signature.match(/\(([^)]*)\)/);
  if (!parenMatch || !parenMatch[1]?.trim()) return [];

  const paramsStr = parenMatch[1];
  const params: ParamInfo[] = [];
  let depth = 0;
  let current = '';

  for (const ch of paramsStr) {
    if (ch === '<' || ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === '}' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      const p = parseOneRustParam(current.trim());
      if (p) params.push(p);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = parseOneRustParam(current.trim());
  if (last) params.push(last);

  return params;
}

/**
 * Parse a single Rust parameter: `name: Type` or `&self` / `&mut self` / `self`.
 */
function parseOneRustParam(raw: string): ParamInfo | null {
  if (!raw) return null;

  // Handle self variants
  if (/^&\s*mut\s+self$/.test(raw)) {
    return { name: '&mut self', type: 'Self' };
  }
  if (/^&\s*self$/.test(raw)) {
    return { name: '&self', type: 'Self' };
  }
  if (raw === 'self' || raw === 'mut self') {
    return { name: raw, type: 'Self' };
  }

  // name: Type
  const match = raw.match(/^(mut\s+)?(\w+)\s*:\s*(.+)$/);
  if (match) {
    return {
      name: match[2]!,
      type: truncateType(simplifyType(match[3]!)),
    };
  }

  return null;
}

/**
 * Extract return type from a Rust function signature.
 * Looks for `-> Type` after the closing parenthesis.
 */
function extractRustReturnType(signature: string): string {
  // Find closing paren
  let parenDepth = 0;
  let afterParen = -1;

  for (let i = 0; i < signature.length; i++) {
    if (signature[i] === '(') parenDepth++;
    else if (signature[i] === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        afterParen = i + 1;
        break;
      }
    }
  }

  if (afterParen === -1) return '()';

  const rest = signature.slice(afterParen).trim();
  const arrowMatch = rest.match(/^->\s*(.+?)(?:\s*\{|$|\s*where\b)/);
  if (arrowMatch) {
    return truncateType(simplifyType(arrowMatch[1]!.trim()));
  }

  return '()';
}

// ─── Plugin Factory ──────────────────────────────────────────────

const rustParser: LanguageParser = {
  name: 'rust',
  extensions: ['.rs'],
  parse: parseRust,
};

/**
 * Create the Rust parser plugin.
 */
export function createRustParserPlugin(): CodemapPlugin {
  return {
    name: 'rust-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(rustParser);
    },
  };
}
