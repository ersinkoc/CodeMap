/**
 * Git hooks plugin.
 *
 * Installs/uninstalls a pre-commit hook that auto-regenerates the codemap.
 * @module
 */

import type { CodemapPlugin } from '../../types.js';
import { installPreCommitHook, uninstallPreCommitHook, isGitRepo } from '../../utils/git.js';

/**
 * Create the git hooks plugin.
 */
export function createGitHooksPlugin(): CodemapPlugin {
  return {
    name: 'git-hooks',
    version: '1.0.0',
    install() {
      // Plugin is used via CLI commands, not during scan
    },
  };
}

/**
 * Install the pre-commit hook in the given directory.
 *
 * @param dir - Root directory of the git repository
 * @returns True if installed successfully
 */
export function installHook(dir: string): boolean {
  if (!isGitRepo(dir)) {
    return false;
  }
  return installPreCommitHook(dir);
}

/**
 * Uninstall the pre-commit hook.
 *
 * @param dir - Root directory of the git repository
 * @returns True if uninstalled successfully
 */
export function uninstallHook(dir: string): boolean {
  return uninstallPreCommitHook(dir);
}
