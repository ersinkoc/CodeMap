# @oxog/codemap

AST-based codebase structure extractor for token-efficient LLM navigation.

Scans your codebase and produces a compact structural map — function signatures, class hierarchies, type definitions, dependency graphs — that fits into an LLM's context window at **10-25x fewer tokens** than reading raw source files.

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
- **Complexity Scoring** — Cyclomatic complexity per function

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

MIT - [Ersin KOÇ](https://x.com/ersinkoc)
