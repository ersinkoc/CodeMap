// Create a custom language parser plugin for Kotlin files
import { codemap, createPlugin } from '@oxog/codemap';
import type { FileAnalysis, LanguageParser } from '@oxog/codemap';

const kotlinParser: LanguageParser = {
  name: 'kotlin',
  extensions: ['.kt', '.kts'],
  parse(content: string, filePath: string): FileAnalysis {
    const lines = content.split('\n');
    const functions = lines.filter((l) => /^\s*fun\s+/.test(l)).map((l) => {
      const match = l.match(/fun\s+(\w+)\s*\(([^)]*)\)/);
      return {
        name: match?.[1] ?? 'unknown', params: [],
        returnType: 'Unit',
        exported: !l.includes('private'), loc: 1,
      };
    });
    return {
      path: filePath,
      language: 'typescript' as const, // closest supported LanguageId
      loc: lines.length,
      estimatedTokens: Math.ceil(content.length / 4),
      imports: [], exports: [], functions,
      classes: [], interfaces: [], types: [], enums: [], constants: [],
    };
  },
};

// Wrap it as a plugin and register
const kotlinPlugin = createPlugin({
  name: 'kotlin-parser',
  version: '1.0.0',
  install(kernel) {
    kernel.registerParser(kotlinParser);
  },
});

const result = await codemap()
  .root('./kotlin-project')
  .use(kotlinPlugin)
  .scan();

console.log(result.output);
