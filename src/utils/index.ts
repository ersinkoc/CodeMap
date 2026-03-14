/**
 * Utility module exports.
 * @module
 */

export { stripComments } from './comment-stripper.js';
export {
  createBraceState,
  updateBraceState,
  countBraceDepth,
  countParenDepth,
  findBlockEnd,
  extractBraceContent,
  isClosingBraceLine,
} from './brace-counter.js';
export type { BraceState } from './brace-counter.js';
export { truncateType, simplifyType, cleanReturnType } from './type-truncator.js';
export {
  globToRegex,
  matchGlob,
  shouldIgnore,
  DEFAULT_IGNORE_PATTERNS,
} from './glob-matcher.js';
export {
  isGitAvailable,
  isGitRepo,
  getGitRoot,
  getChangedFiles,
  hashContent,
  installPreCommitHook,
  uninstallPreCommitHook,
} from './git.js';
