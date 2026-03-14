/**
 * Swift language regex/heuristic parser.
 *
 * Extracts structural information from Swift files including:
 * classes, structs, enums, protocols, extensions, functions,
 * init/deinit, properties, typealiases, and imports.
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
  StructInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Visibility Helpers ───────────────────────────────────────────

type SwiftVisibility = 'public' | 'internal' | 'private' | 'fileprivate' | 'open';

function parseVisibility(raw: string | undefined): SwiftVisibility | undefined {
  const trimmed = raw?.trim();
  if (
    trimmed === 'public' ||
    trimmed === 'internal' ||
    trimmed === 'private' ||
    trimmed === 'fileprivate' ||
    trimmed === 'open'
  ) {
    return trimmed;
  }
  return undefined; // default (internal)
}

function mapScope(
  vis: SwiftVisibility | undefined,
): 'public' | 'protected' | 'private' | undefined {
  if (vis === 'private' || vis === 'fileprivate') return 'private';
  if (vis === 'public' || vis === 'open') return 'public';
  return undefined;
}

function isExported(vis: SwiftVisibility | undefined): boolean {
  return vis === 'public' || vis === 'open';
}

// ─── Access modifier regex prefix ─────────────────────────────────

const ACCESS_PREFIX =
  '(?:(public|private|internal|open|fileprivate)\\s+)?';

// ─── Param Parsing ────────────────────────────────────────────────

/**
 * Parse Swift parameters string into ParamInfo array.
 * Handles: (label name: Type), (_ name: Type), (name: Type = default), (name: inout Type)
 */
function parseSwiftParams(paramsStr: string): ParamInfo[] {
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
    // [label] name: [inout] Type [= default]
    const match = seg.match(
      /^(?:(\w+)\s+)?(\w+)\s*:\s*(?:inout\s+)?(.+?)(?:\s*=\s*.+)?$/,
    );
    if (match) {
      const name = match[2]!;
      const type = match[3]!.trim();
      const hasDefault = seg.includes('=');
      params.push({
        name,
        type: truncateType(simplifyType(type)),
        ...(hasDefault ? { defaultValue: 'default' } : {}),
      });
    }
  }

  return params;
}

/**
 * Extract return type from Swift function signature remainder.
 */
function parseSwiftReturnType(rest: string): string {
  // rest might be: -> ReturnType { or -> ReturnType
  const arrowMatch = rest.match(/->\s*(.+?)(?:\s*\{.*$|\s*$)/);
  if (arrowMatch) {
    const type = arrowMatch[1]!.trim().replace(/\s*\{$/, '').trim();
    if (type) return truncateType(simplifyType(type));
  }
  return 'Void';
}

// ─── Body Extraction ──────────────────────────────────────────────

/**
 * Extract methods from a class/struct/enum/extension body.
 */
function extractSwiftMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAnnotations: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect attributes/decorators
    const attrMatch = trimmed.match(/^@(\w+)/);
    if (attrMatch && trimmed.match(/^@\w+(\s*\(.*\))?\s*$/)) {
      pendingAnnotations.push(attrMatch[1]!);
      continue;
    }

    // init/deinit
    const initMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:required\\s+|convenience\\s+)?init[?!]?\\s*\\(([^)]*)\\)`,
      ),
    );
    if (initMatch) {
      const vis = parseVisibility(initMatch[1]);
      const paramsStr = initMatch[2] ?? '';
      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(bodyLines as string[], i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name: 'init',
        params: parseSwiftParams(paramsStr),
        returnType: '',
        exported: isExported(vis),
        scope: mapScope(vis),
        loc: hasBody ? endLine - i + 1 : 1,
        decorators,
      });

      if (hasBody) i = endLine;
      continue;
    }

    const deinitMatch = trimmed.match(/^deinit\s*\{/);
    if (deinitMatch) {
      const endLine = findBlockEnd(bodyLines as string[], i);

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name: 'deinit',
        params: [],
        returnType: 'Void',
        exported: false,
        loc: endLine - i + 1,
        decorators,
      });

      i = endLine;
      continue;
    }

    // func
    const funcMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:(static|class)\\s+)?(?:override\\s+)?(?:mutating\\s+)?func\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*(.*)`,
      ),
    );
    if (funcMatch) {
      const vis = parseVisibility(funcMatch[1]);
      const isStatic = !!funcMatch[2];
      const isMutating = trimmed.includes('mutating');
      const rawName = funcMatch[3]!;
      const name = isMutating ? `mutating ${rawName}` : rawName;
      const paramsStr = funcMatch[4] ?? '';
      const rest = funcMatch[5] ?? '';
      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(bodyLines as string[], i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      methods.push({
        name,
        params: parseSwiftParams(paramsStr),
        returnType: parseSwiftReturnType(rest),
        exported: isExported(vis),
        static: isStatic,
        scope: mapScope(vis),
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
 * Extract properties from a body.
 */
function extractSwiftProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const propMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:static\\s+)?(?:lazy\\s+)?(let|var)\\s+(\\w+)\\s*(?::\\s*([^={\n]+?))?(?:\\s*=.*)?(?:\\s*$|\\s*\\{)`,
      ),
    );
    if (propMatch) {
      const vis = parseVisibility(propMatch[1]);
      const isLet = propMatch[2] === 'let';
      const isStatic = trimmed.includes('static ');
      const type = propMatch[4]?.trim() ?? 'unknown';

      props.push({
        name: propMatch[3]!,
        type: truncateType(simplifyType(type)),
        scope: mapScope(vis),
        static: isStatic || undefined,
        readonly: isLet,
      });
    }
  }

  return props;
}

/**
 * Extract protocol method/property requirements.
 */
function extractProtocolMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // init
    const initMatch = trimmed.match(/^(?:mutating\s+)?init[?!]?\s*\(([^)]*)\)/);
    if (initMatch) {
      methods.push({
        name: 'init',
        params: parseSwiftParams(initMatch[1] ?? ''),
        returnType: '',
        exported: true,
        loc: 1,
      });
      continue;
    }

    // func
    const funcMatch = trimmed.match(
      /^(?:(?:static|class)\s+)?(?:mutating\s+)?func\s+(\w+)\s*\(([^)]*)\)\s*(.*)/,
    );
    if (funcMatch) {
      const isMutating = trimmed.includes('mutating');
      const isStatic = trimmed.includes('static ') || trimmed.includes('class ');
      const rawName = funcMatch[1]!;
      const name = isMutating ? `mutating ${rawName}` : rawName;
      const paramsStr = funcMatch[2] ?? '';
      const rest = funcMatch[3] ?? '';

      methods.push({
        name,
        params: parseSwiftParams(paramsStr),
        returnType: parseSwiftReturnType(rest),
        exported: true,
        static: isStatic,
        loc: 1,
      });
      continue;
    }
  }

  return methods;
}

/**
 * Extract protocol property requirements.
 */
function extractProtocolProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // var name: Type { get set }
    const propMatch = trimmed.match(
      /^(?:static\s+)?(var|let)\s+(\w+)\s*:\s*([^{]+?)(?:\s*\{.*)?$/,
    );
    if (propMatch) {
      const isLet = propMatch[1] === 'let';
      const isReadonly = isLet || (trimmed.includes('{') && trimmed.includes('get') && !trimmed.includes('set'));

      props.push({
        name: propMatch[2]!,
        type: truncateType(simplifyType(propMatch[3]!.trim())),
        readonly: isReadonly,
      });
    }
  }

  return props;
}

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse Swift source file.
 */
function parseSwift(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'swift');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const structs: StructInfo[] = [];
  const imports: ImportInfo[] = [];
  const constants: ConstantInfo[] = [];
  const types: TypeInfo[] = [];

  let pendingAnnotations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // ─── Attributes / decorators ──────────────────────────
    const attrMatch = trimmed.match(/^@(\w+)/);
    if (
      attrMatch &&
      !trimmed.match(
        /^@\w+.*\b(class|struct|enum|protocol|func|extension|var|let|init)\b/,
      ) &&
      trimmed.match(/^@\w+(\s*\(.*\))?\s*$/)
    ) {
      pendingAnnotations.push(attrMatch[1]!);
      continue;
    }

    // ─── Imports ──────────────────────────────────────────
    const importMatch = trimmed.match(/^import\s+(\w+)/);
    if (importMatch) {
      const name = importMatch[1]!;
      // Standard Apple frameworks are external
      const isExternal =
        name === 'Foundation' ||
        name === 'UIKit' ||
        name === 'SwiftUI' ||
        name === 'Combine' ||
        name === 'CoreData' ||
        name === 'CoreGraphics' ||
        name === 'MapKit' ||
        name === 'AppKit' ||
        name === 'XCTest' ||
        name === 'Darwin' ||
        name === 'Dispatch' ||
        name === 'os';
      imports.push({
        from: name,
        names: [name],
        kind: isExternal ? 'external' : 'internal',
      });
      pendingAnnotations = [];
      continue;
    }

    // ─── Typealias ────────────────────────────────────────
    const typealiasMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}typealias\\s+(\\w+)\\s*=\\s*(.+)`,
      ),
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

    // ─── Protocol ─────────────────────────────────────────
    const protocolMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}protocol\\s+(\\w+)(?:\\s*:\\s*(.+?))?\\s*\\{`,
      ),
    );
    if (protocolMatch) {
      const vis = parseVisibility(protocolMatch[1]);
      const name = protocolMatch[2]!;
      const extendsStr = protocolMatch[3];
      const extendsArr = extendsStr
        ? extendsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      interfaces.push({
        name,
        extends: extendsArr,
        properties: extractProtocolProperties(bodyLines),
        methods: extractProtocolMethods(bodyLines),
        exported: isExported(vis),
      });

      i = endLine;
      continue;
    }

    // ─── Extension ────────────────────────────────────────
    const extensionMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}extension\\s+(\\w+)(?:\\s*:\\s*(.+?))?\\s*\\{`,
      ),
    );
    if (extensionMatch) {
      const vis = parseVisibility(extensionMatch[1]);
      const name = extensionMatch[2]!;
      const conformsStr = extensionMatch[3];
      const conformsArr = conformsStr
        ? conformsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      structs.push({
        name,
        fields: [],
        methods: extractSwiftMethods(bodyLines),
        exported: isExported(vis),
        embeds: conformsArr,
      });

      i = endLine;
      continue;
    }

    // ─── Enum ─────────────────────────────────────────────
    const enumMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:indirect\\s+)?enum\\s+(\\w+)(?:<[^>]*>)?(?:\\s*:\\s*(.+?))?\\s*\\{`,
      ),
    );
    if (enumMatch) {
      const vis = parseVisibility(enumMatch[1]);
      const name = enumMatch[2]!;
      const rawTypesStr = enumMatch[3];
      let extendsName: string | undefined;
      let implementsArr: string[] | undefined;

      if (rawTypesStr) {
        const parts = rawTypesStr.split(',').map((s) => s.trim()).filter(Boolean);
        // First element could be a raw type (String, Int, etc.) or protocol
        for (const p of parts) {
          const lc = p.toLowerCase();
          if (
            !extendsName &&
            (lc === 'string' || lc === 'int' || lc === 'double' || lc === 'float' || lc === 'character')
          ) {
            extendsName = p;
          } else {
            if (!implementsArr) implementsArr = [];
            implementsArr.push(p);
          }
        }
      }

      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      classes.push({
        name,
        extends: extendsName,
        implements: implementsArr,
        methods: extractSwiftMethods(bodyLines),
        properties: extractSwiftProperties(bodyLines),
        exported: isExported(vis),
        decorators,
        loc: endLine - i + 1,
      });

      i = endLine;
      continue;
    }

    // ─── Struct ───────────────────────────────────────────
    const structMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}struct\\s+(\\w+)(?:<[^>]*>)?(?:\\s*:\\s*(.+?))?\\s*\\{`,
      ),
    );
    if (structMatch) {
      const vis = parseVisibility(structMatch[1]);
      const name = structMatch[2]!;
      const conformsStr = structMatch[3];
      const conformsArr = conformsStr
        ? conformsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      structs.push({
        name,
        fields: extractSwiftProperties(bodyLines),
        methods: extractSwiftMethods(bodyLines),
        exported: isExported(vis),
        embeds: conformsArr,
      });

      i = endLine;
      continue;
    }

    // ─── Class ────────────────────────────────────────────
    const classMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:final\\s+)?class\\s+(\\w+)(?:<[^>]*>)?(?:\\s*:\\s*(.+?))?\\s*\\{`,
      ),
    );
    if (classMatch) {
      const vis = parseVisibility(classMatch[1]);
      const name = classMatch[2]!;
      const superStr = classMatch[3];

      let extendsName: string | undefined;
      let implementsArr: string[] | undefined;

      if (superStr) {
        const parts = superStr.split(',').map((s) => s.trim()).filter(Boolean);
        // First part is typically the superclass, rest are protocols
        if (parts.length > 0) {
          extendsName = parts[0];
          if (parts.length > 1) {
            implementsArr = parts.slice(1);
          }
        }
      }

      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      classes.push({
        name,
        extends: extendsName,
        implements: implementsArr,
        methods: extractSwiftMethods(bodyLines),
        properties: extractSwiftProperties(bodyLines),
        exported: isExported(vis),
        decorators,
        loc: endLine - i + 1,
      });

      i = endLine;
      continue;
    }

    // ─── Top-level init ───────────────────────────────────
    const topInitMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:required\\s+|convenience\\s+)?init[?!]?\\s*\\(([^)]*)\\)`,
      ),
    );
    if (topInitMatch) {
      const vis = parseVisibility(topInitMatch[1]);
      const paramsStr = topInitMatch[2] ?? '';
      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      functions.push({
        name: 'init',
        params: parseSwiftParams(paramsStr),
        returnType: '',
        exported: isExported(vis),
        scope: mapScope(vis),
        loc: hasBody ? endLine - i + 1 : 1,
        decorators,
      });

      if (hasBody) i = endLine;
      continue;
    }

    // ─── Top-level function ───────────────────────────────
    const funcMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:(?:static|class)\\s+)?(?:override\\s+)?(?:mutating\\s+)?func\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*(.*)`,
      ),
    );
    if (funcMatch) {
      const vis = parseVisibility(funcMatch[1]);
      const isStatic =
        trimmed.includes('static ') || /\bclass\s+func\b/.test(trimmed);
      const isMutating = trimmed.includes('mutating');
      const rawName = funcMatch[2]!;
      const name = isMutating ? `mutating ${rawName}` : rawName;
      const paramsStr = funcMatch[3] ?? '';
      const rest = funcMatch[4] ?? '';
      const hasBody = trimmed.includes('{');
      const endLine = hasBody ? findBlockEnd(lines, i) : i;

      const decorators =
        pendingAnnotations.length > 0 ? [...pendingAnnotations] : undefined;
      pendingAnnotations = [];

      functions.push({
        name,
        params: parseSwiftParams(paramsStr),
        returnType: parseSwiftReturnType(rest),
        exported: isExported(vis),
        static: isStatic,
        scope: mapScope(vis),
        loc: hasBody ? endLine - i + 1 : 1,
        decorators,
      });

      if (hasBody) i = endLine;
      continue;
    }

    // ─── Top-level let/var ────────────────────────────────
    const constMatch = trimmed.match(
      new RegExp(
        `^${ACCESS_PREFIX}(?:static\\s+)?(?:lazy\\s+)?(let|var)\\s+(\\w+)\\s*(?::\\s*(\\S+))?\\s*=`,
      ),
    );
    if (constMatch) {
      const vis = parseVisibility(constMatch[1]);
      const type = constMatch[4] ?? 'unknown';
      constants.push({
        name: constMatch[3]!,
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
    language: 'swift',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'swift'),
    imports,
    exports: [],
    functions,
    classes,
    interfaces,
    types,
    enums: [],
    constants,
    structs: structs.length > 0 ? structs : undefined,
  };
}

// ─── Plugin Factory ──────────────────────────────────────────────

const swiftParser: LanguageParser = {
  name: 'swift',
  extensions: ['.swift'],
  parse: parseSwift,
};

/**
 * Create the Swift language parser plugin.
 */
export function createSwiftParserPlugin(): CodemapPlugin {
  return {
    name: 'swift-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(swiftParser);
    },
  };
}
