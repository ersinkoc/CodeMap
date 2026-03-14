// Scan with all configuration options
import { scan } from '@oxog/codemap';

const result = await scan('./src', {
  // Output format: 'compact' | 'json' | 'markdown' | 'llms-txt'
  format: 'compact',

  // Only re-parse files changed since last scan (uses git diff + cache)
  incremental: true,

  // Calculate cyclomatic complexity scores per function
  complexity: true,

  // Include token count estimates per file
  tokenCounts: true,

  // Detect and scan monorepo workspaces
  monorepo: false,

  // Glob patterns to exclude from scanning
  ignore: ['**/*.test.ts', '**/*.spec.ts', '**/fixtures/**'],

  // Restrict to specific languages (auto-detected if omitted)
  languages: ['typescript', 'python'],
});

console.log(`Scanned ${result.stats.fileCount} files in ${result.stats.scanDurationMs}ms`);
console.log(`Total tokens: ~${result.stats.totalTokens}`);
console.log('Language breakdown:', result.stats.languageBreakdown);

if (result.output) {
  console.log('\n--- Output ---\n');
  console.log(result.output);
}
