// Manually register plugins using the builder API
import { codemap, createPlugin } from '@oxog/codemap';

// Create a simple logging plugin
const logPlugin = createPlugin({
  name: 'logger',
  version: '1.0.0',
  install(kernel) {
    kernel.on('scan:start', () => console.log('[log] Scan started'));
    kernel.on('scan:file', (path) => console.log(`[log] Parsing: ${path}`));
    kernel.on('scan:complete', () => console.log('[log] Scan complete'));
    kernel.on('scan:error', (path, err) => {
      console.warn(`[log] Error in ${path}:`, err);
    });
  },
});

// Register the plugin via the builder's .use() method
const result = await codemap()
  .root('./src')
  .format('compact')
  .use(logPlugin)
  .scan();

console.log(`\nScanned ${result.stats.fileCount} files`);
