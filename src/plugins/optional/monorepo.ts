/**
 * Monorepo workspace detection plugin.
 *
 * Detects pnpm, yarn, npm, and turborepo workspace configurations.
 * @module
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CodemapPlugin, CodemapContext } from '../../types.js';

/**
 * Detect workspace paths from monorepo configuration.
 *
 * @param rootDir - Project root directory
 * @returns Array of workspace directory paths, or empty array
 */
export function detectWorkspaces(rootDir: string): string[] {
  // Try pnpm-workspace.yaml
  const pnpmPath = join(rootDir, 'pnpm-workspace.yaml');
  if (existsSync(pnpmPath)) {
    const content = readFileSync(pnpmPath, 'utf-8');
    return parsePnpmWorkspaces(content, rootDir);
  }

  // Try package.json workspaces
  const pkgPath = join(rootDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const workspaces = pkg['workspaces'];

      if (Array.isArray(workspaces)) {
        return resolveGlobWorkspaces(workspaces as string[], rootDir);
      }

      if (workspaces && typeof workspaces === 'object') {
        const wsObj = workspaces as Record<string, unknown>;
        const packages = wsObj['packages'];
        if (Array.isArray(packages)) {
          return resolveGlobWorkspaces(packages as string[], rootDir);
        }
      }
    } catch {
      // Skip
    }
  }

  return [];
}

/**
 * Parse pnpm-workspace.yaml content for workspace packages.
 */
function parsePnpmWorkspaces(content: string, rootDir: string): string[] {
  const patterns: string[] = [];

  // Simple YAML parsing for packages list
  const lines = content.split('\n');
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      if (trimmed.startsWith('- ')) {
        const pattern = trimmed.slice(2).replace(/['"]/g, '').trim();
        patterns.push(pattern);
      } else if (!trimmed.startsWith('#') && trimmed !== '') {
        // End of packages section
        break;
      }
    }
  }

  return resolveGlobWorkspaces(patterns, rootDir);
}

/**
 * Resolve glob-based workspace patterns to actual directories.
 */
function resolveGlobWorkspaces(patterns: string[], rootDir: string): string[] {
  const workspaces: string[] = [];

  for (const pattern of patterns) {
    // Handle simple patterns like 'packages/*' or 'apps/*'
    const hasGlob = pattern.includes('*');
    const cleanPattern = pattern.replace(/\/\*$/, '').replace(/\*$/, '');

    if (cleanPattern && !cleanPattern.includes('*') && !hasGlob) {
      // Direct path (no glob in original pattern)
      const fullPath = join(rootDir, cleanPattern);
      if (existsSync(fullPath)) {
        workspaces.push(cleanPattern);
      }
    } else {
      // Glob pattern - resolve parent directory
      const parentDir = cleanPattern || '.';
      const parentPath = join(rootDir, parentDir);

      if (existsSync(parentPath)) {
        try {
          const entries = readdirSync(parentPath);
          for (const entry of entries) {
            const entryPath = join(parentPath, entry);
            try {
              if (statSync(entryPath).isDirectory()) {
                const pkgJsonPath = join(entryPath, 'package.json');
                if (existsSync(pkgJsonPath)) {
                  workspaces.push(join(parentDir, entry).replace(/\\/g, '/'));
                }
              }
            } catch {
              continue;
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }

  return workspaces;
}

/**
 * Create the monorepo plugin.
 */
export function createMonorepoPlugin(): CodemapPlugin {
  return {
    name: 'monorepo',
    version: '1.0.0',
    install() {
      // Monorepo detection runs during scan initialization
    },
    async onInit(context: CodemapContext) {
      const workspaces = detectWorkspaces(context.config.root);
      if (workspaces.length > 0) {
        // Store workspace info in context for later use
        (context as unknown as Record<string, unknown>)['workspaces'] = workspaces;
      }
    },
  };
}
