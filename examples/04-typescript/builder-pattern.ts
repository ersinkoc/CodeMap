// Builder API with full type inference
// Each method returns `this` for chaining, and .scan() returns Promise<ScanResult>
import { codemap } from '@oxog/codemap';

// The builder provides a fluent interface — every method is strongly typed
const result = await codemap()
  // Set root directory to scan
  .root('./src')
  // Output format: FormatType | FormatType[]
  .format(['compact', 'json'])
  // Add ignore patterns (variadic)
  .ignore('**/*.test.ts', '**/*.spec.ts', '**/fixtures/**')
  // Restrict to specific LanguageId[]
  .languages(['typescript'])
  // Enable incremental mode (git-based change detection)
  .incremental()
  // Enable cyclomatic complexity scoring
  .withComplexity()
  // Enable per-file token count estimates
  .withTokenCounts()
  // Enable monorepo workspace detection
  .monorepo()
  // Execute the scan
  .scan();

// result is ScanResult — fully typed, all properties readonly
console.log(`Root: ${result.root}`);
console.log(`Timestamp: ${result.timestamp}`);
console.log(`Files: ${result.stats.fileCount}`);
console.log(`Tokens: ~${result.stats.totalTokens}`);
console.log(`Duration: ${result.stats.scanDurationMs}ms`);
console.log(`Incremental: ${result.stats.incremental}`);
console.log(`Dependencies:`, Object.keys(result.dependencyGraph).length, 'internal');
console.log(`External deps:`, Object.keys(result.externalDeps).length, 'packages');
