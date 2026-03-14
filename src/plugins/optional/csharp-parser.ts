/**
 * C# regex/heuristic parser.
 *
 * Extracts structural information from C# files including:
 * classes, interfaces, records, structs, methods, properties,
 * namespaces, using statements, and attributes.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  ImportInfo,
  ExportInfo,
  ParamInfo,
  PropertyInfo,
  PackageInfo,
  StructInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Visibility Helpers ───────────────────────────────────────────

type CsharpVisibility = 'public' | 'protected' | 'private';

function parseVisibility(raw: string | undefined): CsharpVisibility | undefined {
  if (raw === 'public' || raw === 'protected' || raw === 'private') return raw;
  // 'internal' and 'protected internal' map to undefined (no direct equivalent)
  return undefined;
}

function isExported(vis: CsharpVisibility | undefined): boolean {
  return vis === 'public';
}

// ─── Keyword Guards ───────────────────────────────────────────────

const CONTROL_KEYWORDS = new Set([
  'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'try', 'catch',
  'finally', 'return', 'throw', 'new', 'base', 'this', 'using', 'namespace',
  'lock', 'fixed', 'checked', 'unchecked', 'yield', 'await',
]);

// Modifiers that may appear before a type in declarations
const MODIFIER_PATTERN = /^(?:public|protected|private|internal|static|abstract|sealed|virtual|override|partial|async|extern|readonly|new|unsafe|volatile)\s+/;

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse a C# source file.
 */
function parseCsharp(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'csharp');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const packages: PackageInfo[] = [];
  const structs: StructInfo[] = [];

  // Track pending attributes to attach to the next declaration
  let pendingAttributes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // ─── Attributes ───────────────────────────────────────
    const attrMatch = trimmed.match(/^\[(\w+)/);
    if (attrMatch && !trimmed.match(/^\[.*\].*\b(class|interface|struct|record|enum)\b/)) {
      // Standalone attribute line like [Serializable] or [HttpGet("path")]
      if (trimmed.match(/^\[[\w,\s()"=.]+\]\s*$/)) {
        // Extract all attributes from the line: [Attr1, Attr2] or [Attr1][Attr2]
        const allAttrs = trimmed.matchAll(/\[(\w+)/g);
        for (const a of allAttrs) {
          pendingAttributes.push(a[1]!);
        }
        continue;
      }
    }

    // ─── Using statements ─────────────────────────────────
    const usingMatch = trimmed.match(/^using\s+(static\s+)?([\w.]+)\s*;/);
    if (usingMatch) {
      // Skip 'using' blocks (e.g. using var x = ...)
      const ns = usingMatch[2]!;
      imports.push({
        from: ns,
        names: [ns.split('.').pop()!],
        kind: ns.startsWith('System') ? 'external' : 'internal',
      });
      pendingAttributes = [];
      continue;
    }

    // ─── Namespace (file-scoped or block-scoped) ──────────
    const nsFileScopedMatch = trimmed.match(/^namespace\s+([\w.]+)\s*;/);
    if (nsFileScopedMatch) {
      packages.push({
        name: nsFileScopedMatch[1]!,
        path: filePath,
      });
      pendingAttributes = [];
      continue;
    }

    const nsBlockMatch = trimmed.match(/^namespace\s+([\w.]+)\s*\{/);
    if (nsBlockMatch) {
      packages.push({
        name: nsBlockMatch[1]!,
        path: filePath,
      });
      pendingAttributes = [];
      // Don't skip to end — we need to parse contents inside the namespace
      continue;
    }

    // ─── Interfaces ───────────────────────────────────────
    const ifaceMatch = trimmed.match(
      /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:partial\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*(.+?))?\s*\{/,
    );
    if (ifaceMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const baseStr = ifaceMatch[2];
      const extendsArr = baseStr
        ? baseStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const vis = extractVisibility(trimmed);
      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      interfaces.push({
        name: ifaceMatch[1]!,
        extends: extendsArr,
        properties: extractCsharpProperties(bodyLines),
        methods: extractInterfaceMethods(bodyLines),
        exported: isExported(vis),
      });

      i = endLine;
      continue;
    }

    // ─── Records ──────────────────────────────────────────
    const recordMatch = trimmed.match(
      /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:partial\s+)?(?:abstract\s+|sealed\s+)?record\s+(struct\s+)?(\w+)(?:<[^>]*>)?(?:\s*\(([^)]*)\))?(?:\s*:\s*(.+?))?\s*[{;]/,
    );
    if (recordMatch) {
      const endLine = trimmed.endsWith(';') ? i : findBlockEnd(lines, i);
      const bodyLines = trimmed.endsWith(';') ? [] : lines.slice(i + 1, endLine);
      const vis = extractVisibility(trimmed);
      const isStruct = !!recordMatch[1];
      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      const recordParams = parseCsharpParams(recordMatch[3] ?? '');
      const properties: PropertyInfo[] = recordParams.map((p) => ({
        name: p.name,
        type: p.type,
        scope: 'public' as const,
        readonly: true,
      }));

      const baseStr = recordMatch[4];
      const extendsName = baseStr?.split(',')[0]?.trim().split(/[<\s]/)[0];

      if (isStruct) {
        structs.push({
          name: recordMatch[2]!,
          fields: properties,
          methods: extractClassMethods(bodyLines),
          exported: isExported(vis),
          derives: decorators,
        });
      } else {
        classes.push({
          name: recordMatch[2]!,
          extends: extendsName,
          methods: extractClassMethods(bodyLines),
          properties,
          exported: isExported(vis),
          decorators,
          loc: endLine - i + 1,
        });
      }

      i = endLine;
      continue;
    }

    // ─── Structs ──────────────────────────────────────────
    const structMatch = trimmed.match(
      /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:partial\s+)?(?:readonly\s+)?(?:ref\s+)?struct\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*(.+?))?\s*\{/,
    );
    if (structMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const structBody = bodyLines.join('\n');
      const vis = extractVisibility(trimmed);
      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      const implementsStr = structMatch[2];
      const implementsList = implementsStr
        ? implementsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      structs.push({
        name: structMatch[1]!,
        fields: extractCsharpFields(structBody),
        methods: extractClassMethods(bodyLines),
        exported: isExported(vis),
        derives: decorators,
        embeds: implementsList,
      });

      i = endLine;
      continue;
    }

    // ─── Classes ──────────────────────────────────────────
    const classMatch = trimmed.match(
      /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:static\s+)?(?:partial\s+)?(?:abstract\s+|sealed\s+)?class\s+(\w+)(?:<[^>]*>)?(?:\s*:\s*(.+?))?\s*\{/,
    );
    if (classMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const classBody = bodyLines.join('\n');
      const vis = extractVisibility(trimmed);
      const isAbstract = /\babstract\b/.test(trimmed);
      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      // In C#, the base list after : can contain both base class and interfaces
      const baseStr = classMatch[2];
      let extendsName: string | undefined;
      let implementsArr: string[] | undefined;

      if (baseStr) {
        const bases = baseStr.split(',').map((s) => s.trim()).filter(Boolean);
        // Convention: interfaces start with 'I' followed by uppercase letter
        const ifaces: string[] = [];
        for (const b of bases) {
          const baseName = b.split(/[<\s]/)[0]!;
          if (baseName.match(/^I[A-Z]/) && !extendsName) {
            ifaces.push(baseName);
          } else if (!extendsName) {
            extendsName = baseName;
          } else {
            ifaces.push(baseName);
          }
        }
        if (ifaces.length > 0) implementsArr = ifaces;
      }

      classes.push({
        name: classMatch[1]!,
        extends: extendsName,
        implements: implementsArr,
        methods: extractClassMethods(bodyLines),
        properties: [
          ...extractCsharpFields(classBody),
          ...extractCsharpAutoProperties(bodyLines),
        ],
        exported: isExported(vis),
        abstract: isAbstract,
        decorators,
        loc: endLine - i + 1,
      });

      i = endLine;
      continue;
    }

    // Reset attributes if nothing matched
    pendingAttributes = [];
  }

  return {
    path: filePath,
    language: 'csharp',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'csharp'),
    imports,
    exports,
    functions,
    classes,
    interfaces,
    types: [],
    enums: [],
    constants: [],
    structs: structs.length > 0 ? structs : undefined,
    packages: packages.length > 0 ? packages : undefined,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────

function extractVisibility(line: string): CsharpVisibility | undefined {
  const match = line.match(/^(public|protected|private|internal)\b/);
  if (!match) return undefined;
  return parseVisibility(match[1]);
}

function parseCsharpParams(paramsStr: string): ParamInfo[] {
  if (!paramsStr.trim()) return [];

  const params: ParamInfo[] = [];
  let depth = 0;
  let current = '';

  for (const ch of paramsStr) {
    if (ch === '<' || ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === '}' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      const p = parseOneCsharpParam(current.trim());
      if (p) params.push(p);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = parseOneCsharpParam(current.trim());
  if (last) params.push(last);

  return params;
}

function parseOneCsharpParam(raw: string): ParamInfo | null {
  if (!raw) return null;

  // Remove attributes like [FromBody], [Required]
  const cleaned = raw.replace(/\[[^\]]*\]\s*/g, '').trim();
  if (!cleaned) return null;

  // Handle params keyword: params Type[] name
  // Handle ref/out/in modifiers: ref Type name, out Type name, in Type name
  const modifierMatch = cleaned.match(
    /^(?:params\s+|ref\s+|out\s+|in\s+|this\s+)?([\w.<>,[\]?]+)\s+(\w+)(?:\s*=\s*(.+))?$/,
  );
  if (modifierMatch) {
    return {
      name: modifierMatch[2]!,
      type: truncateType(simplifyType(modifierMatch[1]!)),
      optional: !!modifierMatch[3],
      defaultValue: modifierMatch[3],
    };
  }

  return null;
}

function extractCsharpFields(body: string): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Field: [visibility] [static] [readonly] [const] Type name [= value];
    // Must end with semicolon and NOT contain { get or ( which indicates property/method
    const fieldMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+|internal\s+)?(static\s+)?(readonly\s+|const\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*(?:=\s*.+?)?\s*;$/,
    );
    if (fieldMatch && !trimmed.includes('{') && !trimmed.includes('(')) {
      const type = fieldMatch[4]!.trim();
      if (!type || CONTROL_KEYWORDS.has(type)) continue;

      const vis = parseVisibility(fieldMatch[1]?.trim() as string | undefined);
      const isReadonly = !!fieldMatch[3]?.includes('readonly') || !!fieldMatch[3]?.includes('const');

      props.push({
        name: fieldMatch[5]!,
        type: truncateType(simplifyType(type)),
        scope: vis,
        static: !!fieldMatch[2],
        readonly: isReadonly,
      });
    }
  }

  return props;
}

function extractCsharpAutoProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];
  let pendingAttributes: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect attributes
    const attrMatch = trimmed.match(/^\[(\w+)/);
    if (attrMatch && trimmed.match(/^\[[\w,\s()"=.]+\]\s*$/)) {
      const allAttrs = trimmed.matchAll(/\[(\w+)/g);
      for (const a of allAttrs) {
        pendingAttributes.push(a[1]!);
      }
      continue;
    }

    // Auto-property: [visibility] [static] [virtual/override/abstract] Type Name { get; set; }
    // Also handles: Type Name { get; init; }, Type Name { get; private set; }, Type Name => expr;
    const propMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+|internal\s+)?(static\s+)?(virtual\s+|override\s+|abstract\s+)?(required\s+)?(new\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*\{\s*(get|set|init)/,
    );
    if (propMatch) {
      const type = propMatch[6]!.trim();
      const name = propMatch[7]!;

      if (CONTROL_KEYWORDS.has(type) || CONTROL_KEYWORDS.has(name)) {
        pendingAttributes = [];
        continue;
      }

      const vis = parseVisibility(propMatch[1]?.trim() as string | undefined);
      const isReadonly = !trimmed.includes('set') && !trimmed.includes('init');

      props.push({
        name,
        type: truncateType(simplifyType(type)),
        scope: vis,
        static: !!propMatch[2],
        readonly: isReadonly,
      });

      pendingAttributes = [];
      continue;
    }

    // Expression-bodied property: Type Name => expression;
    const exprPropMatch = trimmed.match(
      /^(public\s+|protected\s+|private\s+|internal\s+)?(static\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*=>/,
    );
    if (exprPropMatch) {
      const type = exprPropMatch[3]!.trim();
      const name = exprPropMatch[4]!;

      if (!CONTROL_KEYWORDS.has(type) && !CONTROL_KEYWORDS.has(name)) {
        const vis = parseVisibility(exprPropMatch[1]?.trim() as string | undefined);
        props.push({
          name,
          type: truncateType(simplifyType(type)),
          scope: vis,
          static: !!exprPropMatch[2],
          readonly: true,
        });
      }

      pendingAttributes = [];
      continue;
    }

    pendingAttributes = [];
  }

  return props;
}

function extractClassMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAttributes: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect attributes
    const attrMatch = trimmed.match(/^\[(\w+)/);
    if (attrMatch && trimmed.match(/^\[[\w,\s()"=.]+\]\s*$/)) {
      const allAttrs = trimmed.matchAll(/\[(\w+)/g);
      for (const a of allAttrs) {
        pendingAttributes.push(a[1]!);
      }
      continue;
    }

    // Skip property declarations (contain { get or =>)
    if (trimmed.match(/\{\s*(get|set|init)/) || trimmed.match(/\w+\s*=>/)) {
      // Could be expression-bodied method — check if it has parens before =>
      const exprMethodMatch = trimmed.match(
        /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:static\s+)?(?:async\s+)?(?:virtual\s+|override\s+|abstract\s+)?(?:new\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*\(([^)]*)\)\s*=>/,
      );
      if (exprMethodMatch) {
        const name = exprMethodMatch[2]!;
        const returnType = exprMethodMatch[1]!;
        if (!CONTROL_KEYWORDS.has(name) && !CONTROL_KEYWORDS.has(returnType)) {
          const params = parseCsharpParams(exprMethodMatch[3] ?? '');
          const vis = extractVisibility(trimmed);
          const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
          pendingAttributes = [];

          methods.push({
            name,
            params,
            returnType: truncateType(simplifyType(returnType)),
            exported: isExported(vis),
            async: /\basync\b/.test(trimmed),
            static: /\bstatic\b/.test(trimmed),
            scope: vis ?? 'public',
            loc: 1,
            decorators,
          });
          continue;
        }
      }
      pendingAttributes = [];
      continue;
    }

    // Method: [visibility] [static] [async] [virtual/override/abstract] ReturnType Name(params)
    const methodMatch = trimmed.match(
      /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:static\s+)?(?:async\s+)?(?:virtual\s+|override\s+|abstract\s+|sealed\s+)?(?:new\s+)?(?:extern\s+)?(?:partial\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*\(/,
    );
    if (methodMatch) {
      const name = methodMatch[2]!;
      const returnType = methodMatch[1]!;

      // Skip control flow, properties, and field-like patterns
      if (CONTROL_KEYWORDS.has(name) || CONTROL_KEYWORDS.has(returnType)) {
        pendingAttributes = [];
        continue;
      }

      const endLine = findBlockEnd(bodyLines as string[], i);
      const fullSig = collectCsharpSignature(bodyLines, i);
      const params = parseCsharpParams(extractParamsFromSignature(fullSig));
      const vis = extractVisibility(trimmed);
      const isAbstract = /\babstract\b/.test(trimmed);

      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      methods.push({
        name,
        params,
        returnType: truncateType(simplifyType(returnType)),
        exported: isExported(vis),
        async: /\basync\b/.test(trimmed),
        static: /\bstatic\b/.test(trimmed),
        scope: vis ?? 'public',
        loc: isAbstract ? 1 : endLine - i + 1,
        decorators,
      });

      if (!isAbstract) {
        i = endLine;
      }
      continue;
    }

    // Constructor: [visibility] ClassName(params) [: base()/this()]
    const ctorMatch = trimmed.match(
      /^(?:public\s+|protected\s+|private\s+|internal\s+)?(?:static\s+)?([A-Z]\w*)\s*\(/,
    );
    if (ctorMatch && !CONTROL_KEYWORDS.has(ctorMatch[1]!)) {
      // Make sure it's not a method call (no return type before it)
      const beforeName = trimmed.slice(0, trimmed.indexOf(ctorMatch[1]!)).trim();
      const isModifiersOnly = !beforeName || /^(?:public|protected|private|internal|static)\s*$/.test(beforeName) || /^(?:(?:public|protected|private|internal|static)\s+)+$/.test(beforeName);

      if (isModifiersOnly) {
        const endLine = findBlockEnd(bodyLines as string[], i);
        const fullSig = collectCsharpSignature(bodyLines, i);
        const params = parseCsharpParams(extractParamsFromSignature(fullSig));
        const vis = extractVisibility(trimmed);

        const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
        pendingAttributes = [];

        methods.push({
          name: ctorMatch[1]!,
          params,
          returnType: '',
          exported: isExported(vis),
          static: /\bstatic\b/.test(trimmed),
          scope: vis ?? 'public',
          loc: endLine - i + 1,
          decorators,
        });

        i = endLine;
        continue;
      }
    }

    // Reset attributes if nothing matched
    pendingAttributes = [];
  }

  return methods;
}

function extractInterfaceMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  let pendingAttributes: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (!trimmed) continue;

    // Collect attributes
    const attrMatch = trimmed.match(/^\[(\w+)/);
    if (attrMatch && trimmed.match(/^\[[\w,\s()"=.]+\]\s*$/)) {
      const allAttrs = trimmed.matchAll(/\[(\w+)/g);
      for (const a of allAttrs) {
        pendingAttributes.push(a[1]!);
      }
      continue;
    }

    // Skip property declarations in interfaces
    if (trimmed.match(/\{\s*(get|set|init)/)) {
      pendingAttributes = [];
      continue;
    }

    // Interface method: ReturnType Name(params);
    const methodMatch = trimmed.match(
      /^(?:static\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*\(([^)]*)\)\s*;/,
    );
    if (methodMatch) {
      const name = methodMatch[2]!;
      if (CONTROL_KEYWORDS.has(name)) {
        pendingAttributes = [];
        continue;
      }

      const params = parseCsharpParams(methodMatch[3] ?? '');
      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      methods.push({
        name,
        params,
        returnType: truncateType(simplifyType(methodMatch[1]!)),
        exported: true,
        static: /\bstatic\b/.test(trimmed),
        loc: 1,
        decorators,
      });
      continue;
    }

    // Default interface method (C# 8+): has a body
    const defaultMethodMatch = trimmed.match(
      /^(?:static\s+)?(?:virtual\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*\(/,
    );
    if (defaultMethodMatch && !CONTROL_KEYWORDS.has(defaultMethodMatch[2]!)) {
      const endLine = findBlockEnd(bodyLines as string[], i);
      const fullSig = collectCsharpSignature(bodyLines, i);
      const params = parseCsharpParams(extractParamsFromSignature(fullSig));
      const decorators = pendingAttributes.length > 0 ? [...pendingAttributes] : undefined;
      pendingAttributes = [];

      methods.push({
        name: defaultMethodMatch[2]!,
        params,
        returnType: truncateType(simplifyType(defaultMethodMatch[1]!)),
        exported: true,
        static: /\bstatic\b/.test(trimmed),
        loc: endLine - i + 1,
        decorators,
      });

      i = endLine;
      continue;
    }

    pendingAttributes = [];
  }

  return methods;
}

function extractCsharpProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Interface property: Type Name { get; set; }
    const propMatch = trimmed.match(
      /^(?:new\s+)?([\w.<>,[\]?]+)\s+(\w+)\s*\{\s*(get|set|init)/,
    );
    if (propMatch) {
      const type = propMatch[1]!.trim();
      const name = propMatch[2]!;

      if (!CONTROL_KEYWORDS.has(type) && !CONTROL_KEYWORDS.has(name)) {
        const isReadonly = !trimmed.includes('set') && !trimmed.includes('init');
        props.push({
          name,
          type: truncateType(simplifyType(type)),
          readonly: isReadonly,
        });
      }
    }
  }

  return props;
}

function collectCsharpSignature(lines: readonly string[], startLine: number): string {
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

// ─── Plugin Factory ──────────────────────────────────────────────

const csharpParser: LanguageParser = {
  name: 'csharp',
  extensions: ['.cs'],
  parse: parseCsharp,
};

/**
 * Create the C# parser plugin.
 */
export function createCsharpParserPlugin(): CodemapPlugin {
  return {
    name: 'csharp-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(csharpParser);
    },
  };
}
