/**
 * Java regex/heuristic parser.
 *
 * Extracts structural information from Java files including:
 * classes, interfaces, enums, records, methods, annotations,
 * packages, and imports.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  EnumInfo,
  ImportInfo,
  ExportInfo,
  ParamInfo,
  PropertyInfo,
  PackageInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Visibility Helpers ───────────────────────────────────────────

type JavaVisibility = 'public' | 'protected' | 'private';

function parseVisibility(raw: string | undefined): JavaVisibility | undefined {
  if (raw === 'public' || raw === 'protected' || raw === 'private') return raw;
  return undefined; // package-private
}

function isExported(vis: JavaVisibility | undefined): boolean {
  return vis === 'public';
}

// ─── Keyword Guards ───────────────────────────────────────────────

const CONTROL_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'try', 'catch', 'finally',
  'return', 'throw', 'new', 'super', 'this', 'import', 'package',
]);

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse a Java source file.
 */
function parseJava(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'java');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const enums: EnumInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const packages: PackageInfo[] = [];

  // Track pending annotations to attach to the next declaration
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines (but don't clear annotations — they can span blank lines)
    if (!trimmed) continue;

    // ─── Annotations ──────────────────────────────────────
    const annotationMatch = trimmed.match(/^@(\w+)/);
    if (annotationMatch && !trimmed.match(/^@\w+.*\b(class|interface|enum|record)\b/)) {
      pendingAnnotations.push(annotationMatch[1]!);
      continue;
    }

    // ─── Package ──────────────────────────────────────────
    const packageMatch = trimmed.match(/^package\s+([\w.]+)\s*;/);
    if (packageMatch) {
      packages.push({
        name: packageMatch[1]!,
        path: filePath,
      });
      pendingAnnotations = [];
      continue;
    }

    // ─── Imports ──────────────────────────────────────────
    const importMatch = trimmed.match(/^import\s+(static\s+)?([\w.*]+)\s*;/);
    if (importMatch) {
      const fullPath = importMatch[2]!;
      const parts = fullPath.split('.');
      const name = parts[parts.length - 1]!;
      // Java standard library and third-party libraries are external
      const isInternal = fullPath.startsWith('com.') || fullPath.startsWith('org.');
      imports.push({
        from: fullPath,
        names: [name],
        kind: isInternal ? 'internal' : 'external',
      });
      pendingAnnotations = [];
      continue;
    }

    // ─── Enums ────────────────────────────────────────────
    const enumMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?(static\s+)?enum\s+(\w+)/,
    );
    if (enumMatch) {
      const endLine = findBlockEnd(lines, i);
      const body = lines.slice(i + 1, endLine).join('\n');
      const members = extractEnumMembers(body);
      const vis = parseVisibility(enumMatch[1]?.trim() as string | undefined);

      enums.push({
        name: enumMatch[3]!,
        members,
        exported: isExported(vis),
      });

      pendingAnnotations = [];
      i = endLine;
      continue;
    }

    // ─── Interfaces ───────────────────────────────────────
    const ifaceMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?(static\s+)?(sealed\s+)?interface\s+(\w+)(?:<([^>]*)>)?(?:\s+extends\s+(.+?))?(?:\s+permits\s+(.+?))?\s*\{/,
    );
    if (ifaceMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const extendsStr = ifaceMatch[6];
      const extendsArr = extendsStr
        ? extendsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const vis = parseVisibility(ifaceMatch[1]?.trim() as string | undefined);
      const decorators = pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      // Capture permits clause into implements-like relationship
      const permitsStr = ifaceMatch[7];
      const permitsArr = permitsStr
        ? permitsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      // Extract generic params with bounds
      const genericsStr = ifaceMatch[5];
      const generics = genericsStr ? extractJavaGenerics(genericsStr) : undefined;

      // Merge permits into extends (they represent subtype relationships)
      const mergedExtends = extendsArr || permitsArr
        ? [...(extendsArr ?? []), ...(permitsArr ?? [])]
        : undefined;

      interfaces.push({
        name: ifaceMatch[4]!,
        extends: mergedExtends,
        properties: [],
        methods: extractInterfaceMethods(bodyLines),
        exported: isExported(vis),
        generics,
      });

      i = endLine;
      continue;
    }

    // ─── Records ──────────────────────────────────────────
    const recordMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?(static\s+)?(final\s+)?record\s+(\w+)\s*\(([^)]*)\)/,
    );
    if (recordMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const vis = parseVisibility(recordMatch[1]?.trim() as string | undefined);
      const decorators = pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      const recordParams = parseJavaParams(recordMatch[5] ?? '');
      const properties: PropertyInfo[] = recordParams.map((p) => ({
        name: p.name,
        type: p.type,
        scope: 'public' as const,
        readonly: true,
      }));

      classes.push({
        name: recordMatch[4]!,
        methods: extractClassMethods(bodyLines),
        properties,
        exported: isExported(vis),
        decorators,
        loc: endLine - i + 1,
      });

      i = endLine;
      continue;
    }

    // ─── Classes ──────────────────────────────────────────
    const classMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?(static\s+)?(abstract\s+)?(final\s+)?(sealed\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.<>,]+(?:\s*,\s*[\w.<>,]+)*))?(?:\s+implements\s+(.+?))?(?:\s+permits\s+(.+?))?\s*\{/,
    );
    if (classMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const classBody = bodyLines.join('\n');
      const vis = parseVisibility(classMatch[1]?.trim() as string | undefined);

      const implementsStr = classMatch[8];
      const implementsArr = implementsStr
        ? implementsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const extendsName = classMatch[7]?.trim().split(/[<\s]/)[0];

      // Capture permits clause and merge into implements
      const permitsStr = classMatch[9];
      const permitsArr = permitsStr
        ? permitsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const mergedImplements = implementsArr || permitsArr
        ? [...(implementsArr ?? []), ...(permitsArr ?? [])]
        : undefined;

      const decorators = pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      classes.push({
        name: classMatch[6]!,
        extends: extendsName,
        implements: mergedImplements,
        methods: extractClassMethods(bodyLines),
        properties: extractJavaFields(classBody),
        exported: isExported(vis),
        abstract: !!classMatch[3],
        decorators,
        loc: endLine - i + 1,
      });

      i = endLine;
      continue;
    }

    // ─── Top-level functions (static methods outside class — rare but possible in tests) ───
    // Reset annotations if nothing matched
    pendingAnnotations = [];
  }

  return {
    path: filePath,
    language: 'java',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'java'),
    imports,
    exports,
    functions,
    classes,
    interfaces,
    types: [],
    enums,
    constants: [],
    packages: packages.length > 0 ? packages : undefined,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────

function extractEnumMembers(body: string): string[] {
  const members: string[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '}') continue;

    // Stop at the first method or field declaration (enum body after constants)
    if (trimmed.match(/^(public|protected|private|static|final|@|\w+\s+\w+\s*\()/)) {
      // Check if it's still an enum constant (could start with uppercase)
      if (!trimmed.match(/^[A-Z_][A-Z_0-9]*\s*[({,;]/)) {
        break;
      }
    }

    // Enum constant: NAME, NAME(args), NAME { ... }
    const memberMatch = trimmed.match(/^([A-Z_][A-Z_0-9]*)\b/);
    if (memberMatch) {
      members.push(memberMatch[1]!);
    }

    // If line contains a semicolon after enum constants, stop
    if (trimmed.endsWith(';') && memberMatch) {
      break;
    }
  }

  return members;
}

function parseJavaParams(paramsStr: string): ParamInfo[] {
  if (!paramsStr.trim()) return [];

  const params: ParamInfo[] = [];
  let depth = 0;
  let current = '';

  for (const ch of paramsStr) {
    if (ch === '<' || ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === '}' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      const p = parseOneJavaParam(current.trim());
      if (p) params.push(p);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = parseOneJavaParam(current.trim());
  if (last) params.push(last);

  return params;
}

function parseOneJavaParam(raw: string): ParamInfo | null {
  if (!raw) return null;

  // Remove annotations like @NonNull, @Nullable
  const cleaned = raw.replace(/@\w+\s*/g, '').trim();
  if (!cleaned) return null;

  // Handle varargs: Type... name
  const varargsMatch = cleaned.match(/^(final\s+)?([\w.<>,\s[\]]+?)\.\.\.\s+(\w+)$/);
  if (varargsMatch) {
    return {
      name: '...' + varargsMatch[3]!,
      type: truncateType(simplifyType(varargsMatch[2]!)) + '[]',
    };
  }

  // Type name  or  final Type name
  const match = cleaned.match(/^(final\s+)?([\w.<>,\s[\]]+?)\s+(\w+)$/);
  if (!match) return null;

  return {
    name: match[3]!,
    type: truncateType(simplifyType(match[2]!)),
  };
}

function extractJavaFields(body: string): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Field: [visibility] [static] [final] Type name [= value];
    const fieldMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?(static\s+)?(final\s+)?([\w.<>,[\]\s]+?)\s+(\w+)\s*(?:=\s*.+?)?\s*;$/,
    );
    if (fieldMatch && !trimmed.includes('(')) {
      const type = fieldMatch[4]!.trim();
      // Skip if 'type' looks like a keyword or is empty
      if (!type || CONTROL_KEYWORDS.has(type)) continue;

      const vis = parseVisibility(fieldMatch[1]?.trim() as string | undefined);
      props.push({
        name: fieldMatch[5]!,
        type: truncateType(simplifyType(type)),
        scope: vis,
        static: !!fieldMatch[2],
        readonly: !!fieldMatch[3],
      });
    }
  }

  return props;
}

function extractClassMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect annotations
    const annoMatch = trimmed.match(/^@(\w+)/);
    if (annoMatch && !trimmed.match(/^@\w+.*\b(class|interface|enum|record)\b/)) {
      // Only treat as standalone annotation if the line is primarily the annotation
      if (trimmed.match(/^@\w+(\s*\(.*\))?\s*$/)) {
        pendingAnnotations.push(annoMatch[1]!);
        continue;
      }
    }

    // Method: [visibility] [static] [abstract] [final] [synchronized] [<generics>] ReturnType name(params)
    const methodMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?(static\s+)?(abstract\s+)?(final\s+)?(synchronized\s+)?(?:<[^>]*>\s+)?([\w.<>,[\]]+)\s+(\w+)\s*\(/,
    );
    if (methodMatch) {
      const name = methodMatch[7]!;
      const returnType = methodMatch[6]!;

      // Skip control flow keywords
      if (CONTROL_KEYWORDS.has(name) || CONTROL_KEYWORDS.has(returnType)) {
        pendingAnnotations = [];
        continue;
      }

      const endLine = findBlockEnd(bodyLines as string[], i);
      const fullSig = collectJavaSignature(bodyLines, i);
      const params = parseJavaParams(extractParamsFromSignature(fullSig));
      const vis = parseVisibility(methodMatch[1]?.trim() as string | undefined);
      const isAbstract = !!methodMatch[3];

      const decorators = pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name,
        params,
        returnType: truncateType(simplifyType(returnType)),
        exported: isExported(vis),
        static: !!methodMatch[2],
        scope: vis ?? 'public',
        loc: isAbstract ? 1 : endLine - i + 1,
        decorators,
      });

      if (!isAbstract) {
        i = endLine;
      }
      continue;
    }

    // Constructor: [visibility] ClassName(params) {
    const ctorMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+)?([A-Z]\w*)\s*\(/,
    );
    if (ctorMatch && !CONTROL_KEYWORDS.has(ctorMatch[2]!)) {
      const endLine = findBlockEnd(bodyLines as string[], i);
      const fullSig = collectJavaSignature(bodyLines, i);
      const params = parseJavaParams(extractParamsFromSignature(fullSig));
      const vis = parseVisibility(ctorMatch[1]?.trim() as string | undefined);

      const decorators = pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name: ctorMatch[2]!,
        params,
        returnType: '',
        exported: isExported(vis),
        scope: vis ?? 'public',
        loc: endLine - i + 1,
        decorators,
      });

      i = endLine;
      continue;
    }

    // Reset annotations if nothing matched
    pendingAnnotations = [];
  }

  return methods;
}

function extractInterfaceMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect annotations
    const annoMatch = trimmed.match(/^@(\w+)(\s*\(.*\))?\s*$/);
    if (annoMatch) {
      pendingAnnotations.push(annoMatch[1]!);
      continue;
    }

    // Interface method: [default] ReturnType name(params);
    const methodMatch = trimmed.match(
      /^(default\s+)?(static\s+)?([\w.<>,[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*[;{]/,
    );
    if (methodMatch) {
      const name = methodMatch[4]!;
      if (CONTROL_KEYWORDS.has(name)) {
        pendingAnnotations = [];
        continue;
      }

      const params = parseJavaParams(methodMatch[5] ?? '');
      const decorators = pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      const isDefault = !!methodMatch[1];
      let loc = 1;
      if (isDefault || !!methodMatch[2]) {
        const endLine = findBlockEnd(bodyLines as string[], i);
        loc = endLine - i + 1;
        i = endLine;
      }

      methods.push({
        name,
        params,
        returnType: truncateType(simplifyType(methodMatch[3]!)),
        exported: true,
        static: !!methodMatch[2],
        loc,
        decorators,
      });
      continue;
    }

    pendingAnnotations = [];
  }

  return methods;
}

function collectJavaSignature(lines: readonly string[], startLine: number): string {
  let sig = '';
  let parenDepth = 0;
  let foundOpen = false;

  for (let i = startLine; i < lines.length && i < startLine + 10; i++) {
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

    if (line.includes('{') && foundOpen) {
      return sig;
    }
  }

  return sig;
}

function extractParamsFromSignature(signature: string): string {
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

function extractJavaGenerics(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of str) {
    if (ch === '<') {
      /* v8 ignore next 2 -- nested generics blocked by regex [^>]* */
      depth++;
      current += ch;
    } else if (ch === '>') {
      /* v8 ignore next 2 -- nested generics blocked by regex [^>]* */
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) result.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) result.push(last);

  return result;
}

// ─── Plugin Factory ──────────────────────────────────────────────

const javaParser: LanguageParser = {
  name: 'java',
  extensions: ['.java'],
  parse: parseJava,
};

/**
 * Create the Java parser plugin.
 */
export function createJavaParserPlugin(): CodemapPlugin {
  return {
    name: 'java-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(javaParser);
    },
  };
}
