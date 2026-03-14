# @oxog/codemap

AST-based codebase structure extractor for token-efficient LLM navigation.

Scans your codebase and produces a compact structural map — function signatures, class hierarchies, type definitions, dependency graphs — that fits into an LLM's context window at **10-25x fewer tokens** than reading raw source files.

**v0.1.0** adds deep code analysis: reverse dependencies, circular dependency detection, orphan file detection, and unused export analysis.

## Install

```bash
npm install @oxog/codemap
```

## Quick Start

```typescript
import { scan } from '@oxog/codemap';

const map = await scan('./src');
console.log(map.output);
// # CODEMAP — ./src
// ## FILES
// ━━ services/user.ts (120L) [~340T]
//   ◆ UserService ← BaseService
//     .async getById(id: string) → Promise<User>
//   ◇ User { id: string, name: string }
//
// ## REVERSE DEPS (who imports me?)
//   services/user.ts ← routes/api.ts, controllers/auth.ts
//
// ## UNUSED EXPORTS
//   ⚠ utils/legacy.ts: oldHelper, deprecatedFn
```

## Features

- **7 Languages** — TypeScript/JavaScript, Go, Python, Rust, PHP, Java, C#
- **4 Output Formats** — Compact (default), JSON, Markdown, llms.txt
- **Zero Dependencies** — Everything built from scratch
- **Plugin Architecture** — Micro-kernel with auto-detection
- **Watch Mode** — Auto-regenerate on file changes
- **Incremental Scanning** — Git diff-based selective re-parsing
- **Monorepo Support** — pnpm/yarn/npm/turborepo workspaces
- **CLAUDE.md Integration** — Auto-inject map for AI coding assistants
- **Git Hooks** — Pre-commit auto-generation
- **Complexity Scoring** — Cyclomatic complexity per file

### Code Analysis (v0.1.0)

- **Reverse Dependencies** — See who imports each file (`kernel.ts ← builder.ts, cli.ts`)
- **Circular Dependencies** — Detect dependency cycles (`A → B → C → A`)
- **Orphan Files** — Find dead modules not imported by anyone
- **Unused Exports** — Find exported symbols never imported in the project
- **Entry Points** — Auto-detect from `package.json` (`main`, `bin`, `exports`)

## Usage

### Simple API

```typescript
import { scan } from '@oxog/codemap';

// Basic scan
const map = await scan('./src');

// With options
const map = await scan('./src', {
  format: 'json',
  incremental: true,
  complexity: true,
});

// Access analysis results
if (map.analysis) {
  console.log('Circular deps:', map.analysis.circularDeps);
  console.log('Orphan files:', map.analysis.orphanFiles);
  console.log('Unused exports:', map.analysis.unusedExports);
}
```

### Builder API

```typescript
import { codemap } from '@oxog/codemap';

const map = await codemap()
  .root('./src')
  .format('compact')
  .ignore('**/*.test.ts', '**/*.spec.ts')
  .languages(['typescript', 'go'])
  .incremental()
  .withComplexity()
  .withTokenCounts()
  .scan();
```

### Watch Mode

```typescript
import { codemap } from '@oxog/codemap';

const watcher = codemap()
  .root('./src')
  .debounce(300)
  .watch();

watcher.on('change', (event) => {
  console.log(`Updated: ${event.changedFiles.length} files`);
  console.log(`Tokens: ~${event.map.stats.totalTokens}`);
});

process.on('SIGINT', () => watcher.close());
```

### CLI

```bash
# Basic scan
npx @oxog/codemap

# Custom root and format
npx @oxog/codemap ./lib --format=json

# Watch mode
npx @oxog/codemap --watch --debounce=500

# Incremental scan
npx @oxog/codemap --incremental

# Enable complexity scoring
npx @oxog/codemap --complexity

# Inject into CLAUDE.md
npx @oxog/codemap inject

# Git hooks
npx @oxog/codemap hook install
npx @oxog/codemap hook uninstall

# Initialize config
npx @oxog/codemap init

# Show stats
npx @oxog/codemap stats
```

### Custom Plugin

```typescript
import { codemap, createPlugin } from '@oxog/codemap';

const kotlinPlugin = createPlugin({
  name: 'kotlin',
  version: '1.0.0',
  install(kernel) {
    kernel.registerParser({
      name: 'kotlin',
      extensions: ['.kt', '.kts'],
      parse(content, filePath) {
        // Parse Kotlin source files
        return { /* FileAnalysis */ };
      },
    });
  },
});

const map = await codemap().use(kotlinPlugin).scan();
```

## Output Example

```
# CODEMAP — ./src
# Generated: 2026-03-14 | Files: 39 | LOC: 6,869 | ~73,615 tokens

## EXTERNAL DEPS
  node:path: resolve, join, extname, relative
  node:fs: existsSync, readFileSync, writeFileSync, ...

## FILES

━━ kernel.ts (247L) [~2,667T]
  ƒ createKernel(config: CodemapConfig) → Kernel
  ƒ setupKernel(config: CodemapConfig, extraPlugins?: readonly CodemapPlugin[]) → Kernel
  ◆ Kernel ⊳ CodemapKernel<CodemapContext> (295L)
    .use(plugin: CodemapPlugin)
    .async scan() → Promise<ScanResult>
    .registerParser(parser: LanguageParser)
    .getFormatter(name: string) → OutputFormatter | undefined

━━ scanner.ts (111L) [~1,204T]
  ƒ scanDirectory() → ScannedFile[]
  ƒ readIgnoreFile(dir: string) → string[]

## DEPENDENCY GRAPH
  kernel.ts → ./errors.js, ./scanner.js, ./token-estimator.js
  scanner.ts → ./utils/glob-matcher.js, ./language-map.js

## ENTRY POINTS
  ▶ index.ts
  ▶ cli.ts

## REVERSE DEPS (who imports me?)
  kernel.ts ← builder.ts, cli.ts, index.ts, watcher.ts
  scanner.ts ← kernel.ts, plugins/optional/ignore.ts
  types.ts ← builder.ts, cli.ts, config.ts, kernel.ts, ...

## CIRCULAR DEPS
  ⟳ a.ts → b.ts → c.ts → a.ts

## ORPHAN FILES (not imported by anyone)
  ⚠ utils/deprecated.ts

## UNUSED EXPORTS (exported but never imported)
  ⚠ utils/helpers.ts: oldFunction, legacyHelper
```

## Output Formats

| Format | Use Case | Token Efficiency |
|--------|----------|-----------------|
| `compact` | LLM context injection (default) | Best |
| `json` | Programmatic consumption | Good |
| `markdown` | Human reading, GitHub | Good |
| `llms-txt` | llms.txt spec compliance | Good |

## Symbol Legend

```
ƒ Function       ◆ Class         ◇ Interface
τ Type alias      ε Enum          κ Constant
⚛ Component      🪝 Hook          ✦ Struct
Δ Trait           λ Method         ∂ Decorator
← extends         ⊳ implements    ↗ Re-export
▶ Entry point     ⟳ Circular dep  ⚠ Warning
```

## Configuration

```typescript
// codemap.config.ts
import { defineConfig } from '@oxog/codemap';

export default defineConfig({
  root: './src',
  output: '.codemap',
  format: ['compact', 'json'],
  ignore: ['**/*.test.ts'],
  incremental: true,
  complexity: true,
  tokenCounts: true,
  monorepo: true,
});
```

## Supported Languages

| Language | Extensions | Accuracy |
|----------|-----------|----------|
| TypeScript/JavaScript | `.ts` `.tsx` `.js` `.jsx` `.mjs` `.mts` | ~90% |
| Go | `.go` | ~85% |
| Python | `.py` | ~85% |
| Rust | `.rs` | ~85% |
| PHP | `.php` | ~85% |
| Java | `.java` | ~85% |
| C# | `.cs` | ~85% |

## Links

- [Documentation](https://codemap.oxog.dev)
- [GitHub](https://github.com/ersinkoc/codemap)
- [npm](https://www.npmjs.com/package/@oxog/codemap)

## License

MIT - [Ersin KOC](https://x.com/ersinkoc)
