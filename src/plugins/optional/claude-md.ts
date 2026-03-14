/**
 * CLAUDE.md injection plugin.
 *
 * Injects/updates the codemap between marker comments in CLAUDE.md.
 * @module
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodemapPlugin } from '../../types.js';

const START_MARKER = '<!-- CODEMAP:START -->';
const END_MARKER = '<!-- CODEMAP:END -->';

/**
 * Inject codemap output into CLAUDE.md file.
 *
 * @param dir - Project root directory
 * @param mapContent - Compact map content to inject
 * @returns True if injection succeeded
 */
export function injectIntoClaudeMd(dir: string, mapContent: string): boolean {
  const claudePath = join(dir, 'CLAUDE.md');
  const injection = buildInjection(mapContent);

  if (existsSync(claudePath)) {
    const existing = readFileSync(claudePath, 'utf-8');

    if (existing.includes(START_MARKER) && existing.includes(END_MARKER)) {
      // Replace existing content between markers
      const startIdx = existing.indexOf(START_MARKER);
      const endIdx = existing.indexOf(END_MARKER) + END_MARKER.length;
      const updated =
        existing.slice(0, startIdx) + injection + existing.slice(endIdx);
      writeFileSync(claudePath, updated);
    } else {
      // Append to end
      writeFileSync(claudePath, existing + '\n\n' + injection);
    }
  } else {
    // Create new CLAUDE.md
    writeFileSync(claudePath, injection + '\n');
  }

  return true;
}

function buildInjection(mapContent: string): string {
  return `${START_MARKER}
## Codebase Map
Always read this map before opening source files. Only open files you need to edit.

${mapContent}

### Symbol Legend
ƒ Function  ◆ Class  ◇ Interface  τ Type  ε Enum  ⚛ Component  🪝 Hook
${END_MARKER}`;
}

/**
 * Create the CLAUDE.md injection plugin.
 */
export function createClaudeMdPlugin(): CodemapPlugin {
  return {
    name: 'claude-md',
    version: '1.0.0',
    install() {
      // Used via CLI command, not during scan
    },
  };
}
