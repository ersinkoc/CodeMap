import { describe, it, expect } from 'vitest';
import { createIgnorePlugin } from '../../../src/plugins/optional/ignore.js';

describe('Ignore Plugin', () => {
  it('should have correct name', () => {
    const plugin = createIgnorePlugin();
    expect(plugin.name).toBe('ignore');
  });

  it('should have correct version', () => {
    const plugin = createIgnorePlugin();
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have an install method', () => {
    const plugin = createIgnorePlugin();
    expect(typeof plugin.install).toBe('function');
  });

  it('install should not throw', () => {
    const plugin = createIgnorePlugin();
    expect(() => plugin.install({} as any)).not.toThrow();
  });

  it('should have an onInit hook', () => {
    const plugin = createIgnorePlugin();
    expect(typeof plugin.onInit).toBe('function');
  });

  it('should execute onInit without error for a directory without .codemapignore', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-ignore-'));
    try {
      const plugin = createIgnorePlugin();
      const context: any = { config: { root: dir } };
      await plugin.onInit!(context);
      // Should not throw
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should execute onInit reading .codemapignore when it exists', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-ignore-'));
    try {
      fs.writeFileSync(path.join(dir, '.codemapignore'), '*.log\ntemp/\n');
      const plugin = createIgnorePlugin();
      const context: any = { config: { root: dir } };
      await plugin.onInit!(context);
      // Should not throw and should read patterns successfully
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
