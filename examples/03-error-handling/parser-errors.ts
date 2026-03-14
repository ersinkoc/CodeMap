// Parser errors are handled gracefully — files that fail to parse
// still appear in results with basic metadata (path, loc, token estimate)
import { scan, codemap, createPlugin } from '@oxog/codemap';

// Track parser errors via the kernel event bus
const errorTracker = createPlugin({
  name: 'error-tracker',
  version: '1.0.0',
  install(kernel) {
    const errors: Array<{ path: string; error: unknown }> = [];

    kernel.on('scan:error', (path, error) => {
      errors.push({ path: path as string, error });
    });

    kernel.on('scan:complete', () => {
      if (errors.length > 0) {
        console.warn(`\n${errors.length} file(s) had parse errors:`);
        for (const { path, error } of errors) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`  - ${path}: ${msg}`);
        }
      }
    });
  },
});

// Even if some files fail to parse, the scan still completes
const result = await codemap()
  .root('./src')
  .use(errorTracker)
  .scan();

console.log(`Scanned ${result.stats.fileCount} files successfully`);
// Files with parse errors have empty functions/classes arrays
// but still contribute to file count, loc, and token estimates
