/**
 * TypeScript/JavaScript regex/heuristic parser.
 *
 * Extracts structural information from TS/JS/TSX/JSX files including:
 * functions, classes, interfaces, types, enums, React components/hooks,
 * imports, exports, and constants.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  TypeInfo,
  EnumInfo,
  ConstantInfo,
  ImportInfo,
  ExportInfo,
  ComponentInfo,
  HookInfo,
  ParamInfo,
  PropertyInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { findBlockEnd } from '../../utils/brace-counter.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

/**
 * Parse TypeScript/JavaScript source file.
 */
function parseTypeScript(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'typescript');
  const lines = stripped.split('\n');
  const rawLines = content.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const types: TypeInfo[] = [];
  const enums: EnumInfo[] = [];
  const constants: ConstantInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const components: ComponentInfo[] = [];
  const hooks: HookInfo[] = [];

  const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // ─── Imports ──────────────────────────────────────────
    // Use raw lines for import/re-export matching because
    // the comment stripper removes string literals (module specifiers).
    const rawTrimmed = rawLines[i]!.trim();

    // Handle multi-line imports: import { ... \n ... } from '...'
    if (/^import\s+(type\s+)?\{/.test(rawTrimmed) && !rawTrimmed.includes('}')) {
      let collected = rawTrimmed;
      let j = i + 1;
      while (j < rawLines.length) {
        const nextRaw = rawLines[j]!.trim();
        collected += ' ' + nextRaw;
        if (nextRaw.includes('}')) {
          // Might need to grab from line too
          if (!collected.includes('from')) {
            j++;
            if (j < rawLines.length) {
              collected += ' ' + rawLines[j]!.trim();
            }
          }
          break;
        }
        j++;
      }
      parseImport(collected, rawLines, i, imports);
      i = j;
      continue;
    } else {
      parseImport(rawTrimmed, rawLines, i, imports);
    }

    // ─── Re-exports ───────────────────────────────────────
    // Handle multi-line: export (type)? { ... } from '...'
    if (/^export\s+(type\s+)?\{/.test(rawTrimmed) && rawTrimmed.includes('from')) {
      parseReExport(rawTrimmed, exports);
    } else if (/^export\s+(type\s+)?\{/.test(rawTrimmed) && !rawTrimmed.includes('}')) {
      // Multi-line re-export: collect lines until closing brace + from
      let collected = rawTrimmed;
      let j = i + 1;
      while (j < rawLines.length) {
        const nextRaw = rawLines[j]!.trim();
        collected += ' ' + nextRaw;
        if (nextRaw.includes('from')) {
          break;
        }
        j++;
      }
      parseReExport(collected, exports);
      i = j;
      continue;
    } else {
      parseReExport(rawTrimmed, exports);
    }

    // ─── Enums ────────────────────────────────────────────
    const enumMatch = trimmed.match(
      /^(export\s+)?(const\s+)?enum\s+(\w+)/,
    );
    if (enumMatch) {
      const endLine = findBlockEnd(lines, i);
      const body = lines.slice(i, endLine + 1).join('\n');
      const members = extractEnumMembers(body);
      enums.push({
        name: enumMatch[3]!,
        members,
        exported: !!enumMatch[1],
      });
      i = endLine;
      continue;
    }

    // ─── Interfaces ───────────────────────────────────────
    const ifaceMatch = trimmed.match(
      /^(export\s+)?interface\s+(\w+)(\s*<[^>]*>)?(\s+extends\s+(.+?))?\s*\{/,
    );
    if (ifaceMatch) {
      const endLine = findBlockEnd(lines, i);
      const body = lines.slice(i + 1, endLine).join('\n');
      const extendsStr = ifaceMatch[5];
      const extendsArr = extendsStr
        ? extendsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const generics = ifaceMatch[3]
        ? extractGenerics(ifaceMatch[3])
        : undefined;

      interfaces.push({
        name: ifaceMatch[2]!,
        extends: extendsArr,
        properties: extractProperties(body),
        methods: extractInterfaceMethods(body),
        exported: !!ifaceMatch[1],
        generics,
      });
      i = endLine;
      continue;
    }

    // ─── Type aliases ─────────────────────────────────────
    // Use raw line so string literal type values (e.g. 'admin' | 'editor') are preserved
    const rawForType = rawLines[i]!.trim();
    const typeMatch = rawForType.match(
      /^(export\s+)?type\s+(\w+)(\s*<[^>]*>)?\s*=\s*(.*)/,
    );
    if (typeMatch) {
      let typeValue = typeMatch[4]!.trim();
      // Multi-line type — collect until semicolon
      if (!typeValue.endsWith(';')) {
        let j = i + 1;
        while (j < rawLines.length) {
          const nextLine = rawLines[j]!.trim();
          typeValue += ' ' + nextLine;
          if (nextLine.endsWith(';') || nextLine === '') break;
          j++;
        }
      }
      typeValue = typeValue.replace(/;$/, '').trim();
      const generics = typeMatch[3]
        ? extractGenerics(typeMatch[3])
        : undefined;

      types.push({
        name: typeMatch[2]!,
        type: truncateType(simplifyType(typeValue)),
        exported: !!typeMatch[1],
        generics,
      });
      continue;
    }

    // ─── Classes ──────────────────────────────────────────
    const classMatch = trimmed.match(
      /^(export\s+)?(abstract\s+)?class\s+(\w+)(\s+extends\s+(\w+))?(\s+implements\s+(.+?))?\s*\{/,
    );
    if (classMatch) {
      const endLine = findBlockEnd(lines, i);
      const bodyLines = lines.slice(i + 1, endLine);
      const classBody = bodyLines.join('\n');

      const implementsStr = classMatch[7];
      const implementsArr = implementsStr
        ? implementsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

      // Check for decorators on previous lines
      const decorators = collectDecorators(lines, i);

      classes.push({
        name: classMatch[3]!,
        extends: classMatch[5],
        implements: implementsArr,
        methods: extractClassMethods(bodyLines),
        properties: extractProperties(classBody),
        exported: !!classMatch[1],
        abstract: !!classMatch[2],
        decorators: decorators.length > 0 ? decorators : undefined,
        loc: endLine - i + 1,
      });
      i = endLine;
      continue;
    }

    // ─── Function declarations ────────────────────────────
    const funcMatch = trimmed.match(
      /^(export\s+)?(async\s+)?function\s*(\*)?\s*(\w+)\s*(<[^>]*>)?\s*\((.*)/,
    );
    if (funcMatch) {
      const endLine = findBlockEnd(lines, i);
      const fullSig = collectSignature(lines, i);
      const params = parseParams(fullSig);
      const returnType = extractReturnType(fullSig);
      const decorators = collectDecorators(lines, i);

      const funcInfo: FunctionInfo = {
        name: funcMatch[4]!,
        params,
        returnType,
        exported: !!funcMatch[1],
        async: !!funcMatch[2],
        generator: !!funcMatch[3],
        loc: endLine - i + 1,
        decorators: decorators.length > 0 ? decorators : undefined,
      };

      // Check if it's a React component or hook
      if (isPascalCase(funcMatch[4]!) && isTsx) {
        components.push({ ...funcInfo, kind: 'component' });
      } else if (funcMatch[4]!.startsWith('use') && funcMatch[4]!.length > 3) {
        hooks.push({ ...funcInfo, kind: 'hook' });
      } else {
        functions.push(funcInfo);
      }
      i = endLine;
      continue;
    }

    // ─── Arrow functions / const declarations ─────────────
    const arrowMatch = trimmed.match(
      /^(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*(.+?))?\s*=\s*(async\s+)?(?:\((.*)|(\w+)\s*=>)/,
    );
    if (arrowMatch) {
      const name = arrowMatch[3]!;
      const isAsync = !!arrowMatch[5];
      const endLine = findBlockEnd(lines, i);
      const fullSig = collectSignature(lines, i);
      const params = parseParams(fullSig);
      const typeAnnotation = arrowMatch[4];
      const returnType = typeAnnotation
        ? extractReturnTypeFromAnnotation(typeAnnotation)
        : extractArrowReturnType(fullSig);

      const funcInfo: FunctionInfo = {
        name,
        params,
        returnType,
        exported: !!arrowMatch[1],
        async: isAsync,
        loc: endLine - i + 1,
      };

      if (isPascalCase(name) && isTsx) {
        components.push({ ...funcInfo, kind: 'component' });
      } else if (name.startsWith('use') && name.length > 3) {
        hooks.push({ ...funcInfo, kind: 'hook' });
      } else {
        // Check if it's actually a constant (no arrow/function body)
        const isFunction = /=>\s*\{|=>\s*[^{]|function/.test(fullSig);
        if (isFunction) {
          functions.push(funcInfo);
        } else {
          constants.push({
            name,
            type: typeAnnotation ? truncateType(simplifyType(typeAnnotation)) : 'unknown',
            exported: !!arrowMatch[1],
          });
        }
      }
      continue;
    }

    // ─── Constants (non-function) ─────────────────────────
    const constMatch = trimmed.match(
      /^(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*(.+?))?\s*=\s*(?!.*(?:=>|\bfunction\b))/,
    );
    if (constMatch && !trimmed.includes('=>') && !trimmed.includes('function')) {
      constants.push({
        name: constMatch[3]!,
        type: constMatch[4] ? truncateType(simplifyType(constMatch[4])) : 'unknown',
        exported: !!constMatch[1],
      });
      continue;
    }

    // ─── Named exports ───────────────────────────────────
    const namedExportMatch = trimmed.match(/^export\s+\{(.+?)\}\s*;?$/);
    if (namedExportMatch) {
      const names = namedExportMatch[1]!
        .split(',')
        .map((n) => n.trim().split(/\s+as\s+/).pop()!.trim())
        .filter(Boolean);
      exports.push({ names, isReExport: false });
      continue;
    }
  }

  return {
    path: filePath,
    language: 'typescript',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'typescript'),
    imports,
    exports,
    functions,
    classes,
    interfaces,
    types,
    enums,
    constants,
    components: components.length > 0 ? components : undefined,
    hooks: hooks.length > 0 ? hooks : undefined,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────

function parseImport(
  line: string,
  rawLines: readonly string[],
  lineIdx: number,
  imports: ImportInfo[],
): void {
  // import { A, B } from 'module'
  const namedMatch = line.match(
    /^import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
  );
  if (namedMatch) {
    const names = namedMatch[2]!
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/).pop()!.trim())
      .filter(Boolean);
    const from = namedMatch[3]!;
    imports.push({
      from,
      names,
      kind: isExternalModule(from) ? 'external' : 'internal',
      isTypeOnly: !!namedMatch[1],
    });
    return;
  }

  // import Default from 'module'
  const defaultMatch = line.match(
    /^import\s+(type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/,
  );
  if (defaultMatch) {
    const from = defaultMatch[3]!;
    imports.push({
      from,
      names: [defaultMatch[2]!],
      kind: isExternalModule(from) ? 'external' : 'internal',
      isTypeOnly: !!defaultMatch[1],
    });
    return;
  }

  // import * as NS from 'module'
  const nsMatch = line.match(
    /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
  );
  if (nsMatch) {
    const from = nsMatch[2]!;
    imports.push({
      from,
      names: ['* as ' + nsMatch[1]!],
      kind: isExternalModule(from) ? 'external' : 'internal',
    });
  }
}

function parseReExport(line: string, exports: ExportInfo[]): void {
  const match = line.match(
    /^export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
  );
  if (match) {
    const names = match[1]!
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/).pop()!.trim())
      .filter(Boolean);
    exports.push({
      from: match[2],
      names,
      isReExport: true,
    });
    return;
  }

  // export * from 'module'
  const starMatch = line.match(
    /^export\s+\*\s+(?:as\s+(\w+)\s+)?from\s+['"]([^'"]+)['"]/,
  );
  if (starMatch) {
    exports.push({
      from: starMatch[2],
      names: starMatch[1] ? [starMatch[1]] : ['*'],
      isReExport: true,
    });
  }
}

function isExternalModule(from: string): boolean {
  return !from.startsWith('.') && !from.startsWith('/');
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

function collectDecorators(lines: readonly string[], lineIdx: number): string[] {
  const decorators: string[] = [];
  let j = lineIdx - 1;
  while (j >= 0) {
    const prev = lines[j]!.trim();
    const decMatch = prev.match(/^@(\w+)/);
    if (decMatch) {
      decorators.unshift(decMatch[1]!);
      j--;
    } else {
      break;
    }
  }
  return decorators;
}

function collectSignature(lines: readonly string[], startLine: number): string {
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
          // Collect a bit more for return type
          const rest = lines[i]!.slice(lines[i]!.indexOf(')') + 1);
          if (rest.includes('{') || rest.includes('=>')) {
            return sig;
          }
          // Maybe return type on next line
          if (i + 1 < lines.length) {
            sig += ' ' + lines[i + 1]!.trim();
          }
          return sig;
        }
      }
    }

    if (line.includes('{') || line.includes('=>')) {
      return sig;
    }
  }

  return sig;
}

function parseParams(signature: string): ParamInfo[] {
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
      const p = parseOneParam(current.trim());
      if (p) params.push(p);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = parseOneParam(current.trim());
  if (last) params.push(last);

  return params;
}

function parseOneParam(raw: string): ParamInfo | null {
  if (!raw) return null;

  // Remove decorators
  const cleaned = raw.replace(/^@\w+\s*(\(.*?\))?\s*/, '');
  if (!cleaned) return null;

  // Handle destructured params: { a, b }: Type
  const destructMatch = cleaned.match(/^(\{[^}]+\}|\[[^\]]+\])\s*(?::\s*(.+?))?(?:\s*=\s*(.+))?$/);
  if (destructMatch) {
    return {
      name: destructMatch[1]!,
      type: destructMatch[2] ? truncateType(simplifyType(destructMatch[2])) : 'unknown',
      defaultValue: destructMatch[3],
      optional: !!destructMatch[3],
    };
  }

  // name?: Type = default
  const match = cleaned.match(/^(\.\.\.)?([\w$]+)(\?)?\s*(?::\s*(.+?))?(?:\s*=\s*(.+))?$/);
  if (!match) return null;

  const name = (match[1] ?? '') + match[2]!;
  return {
    name,
    type: match[4] ? truncateType(simplifyType(match[4])) : 'unknown',
    optional: !!match[3] || !!match[5],
    defaultValue: match[5],
  };
}

function extractReturnType(signature: string): string {
  // Find the closing paren, then look for : Type
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
  const colonMatch = rest.match(/^:\s*(.+?)(?:\s*\{|$)/);
  if (colonMatch) {
    return truncateType(simplifyType(colonMatch[1]!.trim()));
  }

  return 'void';
}

function extractReturnTypeFromAnnotation(annotation: string): string {
  // For const fn: (args) => RetType = ...
  const arrowMatch = annotation.match(/=>\s*(.+)$/);
  if (arrowMatch) {
    return truncateType(simplifyType(arrowMatch[1]!.trim()));
  }
  return truncateType(simplifyType(annotation));
}

function extractArrowReturnType(signature: string): string {
  // Look for => after params
  const arrowIdx = signature.indexOf('=>');
  if (arrowIdx === -1) return 'void';

  // Check for : ReturnType before =>
  let parenDepth = 0;
  let afterParen = -1;

  for (let i = 0; i < arrowIdx; i++) {
    if (signature[i] === '(') parenDepth++;
    else if (signature[i] === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        afterParen = i + 1;
        break;
      }
    }
  }

  if (afterParen > 0) {
    const between = signature.slice(afterParen, arrowIdx).trim();
    const colonMatch = between.match(/^:\s*(.+)/);
    if (colonMatch) {
      return truncateType(simplifyType(colonMatch[1]!.trim()));
    }
  }

  return 'void';
}

function extractEnumMembers(body: string): string[] {
  const members: string[] = [];
  const memberRegex = /(\w+)\s*(?:=|,|\})/g;
  let match;
  let first = true;

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (first) {
      first = false;
      continue; // Skip the enum declaration line
    }
    const memberMatch = trimmed.match(/^(\w+)/);
    if (memberMatch && memberMatch[1] !== '}') {
      members.push(memberMatch[1]!);
    }
  }

  return members;
}

function extractProperties(body: string): PropertyInfo[] {
  const props: PropertyInfo[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    const propMatch = trimmed.match(
      /^(public|protected|private)?\s*(static\s+)?(readonly\s+)?(\w+)(\?)?\s*:\s*(.+?)\s*[;,]?\s*$/,
    );
    if (propMatch && !trimmed.includes('(')) {
      props.push({
        name: propMatch[4]!,
        type: truncateType(simplifyType(propMatch[6]!)),
        scope: propMatch[1] as PropertyInfo['scope'],
        static: !!propMatch[2],
        readonly: !!propMatch[3],
        optional: !!propMatch[5],
      });
    }
  }

  return props;
}

function extractClassMethods(bodyLines: readonly string[]): FunctionInfo[] {
  const methods: FunctionInfo[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    const trimmed = line.trim();

    const methodMatch = trimmed.match(
      /^(public|protected|private)?\s*(static\s+)?(async\s+)?(\w+)\s*(<[^>]*>)?\s*\(/,
    );
    if (methodMatch && methodMatch[4] !== 'if' && methodMatch[4] !== 'for' && methodMatch[4] !== 'while') {
      const endLine = findBlockEnd(bodyLines as string[], i);
      const fullSig = collectSignature(bodyLines as string[], i);
      const params = parseParams(fullSig);
      const returnType = extractReturnType(fullSig);
      const decorators = collectDecorators(bodyLines as string[], i);

      methods.push({
        name: methodMatch[4]!,
        params,
        returnType,
        exported: true, // class methods are accessible via the class
        async: !!methodMatch[3],
        static: !!methodMatch[2],
        scope: (methodMatch[1] as FunctionInfo['scope']) ?? 'public',
        loc: endLine - i + 1,
        decorators: decorators.length > 0 ? decorators : undefined,
      });
      i = endLine;
    }
  }

  return methods;
}

function extractInterfaceMethods(body: string): FunctionInfo[] {
  const methods: FunctionInfo[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const methodMatch = trimmed.match(/^(\w+)\s*(<[^>]*>)?\s*\((.+?)?\)\s*:\s*(.+?)\s*[;,]?\s*$/);
    if (methodMatch) {
      methods.push({
        name: methodMatch[1]!,
        params: methodMatch[3] ? parseParams('(' + methodMatch[3] + ')') : [],
        returnType: truncateType(simplifyType(methodMatch[4]!)),
        exported: true,
        loc: 1,
      });
    }
  }

  return methods;
}

function extractGenerics(str: string): string[] {
  const inner = str.replace(/^</, '').replace(/>$/, '');
  return inner
    .split(',')
    .map((g) => g.trim().split(/\s+/)[0]!)
    .filter(Boolean);
}

// ─── Plugin Factory ──────────────────────────────────────────────

const typescriptParser: LanguageParser = {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'],
  parse: parseTypeScript,
};

/**
 * Create the TypeScript/JavaScript parser plugin.
 */
export function createTypescriptParserPlugin(): CodemapPlugin {
  return {
    name: 'typescript-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(typescriptParser);
    },
  };
}
