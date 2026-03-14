// Create a custom output formatter plugin (YAML-like format)
import { codemap, createPlugin } from '@oxog/codemap';
import type { OutputFormatter, ScanResult } from '@oxog/codemap';

const yamlFormatter: OutputFormatter = {
  name: 'yaml',
  extension: '.yaml',
  format(result: ScanResult): string {
    const lines: string[] = ['# Codemap output', `root: ${result.root}`, ''];

    for (const file of result.files) {
      lines.push(`- path: ${file.path}`);
      lines.push(`  language: ${file.language}`);
      lines.push(`  loc: ${file.loc}`);
      lines.push(`  tokens: ${file.estimatedTokens}`);

      if (file.functions.length > 0) {
        lines.push('  functions:');
        for (const fn of file.functions) {
          const params = fn.params.map((p) => `${p.name}: ${p.type}`).join(', ');
          lines.push(`    - ${fn.name}(${params}): ${fn.returnType}`);
        }
      }
      lines.push('');
    }

    lines.push(`# ${result.stats.fileCount} files, ~${result.stats.totalTokens} tokens`);
    return lines.join('\n');
  },
};

const yamlPlugin = createPlugin({
  name: 'yaml-formatter',
  version: '1.0.0',
  install(kernel) {
    kernel.registerFormatter(yamlFormatter);
  },
});

const result = await codemap()
  .root('./src')
  .format('compact') // primary format still used for result.output
  .use(yamlPlugin)
  .scan();

// Use the custom formatter manually
const yamlOutput = yamlFormatter.format(result);
console.log(yamlOutput);
