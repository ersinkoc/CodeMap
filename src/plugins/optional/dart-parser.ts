/**
 * Dart language regex/heuristic parser.
 *
 * Extracts structural information from Dart files including:
 * classes, mixins, extensions, enums, typedefs, functions,
 * imports, exports, constants, and decorators.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ExportInfo,
  EnumInfo,
  ConstantInfo,
  TypeInfo,
  ParamInfo,
  PropertyInfo,
  TraitInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Visibility Helpers ───────────────────────────────────────────

/**
 * Dart visibility: names starting with _ are private, everything else is public.
 */
function isDartExported(name: string): boolean {
  return !name.startsWith('_');
}

/**
 * Get scope for a Dart name.
 */
function getDartScope(name: string): 'public' | 'private' {
  return name.startsWith('_') ? 'private' : 'public';
}

// ─── Parameter Parsing ──────────────────────────────────────────

/**
 * Parse Dart function parameters.
 * Handles: (Type name, {required Type name, Type name = default}), [Type name]
 */
function parseDartParams(paramsStr: string): ParamInfo[] {
  let trimmed = paramsStr.trim();
  if (!trimmed) return [];

  // Dart uses {named params} and [optional positional params] at the top level.
  // Flatten them by replacing the outermost {} and [] so commas are at depth 0.
  trimmed = trimmed.replace(/^\{/, '').replace(/\}$/, '');
  trimmed = trimmed.replace(/^\[/, '').replace(/\]$/, '');

  // Also handle mixed: (Type positional, {Type named}) — flatten embedded { } / [ ]
  // by replacing them while preserving their content.
  trimmed = trimmed.replace(/\{([^}]*)\}/, '$1');
  trimmed = trimmed.replace(/\[([^\]]*)\]/, '$1');
  trimmed = trimmed.trim();
  if (!trimmed) return [];

  const params: ParamInfo[] = [];
  let depth = 0;
  let current = '';
  const segments: string[] = [];

  for (const ch of trimmed) {
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') depth--;

    if (ch === ',' && depth === 0) {
      segments.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) segments.push(current.trim());

  for (const seg of segments) {
    let s = seg.trim();
    if (!s) continue;

    // Remove enclosing { } or [ ] from first/last segments
    s = s.replace(/^[{[\s]+/, '').replace(/[}\]\s]+$/, '').trim();
    if (!s) continue;

    // Remove `required` keyword
    const isRequired = s.startsWith('required ');
    if (isRequired) {
      s = s.replace(/^required\s+/, '');
    }

    // Remove `this.` prefix (constructor params)
    const isThis = s.includes('this.');
    s = s.replace(/this\./, '');

    // Remove `super.` prefix
    s = s.replace(/super\./, '');

    // Handle default values: Type name = value or name = value
    const defaultMatch = s.match(/^(.+?)\s*=\s*(.+)$/);
    let nameTypePart = defaultMatch ? defaultMatch[1]!.trim() : s;
    const defaultValue = defaultMatch ? defaultMatch[2]!.trim() : undefined;

    // Parse Type name or just name
    const param = parseOneDartParam(nameTypePart, defaultValue, !isRequired && (!!defaultValue || !isRequired && seg.includes('[')));
    if (param) {
      params.push(param);
    }
  }

  return params;
}

/**
 * Parse a single Dart parameter.
 */
function parseOneDartParam(raw: string, defaultValue: string | undefined, isOptional: boolean): ParamInfo | null {
  if (!raw) return null;

  // Function type param: void Function(int) name
  const funcMatch = raw.match(/^(.+\bFunction\b[^)]*\))\s+(\w+)$/);
  if (funcMatch) {
    return {
      name: funcMatch[2]!,
      type: truncateType(simplifyType(funcMatch[1]!)),
      optional: isOptional || undefined,
      defaultValue,
    };
  }

  // Type name
  const typedMatch = raw.match(/^([\w<>,.\s?]+)\s+(\w+)$/);
  if (typedMatch) {
    return {
      name: typedMatch[2]!,
      type: truncateType(simplifyType(typedMatch[1]!)),
      optional: isOptional || undefined,
      defaultValue,
    };
  }

  // Just a name (no type annotation)
  if (/^\w+$/.test(raw)) {
    return {
      name: raw,
      type: 'dynamic',
      optional: isOptional || undefined,
      defaultValue,
    };
  }

  return null;
}

// ─── Class Body Extraction ────────────────────────────────────────

/**
 * Extract methods and properties from a class/mixin/extension body.
 */
function extractClassMembers(
  bodyLines: readonly string[],
  className: string,
): { methods: FunctionInfo[]; properties: PropertyInfo[] } {
  const methods: FunctionInfo[] = [];
  const properties: PropertyInfo[] = [];
  let pendingDecorators: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // ─── Decorators/annotations ────────────────────────
    const annoMatch = trimmed.match(/^@(\w+)/);
    if (annoMatch && !trimmed.match(/^@\w+.*\b(class|mixin|enum)\b/)) {
      if (/^@\w+(\s*\(.*\))?\s*$/.test(trimmed)) {
        pendingDecorators.push(annoMatch[1]!);
        continue;
      }
    }

    // ─── Factory constructor ───────────────────────────
    const factoryMatch = trimmed.match(
      /^factory\s+(\w+)(?:\.(\w+))?\s*\(/,
    );
    if (factoryMatch) {
      const name = factoryMatch[2]
        ? `${factoryMatch[1]!}.${factoryMatch[2]}`
        : factoryMatch[1]!;
      const endLine = trimmed.includes(';') ? i : findBlockEnd(bodyLines as string[], i);
      const fullSig = collectDartSignature(bodyLines, i);
      const params = parseDartParams(extractParenContent(fullSig));
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      methods.push({
        name,
        params,
        returnType: className,
        exported: isDartExported(name),
        loc: endLine - i + 1,
        decorators,
      });
      if (!trimmed.includes(';')) {
        i = endLine;
      }
      continue;
    }

    // ─── Named constructor: ClassName.name(...) ─────────
    const namedCtorMatch = trimmed.match(
      new RegExp(`^${className}\\.(\\w+)\\s*\\(`),
    );
    if (namedCtorMatch) {
      const name = `${className}.${namedCtorMatch[1]!}`;
      const endLine = trimmed.includes(';') ? i : findBlockEnd(bodyLines as string[], i);
      const fullSig = collectDartSignature(bodyLines, i);
      const params = parseDartParams(extractParenContent(fullSig));
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      methods.push({
        name,
        params,
        returnType: className,
        exported: isDartExported(namedCtorMatch[1]!),
        loc: endLine - i + 1,
        decorators,
      });
      if (!trimmed.includes(';')) {
        i = endLine;
      }
      continue;
    }

    // ─── Default constructor: ClassName(...) ──────────────
    const ctorMatch = trimmed.match(
      new RegExp(`^${className}\\s*\\(`),
    );
    if (ctorMatch) {
      const endLine = trimmed.includes(';') ? i : findBlockEnd(bodyLines as string[], i);
      const fullSig = collectDartSignature(bodyLines, i);
      const params = parseDartParams(extractParenContent(fullSig));
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      methods.push({
        name: className,
        params,
        returnType: '',
        exported: isDartExported(className),
        loc: endLine - i + 1,
        decorators,
      });
      if (!trimmed.includes(';')) {
        i = endLine;
      }
      continue;
    }

    // ─── Getter/setter (must be checked before methods) ──
    const getterMatch = trimmed.match(
      /^(static\s+)?(?:[\w<>?,\s]+\s+)?get\s+(\w+)/,
    );
    if (getterMatch) {
      const name = getterMatch[2]!;
      const endLine = trimmed.includes(';') ? i : findBlockEnd(bodyLines as string[], i);
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      properties.push({
        name,
        type: 'unknown',
        readonly: true,
        static: !!getterMatch[1] || undefined,
        scope: getDartScope(name),
      });
      if (!trimmed.includes(';')) {
        i = endLine;
      }
      continue;
    }

    const setterMatch = trimmed.match(
      /^(static\s+)?set\s+(\w+)\s*\(/,
    );
    if (setterMatch) {
      const name = setterMatch[2]!;
      const endLine = trimmed.includes(';') ? i : findBlockEnd(bodyLines as string[], i);
      pendingDecorators = [];

      // Only add if not already added by a getter
      if (!properties.some((p) => p.name === name)) {
        properties.push({
          name,
          type: 'unknown',
          static: !!setterMatch[1] || undefined,
          scope: getDartScope(name),
        });
      }
      if (!trimmed.includes(';')) {
        i = endLine;
      }
      continue;
    }

    // ─── Methods (static/instance) ─────────────────────
    const methodMatch = trimmed.match(
      /^(static\s+)?(?:Future<[^>]*>\s+|Stream<[^>]*>\s+|void\s+|[\w<>?,\s]+\s+)(\w+)\s*\(/,
    );
    if (methodMatch && !trimmed.startsWith('final ') && !trimmed.startsWith('const ') && !trimmed.startsWith('var ') && !trimmed.startsWith('late ')) {
      const isStatic = !!methodMatch[1];
      const name = methodMatch[2]!;

      // Skip if it looks like a field initialization, not a method
      if (name === className) {
        // Constructor handled above
        pendingDecorators = [];
        continue;
      }

      const endLine = trimmed.includes(';') ? i : findBlockEnd(bodyLines as string[], i);
      const fullSig = collectDartSignature(bodyLines, i);
      const params = parseDartParams(extractParenContent(fullSig));
      const returnType = extractDartReturnType(trimmed, isStatic);
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      methods.push({
        name,
        params,
        returnType,
        exported: isDartExported(name),
        async: trimmed.includes('async') || returnType.startsWith('Future') || undefined,
        static: isStatic || undefined,
        scope: getDartScope(name),
        loc: endLine - i + 1,
        decorators,
      });
      if (!trimmed.includes(';') || trimmed.includes('{')) {
        i = endLine;
      }
      continue;
    }

    // ─── Field declarations ────────────────────────────
    const fieldMatch = trimmed.match(
      /^(static\s+)?(final\s+|const\s+|late\s+(?:final\s+)?|var\s+)?([\w<>?,\s]+?)\s+(\w+)\s*(?:=\s*.+?)?\s*;$/,
    );
    if (fieldMatch) {
      const isStatic = !!fieldMatch[1];
      const modifier = fieldMatch[2]?.trim() ?? '';
      const type = fieldMatch[3]!.trim();
      const name = fieldMatch[4]!;
      const isReadonly = modifier.includes('final') || modifier === 'const';

      // Skip if the type looks like a control keyword
      if (type === 'return' || type === 'if' || type === 'for' || type === 'while') {
        pendingDecorators = [];
        continue;
      }

      properties.push({
        name,
        type: truncateType(simplifyType(type)),
        readonly: isReadonly || undefined,
        static: isStatic || undefined,
        scope: getDartScope(name),
      });
      pendingDecorators = [];
      continue;
    }

    // Reset pending decorators if nothing matched
    pendingDecorators = [];
  }

  return { methods, properties };
}

// ─── Enum Member Extraction ───────────────────────────────────────

/**
 * Extract enum member names from an enum body.
 */
function extractDartEnumMembers(bodyLines: readonly string[]): string[] {
  const members: string[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '}') continue;

    // Stop at semicolon (marks end of enum values, start of members)
    if (trimmed === ';') break;

    // Match enum value name (possibly with arguments)
    const memberMatch = trimmed.match(/^(\w+)\s*(?:\(.*?\))?\s*[,;]?\s*$/);
    if (memberMatch) {
      // Skip if it looks like a method or constructor declaration
      if (trimmed.includes('(') && trimmed.includes(')') && trimmed.includes('{')) break;
      members.push(memberMatch[1]!);
    }
  }

  return members;
}

// ─── Signature Collection ─────────────────────────────────────────

/**
 * Collect a function signature across multiple lines.
 */
function collectDartSignature(lines: readonly string[], startLine: number): string {
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
          return sig;
        }
      }
    }

    if ((line.includes('{') || line.includes(';')) && foundOpen) {
      return sig;
    }
  }

  return sig;
}

/**
 * Extract content between the first pair of parentheses in a signature.
 */
function extractParenContent(signature: string): string {
  const openIdx = signature.indexOf('(');
  if (openIdx === -1) return '';

  let depth = 0;
  for (let i = openIdx; i < signature.length; i++) {
    if (signature[i] === '(') depth++;
    else if (signature[i] === ')') {
      depth--;
      if (depth === 0) {
        return signature.slice(openIdx + 1, i);
      }
    }
  }

  return signature.slice(openIdx + 1);
}

/**
 * Extract the return type from a Dart method signature line.
 */
function extractDartReturnType(line: string, isStatic: boolean): string {
  let cleaned = line.trim();
  if (isStatic) cleaned = cleaned.replace(/^static\s+/, '');

  // Future<Type>
  const futureMatch = cleaned.match(/^(Future<.+?>)\s+\w+\s*\(/);
  if (futureMatch) return truncateType(simplifyType(futureMatch[1]!));

  // Stream<Type>
  const streamMatch = cleaned.match(/^(Stream<.+?>)\s+\w+\s*\(/);
  if (streamMatch) return truncateType(simplifyType(streamMatch[1]!));

  // void
  if (cleaned.startsWith('void ')) return 'void';

  // Type name(
  const typeMatch = cleaned.match(/^([\w<>?,\s]+?)\s+\w+\s*\(/);
  return typeMatch ? truncateType(simplifyType(typeMatch[1]!)) : 'void';
}

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse Dart source file.
 */
function parseDart(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'dart');
  const lines = stripped.split('\n');
  const rawLines = content.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const traits: TraitInfo[] = [];
  const enums: EnumInfo[] = [];
  const types: TypeInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const constants: ConstantInfo[] = [];

  let pendingDecorators: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // ─── Annotations ──────────────────────────────────
    const annoMatch = trimmed.match(/^@(\w+)/);
    if (annoMatch && !trimmed.match(/^@\w+.*\b(class|mixin|enum|extension)\b/)) {
      if (/^@\w+(\s*\(.*\))?\s*$/.test(trimmed)) {
        pendingDecorators.push(annoMatch[1]!);
        continue;
      }
    }

    // ─── Imports ──────────────────────────────────────
    const rawTrimmed = rawLines[i]!.trim();
    const importMatch = rawTrimmed.match(/^import\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const from = importMatch[1]!;
      const isPackage = from.startsWith('package:');
      const isDart = from.startsWith('dart:');

      // Extract 'show'/'hide' names
      const showMatch = rawTrimmed.match(/\bshow\s+(.+?)(?:\bhide\b|;|$)/);
      const names = showMatch
        ? showMatch[1]!.split(',').map((n) => n.trim()).filter(Boolean)
        : [from.split('/').pop()?.replace('.dart', '') ?? from];

      imports.push({
        from,
        names,
        kind: isDart || isPackage ? 'external' : 'internal',
      });
      pendingDecorators = [];
      continue;
    }

    // ─── Exports ──────────────────────────────────────
    const exportMatch = rawTrimmed.match(/^export\s+['"]([^'"]+)['"]/);
    if (exportMatch) {
      const from = exportMatch[1]!;
      exports.push({
        from,
        names: [from.split('/').pop()?.replace('.dart', '') ?? from],
        isReExport: true,
      });
      pendingDecorators = [];
      continue;
    }

    // ─── Typedef ──────────────────────────────────────
    const typedefMatch = trimmed.match(/^typedef\s+(\w+)/);
    if (typedefMatch) {
      const name = typedefMatch[1]!;
      // Extract the full type definition
      const defMatch = trimmed.match(/^typedef\s+\w+(?:<[^>]*>)?\s*=\s*(.+?)\s*;$/);
      const typeStr = defMatch ? defMatch[1]! : 'unknown';

      types.push({
        name,
        type: truncateType(simplifyType(typeStr)),
        exported: isDartExported(name),
      });
      pendingDecorators = [];
      continue;
    }

    // ─── Enum ─────────────────────────────────────────
    const enumMatch = trimmed.match(/^enum\s+(\w+)/);
    if (enumMatch) {
      const name = enumMatch[1]!;
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const members = extractDartEnumMembers(bodyLines);

      enums.push({
        name,
        members,
        exported: isDartExported(name),
      });
      pendingDecorators = [];
      i = endLine;
      continue;
    }

    // ─── Mixin ────────────────────────────────────────
    const mixinMatch = trimmed.match(/^mixin\s+(\w+)(?:\s+on\s+(.+?))?\s*\{/);
    if (mixinMatch) {
      const name = mixinMatch[1]!;
      const onStr = mixinMatch[2];
      const superTraits = onStr
        ? onStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const { methods } = extractClassMembers(bodyLines, name);

      traits.push({
        name,
        methods,
        exported: isDartExported(name),
        superTraits,
      });
      pendingDecorators = [];
      i = endLine;
      continue;
    }

    // ─── Extension ────────────────────────────────────
    const extensionMatch = trimmed.match(/^extension\s+(?:(\w+)\s+)?on\s+(.+?)\s*\{/);
    if (extensionMatch) {
      const name = extensionMatch[1] ?? '_anonymous';
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const { methods, properties } = extractClassMembers(bodyLines, name);

      classes.push({
        name,
        extends: extensionMatch[2]!.trim(),
        methods,
        properties,
        exported: isDartExported(name),
        loc: endLine - i + 1,
      });
      pendingDecorators = [];
      i = endLine;
      continue;
    }

    // ─── Classes (abstract, sealed, base, final, interface) ─
    const classMatch = trimmed.match(
      /^(abstract\s+|sealed\s+)?(base\s+|final\s+|interface\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w<>.]+))?(?:\s+with\s+(.+?))?(?:\s+implements\s+(.+?))?\s*\{/,
    );
    if (classMatch) {
      const isAbstract = !!classMatch[1]?.includes('abstract');
      const name = classMatch[3]!;
      const extendsName = classMatch[4]?.trim().split('<')[0];
      const withStr = classMatch[5];
      const implementsStr = classMatch[6];

      const withArr = withStr
        ? withStr.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const implementsArr = implementsStr
        ? implementsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const allImplements = [...withArr, ...implementsArr];

      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const { methods, properties } = extractClassMembers(bodyLines, name);
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      classes.push({
        name,
        extends: extendsName,
        implements: allImplements.length > 0 ? allImplements : undefined,
        methods,
        properties,
        exported: isDartExported(name),
        abstract: isAbstract || undefined,
        decorators,
        loc: endLine - i + 1,
      });
      i = endLine;
      continue;
    }

    // ─── Top-level constants ──────────────────────────
    const constFieldMatch = trimmed.match(
      /^(final|const|var|late\s+final|late)\s+(?:([\w<>?,\s]+)\s+)?(\w+)\s*=\s*.+;\s*$/,
    );
    if (constFieldMatch) {
      const modifier = constFieldMatch[1]!;
      const type = constFieldMatch[2] ?? 'dynamic';
      const name = constFieldMatch[3]!;

      if (modifier === 'const' || modifier === 'final') {
        constants.push({
          name,
          type: truncateType(simplifyType(type)),
          exported: isDartExported(name),
        });
      }
      pendingDecorators = [];
      continue;
    }

    // ─── Top-level functions ──────────────────────────
    const funcMatch = trimmed.match(
      /^(?:Future<[^>]*>\s+|Stream<[^>]*>\s+|void\s+|[\w<>?,\s]+\s+)(\w+)\s*\(/,
    );
    if (funcMatch) {
      const name = funcMatch[1]!;
      const endLine = trimmed.includes(';') && !trimmed.includes('{') ? i : findBlockEnd(lines, i);
      const fullSig = collectDartSignature(lines, i);
      const params = parseDartParams(extractParenContent(fullSig));
      const returnType = extractDartReturnType(trimmed, false);
      const decorators = pendingDecorators.length > 0 ? [...pendingDecorators] : undefined;
      pendingDecorators = [];

      functions.push({
        name,
        params,
        returnType,
        exported: isDartExported(name),
        async: trimmed.includes('async') || returnType.startsWith('Future') || undefined,
        loc: endLine - i + 1,
        decorators,
      });
      if (!trimmed.includes(';') || trimmed.includes('{')) {
        i = endLine;
      }
      continue;
    }

    // Reset annotations if nothing matched
    pendingDecorators = [];
  }

  return {
    path: filePath,
    language: 'dart',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'dart'),
    imports,
    exports,
    functions,
    classes,
    interfaces: [],
    types,
    enums,
    constants,
    traits: traits.length > 0 ? traits : undefined,
  };
}

// ─── Plugin Factory ──────────────────────────────────────────────

const dartParser: LanguageParser = {
  name: 'dart',
  extensions: ['.dart'],
  parse: parseDart,
};

/**
 * Create the Dart language parser plugin.
 */
export function createDartParserPlugin(): CodemapPlugin {
  return {
    name: 'dart-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(dartParser);
    },
  };
}
