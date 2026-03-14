# @oxog/codemap - Zero-Dependency NPM Package

## Package Identity

| Field | Value |
|-------|-------|
| **NPM Package** | `@oxog/codemap` |
| **GitHub Repository** | `https://github.com/ersinkoc/codemap` |
| **Documentation Site** | `https://codemap.oxog.dev` |
| **License** | MIT |
| **Author** | Ersin Koç (ersinkoc) |

> **NO social media, Discord, email, or external links allowed.**

---

## Package Description

**One-line:** AST-based codebase structure extractor for token-efficient LLM navigation

@oxog/codemap scans your entire codebase and produces a compact structural map — function signatures, class hierarchies, type definitions, dependency graphs — that fits into an LLM's context window at 10-25x fewer tokens than reading raw source files. Instead of letting AI coding agents burn context by `cat`-ing every file, you give them a "codebase X-ray" that shows what's where and what shape it has, so they only open files they actually need to modify. Supports 7+ programming languages via a hybrid regex/heuristic parser engine with plugin architecture for accurate AST-based upgrades.

---

## NON-NEGOTIABLE RULES

These rules are **ABSOLUTE** and must be followed without exception.

### 1. ZERO RUNTIME DEPENDENCIES

```json
{
  "dependencies": {}
}
```

- Implement EVERYTHING from scratch
- No ts-morph, no tree-sitter, no babel, no acorn — nothing
- Write your own regex/heuristic parsers for each language
- Write your own file walker, glob matcher, config loader, git integration
- If you think you need a dependency, you don't

**Allowed devDependencies only:**
```json
{
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "tsup": "^8.0.0",
    "@types/node": "^22.0.0",
    "prettier": "^3.0.0",
    "eslint": "^9.0.0"
  }
}
```

### 2. 100% TEST COVERAGE

- Every line of code must be tested
- Every branch must be tested
- Every function must be tested
- **All tests must pass** (100% success rate)
- Use Vitest for testing
- Coverage thresholds enforced in config

### 3. MICRO-KERNEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│           User Code / CLI / Watch Mode                          │
├─────────────────────────────────────────────────────────────────┤
│           Plugin Registry + Auto-Detect by Extension            │
│  use() · register() · unregister() · list() · autoDetect()     │
├───────────────┬───────────────────┬─────────────────────────────┤
│  Language     │  Output           │  Feature                    │
│  Parsers      │  Formatters       │  Plugins                    │
│───────────────│───────────────────│─────────────────────────────│
│  ts-js (core) │  compact (core)   │  git-hooks                  │
│  go           │  json             │  claude-md                  │
│  python       │  markdown         │  monorepo                   │
│  rust         │  llms-txt         │  complexity                 │
│  php          │                   │  ignore                     │
│  java         │                   │  incremental                │
│  csharp       │                   │  chokidar (external)        │
├───────────────┴───────────────────┴─────────────────────────────┤
│                    Micro Kernel (zero-dep)                       │
│  Event Bus · Lifecycle · Error Boundary · File Scanner ·        │
│  Config Loader · fs.watch · Token Estimator · Git Diff Engine   │
└─────────────────────────────────────────────────────────────────┘
```

**Kernel responsibilities (minimal):**
- Plugin registration and lifecycle management
- Event bus for inter-plugin communication
- Error boundary and recovery
- Configuration management (`.codemaprc`, `codemap.config.ts`, `package.json#codemap`)
- File system scanning with ignore pattern support
- fs.watch-based file watching
- Token count estimation engine
- Git diff integration for incremental scanning

### 4. DEVELOPMENT WORKFLOW

Create these documents **FIRST**, before any code:

1. **SPECIFICATION.md** - Complete package specification
2. **IMPLEMENTATION.md** - Architecture and design decisions
3. **TASKS.md** - Ordered task list with dependencies

Only after all three documents are complete, implement code following TASKS.md sequentially.

### 5. TYPESCRIPT STRICT MODE

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "target": "ES2024",
    "module": "ESNext",
    "lib": ["ES2024"],
    "skipLibCheck": true
  }
}
```

### 6. LLM-NATIVE DESIGN

Package must be designed for both humans AND AI assistants:

- **llms.txt** file in root (< 2000 tokens)
- **Predictable API** naming (`scan`, `create`, `use`, `watch`, `format`)
- **Rich JSDoc** with @example on every public API
- **15+ examples** organized by category
- **README** optimized for LLM consumption

### 7. NO EXTERNAL LINKS

- ✅ GitHub repository URL
- ✅ Custom domain (codemap.oxog.dev)
- ✅ npm package URL
- ❌ Social media (Twitter, LinkedIn, etc.)
- ❌ Discord/Slack links
- ❌ Email addresses
- ❌ Donation/sponsor links

---

## CORE FEATURES

### 1. Multi-Language Regex/Heuristic Parser Engine

The core of codemap is a zero-dependency parser that extracts structural information from source files using regex patterns and heuristic rules. NOT a full AST parser — it targets ~85-90% accuracy which is sufficient for LLM navigation. Each language parser implements the `LanguageParser` interface and extracts: functions/methods with signatures, classes with hierarchy, interfaces/types/enums, exports/imports, React components and hooks (for TS/JS).

**Supported languages in V1:**

| Language | Extensions | Key Extractions |
|----------|-----------|-----------------|
| TypeScript/JavaScript | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts` | functions, classes, interfaces, types, enums, React components/hooks, exports, imports |
| Go | `.go` | functions, methods, structs, interfaces, packages, exported symbols |
| Python | `.py` | classes, functions, decorators, type hints, dataclasses, `__all__` exports |
| Rust | `.rs` | structs, enums, traits, impl blocks, pub functions, modules, derive macros |
| PHP | `.php` | classes, interfaces, traits, functions, namespaces, use statements |
| Java | `.java` | classes, interfaces, enums, records, methods, annotations, packages |
| C# | `.cs` | classes, interfaces, records, structs, methods, namespaces, attributes |

**API Example:**
```typescript
import { scan } from '@oxog/codemap';
const map = await scan('./src'); // auto-detects languages by extension
```

### 2. Compact Output Format (Token-Optimized)

The default output format uses Unicode symbols for maximum information density with minimum token count. This is the primary reason codemap exists — a 50K LOC project produces a map of ~5K tokens instead of ~250K tokens for raw file reads.

**Symbol legend:**
```
⚛ React Component    🪝 React Hook
ƒ Function           ◆ Class
◇ Interface          τ Type alias
ε Enum               κ Constant
↗ Re-export          ← extends
⊳ implements         ✦ Struct (Go/Rust/C#)
Δ Trait/Protocol      λ Method
π Package/Namespace   ∂ Decorator/Annotation
```

**Output example:**
```
# CODEMAP — ./src
# Generated: 2026-03-14 | Files: 42 | LOC: 8,340 | ~2,847 tokens

## EXTERNAL DEPS
  react: useState, useEffect, useCallback
  express: Router, Request, Response
  zod: z, ZodSchema

## FILES

━━ services/user-service.ts (120L) [~340T] [C:4]
  ◆ UserService ← BaseService ⊳ Cacheable (95L)
    .async getById(id: string) → Promise<User | null>
    .async create(input: CreateUserInput) → Promise<User>
    .async updateRole(id: string, role: UserRole) → Promise<void>
    .async listByRole(role: UserRole, limit?: number) → Promise<User[]>
    .clearCache() → void
  κ userService: UserService

━━ types/user.ts (30L) [~85T] [C:1]
  ◇ User { id: string, name: string, email: string, role: UserRole, createdAt: Date }
  ◇ CreateUserInput { name: string, email: string, role?: UserRole }
  τ UserRole = 'admin' | 'editor' | 'viewer'
  ε OrderStatus [Pending, Confirmed, Shipped, Delivered, Cancelled]

## DEPENDENCY GRAPH
  services/user-service.ts → types/user.ts, utils/validators.ts
  components/UserCard.tsx → types/user.ts, hooks/use-user.ts
```

Note: `[~340T]` = estimated token count, `[C:4]` = cyclomatic complexity score.

### 3. Multiple Output Formats

Four output format plugins, each serving a different use case:

| Format | Use Case | Token Efficiency |
|--------|----------|-----------------|
| `compact` | LLM context injection (default) | ★★★★★ |
| `json` | Programmatic consumption, tooling | ★★★ |
| `markdown` | Human reading, GitHub preview | ★★★★ |
| `llms-txt` | llms.txt spec compliance | ★★★★ |

**API Example:**
```typescript
const map = await scan('./src', { format: 'json' });
const map = await scan('./src', { format: 'markdown' });
```

### 4. CLI Interface

Full-featured CLI accessible via `npx @oxog/codemap`:

```bash
# Basic usage
npx @oxog/codemap                          # scan ./src, compact format, → .codemap/
npx @oxog/codemap ./lib                    # custom root directory
npx @oxog/codemap ./src --format=json      # specific format
npx @oxog/codemap ./src --format=compact,json  # multiple formats

# Watch mode
npx @oxog/codemap --watch                  # fs.watch, auto-regen on change
npx @oxog/codemap --watch --debounce=500   # custom debounce ms

# Incremental
npx @oxog/codemap --incremental            # only scan git-changed files
npx @oxog/codemap --full                   # force full rescan

# Features
npx @oxog/codemap inject                   # inject map into CLAUDE.md
npx @oxog/codemap hook install             # install git pre-commit hook
npx @oxog/codemap hook uninstall           # remove git hook
npx @oxog/codemap init                     # generate .codemapignore + config

# Info
npx @oxog/codemap stats                    # show token counts, complexity
npx @oxog/codemap --version
npx @oxog/codemap --help
```

### 5. Builder API (Programmatic)

For complex configurations, a chainable builder API alongside the simple functional API:

```typescript
// Simple functional API
import { scan } from '@oxog/codemap';
const map = await scan('./src');
const map = await scan('./src', { format: 'json', incremental: true });

// Builder API
import { codemap } from '@oxog/codemap';
const map = await codemap()
  .root('./src')
  .format('compact')
  .ignore('**/*.test.ts', '**/*.spec.ts')
  .languages(['typescript', 'go', 'python'])
  .incremental()
  .withComplexity()
  .withTokenCounts()
  .scan();

// Watch mode
const watcher = codemap()
  .root('./src')
  .format('compact')
  .debounce(300)
  .watch();

watcher.on('change', (map) => { /* new map */ });
watcher.on('error', (err) => { /* handle */ });
watcher.close();

// Custom plugin
import { codemap, createPlugin } from '@oxog/codemap';
const myPlugin = createPlugin({ name: 'kotlin', version: '1.0.0', /* ... */ });
const map = await codemap().use(myPlugin).scan();
```

### 6. Watch Mode

File system watching with auto-regeneration. Core uses Node.js native `fs.watch` (zero-dep). Optional chokidar plugin provides more reliable cross-platform watching.

```typescript
import { codemap } from '@oxog/codemap';

const watcher = codemap()
  .root('./src')
  .debounce(300)
  .watch();

watcher.on('change', (event) => {
  console.log(`Map updated: ${event.changedFiles.length} files changed`);
  console.log(`Total tokens: ${event.map.stats.totalTokens}`);
});

watcher.on('error', (err) => console.error(err));

// Graceful shutdown
process.on('SIGINT', () => watcher.close());
```

### 7. Incremental Scanning (Git Diff)

Uses `git diff` output to only re-parse changed files. Maintains a cache in `.codemap/cache.json` with file hashes. Falls back to full scan when cache is missing or stale.

```typescript
const map = await scan('./src', { incremental: true });
// Only re-parses files changed since last scan
// Uses .codemap/cache.json for file hash comparison
```

### 8. Monorepo Support

Detects and respects workspace configurations from pnpm, yarn, npm, and turborepo. Scans each workspace package independently and produces a unified or per-package map.

```typescript
const map = await codemap()
  .root('.')
  .monorepo()    // auto-detect workspaces
  .scan();

// map.workspaces = ['packages/core', 'packages/cli', 'apps/web']
// map.packages['packages/core'] = { files: [...], graph: {...} }
```

### 9. CLAUDE.md Auto-Injection

Reads `.codemap/map.txt` and injects/updates it into the project's CLAUDE.md file between marker comments. Creates CLAUDE.md if it doesn't exist. Preserves existing content outside markers.

```bash
npx @oxog/codemap inject
```

Produces in CLAUDE.md:
```markdown
<!-- CODEMAP:START -->
## Codebase Map
Always read this map before opening source files. Only open files you need to edit.

[compact map content here]

### Symbol Legend
ƒ Function  ◆ Class  ◇ Interface  τ Type  ε Enum  ⚛ Component  🪝 Hook
<!-- CODEMAP:END -->
```

### 10. Git Hook Integration

Installs a pre-commit hook that auto-regenerates the map and stages it. Uses the `.git/hooks/pre-commit` mechanism directly — no husky dependency.

```bash
npx @oxog/codemap hook install    # creates .git/hooks/pre-commit
npx @oxog/codemap hook uninstall  # removes it
```

### 11. Complexity Scoring

Calculates cyclomatic complexity per function/method using heuristic counting of branching keywords (`if`, `else`, `switch`, `case`, `for`, `while`, `catch`, `&&`, `||`, `??`, ternary). Reports per-file average and per-function scores in the map output.

```
━━ services/payment.ts (340L) [~890T] [C:12]
  ƒ async processPayment(order: Order) → Result<Payment> [C:8]
  ƒ validateCard(card: CardInput) → boolean [C:5]
  ƒ calculateTax(amount: number, region: string) → number [C:12]
```

### 12. Token Count Estimation

Estimates token count per file using character-based heuristics (~3.5 chars per token for code, adjusted by language). Reports per-file and total estimates in map output and `.codemap/stats.json`.

### 13. Custom Ignore Patterns

`.codemapignore` file using gitignore syntax. Merged with built-in defaults (node_modules, dist, .git, etc.):

```gitignore
# .codemapignore
*.test.ts
*.spec.ts
*.stories.tsx
__mocks__/
fixtures/
generated/
*.d.ts
```

### 14. Configuration System

Config loaded from (in priority order):
1. CLI flags
2. `codemap.config.ts` / `codemap.config.js`
3. `package.json#codemap` field
4. `.codemaprc` (JSON)
5. Built-in defaults

```typescript
// codemap.config.ts
import { defineConfig } from '@oxog/codemap';

export default defineConfig({
  root: './src',
  output: '.codemap',
  format: ['compact', 'json'],
  languages: ['typescript', 'go', 'python'],
  ignore: ['**/*.test.ts'],
  incremental: true,
  watch: {
    debounce: 300,
  },
  complexity: true,
  tokenCounts: true,
  monorepo: true,
});
```

---

## PLUGIN SYSTEM

### Plugin Interface

```typescript
/**
 * Base plugin interface for extending codemap functionality.
 *
 * @typeParam TContext - Shared scanning context type
 *
 * @example
 * ```typescript
 * import { createPlugin } from '@oxog/codemap';
 *
 * const myPlugin = createPlugin({
 *   name: 'kotlin',
 *   version: '1.0.0',
 *   install(kernel) {
 *     kernel.registerParser({
 *       name: 'kotlin',
 *       extensions: ['.kt', '.kts'],
 *       parse: (content, filePath) => ({ ... }),
 *     });
 *   },
 * });
 * ```
 */
export interface CodemapPlugin<TContext = CodemapContext> {
  /** Unique plugin identifier (kebab-case) */
  readonly name: string;

  /** Semantic version */
  readonly version: string;

  /** Other plugins this depends on */
  readonly dependencies?: readonly string[];

  /** Called when plugin is registered */
  install: (kernel: CodemapKernel<TContext>) => void;

  /** Called after all plugins installed, before scan */
  onInit?: (context: TContext) => void | Promise<void>;

  /** Called after scan completes */
  onScanComplete?: (result: ScanResult) => void | Promise<void>;

  /** Called when plugin is unregistered */
  onDestroy?: () => void | Promise<void>;

  /** Called on error in this plugin */
  onError?: (error: Error) => void;
}

/**
 * Language parser interface for adding language support.
 */
export interface LanguageParser {
  /** Language identifier (lowercase) */
  readonly name: string;

  /** File extensions this parser handles (with dot) */
  readonly extensions: readonly string[];

  /**
   * Parse a source file and extract structural information.
   * @param content - Raw file content as string
   * @param filePath - Relative file path from root
   * @returns Extracted structural data
   */
  parse: (content: string, filePath: string) => FileAnalysis;
}

/**
 * Output formatter interface for custom output formats.
 */
export interface OutputFormatter {
  /** Format identifier (lowercase) */
  readonly name: string;

  /** File extension for output (without dot) */
  readonly extension: string;

  /**
   * Format the scan result into a string output.
   * @param result - Complete scan result
   * @param options - Formatter-specific options
   * @returns Formatted string output
   */
  format: (result: ScanResult, options?: Record<string, unknown>) => string;
}
```

### Core Plugins (Always Loaded)

| Plugin | Description |
|--------|-------------|
| `typescript-parser` | Regex/heuristic parser for TS/JS/TSX/JSX/MJS/MTS files. Extracts functions, classes, interfaces, types, enums, React components/hooks, imports, exports, re-exports. |
| `compact-formatter` | Token-optimized output format using Unicode symbols. Default output format. |
| `file-scanner` | Directory walker with ignore pattern support. Respects `.codemapignore` and built-in ignore list. |
| `config-loader` | Configuration resolution from CLI, config files, package.json, rc file, and defaults. |
| `token-estimator` | Character-based token count estimation engine, language-aware ratios. |

### Optional Plugins (Opt-in, shipped with package)

| Plugin | Description | Enable |
|--------|-------------|--------|
| `go-parser` | Regex/heuristic parser for Go files | Auto-detected by `.go` extension |
| `python-parser` | Regex/heuristic parser for Python files | Auto-detected by `.py` extension |
| `rust-parser` | Regex/heuristic parser for Rust files | Auto-detected by `.rs` extension |
| `php-parser` | Regex/heuristic parser for PHP files | Auto-detected by `.php` extension |
| `java-parser` | Regex/heuristic parser for Java files | Auto-detected by `.java` extension |
| `csharp-parser` | Regex/heuristic parser for C# files | Auto-detected by `.cs` extension |
| `json-formatter` | JSON output format for programmatic use | `format: 'json'` |
| `markdown-formatter` | Human-readable Markdown output | `format: 'markdown'` |
| `llms-txt-formatter` | llms.txt spec compliant output | `format: 'llms-txt'` |
| `git-hooks` | Pre-commit hook auto-install/uninstall | `codemap hook install` |
| `claude-md` | CLAUDE.md injection between markers | `codemap inject` |
| `monorepo` | Workspace detection and per-package scanning | `monorepo: true` |
| `complexity` | Cyclomatic complexity scoring per function | `complexity: true` |
| `ignore` | `.codemapignore` file support (gitignore syntax) | Always active when `.codemapignore` exists |
| `incremental` | Git diff based selective rescanning with cache | `incremental: true` |

### External Plugins (User-installed, not shipped)

| Plugin | Description |
|--------|-------------|
| `chokidar-watcher` | Reliable cross-platform file watching using chokidar |
| `tree-sitter-*` | WASM-based accurate AST parsers for any language |
| Community plugins | Any plugin implementing `CodemapPlugin` interface |

---

## TYPE DEFINITIONS

```typescript
/** Configuration for codemap */
export interface CodemapConfig {
  /** Root directory to scan (default: './src') */
  readonly root: string;
  /** Output directory (default: '.codemap') */
  readonly output: string;
  /** Output format(s) */
  readonly format: FormatType | readonly FormatType[];
  /** Languages to scan (default: auto-detect) */
  readonly languages?: readonly LanguageId[];
  /** Additional ignore patterns */
  readonly ignore?: readonly string[];
  /** Enable incremental scanning */
  readonly incremental?: boolean;
  /** Watch mode configuration */
  readonly watch?: WatchConfig | boolean;
  /** Enable complexity scoring */
  readonly complexity?: boolean;
  /** Enable token count estimation */
  readonly tokenCounts?: boolean;
  /** Enable monorepo workspace detection */
  readonly monorepo?: boolean;
}

export type FormatType = 'compact' | 'json' | 'markdown' | 'llms-txt';
export type LanguageId = 'typescript' | 'go' | 'python' | 'rust' | 'php' | 'java' | 'csharp';

export interface WatchConfig {
  /** Debounce interval in ms (default: 300) */
  readonly debounce?: number;
  /** Use polling instead of native fs events */
  readonly polling?: boolean;
  /** Polling interval in ms */
  readonly interval?: number;
}

/** Result of scanning a codebase */
export interface ScanResult {
  /** Root directory that was scanned */
  readonly root: string;
  /** Timestamp of scan */
  readonly timestamp: string;
  /** All analyzed files */
  readonly files: readonly FileAnalysis[];
  /** Internal dependency graph */
  readonly dependencyGraph: Readonly<Record<string, readonly string[]>>;
  /** External package dependencies */
  readonly externalDeps: Readonly<Record<string, readonly string[]>>;
  /** Scan statistics */
  readonly stats: ScanStats;
  /** Per-workspace results (monorepo only) */
  readonly workspaces?: Readonly<Record<string, ScanResult>>;
}

export interface ScanStats {
  readonly fileCount: number;
  readonly totalLoc: number;
  readonly totalTokens: number;
  readonly languageBreakdown: Readonly<Record<LanguageId, number>>;
  readonly scanDurationMs: number;
  readonly incremental: boolean;
  readonly changedFiles?: number;
}

/** Analysis result for a single file */
export interface FileAnalysis {
  readonly path: string;
  readonly language: LanguageId;
  readonly loc: number;
  readonly estimatedTokens: number;
  readonly complexity?: number;
  readonly imports: readonly ImportInfo[];
  readonly exports: readonly ExportInfo[];
  readonly functions: readonly FunctionInfo[];
  readonly classes: readonly ClassInfo[];
  readonly interfaces: readonly InterfaceInfo[];
  readonly types: readonly TypeInfo[];
  readonly enums: readonly EnumInfo[];
  readonly constants: readonly ConstantInfo[];
  readonly components?: readonly ComponentInfo[];   // React (TS/JS only)
  readonly hooks?: readonly HookInfo[];             // React (TS/JS only)
  readonly structs?: readonly StructInfo[];          // Go, Rust, C#
  readonly traits?: readonly TraitInfo[];            // Rust, PHP
  readonly packages?: readonly PackageInfo[];        // Go, Java, C#, PHP
}

export interface FunctionInfo {
  readonly name: string;
  readonly params: readonly ParamInfo[];
  readonly returnType: string;
  readonly exported: boolean;
  readonly async?: boolean;
  readonly generator?: boolean;
  readonly static?: boolean;
  readonly scope?: 'public' | 'protected' | 'private';
  readonly complexity?: number;
  readonly loc: number;
  readonly decorators?: readonly string[];
}

export interface ParamInfo {
  readonly name: string;
  readonly type: string;
  readonly optional?: boolean;
  readonly defaultValue?: string;
}

export interface ClassInfo {
  readonly name: string;
  readonly extends?: string;
  readonly implements?: readonly string[];
  readonly methods: readonly FunctionInfo[];
  readonly properties: readonly PropertyInfo[];
  readonly exported: boolean;
  readonly abstract?: boolean;
  readonly decorators?: readonly string[];
  readonly loc: number;
}

export interface PropertyInfo {
  readonly name: string;
  readonly type: string;
  readonly scope?: 'public' | 'protected' | 'private';
  readonly static?: boolean;
  readonly readonly?: boolean;
  readonly optional?: boolean;
}

export interface InterfaceInfo {
  readonly name: string;
  readonly extends?: readonly string[];
  readonly properties: readonly PropertyInfo[];
  readonly methods?: readonly FunctionInfo[];
  readonly exported: boolean;
  readonly generics?: readonly string[];
}

export interface TypeInfo {
  readonly name: string;
  readonly type: string;
  readonly exported: boolean;
  readonly generics?: readonly string[];
}

export interface EnumInfo {
  readonly name: string;
  readonly members: readonly string[];
  readonly exported: boolean;
}

export interface ConstantInfo {
  readonly name: string;
  readonly type: string;
  readonly exported: boolean;
}

export interface ComponentInfo extends FunctionInfo {
  readonly kind: 'component';
}

export interface HookInfo extends FunctionInfo {
  readonly kind: 'hook';
}

export interface StructInfo {
  readonly name: string;
  readonly fields: readonly PropertyInfo[];
  readonly methods: readonly FunctionInfo[];
  readonly exported: boolean;
  readonly derives?: readonly string[];      // Rust
  readonly embeds?: readonly string[];       // Go
}

export interface TraitInfo {
  readonly name: string;
  readonly methods: readonly FunctionInfo[];
  readonly exported: boolean;
  readonly superTraits?: readonly string[];
}

export interface ImportInfo {
  readonly from: string;
  readonly names: readonly string[];
  readonly kind: 'internal' | 'external';
  readonly isTypeOnly?: boolean;
}

export interface ExportInfo {
  readonly from?: string;
  readonly names: readonly string[];
  readonly isReExport: boolean;
}

export interface PackageInfo {
  readonly name: string;
  readonly path: string;
}
```

---

## TECHNICAL REQUIREMENTS

| Requirement | Value |
|-------------|-------|
| Runtime | Node.js |
| Module Format | ESM + CJS (dual) |
| Node.js Version | >= 22 |
| TypeScript Version | >= 5.7 |
| Bundle Size (core) | < 5KB gzipped |
| Bundle Size (all core plugins) | < 10KB gzipped |
| Bundle Size (all plugins) | < 20KB gzipped |

---

## LANGUAGE PARSER DESIGN GUIDE

Each language parser is a regex/heuristic-based extractor. They do NOT build a full AST. They use line-by-line scanning with regex patterns to identify structural elements.

### Parser Strategy for Each Language

**TypeScript/JavaScript (Core — most thorough):**
- Function declarations: `/^export\s+(async\s+)?function\s+(\w+)/`
- Arrow functions: `/^export\s+const\s+(\w+)\s*=\s*(async\s+)?\(/`
- Classes: `/^export\s+(abstract\s+)?class\s+(\w+)(\s+extends\s+(\w+))?/`
- Interfaces: `/^export\s+interface\s+(\w+)/`
- Type aliases: `/^export\s+type\s+(\w+)\s*=/`
- Enums: `/^export\s+enum\s+(\w+)/`
- React components: PascalCase + `.tsx`/`.jsx` extension
- React hooks: `use*` naming convention
- Imports: standard import statement parsing
- Multi-line handling: brace counting for class/interface/function bodies
- String/comment stripping before pattern matching

**Go:**
- Functions: `/^func\s+(\w+)\((.*?)\)\s*(.*?)\s*\{/`
- Methods: `/^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\((.*?)\)/`
- Structs: `/^type\s+(\w+)\s+struct\s*\{/`
- Interfaces: `/^type\s+(\w+)\s+interface\s*\{/`
- Package: `/^package\s+(\w+)/`
- Exported = starts with uppercase

**Python:**
- Functions: `/^(\s*)def\s+(\w+)\((.*?)\)(\s*->\s*(.+?))?:/`
- Classes: `/^class\s+(\w+)(\((.+?)\))?:/`
- Decorators: `/^@(\w+)/` preceding function/class
- Type hints in function signatures
- `__all__` for export detection
- Indentation-based scope detection

**Rust:**
- Functions: `/^pub(\(crate\))?\s+(async\s+)?fn\s+(\w+)/`
- Structs: `/^pub\s+struct\s+(\w+)/`
- Enums: `/^pub\s+enum\s+(\w+)/`
- Traits: `/^pub\s+trait\s+(\w+)/`
- Impl blocks: `/^impl\s+(\w+)\s+for\s+(\w+)/` or `/^impl\s+(\w+)/`
- Derive macros: `#[derive(...)]`

**PHP:**
- Classes: `/^(abstract\s+)?class\s+(\w+)(\s+extends\s+(\w+))?/`
- Interfaces: `/^interface\s+(\w+)/`
- Traits: `/^trait\s+(\w+)/`
- Functions: `/^(public|protected|private)?\s*(static\s+)?function\s+(\w+)/`
- Namespaces: `/^namespace\s+(.+);/`
- Use statements

**Java:**
- Classes: `/^(public\s+)?(abstract\s+)?(final\s+)?class\s+(\w+)/`
- Interfaces: `/^(public\s+)?interface\s+(\w+)/`
- Enums: `/^(public\s+)?enum\s+(\w+)/`
- Records: `/^(public\s+)?record\s+(\w+)/`
- Methods: visibility + return type + name pattern
- Annotations: `@Override`, `@Deprecated`, etc.
- Package: `/^package\s+(.+);/`

**C#:**
- Classes: `/^(public|internal)?\s*(abstract\s+)?(sealed\s+)?class\s+(\w+)/`
- Interfaces: `/^(public|internal)?\s*interface\s+(\w+)/`
- Records: `/^(public|internal)?\s*record\s+(\w+)/`
- Structs: `/^(public|internal)?\s*struct\s+(\w+)/`
- Methods: visibility + static + return type + name pattern
- Namespaces: `/^namespace\s+(.+)/`
- Attributes: `[...]` preceding declarations

### Important Parser Rules

1. **Strip comments and strings first** — before any pattern matching, remove line comments, block comments, and string literals to avoid false positives
2. **Handle multi-line signatures** — use brace/paren counting to handle signatures that span multiple lines
3. **Truncate long types** — any type string > 80 chars gets truncated with `...`
4. **Track export status** — each language has different export mechanisms (export keyword, pub keyword, uppercase name, `__all__`, visibility modifiers)
5. **Handle decorators/annotations** — collect them and attach to the next declaration
6. **Scope detection** — track indentation (Python) or brace depth (others) for proper nesting

---

## OUTPUT DIRECTORY STRUCTURE

```
.codemap/
├── map.txt          # compact format output (always generated)
├── map.json         # json format (if format includes 'json')
├── map.md           # markdown format (if format includes 'markdown')
├── llms.txt         # llms-txt format (if format includes 'llms-txt')
├── cache.json       # incremental scan cache (file hashes)
└── stats.json       # token counts, complexity scores, language breakdown
```

`.codemap/` should be added to `.gitignore` by default EXCEPT `.codemap/map.txt` which should be committed so it's available for LLMs cloning the repo.

---

## LLM-NATIVE REQUIREMENTS

### 1. llms.txt File

Create `/llms.txt` in project root (< 2000 tokens):

```markdown
# @oxog/codemap

> AST-based codebase structure extractor for token-efficient LLM navigation

## Install

npm install @oxog/codemap

## Basic Usage

import { scan } from '@oxog/codemap';
const map = await scan('./src');
// map.files, map.dependencyGraph, map.stats

## API Summary

### Core
- `scan(root, options?)` - Scan codebase and return structural map
- `codemap()` - Create builder for complex configuration
- `createPlugin(config)` - Create a custom plugin
- `defineConfig(config)` - Type-safe config helper

### Builder
- `.root(path)` - Set root directory
- `.format(type)` - Set output format
- `.ignore(...patterns)` - Add ignore patterns
- `.languages([...])` - Restrict languages
- `.incremental()` - Enable incremental scanning
- `.withComplexity()` - Enable complexity scoring
- `.withTokenCounts()` - Enable token estimation
- `.watch()` - Start watching for changes
- `.scan()` - Execute scan

### CLI
- `npx @oxog/codemap` - Scan with defaults
- `npx @oxog/codemap --watch` - Watch mode
- `npx @oxog/codemap --incremental` - Incremental scan
- `npx @oxog/codemap inject` - Inject into CLAUDE.md
- `npx @oxog/codemap hook install` - Git pre-commit hook
- `npx @oxog/codemap init` - Initialize config

### Languages
typescript, go, python, rust, php, java, csharp (auto-detected by extension)

### Formats
compact (default), json, markdown, llms-txt

## Common Patterns

### Scan and write to file
import { scan } from '@oxog/codemap';
import { writeFileSync } from 'fs';
const map = await scan('./src', { format: 'compact' });
writeFileSync('.codemap/map.txt', map.output);

### Custom language plugin
import { codemap, createPlugin } from '@oxog/codemap';
const kotlin = createPlugin({
  name: 'kotlin',
  version: '1.0.0',
  install(kernel) {
    kernel.registerParser({ name: 'kotlin', extensions: ['.kt'], parse: (content) => ({...}) });
  },
});
await codemap().use(kotlin).scan();

### Watch with callback
import { codemap } from '@oxog/codemap';
const w = codemap().root('./src').watch();
w.on('change', (e) => console.log(e.map.stats.totalTokens));

## Errors

| Code | Meaning | Solution |
|------|---------|----------|
| ROOT_NOT_FOUND | Root directory doesn't exist | Check path |
| NO_FILES_FOUND | No scannable files in root | Check ignore patterns |
| PARSER_ERROR | Language parser failed on file | File may have syntax errors |
| CONFIG_ERROR | Invalid configuration | Check config file format |
| WATCH_ERROR | File watcher failed | Check permissions |
| CACHE_CORRUPT | Incremental cache is invalid | Delete .codemap/cache.json |
| GIT_NOT_FOUND | Git not available for incremental | Install git or use full scan |

## Links

- Docs: https://codemap.oxog.dev
- GitHub: https://github.com/ersinkoc/codemap
```

### 2. API Naming Standards

```typescript
// ✅ GOOD - Predictable
scan()          // Primary action
codemap()       // Builder factory
createPlugin()  // Plugin factory
defineConfig()  // Config helper
use()           // Register plugin
watch()         // Start watching
close()         // Stop watching
format()        // Set format
ignore()        // Add ignore pattern

// ❌ BAD - Avoid these
x(), proc(), do(), handle(), mgr(), exec(), run()
```

### 3. JSDoc Requirements

Every public API MUST have full JSDoc with @example:

```typescript
/**
 * Scan a codebase and produce a structural map.
 *
 * Analyzes all source files in the given directory, extracting
 * function signatures, class hierarchies, type definitions,
 * and dependency relationships. Returns a token-efficient
 * structural representation.
 *
 * @param root - Root directory to scan (default: './src')
 * @param options - Scan configuration options
 * @param options.format - Output format type (default: 'compact')
 * @param options.incremental - Only scan changed files (default: false)
 * @returns Complete scan result with files, graph, and stats
 * @throws {CodemapError} When root directory is not found
 *
 * @example Basic scan
 * ```typescript
 * import { scan } from '@oxog/codemap';
 * const result = await scan('./src');
 * console.log(result.stats.totalTokens);
 * ```
 *
 * @example With options
 * ```typescript
 * const result = await scan('./lib', {
 *   format: 'json',
 *   incremental: true,
 *   complexity: true,
 * });
 * ```
 */
export async function scan(root?: string, options?: ScanOptions): Promise<ScanResult> { }
```

### 4. Example Organization (minimum 15 examples)

```
examples/
├── 01-basic/
│   ├── minimal.ts              # 5-line scan
│   ├── with-options.ts         # All config options
│   ├── multiple-formats.ts     # Generate multiple outputs
│   └── README.md
├── 02-plugins/
│   ├── auto-detect.ts          # Extension-based auto-loading
│   ├── manual-register.ts      # Explicit plugin registration
│   ├── custom-parser.ts        # Writing a language parser
│   ├── custom-formatter.ts     # Writing an output formatter
│   └── README.md
├── 03-error-handling/
│   ├── try-catch.ts            # Error handling patterns
│   ├── parser-errors.ts        # Handling parse failures gracefully
│   └── README.md
├── 04-typescript/
│   ├── strict-types.ts         # Full type usage
│   ├── builder-pattern.ts      # Builder API with types
│   └── README.md
├── 05-integrations/
│   ├── claude-code/            # CLAUDE.md workflow
│   ├── git-hooks/              # Pre-commit integration
│   ├── ci-pipeline/            # GitHub Actions usage
│   └── README.md
└── 06-real-world/
    ├── monorepo-scan/          # Turborepo/pnpm workspace
    ├── incremental-workflow/   # Git diff based updates
    ├── multi-language/         # Mixed TS + Go + Python project
    └── README.md
```

### 5. Package.json Keywords

```json
{
  "keywords": [
    "codemap",
    "codebase",
    "ast",
    "parser",
    "llm",
    "context-window",
    "token-efficient",
    "zero-dependency",
    "typescript",
    "plugin",
    "micro-kernel",
    "code-analysis",
    "structural-analysis",
    "multi-language",
    "developer-tools",
    "ai-tools"
  ]
}
```

---

## PROJECT STRUCTURE

```
codemap/
├── .github/
│   └── workflows/
│       └── deploy.yml                    # Website deploy ONLY
├── src/
│   ├── index.ts                          # Public API exports (scan, codemap, createPlugin, defineConfig)
│   ├── kernel.ts                         # Micro kernel core
│   ├── types.ts                          # All type definitions
│   ├── errors.ts                         # Custom error classes (CodemapError, ParserError, ConfigError)
│   ├── builder.ts                        # Builder API implementation
│   ├── cli.ts                            # CLI entry point + argument parser
│   ├── config.ts                         # Config loader (files, package.json, defaults)
│   ├── scanner.ts                        # File system scanner/walker
│   ├── watcher.ts                        # fs.watch based file watcher
│   ├── token-estimator.ts               # Token count estimation engine
│   ├── utils/
│   │   ├── index.ts
│   │   ├── comment-stripper.ts          # Strip comments/strings from source
│   │   ├── brace-counter.ts             # Multi-line signature handling
│   │   ├── type-truncator.ts            # Truncate long type strings
│   │   ├── glob-matcher.ts              # Gitignore-compatible glob matching
│   │   └── git.ts                       # Git operations (diff, hash, hooks)
│   └── plugins/
│       ├── index.ts                      # Plugin exports
│       ├── registry.ts                   # Plugin registry + auto-detect
│       ├── core/
│       │   ├── index.ts
│       │   ├── typescript-parser.ts      # TS/JS/TSX/JSX parser
│       │   └── compact-formatter.ts      # Compact output formatter
│       └── optional/
│           ├── index.ts
│           ├── go-parser.ts
│           ├── python-parser.ts
│           ├── rust-parser.ts
│           ├── php-parser.ts
│           ├── java-parser.ts
│           ├── csharp-parser.ts
│           ├── json-formatter.ts
│           ├── markdown-formatter.ts
│           ├── llms-txt-formatter.ts
│           ├── git-hooks.ts
│           ├── claude-md.ts
│           ├── monorepo.ts
│           ├── complexity.ts
│           ├── ignore.ts
│           └── incremental.ts
├── tests/
│   ├── unit/
│   │   ├── kernel.test.ts
│   │   ├── builder.test.ts
│   │   ├── scanner.test.ts
│   │   ├── watcher.test.ts
│   │   ├── config.test.ts
│   │   ├── token-estimator.test.ts
│   │   ├── cli.test.ts
│   │   ├── utils/
│   │   │   ├── comment-stripper.test.ts
│   │   │   ├── brace-counter.test.ts
│   │   │   ├── type-truncator.test.ts
│   │   │   ├── glob-matcher.test.ts
│   │   │   └── git.test.ts
│   │   └── plugins/
│   │       ├── typescript-parser.test.ts
│   │       ├── go-parser.test.ts
│   │       ├── python-parser.test.ts
│   │       ├── rust-parser.test.ts
│   │       ├── php-parser.test.ts
│   │       ├── java-parser.test.ts
│   │       ├── csharp-parser.test.ts
│   │       ├── compact-formatter.test.ts
│   │       ├── json-formatter.test.ts
│   │       ├── markdown-formatter.test.ts
│   │       ├── llms-txt-formatter.test.ts
│   │       ├── git-hooks.test.ts
│   │       ├── claude-md.test.ts
│   │       ├── monorepo.test.ts
│   │       ├── complexity.test.ts
│   │       ├── ignore.test.ts
│   │       └── incremental.test.ts
│   ├── integration/
│   │   ├── full-scan.test.ts
│   │   ├── multi-language.test.ts
│   │   ├── incremental-scan.test.ts
│   │   ├── watch-mode.test.ts
│   │   └── cli.test.ts
│   └── fixtures/
│       ├── typescript-project/
│       ├── go-project/
│       ├── python-project/
│       ├── rust-project/
│       ├── php-project/
│       ├── java-project/
│       ├── csharp-project/
│       ├── mixed-project/
│       └── monorepo-project/
├── examples/
│   ├── 01-basic/
│   ├── 02-plugins/
│   ├── 03-error-handling/
│   ├── 04-typescript/
│   ├── 05-integrations/
│   └── 06-real-world/
├── website/
│   ├── public/
│   │   ├── CNAME                         # codemap.oxog.dev
│   │   ├── llms.txt                      # Copied from root
│   │   ├── favicon.svg
│   │   └── og-image.png
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── CodeBlock.tsx             # IDE-style with line numbers
│   │   │   ├── CopyButton.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── InstallTabs.tsx
│   │   │   └── SymbolLegend.tsx          # Interactive symbol reference
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── DocsHome.tsx
│   │   │   ├── GettingStarted.tsx
│   │   │   ├── ApiReference.tsx
│   │   │   ├── Examples.tsx
│   │   │   ├── Plugins.tsx
│   │   │   ├── Languages.tsx             # Language support matrix
│   │   │   ├── ClaudeIntegration.tsx     # CLAUDE.md workflow guide
│   │   │   └── Playground.tsx            # Live demo with sample code
│   │   └── hooks/
│   │       ├── useTheme.ts
│   │       └── useClipboard.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── llms.txt
├── SPECIFICATION.md
├── IMPLEMENTATION.md
├── TASKS.md
├── README.md
├── CHANGELOG.md
├── LICENSE                               # MIT
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── .gitignore
```

---

## CONFIG FILES

### package.json

```json
{
  "name": "@oxog/codemap",
  "version": "1.0.0",
  "description": "AST-based codebase structure extractor for token-efficient LLM navigation",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "codemap": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./plugins": {
      "import": {
        "types": "./dist/plugins/index.d.ts",
        "default": "./dist/plugins/index.js"
      },
      "require": {
        "types": "./dist/plugins/index.d.cts",
        "default": "./dist/plugins/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build && npm run test:coverage"
  },
  "keywords": [
    "codemap", "codebase", "ast", "parser", "llm", "context-window",
    "token-efficient", "zero-dependency", "typescript", "plugin",
    "micro-kernel", "code-analysis", "structural-analysis",
    "multi-language", "developer-tools", "ai-tools"
  ],
  "author": "Ersin Koç",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ersinkoc/codemap.git"
  },
  "bugs": {
    "url": "https://github.com/ersinkoc/codemap/issues"
  },
  "homepage": "https://codemap.oxog.dev",
  "engines": {
    "node": ">=22"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "target": "ES2024",
    "module": "ESNext",
    "lib": ["ES2024"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "website", "tests", "examples"]
}
```

### tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/plugins/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    splitting: false,
    sourcemap: true,
    treeshake: true,
    minify: false,
  },
]);
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'website/',
        'examples/',
        '*.config.*',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
```

---

## Website Requirements

Create a documentation website using:
- React 19 + Vite 6 + TypeScript
- Tailwind CSS v4 (CSS-first configuration)
- shadcn/ui for UI components
- @oxog/codeshine for syntax highlighting
- Lucide React for icons
- JetBrains Mono + Inter fonts

### Required Pages
- **Home** — Hero with animated code map example, install tabs, feature grid
- **Getting Started** — Installation, first scan, understanding output
- **API Reference** — Full API docs with examples
- **Languages** — Support matrix, parser accuracy notes, custom parser guide
- **Plugins** — Core vs optional vs community, plugin authoring
- **Examples** — Interactive examples with live output
- **CLAUDE.md Integration** — Step-by-step workflow guide for AI coding
- **Playground** — Paste code, see generated map live

### Required Features
- IDE-style code blocks with macOS traffic lights
- Dark/Light theme toggle (synced with codeshine)
- GitHub star button with real count
- Footer: "Made with ❤️ by Ersin KOÇ"
- Links to github.com/ersinkoc/codemap
- npm package link
- CNAME: codemap.oxog.dev
- Mobile responsive

---

## GITHUB ACTIONS

Single workflow file: `.github/workflows/deploy.yml`

```yaml
name: Deploy Website

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm run test:coverage
      - name: Build package
        run: npm run build
      - name: Build website
        working-directory: ./website
        run: |
          npm ci
          npm run build
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './website/dist'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## ERROR CLASSES

```typescript
export class CodemapError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CodemapError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ParserError extends CodemapError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly language: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'PARSER_ERROR', { ...context, filePath, language });
    this.name = 'ParserError';
  }
}

export class ConfigError extends CodemapError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

export class PluginError extends CodemapError {
  constructor(
    message: string,
    public readonly pluginName: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'PLUGIN_ERROR', { ...context, pluginName });
    this.name = 'PluginError';
  }
}

export class ScanError extends CodemapError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SCAN_ERROR', context);
    this.name = 'ScanError';
  }
}
```

---

## IMPLEMENTATION CHECKLIST

### Before Starting
- [ ] Create SPECIFICATION.md with complete spec
- [ ] Create IMPLEMENTATION.md with architecture
- [ ] Create TASKS.md with ordered task list
- [ ] All three documents reviewed and complete

### During Implementation
- [ ] Follow TASKS.md sequentially
- [ ] Write tests before or with each feature
- [ ] Maintain 100% coverage throughout
- [ ] JSDoc on every public API with @example
- [ ] Create examples as features are built

### Package Completion
- [ ] All tests passing (100%)
- [ ] Coverage at 100% (lines, branches, functions)
- [ ] No TypeScript errors
- [ ] ESLint passes
- [ ] Package builds without errors
- [ ] CLI works via `npx`

### Language Parsers
- [ ] TypeScript/JavaScript parser with comprehensive tests
- [ ] Go parser with comprehensive tests
- [ ] Python parser with comprehensive tests
- [ ] Rust parser with comprehensive tests
- [ ] PHP parser with comprehensive tests
- [ ] Java parser with comprehensive tests
- [ ] C# parser with comprehensive tests
- [ ] Each parser has fixture files for testing

### Output Formatters
- [ ] Compact formatter (token-optimized)
- [ ] JSON formatter (structured)
- [ ] Markdown formatter (human-readable)
- [ ] llms.txt formatter (spec-compliant)

### Feature Plugins
- [ ] Git hooks (install/uninstall)
- [ ] CLAUDE.md injection
- [ ] Monorepo workspace detection
- [ ] Complexity scoring
- [ ] Ignore pattern support
- [ ] Incremental scanning

### LLM-Native Completion
- [ ] llms.txt created (< 2000 tokens)
- [ ] llms.txt copied to website/public/
- [ ] README first 500 tokens optimized
- [ ] All public APIs have JSDoc + @example
- [ ] 15+ examples in organized folders
- [ ] package.json has keywords
- [ ] API uses standard naming patterns

### Website Completion
- [ ] All pages implemented
- [ ] IDE-style code blocks with line numbers
- [ ] Copy buttons working
- [ ] Dark/Light theme toggle
- [ ] CNAME file with codemap.oxog.dev
- [ ] Mobile responsive
- [ ] Footer with Ersin Koç, MIT, GitHub only

### Final Verification
- [ ] `npm run build` succeeds
- [ ] `npm run test:coverage` shows 100%
- [ ] Website builds without errors
- [ ] All examples run successfully
- [ ] README is complete and accurate

---

## BEGIN IMPLEMENTATION

Start by creating **SPECIFICATION.md** with the complete package specification based on everything above.

Then create **IMPLEMENTATION.md** with architecture decisions.

Then create **TASKS.md** with ordered, numbered tasks.

Only after all three documents are complete, begin implementing code by following TASKS.md sequentially.

**Remember:**
- This package will be published to npm as @oxog/codemap
- It must be production-ready
- Zero runtime dependencies — write every parser, every utility from scratch
- 100% test coverage with fixture files for each language
- Professionally documented with JSDoc + @example everywhere
- LLM-native design (llms.txt, predictable API, rich examples)
- Beautiful documentation website at codemap.oxog.dev
- The regex/heuristic parsers don't need 100% accuracy — 85-90% structural extraction is the target, sufficient for LLM navigation
