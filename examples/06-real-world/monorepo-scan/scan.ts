// Scan a monorepo with workspace detection
//
// When monorepo mode is enabled, codemap detects workspaces from
// pnpm-workspace.yaml, package.json#workspaces, or turbo.json
// and scans each workspace independently.
import { codemap } from '@oxog/codemap';

const result = await codemap()
  .root('.')           // scan from project root
  .format('compact')
  .monorepo()          // enable workspace detection
  .ignore('**/node_modules/**', '**/dist/**', '**/.next/**')
  .scan();

console.log(`Root scan: ${result.stats.fileCount} files`);

// If workspaces were detected, each gets its own ScanResult
if (result.workspaces) {
  for (const [name, workspace] of Object.entries(result.workspaces)) {
    console.log(`\n[${name}]`);
    console.log(`  Files: ${workspace.stats.fileCount}`);
    console.log(`  Tokens: ~${workspace.stats.totalTokens}`);
    console.log(`  Languages:`, workspace.stats.languageBreakdown);
  }
} else {
  console.log('No workspaces detected (single-package project)');
}

console.log(`\nTotal scan time: ${result.stats.scanDurationMs}ms`);
