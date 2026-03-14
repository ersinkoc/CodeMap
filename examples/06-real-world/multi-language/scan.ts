// Scan a project with multiple languages
//
// Codemap auto-detects parsers based on file extensions:
//   .ts/.tsx/.js/.jsx → TypeScript parser
//   .py               → Python parser
//   .go               → Go parser
//   .rs               → Rust parser
//   .java             → Java parser
//   .php              → PHP parser
//   .cs               → C# parser
import { scan } from '@oxog/codemap';

const result = await scan('.', {
  format: 'compact',
  complexity: true,
  ignore: ['**/node_modules/**', '**/vendor/**', '**/target/**'],
});

// Language breakdown shows file counts per detected language
console.log('Language breakdown:');
const sorted = Object.entries(result.stats.languageBreakdown)
  .sort(([, a], [, b]) => b - a);

for (const [lang, count] of sorted) {
  const pct = ((count / result.stats.fileCount) * 100).toFixed(1);
  console.log(`  ${lang.padEnd(12)} ${String(count).padStart(4)} files (${pct}%)`);
}

// External dependencies grouped by package manager ecosystem
console.log(`\nExternal dependencies: ${Object.keys(result.externalDeps).length} packages`);

// Internal dependency graph
const edges = Object.values(result.dependencyGraph).reduce((n, d) => n + d.length, 0);
console.log(`Internal dep graph: ${Object.keys(result.dependencyGraph).length} files, ${edges} edges`);

console.log(`\nTotal: ${result.stats.fileCount} files, ~${result.stats.totalTokens} tokens`);
