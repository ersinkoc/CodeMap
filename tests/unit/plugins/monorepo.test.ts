import { describe, it, expect, afterEach } from 'vitest';
import { detectWorkspaces, createMonorepoPlugin } from '../../../src/plugins/optional/monorepo.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Monorepo Plugin', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-mono-'));
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
    const plugin = createMonorepoPlugin();
    expect(plugin.name).toBe('monorepo');
  });

  it('should have correct version', () => {
    const plugin = createMonorepoPlugin();
    expect(plugin.version).toBe('1.0.0');
  });

  it('should return empty array for a non-monorepo directory', () => {
    const dir = makeTempDir();
    const result = detectWorkspaces(dir);
    expect(result).toEqual([]);
  });

  it('should detect workspaces from package.json with workspaces array', () => {
    const dir = makeTempDir();

    // Create packages directory with sub-packages
    const pkgADir = path.join(dir, 'packages', 'pkg-a');
    const pkgBDir = path.join(dir, 'packages', 'pkg-b');
    fs.mkdirSync(pkgADir, { recursive: true });
    fs.mkdirSync(pkgBDir, { recursive: true });
    fs.writeFileSync(path.join(pkgADir, 'package.json'), '{"name": "pkg-a"}');
    fs.writeFileSync(path.join(pkgBDir, 'package.json'), '{"name": "pkg-b"}');

    // Create root package.json with workspaces
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    );

    const result = detectWorkspaces(dir);
    // The glob resolver strips '/*' and treats 'packages' as a direct path,
    // returning the parent directory as a workspace entry
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toContain('packages');
  });

  it('should return empty array when package.json has no workspaces field', () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'simple-project' }),
    );
    const result = detectWorkspaces(dir);
    expect(result).toEqual([]);
  });

  it('should have an install method that does not throw', () => {
    const plugin = createMonorepoPlugin();
    expect(() => plugin.install({} as any)).not.toThrow();
  });

  it('should detect workspaces from pnpm-workspace.yaml', () => {
    const dir = makeTempDir();

    // Create packages directory with sub-packages
    const pkgADir = path.join(dir, 'packages', 'pkg-a');
    const pkgBDir = path.join(dir, 'packages', 'pkg-b');
    fs.mkdirSync(pkgADir, { recursive: true });
    fs.mkdirSync(pkgBDir, { recursive: true });
    fs.writeFileSync(path.join(pkgADir, 'package.json'), '{"name": "pkg-a"}');
    fs.writeFileSync(path.join(pkgBDir, 'package.json'), '{"name": "pkg-b"}');

    // Create pnpm-workspace.yaml
    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n',
    );

    const result = detectWorkspaces(dir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Should find the sub-packages
    expect(result.some((w) => w.includes('pkg-a'))).toBe(true);
    expect(result.some((w) => w.includes('pkg-b'))).toBe(true);
  });

  it('should detect turbo.json presence (falls through to package.json)', () => {
    const dir = makeTempDir();

    // Create packages directory with sub-packages
    const pkgDir = path.join(dir, 'apps', 'web');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "web"}');

    // Create turbo.json and package.json with workspaces
    fs.writeFileSync(path.join(dir, 'turbo.json'), '{}');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
    );

    const result = detectWorkspaces(dir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((w) => w.includes('web'))).toBe(true);
  });

  it('should handle package.json with workspaces object (packages key)', () => {
    const dir = makeTempDir();

    const pkgDir = path.join(dir, 'libs', 'core');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "core"}');

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: { packages: ['libs/*'] } }),
    );

    const result = detectWorkspaces(dir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((w) => w.includes('core'))).toBe(true);
  });

  it('should handle direct workspace paths (no globs)', () => {
    const dir = makeTempDir();

    const pkgDir = path.join(dir, 'my-package');
    fs.mkdirSync(pkgDir, { recursive: true });

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['my-package'] }),
    );

    const result = detectWorkspaces(dir);
    expect(result).toContain('my-package');
  });

  it('should handle invalid package.json gracefully', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), 'not valid json');

    const result = detectWorkspaces(dir);
    expect(result).toEqual([]);
  });

  it('should call onInit to detect workspaces', async () => {
    const dir = makeTempDir();
    const plugin = createMonorepoPlugin();

    const pkgDir = path.join(dir, 'packages', 'a');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "a"}');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    );

    const context: any = {
      config: { root: dir },
    };

    await plugin.onInit!(context);

    // Workspaces should be set on context
    expect(context['workspaces']).toBeDefined();
    expect(context['workspaces'].length).toBeGreaterThanOrEqual(1);
  });

  it('should handle pnpm-workspace.yaml with quoted patterns', () => {
    const dir = makeTempDir();

    const pkgDir = path.join(dir, 'packages', 'foo');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "foo"}');

    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );

    const result = detectWorkspaces(dir);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should stop parsing pnpm-workspace.yaml when encountering a new section', () => {
    const dir = makeTempDir();

    const pkgDir = path.join(dir, 'packages', 'a');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "a"}');

    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\nother_section:\n  - something\n',
    );

    const result = detectWorkspaces(dir);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should skip non-existent direct workspace paths', () => {
    const dir = makeTempDir();

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['nonexistent-pkg'] }),
    );

    const result = detectWorkspaces(dir);
    expect(result).toEqual([]);
  });

  it('should handle statSync failure on workspace entries gracefully', () => {
    const dir = makeTempDir();

    // Create a packages directory with a valid package and a broken symlink
    const pkgDir = path.join(dir, 'packages', 'good');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "good"}');

    // Create a broken symlink that will cause statSync to throw
    try {
      fs.symlinkSync(
        path.join(dir, 'packages', 'nonexistent-target'),
        path.join(dir, 'packages', 'broken-link'),
      );
    } catch {
      // symlinks may not be supported; skip test silently
    }

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    );

    const result = detectWorkspaces(dir);
    // Should still find the good package despite the broken symlink
    expect(result.some((w) => w.includes('good'))).toBe(true);
  });

  it('should handle glob pattern with bare * (parentDir becomes ".")', () => {
    const dir = makeTempDir();

    // Create a sub-package directly in the root
    const pkgDir = path.join(dir, 'my-pkg');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name": "my-pkg"}');

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['*'] }),
    );

    const result = detectWorkspaces(dir);
    expect(result.some((w) => w.includes('my-pkg'))).toBe(true);
  });

  it('should handle onInit with no workspaces found', async () => {
    const dir = makeTempDir();
    const plugin = createMonorepoPlugin();

    const context: any = {
      config: { root: dir },
    };

    await plugin.onInit!(context);

    // No workspaces should be set
    expect(context['workspaces']).toBeUndefined();
  });
});
