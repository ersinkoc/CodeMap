/**
 * Kotlin language regex/heuristic parser.
 *
 * Extracts structural information from Kotlin files including:
 * classes, data classes, sealed classes, objects, interfaces,
 * functions, extension functions, properties, typealiases,
 * packages, and imports.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  ImportInfo,
  ConstantInfo,
  ParamInfo,
  PropertyInfo,
  TypeInfo,
  PackageInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Visibility Helpers ───────────────────────────────────────────

type KotlinVisibility = 'public' | 'protected' | 'private' | 'internal';

function parseVisibility(raw: string | undefined): KotlinVisibility | undefined {
  const trimmed = raw?.trim();
  if (
    trimmed === 'public' ||
    trimmed === 'protected' ||
    trimmed === 'private' ||
    trimmed === 'internal'
  ) {
    return trimmed;
  }
  return undefined; // default (public)
}

function mapScope(
  vis: KotlinVisibility | undefined,
): 'public' | 'protected' | 'private' | undefined {
  if (vis === 'internal') return undefined;
  return vis;
}

function isExported(vis: KotlinVisibility | undefined): boolean {
  return vis !== 'private';
}

// ─── Param Parsing ────────────────────────────────────────────────

/**
 * Parse Kotlin parameters string into ParamInfo array.
 * Handles: (name: Type, name: Type = default), (vararg items: T)
 */
function parseKotlinParams(paramsStr: string): ParamInfo[] {
  const trimmed = paramsStr.trim();
  if (!trimmed) return [];

  const params: ParamInfo[] = [];
  let depth = 0;
  let current = '';
  const segments: string[] = [];

  for (const ch of trimmed) {
    if (ch === '(' || ch === '<' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === '>' || ch === ']' || ch === '}') depth--;

    if (ch === ',' && depth === 0) {
      segments.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) segments.push(current.trim());

  for (const seg of segments) {
    let cleaned = seg;

    // Remove vararg/noinline/crossinline keywords
    cleaned = cleaned.replace(/^(vararg|noinline|crossinline)\s+/, '');

    // Remove val/var prefix (in primary constructors)
    cleaned = cleaned.replace(/^(val|var)\s+/, '');

    // name: Type = defaultValue
    const match = cleaned.match(/^(\w+)\s*:\s*(.+?)(?:\s*=\s*.+)?$/);
    if (match) {
      const hasDefault = cleaned.includes('=');
      params.push({
        name: match[1]!,
        type: truncateType(simplifyType(match[2]!)),
        ...(hasDefault ? { defaultValue: 'default' } : {}),
      });
    }
  }

  return params;
}

/**
 * Extract return type from Kotlin function signature remainder.
 */
function parseKotlinReturnType(rest: string): string {
  // rest is everything after the closing paren: ): ReturnType { or ): ReturnType =
  const cleaned = rest.replace(/\s*[{=].*$/, '').trim();
  if (!cleaned) return 'Unit';

  // Remove leading colon if present
  const withoutColon = cleaned.replace(/^:\s*/, '').trim();
  if (!withoutColon) return 'Unit';

  return truncateType(simplifyType(withoutColon));
}

// ─── Body Extraction ──────────────────────────────────────────────

/**
 * Extract methods from a class/object body.
 */
function extractKotlinMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect annotations
    const annoMatch = trimmed.match(/^@(\w+)/);
    if (annoMatch && trimmed.match(/^@\w+(\s*\(.*\))?\s*$/)) {
      pendingAnnotations.push(annoMatch[1]!);
      continue;
    }

    // Method
    const methodMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(abstract\s+|override\s+)?(suspend\s+)?(inline\s+)?fun\s+(?:<[^>]*>\s+)?(?:(\w+(?:<[^>]*>)?)\.)?(\w+)\s*\(([^)]*)\)\s*(.*)/,
    );
    if (methodMatch) {
      const vis = parseVisibility(methodMatch[1]);
      const receiver = methodMatch[5];
      const name = receiver ? `${receiver}.${methodMatch[6]!}` : methodMatch[6]!;
      const paramsStr = methodMatch[7] ?? '';
      const rest = methodMatch[8] ?? '';
      const endLine = trimmed.includes('{') ? findBlockEnd(bodyLines as string[], i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name,
        params: parseKotlinParams(paramsStr),
        returnType: parseKotlinReturnType(rest),
        exported: isExported(vis),
        scope: mapScope(vis),
        async: !!methodMatch[3],
        static: false,
        loc: endLine - i + 1,
        decorators,
      });

      i = endLine;
      continue;
    }

    pendingAnnotations = [];
  }

  return methods;
}

/**
 * Extract properties from a class body.
 */
function extractKotlinProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const propMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(override\s+)?(abstract\s+)?(const\s+)?(val|var)\s+(\w+)\s*(?::\s*([^={\n]+?))?(?:\s*=.*)?(?:\s*$|\s*\{)/,
    );
    if (propMatch) {
      const vis = parseVisibility(propMatch[1]);
      const isVal = propMatch[5] === 'val';
      const type = propMatch[7]?.trim() ?? 'unknown';

      props.push({
        name: propMatch[6]!,
        type: truncateType(simplifyType(type)),
        scope: mapScope(vis),
        readonly: isVal,
      });
    }
  }

  return props;
}

/**
 * Extract method signatures from an interface body.
 */
function extractKotlinInterfaceMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect annotations
    const annoMatch = trimmed.match(/^@(\w+)/);
    if (annoMatch && trimmed.match(/^@\w+(\s*\(.*\))?\s*$/)) {
      pendingAnnotations.push(annoMatch[1]!);
      continue;
    }

    const methodMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(abstract\s+|override\s+)?(suspend\s+)?(inline\s+)?fun\s+(?:<[^>]*>\s+)?(?:(\w+(?:<[^>]*>)?)\.)?(\w+)\s*\(([^)]*)\)\s*(.*)/,
    );
    if (methodMatch) {
      const vis = parseVisibility(methodMatch[1]);
      const receiver = methodMatch[5];
      const name = receiver ? `${receiver}.${methodMatch[6]!}` : methodMatch[6]!;
      const paramsStr = methodMatch[7] ?? '';
      const rest = methodMatch[8] ?? '';
      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(bodyLines as string[], i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name,
        params: parseKotlinParams(paramsStr),
        returnType: parseKotlinReturnType(rest),
        exported: isExported(vis),
        async: !!methodMatch[3],
        loc: hasBody ? endLine - i + 1 : 1,
        decorators,
      });

      if (hasBody) i = endLine;
      continue;
    }

    pendingAnnotations = [];
  }

  return methods;
}

/**
 * Extract interface properties from body.
 */
function extractKotlinInterfaceProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const propMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(override\s+)?(val|var)\s+(\w+)\s*(?::\s*([^={\n]+?))?(?:\s*$|\s*\{|\s*=)/,
    );
    if (propMatch) {
      const vis = parseVisibility(propMatch[1]);
      const isVal = propMatch[3] === 'val';
      const type = propMatch[5]?.trim() ?? 'unknown';

      props.push({
        name: propMatch[4]!,
        type: truncateType(simplifyType(type)),
        scope: mapScope(vis),
        readonly: isVal,
      });
    }
  }

  return props;
}

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse Kotlin source file.
 */
function parseKotlin(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'kotlin');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const imports: ImportInfo[] = [];
  const constants: ConstantInfo[] = [];
  const types: TypeInfo[] = [];
  const packages: PackageInfo[] = [];

  let pendingAnnotations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // ─── Annotations ──────────────────────────────────────
    const annotationMatch = trimmed.match(/^@(\w+)/);
    if (
      annotationMatch &&
      !trimmed.match(
        /^@\w+.*\b(class|interface|object|fun|val|var|typealias)\b/,
      ) &&
      trimmed.match(/^@\w+(\s*\(.*\))?\s*$/)
    ) {
      pendingAnnotations.push(annotationMatch[1]!);
      continue;
    }

    // ─── Package declaration ──────────────────────────────
    const pkgMatch = trimmed.match(/^package\s+([\w.]+)/);
    if (pkgMatch) {
      packages.push({
        name: pkgMatch[1]!,
        path: filePath,
      });
      pendingAnnotations = [];
      continue;
    }

    // ─── Imports ──────────────────────────────────────────
    const importMatch = trimmed.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      const from = importMatch[1]!;
      const alias = importMatch[2];
      const parts = from.split('.');
      const name = alias ?? parts[parts.length - 1]!;
      // External if contains domain-like segments (e.g., com.xxx, org.xxx, io.xxx)
      const isExternal =
        from.startsWith('java.') ||
        from.startsWith('javax.') ||
        from.startsWith('kotlin.') ||
        from.startsWith('kotlinx.') ||
        from.startsWith('android.') ||
        from.startsWith('androidx.') ||
        from.startsWith('com.') ||
        from.startsWith('org.') ||
        from.startsWith('io.') ||
        from.startsWith('net.');
      imports.push({
        from,
        names: [name],
        kind: isExternal ? 'external' : 'internal',
      });
      pendingAnnotations = [];
      continue;
    }

    // ─── Typealias ────────────────────────────────────────
    const typealiasMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?typealias\s+(\w+)(?:<[^>]*>)?\s*=\s*(.+)/,
    );
    if (typealiasMatch) {
      const vis = parseVisibility(typealiasMatch[1]);
      types.push({
        name: typealiasMatch[2]!,
        type: truncateType(simplifyType(typealiasMatch[3]!.trim())),
        exported: isExported(vis),
      });
      pendingAnnotations = [];
      continue;
    }

    // ─── Interface ────────────────────────────────────────
    const ifaceMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(sealed\s+)?interface\s+(\w+)(?:<([^>]*)>)?(?:\s*:\s*([^{]+))?\s*\{?/,
    );
    if (ifaceMatch) {
      const vis = parseVisibility(ifaceMatch[1]);
      const name = ifaceMatch[3]!;
      const genericsStr = ifaceMatch[4];
      const extendsStr = ifaceMatch[5];
      const extendsArr = extendsStr
        ? extendsStr
            .split(',')
            .map((s) => s.trim().replace(/\(.*\)/, '').trim())
            .filter(Boolean)
        : undefined;
      const generics = genericsStr
        ? genericsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;
      const bodyLines = hasBody ? lines.slice(i + 1, endLine) : [];

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      interfaces.push({
        name,
        extends: extendsArr,
        properties: extractKotlinInterfaceProperties(bodyLines),
        methods: extractKotlinInterfaceMethods(bodyLines),
        exported: isExported(vis),
        generics,
      });

      if (hasBody) i = endLine;
      continue;
    }

    // ─── Object / Companion Object ────────────────────────
    const objectMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(?:companion\s+)?object\s+(\w+)?(?:\s*:\s*([^{]+))?\s*\{?/,
    );
    if (objectMatch) {
      const vis = parseVisibility(objectMatch[1]);
      const name = objectMatch[2] ?? 'Companion';
      const isCompanion = trimmed.includes('companion');
      const implementsStr = objectMatch[3];
      const implementsArr = implementsStr
        ? implementsStr
            .split(',')
            .map((s) => s.trim().replace(/\(.*\)/, '').trim())
            .filter(Boolean)
        : undefined;

      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;
      const bodyLines = hasBody ? lines.slice(i + 1, endLine) : [];

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      classes.push({
        name,
        implements: implementsArr,
        methods: extractKotlinMethods(bodyLines),
        properties: extractKotlinProperties(bodyLines),
        exported: isExported(vis),
        abstract: isCompanion,
        decorators,
        loc: hasBody ? endLine - i + 1 : 1,
      });

      if (hasBody) i = endLine;
      continue;
    }

    // ─── Enum class ───────────────────────────────────────
    const enumClassMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?enum\s+class\s+(\w+)(?:\s*\([^)]*\))?(?:\s*:\s*([^{]+))?\s*\{?/,
    );
    if (enumClassMatch) {
      const vis = parseVisibility(enumClassMatch[1]);
      const name = enumClassMatch[2]!;
      const implementsStr = enumClassMatch[3];
      const implementsArr = implementsStr
        ? implementsStr
            .split(',')
            .map((s) => s.trim().replace(/\(.*\)/, '').trim())
            .filter(Boolean)
        : undefined;

      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;
      const bodyLines = hasBody ? lines.slice(i + 1, endLine) : [];

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      classes.push({
        name,
        implements: implementsArr,
        methods: extractKotlinMethods(bodyLines),
        properties: extractKotlinProperties(bodyLines),
        exported: isExported(vis),
        decorators,
        loc: hasBody ? endLine - i + 1 : 1,
      });

      if (hasBody) i = endLine;
      continue;
    }

    // ─── Class (data/sealed/abstract/open/inner) ──────────
    const classMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(abstract\s+|sealed\s+|open\s+|data\s+|inner\s+)?(class)\s+(\w+)(?:<[^>]*>)?(?:\s*\([^)]*\))?(?:\s*:\s*([^{]+))?\s*\{?/,
    );
    if (classMatch) {
      const vis = parseVisibility(classMatch[1]);
      const modifier = classMatch[2]?.trim();
      const name = classMatch[4]!;
      const superStr = classMatch[5];

      let extendsName: string | undefined;
      let implementsArr: string[] | undefined;

      if (superStr) {
        const supers = superStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const s of supers) {
          // If it has parentheses, it's a class constructor call (extends)
          if (s.includes('(') && !extendsName) {
            extendsName = s.replace(/\(.*\)/, '').replace(/<.*>/, '').trim();
          } else {
            if (!implementsArr) implementsArr = [];
            implementsArr.push(s.replace(/\(.*\)/, '').replace(/<.*>/, '').trim());
          }
        }
      }

      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;
      const bodyLines = hasBody ? lines.slice(i + 1, endLine) : [];

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      classes.push({
        name,
        extends: extendsName,
        implements: implementsArr,
        methods: extractKotlinMethods(bodyLines),
        properties: extractKotlinProperties(bodyLines),
        exported: isExported(vis),
        abstract: modifier === 'abstract' || modifier === 'sealed',
        decorators,
        loc: hasBody ? endLine - i + 1 : 1,
      });

      if (hasBody) i = endLine;
      continue;
    }

    // ─── Top-level function ───────────────────────────────
    const funcMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(abstract\s+|override\s+)?(suspend\s+)?(inline\s+)?fun\s+(?:<[^>]*>\s+)?(?:(\w+(?:<[^>]*>)?)\.)?(\w+)\s*\(([^)]*)\)\s*(.*)/,
    );
    if (funcMatch) {
      const vis = parseVisibility(funcMatch[1]);
      const receiver = funcMatch[5];
      const name = receiver ? `${receiver}.${funcMatch[6]!}` : funcMatch[6]!;
      const paramsStr = funcMatch[7] ?? '';
      const rest = funcMatch[8] ?? '';
      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      functions.push({
        name,
        params: parseKotlinParams(paramsStr),
        returnType: parseKotlinReturnType(rest),
        exported: isExported(vis),
        async: !!funcMatch[3],
        scope: mapScope(vis),
        loc: endLine - i + 1,
        decorators,
      });

      i = endLine;
      continue;
    }

    // ─── Top-level val/var/const val ──────────────────────
    const constMatch = trimmed.match(
      /^(public\s+|private\s+|internal\s+|protected\s+)?(const\s+)?(val|var)\s+(\w+)\s*(?::\s*(\S+))?\s*=/,
    );
    if (constMatch) {
      const vis = parseVisibility(constMatch[1]);
      const type = constMatch[5] ?? 'unknown';
      constants.push({
        name: constMatch[4]!,
        type: truncateType(simplifyType(type)),
        exported: isExported(vis),
      });
      pendingAnnotations = [];
      continue;
    }

    // Reset annotations if nothing matched
    pendingAnnotations = [];
  }

  return {
    path: filePath,
    language: 'kotlin',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'kotlin'),
    imports,
    exports: [],
    functions,
    classes,
    interfaces,
    types,
    enums: [],
    constants,
    packages: packages.length > 0 ? packages : undefined,
  };
}

// ─── Plugin Factory ──────────────────────────────────────────────

const kotlinParser: LanguageParser = {
  name: 'kotlin',
  extensions: ['.kt', '.kts'],
  parse: parseKotlin,
};

/**
 * Create the Kotlin language parser plugin.
 */
export function createKotlinParserPlugin(): CodemapPlugin {
  return {
    name: 'kotlin-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(kotlinParser);
    },
  };
}
