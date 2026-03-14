# Changelog

## 0.0.4 (2026-03-14)

- `init` command now auto-updates `.gitignore` to exclude `.codemap/*` but keep `map.txt`
- Remove self-dependency from package.json
- Improve `.codemapignore` defaults (`*.config.ts`, `tests/`, `examples/`, `docs/`)

## 0.0.3 (2026-03-14)

- Fix CLI bin path for npx compatibility
- Fix ESM builder require() → import

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
