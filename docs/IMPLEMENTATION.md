# @oxog/codemap — Implementation Guide

## Architecture: Micro-Kernel + Plugin Registry

```
┌─────────────────────────────────────────────────────┐
│          User Code / CLI / Watch Mode                │
├─────────────────────────────────────────────────────┤
│      Builder API (codemap().root().scan())           │
├─────────────────────────────────────────────────────┤
│      Plugin Registry + Auto-Detect by Extension      │
├──────────┬──────────────┬───────────────────────────┤
│ Language │ Output       │ Feature                    │
│ Parsers  │ Formatters   │ Plugins                    │
├──────────┴──────────────┴───────────────────────────┤
│           Micro Kernel (zero-dep)                    │
│  Event Bus · Lifecycle · Error Boundary              │
│  File Scanner · Config · Token Estimator · Git       │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

### D1: Plugin as First-Class Citizen
Every feature (parsers, formatters, complexity, git-hooks, etc.) is a plugin. The kernel only handles registration, lifecycle, events, and error boundaries. This keeps the core tiny and makes everything testable in isolation.

### D2: Lazy Plugin Loading
Optional language parsers are auto-detected by file extension during scanning. If no `.go` files exist, the Go parser never loads. Core plugins (TS parser, compact formatter) are always loaded.

### D3: Comment/String Stripping
Before regex matching, source files have comments and string literals replaced with whitespace. This prevents false positives from commented-out code or strings containing keywords.

### D4: Brace Counting for Scope
Multi-line constructs (class bodies, function signatures spanning lines) use brace/paren counting to determine boundaries. Not a full parser — just enough for structural extraction.

### D5: Stateless Parsers
Each `LanguageParser.parse()` call is stateless — receives content + path, returns `FileAnalysis`. No shared mutable state between parse calls. This enables future parallelization.

### D6: Error Boundaries
Parser errors for individual files are caught and logged but don't abort the scan. A file that fails to parse is included with empty analysis and an error annotation.

### D7: Configuration Cascade
Config merging follows CSS-like specificity: CLI flags override config files, which override package.json, which override .codemaprc, which override built-in defaults. Deep merge for objects, replace for primitives.

## Module Dependency Graph

```
index.ts ──→ kernel.ts ──→ types.ts
   │              │              ↑
   │              ├──→ errors.ts─┘
   │              ├──→ scanner.ts ──→ utils/glob-matcher.ts
   │              ├──→ config.ts
   │              └──→ token-estimator.ts
   │
   ├──→ builder.ts ──→ kernel.ts
   │
   └──→ plugins/
         ├── registry.ts ──→ kernel.ts
         ├── core/
         │    ├── typescript-parser.ts ──→ utils/comment-stripper.ts
         │    │                           utils/brace-counter.ts
         │    │                           utils/type-truncator.ts
         │    └── compact-formatter.ts
         └── optional/
              ├── go-parser.ts ──→ utils/*
              ├── python-parser.ts ──→ utils/*
              ├── rust-parser.ts ──→ utils/*
              ├── php-parser.ts ──→ utils/*
              ├── java-parser.ts ──→ utils/*
              ├── csharp-parser.ts ──→ utils/*
              ├── json-formatter.ts
              ├── markdown-formatter.ts
              ├── llms-txt-formatter.ts
              ├── complexity.ts
              ├── ignore.ts ──→ utils/glob-matcher.ts
              ├── incremental.ts ──→ utils/git.ts
              ├── git-hooks.ts ──→ utils/git.ts
              ├── claude-md.ts
              └── monorepo.ts
```

## Testing Strategy

- **Unit tests:** Each module tested in isolation with mocks for fs/child_process
- **Integration tests:** Full scan pipeline with real fixture directories
- **Fixtures:** One sample project per language with representative code patterns
- **Coverage:** vitest with v8 provider, 100% thresholds enforced

## File Naming Conventions

- Source: `kebab-case.ts`
- Tests: `kebab-case.test.ts` mirroring source structure
- Fixtures: `tests/fixtures/{language}-project/` with sample files

## Build Pipeline

- `tsup` for dual CJS/ESM build with declarations
- CLI entry point gets `#!/usr/bin/env node` banner
- Tree-shaking enabled, no minification (readable output)
