// Inject codemap output into CLAUDE.md for Claude Code context
//
// This writes the structural map between <!-- CODEMAP:START --> and
// <!-- CODEMAP:END --> markers in your CLAUDE.md file. If the file
// doesn't exist, it creates one. If markers exist, it replaces the
// content between them.
import { scan } from '@oxog/codemap';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const START = '<!-- CODEMAP:START -->';
const END = '<!-- CODEMAP:END -->';

// 1. Generate the compact map
const result = await scan('./src', { format: 'compact' });
const map = result.output ?? '';

// 2. Build the injection block
const injection = [
  START,
  '## Codebase Map',
  'Always read this map before opening source files.',
  '',
  map,
  '',
  '### Symbol Legend',
  'f Function  C Class  I Interface  T Type  E Enum',
  END,
].join('\n');

// 3. Inject into CLAUDE.md
const claudePath = './CLAUDE.md';
if (existsSync(claudePath)) {
  const content = readFileSync(claudePath, 'utf-8');
  if (content.includes(START) && content.includes(END)) {
    const before = content.slice(0, content.indexOf(START));
    const after = content.slice(content.indexOf(END) + END.length);
    writeFileSync(claudePath, before + injection + after);
  } else {
    writeFileSync(claudePath, content + '\n\n' + injection);
  }
} else {
  writeFileSync(claudePath, injection + '\n');
}

console.log('CLAUDE.md updated with codemap');
