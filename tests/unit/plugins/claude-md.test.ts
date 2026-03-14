import { describe, it, expect, afterEach } from 'vitest';
import { createClaudeMdPlugin, injectIntoClaudeMd } from '../../../src/plugins/optional/claude-md.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Claude MD Plugin', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  it('should have correct name', () => {
    const plugin = createClaudeMdPlugin();
    expect(plugin.name).toBe('claude-md');
  });

  it('should have correct version', () => {
    const plugin = createClaudeMdPlugin();
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have an install method that does not throw', () => {
    const plugin = createClaudeMdPlugin();
    expect(() => plugin.install({} as any)).not.toThrow();
  });

  it('should create CLAUDE.md when it does not exist', () => {
    const dir = makeTempDir();
    const result = injectIntoClaudeMd(dir, 'test map content');
    expect(result).toBe(true);

    const claudePath = path.join(dir, 'CLAUDE.md');
    expect(fs.existsSync(claudePath)).toBe(true);

    const content = fs.readFileSync(claudePath, 'utf-8');
    expect(content).toContain('<!-- CODEMAP:START -->');
    expect(content).toContain('<!-- CODEMAP:END -->');
    expect(content).toContain('test map content');
  });

  it('should update content between markers in existing CLAUDE.md', () => {
    const dir = makeTempDir();
    const claudePath = path.join(dir, 'CLAUDE.md');

    // Create initial CLAUDE.md with markers
    const initial = `# Project

<!-- CODEMAP:START -->
## Codebase Map
Always read this map before opening source files. Only open files you need to edit.

old content

### Symbol Legend
\u0192 Function  \u25C6 Class  \u25C7 Interface  \u03C4 Type  \u03B5 Enum  \u269B Component  \uD83E\uDE9D Hook
<!-- CODEMAP:END -->

Some footer text.`;
    fs.writeFileSync(claudePath, initial);

    // Inject new content
    injectIntoClaudeMd(dir, 'new map content');

    const updated = fs.readFileSync(claudePath, 'utf-8');
    expect(updated).toContain('new map content');
    expect(updated).not.toContain('old content');
    expect(updated).toContain('Some footer text.');
    expect(updated).toContain('<!-- CODEMAP:START -->');
    expect(updated).toContain('<!-- CODEMAP:END -->');
  });

  it('should append markers when CLAUDE.md exists without markers', () => {
    const dir = makeTempDir();
    const claudePath = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(claudePath, '# My Project\n\nSome existing content.');

    injectIntoClaudeMd(dir, 'appended map');

    const content = fs.readFileSync(claudePath, 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Some existing content.');
    expect(content).toContain('<!-- CODEMAP:START -->');
    expect(content).toContain('appended map');
  });
});
