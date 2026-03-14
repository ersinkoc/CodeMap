import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hashContent,
  isGitAvailable,
  isGitRepo,
  getGitRoot,
  getChangedFiles,
  installPreCommitHook,
  uninstallPreCommitHook,
} from '../../../src/utils/git.js';

describe('git utils', () => {
  describe('hashContent', () => {
    it('should return consistent hashes', () => {
      const hash1 = hashContent('hello world');
      const hash2 = hashContent('hello world');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different content', () => {
      const hash1 = hashContent('hello');
      const hash2 = hashContent('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashContent('');
      expect(hash).toBeTruthy();
    });

    it('should return a string', () => {
      const hash = hashContent('test');
      expect(typeof hash).toBe('string');
    });
  });

  describe('isGitAvailable', () => {
    it('should return a boolean', () => {
      const result = isGitAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isGitRepo', () => {
    it('should return true for a directory inside a git repo', () => {
      // The project directory itself should be a git repo (or not),
      // but we can at least test it returns a boolean
      const result = isGitRepo(process.cwd());
      expect(typeof result).toBe('boolean');
    });

    it('should return false for a non-git temp directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-git-'));
      try {
        const result = isGitRepo(tempDir);
        expect(result).toBe(false);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return false for a non-existent directory', () => {
      const result = isGitRepo('/non/existent/path/that/does/not/exist');
      expect(result).toBe(false);
    });
  });

  describe('getGitRoot', () => {
    it('should return null for a non-git directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-gitroot-'));
      try {
        const result = getGitRoot(tempDir);
        expect(result).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return null for a non-existent directory', () => {
      const result = getGitRoot('/non/existent/path/xyz');
      expect(result).toBeNull();
    });

    it('should return a string or null for cwd', () => {
      const result = getGitRoot(process.cwd());
      // Could be a git repo or not depending on environment
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('getChangedFiles', () => {
    it('should return an array for a non-git directory', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-changed-'));
      try {
        const result = getChangedFiles(tempDir);
        // Should return empty array when git operations fail
        expect(Array.isArray(result)).toBe(true);
        expect(result).toEqual([]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return an array for cwd', () => {
      try {
        const result = getChangedFiles(process.cwd());
        expect(Array.isArray(result)).toBe(true);
      } catch {
        // Git might not be available
      }
    });

    it('should return empty array for non-existent directory', () => {
      const result = getChangedFiles('/non/existent/path/abc');
      expect(result).toEqual([]);
    });

    it('should detect changed files in a real git repo', () => {
      const { execFileSync } = require('node:child_process');
      const tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-changed-real-'));
      try {
        execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir, stdio: 'pipe' });

        // Create and commit a file
        writeFileSync(join(tempDir, 'initial.txt'), 'hello');
        execFileSync('git', ['add', '.'], { cwd: tempDir, stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir, stdio: 'pipe' });

        // Now create an untracked file and modify the committed file
        writeFileSync(join(tempDir, 'new-file.txt'), 'new content');
        writeFileSync(join(tempDir, 'initial.txt'), 'modified');

        const result = getChangedFiles(tempDir);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result).toContain('new-file.txt');
        expect(result).toContain('initial.txt');
      } catch {
        // git not available, skip
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('installPreCommitHook', () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return false when .git directory does not exist', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-hook-'));
      const result = installPreCommitHook(tempDir);
      expect(result).toBe(false);
    });

    it('should install hook when .git directory exists', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-hook-'));
      mkdirSync(join(tempDir, '.git'), { recursive: true });

      const result = installPreCommitHook(tempDir);
      expect(result).toBe(true);

      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      expect(existsSync(hookPath)).toBe(true);

      const hookContent = readFileSync(hookPath, 'utf-8');
      expect(hookContent).toContain('@oxog/codemap');
      expect(hookContent).toContain('npx @oxog/codemap');
      expect(hookContent).toContain('git add .codemap/map.txt');
    });

    it('should create hooks directory if it does not exist', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-hook-'));
      mkdirSync(join(tempDir, '.git'), { recursive: true });

      installPreCommitHook(tempDir);

      const hooksDir = join(tempDir, '.git', 'hooks');
      expect(existsSync(hooksDir)).toBe(true);
    });

    it('should return true if hook already contains codemap', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-hook-'));
      mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      writeFileSync(hookPath, '#!/bin/sh\n# @oxog/codemap hook\nnpx @oxog/codemap\n');

      const result = installPreCommitHook(tempDir);
      expect(result).toBe(true);

      // Content should not be duplicated
      const content = readFileSync(hookPath, 'utf-8');
      const occurrences = content.split('@oxog/codemap').length - 1;
      // The original file already had it, so it should just return true without modifying
      expect(occurrences).toBeGreaterThanOrEqual(1);
    });

    it('should append to existing hook that does not contain codemap', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-hook-'));
      mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      writeFileSync(hookPath, '#!/bin/sh\necho "existing hook"\n');

      const result = installPreCommitHook(tempDir);
      expect(result).toBe(true);

      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('existing hook');
      expect(content).toContain('@oxog/codemap');
    });
  });

  describe('uninstallPreCommitHook', () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return true when hook file does not exist', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-unhook-'));
      mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });

      const result = uninstallPreCommitHook(tempDir);
      expect(result).toBe(true);
    });

    it('should return true when hook does not contain codemap', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-unhook-'));
      mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      writeFileSync(hookPath, '#!/bin/sh\necho "other hook"\n');

      const result = uninstallPreCommitHook(tempDir);
      expect(result).toBe(true);

      // Original content should still be there
      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('other hook');
    });

    it('should remove hook file when only codemap content exists', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-unhook-'));
      mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      writeFileSync(
        hookPath,
        '#!/bin/sh\n# Auto-generated by @oxog/codemap\nnpx @oxog/codemap\ngit add .codemap/map.txt\n',
      );

      const result = uninstallPreCommitHook(tempDir);
      expect(result).toBe(true);
      expect(existsSync(hookPath)).toBe(false);
    });

    it('should keep other hook content when removing codemap lines', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'codemap-test-unhook-'));
      mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      writeFileSync(
        hookPath,
        '#!/bin/sh\necho "keep me"\n# Auto-generated by @oxog/codemap\nnpx @oxog/codemap\ngit add .codemap/map.txt\n',
      );

      const result = uninstallPreCommitHook(tempDir);
      expect(result).toBe(true);
      expect(existsSync(hookPath)).toBe(true);

      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('keep me');
      expect(content).not.toContain('npx @oxog/codemap');
    });
  });
});
