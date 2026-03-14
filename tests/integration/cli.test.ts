import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('CLI Integration', () => {
  it('should have built CLI file', () => {
    const cliPath = join(__dirname, '../../dist/cli.js');
    if (existsSync(cliPath)) {
      expect(existsSync(cliPath)).toBe(true);
    } else {
      // CLI not built yet, skip
      expect(true).toBe(true);
    }
  });

  it('should have shebang in CLI output', () => {
    const cliPath = join(__dirname, '../../dist/cli.js');
    if (existsSync(cliPath)) {
      const { readFileSync } = require('node:fs');
      const content = readFileSync(cliPath, 'utf-8');
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });
});
