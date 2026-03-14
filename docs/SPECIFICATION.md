# @oxog/codemap — Specification

## Overview

@oxog/codemap is a zero-dependency, AST-based codebase structure extractor that produces token-efficient structural maps for LLM context windows. It scans source files using regex/heuristic parsers and outputs compact representations at 10-25x fewer tokens than raw source.

## Package Identity

- **NPM:** `@oxog/codemap`
- **GitHub:** `https://github.com/ersinkoc/codemap`
- **Docs:** `https://codemap.oxog.dev`
- **License:** MIT
- **Author:** Ersin Koç

## Core Constraints

1. **Zero runtime dependencies** — all parsers, utilities, and infrastructure hand-written (@oxog/ scoped packages allowed)
2. **100% test coverage** — lines, branches, functions, statements
3. **TypeScript strict mode** — all strict flags enabled
4. **Node.js >= 22** — ESM + CJS dual build
5. **Micro-kernel architecture** — plugin-based extensibility

## Functional Requirements

### F1: Multi-Language Parsing
- 7 languages: TypeScript/JavaScript, Go, Python, Rust, PHP, Java, C#
- Regex/heuristic extraction (~85-90% accuracy)
- Extract: functions, classes, interfaces, types, enums, imports, exports, constants
- Language-specific: React components/hooks (TS/JS), structs (Go/Rust/C#), traits (Rust/PHP), packages (Go/Java/C#/PHP)

### F2: Output Formats
- `compact` — Unicode-symbol token-optimized (default)
- `json` — structured programmatic consumption
- `markdown` — human-readable GitHub-friendly
- `llms-txt` — llms.txt spec compliant

### F3: CLI
- `npx @oxog/codemap [root] [--format] [--watch] [--incremental] [--full]`
- Subcommands: `inject`, `hook install/uninstall`, `init`, `stats`

### F4: Programmatic API
- `scan(root?, options?)` — simple functional scan
- `codemap()` — chainable builder pattern
- `createPlugin(config)` — plugin factory
- `defineConfig(config)` — type-safe config helper

### F5: Watch Mode
- `fs.watch`-based native watching
- Configurable debounce
- Event emitter pattern (change, error)

### F6: Incremental Scanning
- Git diff-based selective re-parsing
- File hash cache in `.codemap/cache.json`
- Automatic fallback to full scan

### F7: Monorepo Support
- Auto-detect pnpm/yarn/npm/turborepo workspaces
- Per-package scanning with unified output

### F8: CLAUDE.md Injection
- Inject/update map between `<!-- CODEMAP:START -->` / `<!-- CODEMAP:END -->` markers

### F9: Git Hooks
- Pre-commit hook auto-generation and staging
- Direct `.git/hooks/pre-commit` manipulation (no husky)

### F10: Complexity Scoring
- Cyclomatic complexity via branching keyword counting
- Per-function and per-file scores

### F11: Token Estimation
- Character-based heuristic (~3.5 chars/token, language-adjusted)
- Per-file and total estimates

### F12: Custom Ignore Patterns
- `.codemapignore` with gitignore syntax
- Merged with built-in defaults

### F13: Configuration System
- Priority: CLI > config file > package.json > .codemaprc > defaults
- `codemap.config.ts`, `codemap.config.js`, `package.json#codemap`, `.codemaprc`

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Bundle size (core) | < 5KB gzipped |
| Bundle size (all core plugins) | < 10KB gzipped |
| Bundle size (all plugins) | < 20KB gzipped |
| Node.js version | >= 22 |
| Module format | ESM + CJS dual |
| TypeScript | >= 5.7, strict mode |
| Test coverage | 100% |
| Parser accuracy | ~85-90% |

## Output Structure

```
.codemap/
├── map.txt          # compact format (always)
├── map.json         # json format (opt-in)
├── map.md           # markdown format (opt-in)
├── llms.txt         # llms-txt format (opt-in)
├── cache.json       # incremental cache
└── stats.json       # statistics
```

## Error Codes

| Code | Meaning |
|------|---------|
| ROOT_NOT_FOUND | Root directory doesn't exist |
| NO_FILES_FOUND | No scannable files in root |
| PARSER_ERROR | Language parser failed |
| CONFIG_ERROR | Invalid configuration |
| WATCH_ERROR | File watcher failed |
| CACHE_CORRUPT | Incremental cache invalid |
| GIT_NOT_FOUND | Git unavailable for incremental |
| PLUGIN_ERROR | Plugin lifecycle failure |
| SCAN_ERROR | Scan process failure |
