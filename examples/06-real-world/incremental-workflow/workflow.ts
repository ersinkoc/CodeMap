// Incremental scanning workflow
//
// On first run, codemap does a full scan and caches file hashes.
// On subsequent runs with incremental: true, only files changed
// since the last scan (detected via git diff) are re-parsed.
import { scan } from '@oxog/codemap';

// First run: full scan, creates .codemap/cache.json
console.log('--- Full scan ---');
const full = await scan('./src', { incremental: true });
console.log(`Scanned ${full.stats.fileCount} files in ${full.stats.scanDurationMs}ms`);

// Simulate making changes...
console.log('\n(make some code changes here)\n');

// Second run: only changed files are re-parsed
console.log('--- Incremental scan ---');
const incremental = await scan('./src', { incremental: true });
console.log(`Scanned ${incremental.stats.fileCount} files in ${incremental.stats.scanDurationMs}ms`);

if (incremental.stats.changedFiles !== undefined) {
  console.log(`Changed files: ${incremental.stats.changedFiles}`);
}

// Incremental mode is ideal for:
// - Pre-commit hooks (fast re-scan)
// - Watch mode (continuous updates)
// - Large codebases (skip unchanged files)
console.log(`\nIncremental: ${incremental.stats.incremental}`);
