/**
 * Ruby language regex/heuristic parser.
 *
 * Extracts structural information from Ruby files including:
 * classes, modules, methods, constants, imports (require/include/extend),
 * attr_accessor/reader/writer properties, and visibility tracking.
 * @module
 */

import type {
  CodemapPlugin,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ConstantInfo,
  ParamInfo,
  PropertyInfo,
  LanguageParser,
} from '../../types.js';
import { stripComments } from '../../utils/comment-stripper.js';
import { truncateType, simplifyType } from '../../utils/type-truncator.js';
import { estimateTokens, countLoc } from '../../token-estimator.js';

// ─── Ruby Block Keywords ──────────────────────────────────────────

/**
 * Keywords that open a new block requiring a matching `end`.
 */
const BLOCK_OPENERS = /^(class|module|def|do|if|unless|while|until|for|begin|case)\b/;

/**
 * Find the end of a Ruby block (keyword...end based).
 * Counts opener keywords vs `end` keywords starting from the given line.
 * Returns the line index of the matching `end`.
 */
function findRubyBlockEnd(lines: readonly string[], startLine: number): number {
  let depth = 0;

  for (let i = startLine; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    // Count block openers on this line
    // We check each token separately to handle inline conditionals
    const tokens = trimmed.split(/\s+/);
    for (const token of tokens) {
      if (BLOCK_OPENERS.test(token)) {
        depth++;
      }
    }

    // Count `end` keywords (must be standalone token)
    if (/^end\b/.test(trimmed) || /\bend$/.test(trimmed)) {
      // Only count standalone `end` — not `end_with?` etc.
      const endTokens = trimmed.split(/\s+/);
      for (const t of endTokens) {
        if (t === 'end') {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }
  }

  return lines.length - 1;
}

// ─── Parameter Parsing ──────────────────────────────────────────

/**
 * Parse Ruby method parameters.
 * Handles: (a, b = 10, *args, **kwargs, &block)
 */
function parseRubyParams(paramsStr: string): ParamInfo[] {
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

    // &block
    const blockMatch = s.match(/^&(\w+)$/);
    if (blockMatch) {
      params.push({ name: '&' + blockMatch[1]!, type: 'block' });
      continue;
    }

    // **kwargs
    const doubleMatch = s.match(/^(\*\*\w+)/);
    if (doubleMatch) {
      params.push({ name: doubleMatch[1]!, type: 'Hash' });
      continue;
    }

    // *args
    const splatMatch = s.match(/^(\*\w+)/);
    if (splatMatch) {
      params.push({ name: splatMatch[1]!, type: 'Array' });
      continue;
    }

    // name: default (keyword arg)
    const keywordMatch = s.match(/^(\w+):\s*(.+)$/);
    if (keywordMatch) {
      params.push({
        name: keywordMatch[1]!,
        type: 'unknown',
        optional: true,
        defaultValue: keywordMatch[2]!.trim(),
      });
      continue;
    }

    // name: (required keyword arg)
    const requiredKeywordMatch = s.match(/^(\w+):$/);
    if (requiredKeywordMatch) {
      params.push({ name: requiredKeywordMatch[1]!, type: 'unknown' });
      continue;
    }

    // name = default (value may be stripped if it was a string literal)
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

    // name = (default stripped — string literal was removed by comment stripper)
    const strippedDefaultMatch = s.match(/^(\w+)\s*=\s*$/);
    if (strippedDefaultMatch) {
      params.push({
        name: strippedDefaultMatch[1]!,
        type: 'unknown',
        optional: true,
      });
      continue;
    }

    // bare name
    if (/^\w+$/.test(s)) {
      params.push({ name: s, type: 'unknown' });
    }
  }

  return params;
}

// ─── Main Parser ──────────────────────────────────────────────────

/**
 * Parse Ruby source file.
 */
function parseRuby(content: string, filePath: string): FileAnalysis {
  const stripped = stripComments(content, 'ruby');
  const lines = stripped.split('\n');

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const constants: ConstantInfo[] = [];

  // Track current class context for method attachment
  interface ClassContext {
    name: string;
    extends?: string | undefined;
    startLine: number;
    endLine: number;
    indent: number;
    methods: FunctionInfo[];
    properties: PropertyInfo[];
    includes: string[];
    visibility: 'public' | 'protected' | 'private';
    exported: boolean;
  }

  const classStack: ClassContext[] = [];

  // Use raw lines for require statements because the comment stripper removes string literals
  const rawLines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;

    // ─── Require / Require_relative ──────────────────────
    const rawTrimmed = rawLines[i]!.trim();
    const requireMatch = rawTrimmed.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
    if (requireMatch) {
      const from = requireMatch[1]!;
      const isRelative = rawTrimmed.startsWith('require_relative');
      imports.push({
        from,
        names: [from.split('/').pop() ?? from],
        kind: isRelative ? 'internal' : 'external',
      });
      continue;
    }

    // ─── Include / Extend (mixins) ───────────────────────
    const includeMatch = trimmed.match(/^include\s+(\w+(?:::\w+)*)/);
    if (includeMatch) {
      const modName = includeMatch[1]!;
      // If inside a class, track as include; also add as import
      const currentClass = classStack.length > 0 ? classStack[classStack.length - 1] : undefined;
      if (currentClass) {
        currentClass!.includes.push(modName);
      }
      imports.push({
        from: modName,
        names: [modName.split('::').pop() ?? modName],
        kind: 'external',
      });
      continue;
    }

    const extendMatch = trimmed.match(/^extend\s+(\w+(?:::\w+)*)/);
    if (extendMatch) {
      const modName = extendMatch[1]!;
      const currentClass = classStack.length > 0 ? classStack[classStack.length - 1] : undefined;
      if (currentClass) {
        currentClass!.includes.push(modName);
      }
      imports.push({
        from: modName,
        names: [modName.split('::').pop() ?? modName],
        kind: 'external',
      });
      continue;
    }

    // ─── Visibility keywords ─────────────────────────────
    if (/^(private|protected|public)\s*$/.test(trimmed)) {
      const currentClass = classStack.length > 0 ? classStack[classStack.length - 1] : undefined;
      if (currentClass) {
        currentClass!.visibility = trimmed as 'public' | 'protected' | 'private';
      }
      continue;
    }

    // ─── Module declaration ──────────────────────────────
    const moduleMatch = trimmed.match(/^module\s+(\w+(?:::\w+)*)/);
    if (moduleMatch) {
      const name = moduleMatch[1]!;
      const endLine = findRubyBlockEnd(lines, i);
      classStack.push({
        name,
        startLine: i,
        endLine,
        indent,
        methods: [],
        properties: [],
        includes: [],
        visibility: 'public',
        exported: true,
      });
      continue;
    }

    // ─── Class declaration ───────────────────────────────
    const classMatch = trimmed.match(/^class\s+(\w+)(?:\s*<\s*(\w+(?:::\w+)*))?/);
    if (classMatch) {
      const name = classMatch[1]!;
      const extendsName = classMatch[2];
      const endLine = findRubyBlockEnd(lines, i);
      classStack.push({
        name,
        extends: extendsName,
        startLine: i,
        endLine,
        indent,
        methods: [],
        properties: [],
        includes: [],
        visibility: 'public',
        exported: true,
      });
      continue;
    }

    // ─── Attr accessor/reader/writer ─────────────────────
    const attrMatch = trimmed.match(/^attr_(accessor|reader|writer)\s+(.+)/);
    if (attrMatch) {
      const kind = attrMatch[1]!;
      const namesStr = attrMatch[2]!;
      const names = namesStr.split(',').map((n) => n.trim().replace(/^:/, '').replace(/\s.*$/, '')).filter(Boolean);
      const readonly = kind === 'reader';

      const currentClass = classStack.length > 0 ? classStack[classStack.length - 1] : undefined;
      for (const name of names) {
        const prop: PropertyInfo = {
          name,
          type: 'unknown',
          readonly: readonly || undefined,
        };
        if (currentClass) {
          currentClass!.properties.push(prop);
        }
      }
      continue;
    }

    // ─── Method definition ───────────────────────────────
    const methodMatch = trimmed.match(/^def\s+(self\.)?(\w+[?!=]?)(?:\s*\((.*)?\))?/);
    if (methodMatch) {
      const isStatic = !!methodMatch[1];
      const name = methodMatch[2]!;
      const paramsStr = methodMatch[3] ?? '';
      const endLine = findRubyBlockEnd(lines, i);

      const currentClass = classStack.length > 0 ? classStack[classStack.length - 1] : undefined;
      const scope = currentClass ? currentClass!.visibility : 'public';

      const funcInfo: FunctionInfo = {
        name: isStatic ? `self.${name}` : name,
        params: parseRubyParams(paramsStr),
        returnType: 'unknown',
        exported: scope === 'public',
        static: isStatic || undefined,
        scope,
        loc: endLine - i + 1,
      };

      if (currentClass) {
        currentClass!.methods.push(funcInfo);
      } else {
        functions.push(funcInfo);
      }

      i = endLine;
      continue;
    }

    // ─── Constants (UPPERCASE_NAME = value) ───────────────
    const constMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (constMatch) {
      constants.push({
        name: constMatch[1]!,
        type: 'unknown',
        exported: true,
      });
      continue;
    }

    // ─── Check if we've reached the end of a class/module ─
    if (trimmed === 'end') {
      // Pop class context if we're at the right level
      if (classStack.length > 0) {
        const ctx = classStack[classStack.length - 1]!;
        if (i >= ctx.endLine) {
          classStack.pop();
          classes.push({
            name: ctx.name,
            extends: ctx.extends,
            implements: ctx.includes.length > 0 ? ctx.includes : undefined,
            methods: ctx.methods,
            properties: ctx.properties,
            exported: ctx.exported,
            loc: ctx.endLine - ctx.startLine + 1,
          });
        }
      }
    }
  }

  // Flush any remaining class contexts (in case of unfinished blocks)
  while (classStack.length > 0) {
    const ctx = classStack.pop()!;
    classes.push({
      name: ctx.name,
      extends: ctx.extends,
      implements: ctx.includes.length > 0 ? ctx.includes : undefined,
      methods: ctx.methods,
      properties: ctx.properties,
      exported: ctx.exported,
      loc: ctx.endLine - ctx.startLine + 1,
    });
  }

  return {
    path: filePath,
    language: 'ruby',
    loc: countLoc(content),
    estimatedTokens: estimateTokens(content, 'ruby'),
    imports,
    exports: [],
    functions,
    classes,
    interfaces: [],
    types: [],
    enums: [],
    constants,
  };
}

// ─── Plugin Factory ──────────────────────────────────────────────

const rubyParser: LanguageParser = {
  name: 'ruby',
  extensions: ['.rb', '.rake', '.gemspec'],
  parse: parseRuby,
};

/**
 * Create the Ruby language parser plugin.
 */
export function createRubyParserPlugin(): CodemapPlugin {
  return {
    name: 'ruby-parser',
    version: '1.0.0',
    install(kernel) {
      kernel.registerParser(rubyParser);
    },
  };
}
