# Changelog

## 0.2.0 (2026-03-14)

### New Languages

- **Kotlin** — `data class`, `sealed class`, `object`, `companion object`, `suspend fun`, extension functions, `typealias`, annotations
- **Swift** — `struct`, `class`, `enum`, `protocol`, `extension`, `func`/`init`/`deinit`, `let`/`var`, `@attribute`
- **Ruby** — `class`, `module`, `def`, `attr_accessor`/`attr_reader`/`attr_writer`, `require`/`include`/`extend`, visibility tracking
- **Dart** — `class` (abstract/sealed/base), `mixin`, `extension`, `enum`, `typedef`, async functions, factory/named constructors, annotations

### Parser Improvements (all 7 existing languages)

- **TypeScript** — Generic constraints preserved (`<T extends Base>` → `['T extends Base']`)
- **Go** — Go 1.18+ generics (`func Map[T any]`, `type Set[T comparable] struct{}`), `const` block extraction
- **Python** — Dataclass field defaults (`= field(default_factory=list)` → `optional: true`)
- **Rust** — Lifetime generics (`<'a, T>` extracted), `where` clause in return type, char literal vs lifetime fix in comment stripper
- **PHP** — Union types (`int|string`), intersection types (`Foo&Bar`), constructor property promotion
- **Java** — Sealed classes/interfaces with `permits` clause, generic bounds extraction for interfaces
- **C#** — Primary constructors (`class Person(string Name, int Age)`), init-only → `readonly: true`

### Infrastructure

- Added `StructInfo.generics` and `TraitInfo.generics` fields to type system
- Ruby comment stripping (`#` + `=begin...=end`) added to comment-stripper
- Extension map expanded: `.kt`, `.kts`, `.swift`, `.rb`, `.dart`
- Token estimation ratios added for 4 new languages

## 0.1.0 (2026-03-14)

### New Features

- **Code Analysis Engine** — Deep structural analysis with 5 new output sections:
  - **Entry Points** (`## ENTRY POINTS`) — Auto-detected from `package.json` (`main`, `bin`, `exports`) and common filenames
  - **Reverse Dependencies** (`## REVERSE DEPS`) — Shows who imports each file (`kernel.ts <- builder.ts, cli.ts, index.ts`)
  - **Circular Dependencies** (`## CIRCULAR DEPS`) — Detects and reports dependency cycles (`A -> B -> C -> A`)
  - **Orphan Files** (`## ORPHAN FILES`) — Files not imported by any other file (dead modules)
  - **Unused Exports** (`## UNUSED EXPORTS`) — Exported symbols that are never imported anywhere in the project
- **Multi-line import/export parsing** — Correctly parses `import { ... }` and `export type { ... }` spanning multiple lines
- New types: `CodeAnalysis`, `UnusedExport` exported from main entry point
- Analysis results included in all output formats (compact, JSON, markdown)

### Bug Fixes

- **Incremental cache** — Was hashing file paths instead of file contents, cache never worked correctly
- **Complexity plugin** — Was reading pre-computed `fn.complexity` values (always 1), now reads actual source files and calculates real cyclomatic complexity
- **Config file loader** — `loadConfigFile()` was dead code that always returned `{}`, now parses JSON-compatible `codemap.config.js` exports
- **`export type` re-exports** — Parser now handles `export type { Foo, Bar } from './types.js'` (previously only `export { ... }`)

### Architecture Improvements

- **`setupKernel()`** — Single entry point for kernel configuration, replaced ~120 lines of duplicated setup code across 4 files (`index.ts`, `builder.ts`, `cli.ts` x2)
- **Single extension map** — `EXTENSION_LANGUAGE_MAP` moved to dedicated `language-map.ts`, eliminating 3 duplicate copies
- **Circular dependency resolved** — Fixed `ignore.ts -> scanner.ts -> registry.ts -> ignore.ts` cycle by extracting extension map to its own module
- **Glob regex caching** — Compiled regex patterns are now cached, avoiding thousands of redundant regex compilations per scan
- **`scanOptionsToConfig` cleanup** — Removed 7 unsafe `as Record<string, unknown>` casts, replaced with spread-based construction

### Performance

- Eliminated double directory scanning — previously every scan traversed the filesystem twice (once for language detection, once for actual parsing)
- Glob pattern regex compilation now cached (O(1) amortized vs O(n*m) previously)

## 0.0.5 (2026-03-14)

- Test/spec/config files excluded by default (`*.test.ts`, `*.spec.ts`, `*.config.ts`, `__tests__/`, `tests/`)
- No `.codemapignore` needed for common exclusions

## 0.0.4 (2026-03-14)

- `init` command now auto-updates `.gitignore` to exclude `.codemap/*` but keep `map.txt`
- Remove self-dependency from package.json
- Improve `.codemapignore` defaults (`*.config.ts`, `tests/`, `examples/`, `docs/`)

## 0.0.3 (2026-03-14)

- Fix CLI bin path for npx compatibility
- Fix ESM builder require() -> import

## 0.0.2 (2026-03-14)

### Features

- Multi-language regex/heuristic parser engine (TypeScript, Go, Python, Rust, PHP, Java, C#)
- Token-optimized compact output format with Unicode symbols
- JSON, Markdown, and llms.txt output formatters
- Micro-kernel plugin architecture with auto-detection
- Chainable builder API and simple `scan()` function
- CLI with watch mode, incremental scanning, and subcommands
- Git pre-commit hook integration
- CLAUDE.md auto-injection
- Monorepo workspace detection
- Cyclomatic complexity scoring
- Token count estimation
- Custom ignore patterns via `.codemapignore`
- Configuration cascade (CLI > config file > package.json > .codemaprc > defaults)
- Zero runtime dependencies
