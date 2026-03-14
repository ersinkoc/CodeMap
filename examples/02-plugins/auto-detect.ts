// Language parsers are auto-detected based on file extensions
//
// When you call scan(), codemap reads the directory, collects file
// extensions, and automatically loads the matching parser plugins:
//
//   .ts/.tsx/.js/.jsx  →  typescript parser (core, always loaded)
//   .go                →  go parser
//   .py                →  python parser
//   .rs                →  rust parser
//   .php               →  php parser
//   .java              →  java parser
//   .cs                →  csharp parser

import { scan } from '@oxog/codemap';

// No language config needed — parsers load automatically
const result = await scan('./my-project');

console.log('Detected languages:');
for (const [lang, count] of Object.entries(result.stats.languageBreakdown)) {
  console.log(`  ${lang}: ${count} files`);
}

// To restrict scanning to specific languages, use the languages option:
const tsOnly = await scan('./my-project', {
  languages: ['typescript'],
});
console.log(`\nTypeScript-only: ${tsOnly.stats.fileCount} files`);
