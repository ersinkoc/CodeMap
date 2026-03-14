/**
 * PHP regex/heuristic parser.
 *
 * Extracts structural information from PHP source files including:
 * classes, abstract classes, interfaces, traits, functions, methods,
 * namespaces, and use statements.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ExportInfo,
  ParamInfo,
  PropertyInfo,
  TraitInfo,
  PackageInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse PHP source file.
 */
function parsePhp(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'php');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const traits: TraitInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const packages: PackageInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines and PHP open/close tags
    if (!trimmed || trimmed === '<?php' || trimmed === '?>') continue;

    // ─── Namespace ─────────────────────────────────────────
    const nsMatch = trimmed.match(
      /^namespace\s+([A-Za-z0-9_\\]+)\s*;/,
    );
    if (nsMatch) {
      const nsName = nsMatch[1]!;
      packages.push({
        name: nsName,
        path: filePath,
      });
      // The namespace itself is treated as an export
      exports.push({
        names: [nsName],
        isReExport: false,
      });
      continue;
    }

    // ─── Use statements ────────────────────────────────────
    const useMatch = trimmed.match(
      /^use\s+([A-Za-z0-9_\\]+)(?:\s+as\s+(\w+))?\s*;/,
    );
    if (useMatch) {
      const fullPath = useMatch[1]!;
      const alias = useMatch[2];
      const parts = fullPath.split('\\');
      const importedName = alias ?? parts[parts.length - 1]!;

      imports.push({
        from: fullPath,
        names: [importedName],
        kind: 'external',
      });
      continue;
    }

    // Group use: use App\Models\{User, Post};
    const groupUseMatch = trimmed.match(
      /^use\s+([A-Za-z0-9_\\]+)\\\{(.+?)\}\s*;/,
    );
    if (groupUseMatch) {
      const basePath = groupUseMatch[1]!;
      const names = groupUseMatch[2]!
        .split(',')
        .map((n) => {
          const part = n.trim();
          const asMatch = part.match(/^(.+?)\s+as\s+(.+)$/);
          return asMatch ? asMatch[2]!.trim() : part;
        })
        .filter(Boolean);

      imports.push({
        from: basePath,
        names,
        kind: 'external',
      });
      continue;
    }

    // ─── Interfaces ────────────────────────────────────────
    const ifaceMatch = trimmed.match(
      /^interface\s+(\w+)(?:\s+extends\s+(.+?))?\s*\{/,
    );
    if (ifaceMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const methods = extractPhpInterfaceMethods(bodyLines);
      const extendsStr = ifaceMatch[2];
      const extendsArr = extendsStr
        ? extendsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      // PHP interfaces are always exported (public)
      classes.push({
        name: ifaceMatch[1]!,
        extends: extendsArr ? extendsArr[0] : undefined,
        implements: extendsArr && extendsArr.length > 1 ? extendsArr.slice(1) : undefined,
        methods,
        properties: [],
        exported: true,
        abstract: true,
        loc: endLine - i + 1,
      });
      exports.push({
        names: [ifaceMatch[1]!],
        isReExport: false,
      });
      i = endLine;
      continue;
    }

    // ─── Traits ────────────────────────────────────────────
    const traitMatch = trimmed.match(
      /^trait\s+(\w+)\s*\{/,
    );
    if (traitMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const methods = extractPhpClassMethods(bodyLines);

      traits.push({
        name: traitMatch[1]!,
        methods,
        exported: true,
      });
      exports.push({
        names: [traitMatch[1]!],
        isReExport: false,
      });
      i = endLine;
      continue;
    }

    // ─── Classes (abstract and concrete) ───────────────────
    const classMatch = trimmed.match(
      /^(abstract\s+)?(final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(.+?))?\s*\{/,
    );
    if (classMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const classBody = bodyLines.join('\n');

      const implementsStr = classMatch[5];
      const implementsArr = implementsStr
        ? implementsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const methods = extractPhpClassMethods(bodyLines);
      const properties = extractPhpProperties(classBody);

      // Constructor property promotion: extract promoted properties from __construct params
      const promotedProps = extractPromotedProperties(bodyLines);
      // Merge promoted properties, avoiding duplicates by name
      const existingNames = new Set(properties.map((p) => p.name));
      const uniquePromoted = promotedProps.filter((p) => !existingNames.has(p.name));
      const allProperties = [...properties, ...uniquePromoted];

      classes.push({
        name: classMatch[3]!,
        extends: classMatch[4],
        implements: implementsArr,
        methods,
        properties: allProperties,
        exported: true,
        abstract: !!classMatch[1],
        loc: endLine - i + 1,
      });
      exports.push({
        names: [classMatch[3]!],
        isReExport: false,
      });
      i = endLine;
      continue;
    }

    // ─── Free functions ────────────────────────────────────
    const fnMatch = trimmed.match(
      /^function\s+(\w+)\s*\(/,
    );
    if (fnMatch) {
      const endLine = findBlockEnd(lines, i);
      const fullSig = collectPhpSignature(lines, i);
      const params = parsePhpParams(fullSig);
      const returnType = extractPhpReturnType(fullSig);

      functions.push({
        name: fnMatch[1]!,
        params,
        returnType,
        exported: true,
        loc: endLine - i + 1,
      });
      exports.push({
        names: [fnMatch[1]!],
        isReExport: false,
      });
      i = endLine;
      continue;
    }
  }

  return {
    path: filePath,
    language: 'php',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'php'),
    imports,
    exports,
    functions,
    classes,
    interfaces: [],
    types: [],
    enums: [],
    constants: [],
    traits: traits.length > 0 ? traits : undefined,
    packages: packages.length > 0 ? packages : undefined,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────

/**
 * Extract methods from a PHP class body.
 */
function extractPhpClassMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();

    const methodMatch = trimmed.match(
      /^(public|protected|private)?\s*(static\s+)?(abstract\s+)?function\s+(\w+)\s*\(/,
    );
    if (methodMatch) {
      const isAbstract = !!methodMatch[3];
      const endLine = isAbstract && trimmed.includes(';')
        ? i
        : findBlockEnd(bodyLines as string[], i);
      const fullSig = collectPhpSignature(bodyLines as string[], i);
      const params = parsePhpParams(fullSig);
      const returnType = extractPhpReturnType(fullSig);
      const visibility = (methodMatch[1] ?? 'public') as 'public' | 'protected' | 'private';

      methods.push({
        name: methodMatch[4]!,
        params,
        returnType,
        exported: visibility === 'public',
        static: !!methodMatch[2],
        scope: visibility,
        loc: endLine - i + 1,
      });
      i = endLine;
    }
  }

  return methods;
}

/**
 * Extract method signatures from a PHP interface body.
 */
function extractPhpInterfaceMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();

    const methodMatch = trimmed.match(
      /^(public\s+)?(static\s+)?function\s+(\w+)\s*\(/,
    );
    if (methodMatch) {
      const fullSig = collectPhpSignature(bodyLines as string[], i);
      const params = parsePhpParams(fullSig);
      const returnType = extractPhpReturnType(fullSig);

      methods.push({
        name: methodMatch[3]!,
        params,
        returnType,
        exported: true,
        static: !!methodMatch[2],
        scope: 'public',
        loc: 1,
      });
    }
  }

  return methods;
}

/**
 * Extract properties from a PHP class body.
 */
function extractPhpProperties(body: string): PropertyInfo[] {
  const props: PropertyInfo[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: public string $name; or protected static int $count = 0;
    // Supports union types (int|string), intersection types (Foo&Bar), and nullable types (?Type)
    const propMatch = trimmed.match(
      /^(public|protected|private)\s+(static\s+)?(readonly\s+)?(?:(\?\s*[\w\\|&]+|[\w\\|&]+)\s+)?\$(\w+)/,
    );
    if (propMatch && !trimmed.includes('function')) {
      const typeStr = propMatch[4];
      props.push({
        name: '$' + propMatch[5]!,
        type: typeStr ? truncateType(simplifyType(typeStr)) : 'mixed',
        scope: propMatch[1] as PropertyInfo['scope'],
        static: !!propMatch[2],
        readonly: !!propMatch[3],
      });
    }
  }

  return props;
}

/**
 * Extract promoted properties from a PHP constructor.
 * Scans class body for __construct method and looks for parameters with visibility modifiers.
 */
function extractPromotedProperties(bodyLines: readonly string[]): PropertyInfo[] {
  const props: PropertyInfo[] = [];

  // Find __construct method
  let ctorStart = -1;
  for (let i = 0; i < bodyLines.length; i++) {
    const trimmed = bodyLines[i]!.trim();
    if (/function\s+__construct\s*\(/.test(trimmed)) {
      ctorStart = i;
      break;
    }
  }

  if (ctorStart === -1) return props;

  // Collect the full constructor signature
  const sig = collectPhpSignature(bodyLines as string[], ctorStart);

  // Extract the parameter list from the signature
  const parenMatch = sig.match(/\(([^)]*)\)/);
  if (!parenMatch || !parenMatch[1]?.trim()) return props;

  const paramsStr = parenMatch[1];
  let depth = 0;
  let current = '';

  const rawParams: string[] = [];
  for (const ch of paramsStr) {
    if (ch === '<' || ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === '}' || ch === ']') depth--;

    if (ch === ',' && depth === 0) {
      rawParams.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) rawParams.push(current.trim());

  // Check each param for visibility modifier (promoted property)
  for (const raw of rawParams) {
    const promotedMatch = raw.match(
      /^(public|protected|private)\s+(?:(readonly)\s+)?(?:(\??\s*[\w\\|&]+)\s+)?\$(\w+)/,
    );
    if (promotedMatch) {
      const visibility = promotedMatch[1] as PropertyInfo['scope'];
      const isReadonly = !!promotedMatch[2];
      const typeStr = promotedMatch[3];
      props.push({
        name: '$' + promotedMatch[4]!,
        type: typeStr ? truncateType(simplifyType(typeStr)) : 'mixed',
        scope: visibility,
        readonly: isReadonly || undefined,
      });
    }
  }

  return props;
}

/**
 * Collect a function/method signature across multiple lines.
 */
function collectPhpSignature(lines: readonly string[], startLine: number): string {
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
            sig += ' ' + lines[i + 1]!.trim();
          }
          return sig;
        }
      }
    }

  }

  return sig;
}

/**
 * Parse PHP function parameters from a signature string.
 */
function parsePhpParams(signature: string): ParamInfo[] {
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
      const p = parseOnePhpParam(current.trim());
      if (p) params.push(p);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = parseOnePhpParam(current.trim());
  if (last) params.push(last);

  return params;
}

/**
 * Parse a single PHP parameter.
 * Forms: `Type $name`, `$name`, `Type $name = default`, `?Type $name`, `...$args`
 */
function parseOnePhpParam(raw: string): ParamInfo | null {
  if (!raw) return null;

  // Match: [?Type] [$name|...$name] [= default]
  // Supports union types (int|string) and intersection types (Foo&Bar)
  const match = raw.match(
    /^(?:(public|protected|private)\s+)?(?:(readonly)\s+)?(?:(\??\s*[\w\\|&]+)\s+)?(\.\.\.)?\$(\w+)(?:\s*=\s*(.+))?$/,
  );
  if (match) {
    const typeStr = match[3];
    const isVariadic = !!match[4];
    const name = (isVariadic ? '...$' : '$') + match[5]!;
    return {
      name,
      type: typeStr ? truncateType(simplifyType(typeStr)) : 'mixed',
      optional: !!match[6],
      defaultValue: match[6]?.trim(),
    };
  }

  return null;
}

/**
 * Extract return type from a PHP function signature.
 * Looks for `: Type` after the closing parenthesis.
 */
function extractPhpReturnType(signature: string): string {
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

  if (afterParen === -1) return 'void';

  const rest = signature.slice(afterParen).trim();
  // Match `: ReturnType` before `{` or `;`
  // Supports union types (int|string), intersection types (Foo&Bar), and nullable types (?Type)
  const colonMatch = rest.match(/^:\s*(\??\s*[\w\\|&]+)(?:\s*\{|\s*;|$)/);
  if (colonMatch) {
    return truncateType(simplifyType(colonMatch[1]!.trim()));
  }

  return 'void';
}

// ─── Plugin Factory ──────────────────────────────────────────────

const phpParser: LanguageParser = {
  name: 'php',
  extensions: ['.php'],
  parse: parsePhp,
};

/**
 * Create the PHP parser plugin.
 */
export function createPhpParserPlugin(): CodemapPlugin {
  return {
    name: 'php-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(phpParser);
    },
  };
}
