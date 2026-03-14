import { describe, it, expect } from 'vitest';
import {
  getCorePlugins,
  getParserPlugin,
  autoDetectPlugins,
  getFormatterPlugins,
  getFeaturePlugins,
  createGitHooksPlugin,
  createClaudeMdPlugin,
} from '../../../src/plugins/registry.js';

describe('Plugin Registry', () => {
  describe('getCorePlugins', () => {
    it('should return an array of plugins', () => {
      const plugins = getCorePlugins();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBeGreaterThan(0);
    });

    it('should include typescript parser', () => {
      const plugins = getCorePlugins();
      const tsParser = plugins.find((p) => p.name === 'typescript-parser');
      expect(tsParser).toBeDefined();
    });

    it('should include compact formatter', () => {
      const plugins = getCorePlugins();
      const compactFormatter = plugins.find((p) => p.name === 'compact-formatter');
      expect(compactFormatter).toBeDefined();
    });

    it('should return plugins with name, version, and install', () => {
      const plugins = getCorePlugins();
      for (const plugin of plugins) {
        expect(plugin).toHaveProperty('name');
        expect(plugin).toHaveProperty('version');
        expect(typeof plugin.install).toBe('function');
      }
    });
  });

  describe('getParserPlugin', () => {
    it('should return typescript parser', () => {
      const plugin = getParserPlugin('typescript');
      expect(plugin.name).toBe('typescript-parser');
    });

    it('should return go parser', () => {
      const plugin = getParserPlugin('go');
      expect(plugin.name).toBe('go-parser');
    });

    it('should return python parser', () => {
      const plugin = getParserPlugin('python');
      expect(plugin.name).toBe('python-parser');
    });

    it('should return rust parser', () => {
      const plugin = getParserPlugin('rust');
      expect(plugin.name).toBe('rust-parser');
    });

    it('should return php parser', () => {
      const plugin = getParserPlugin('php');
      expect(plugin.name).toBe('php-parser');
    });

    it('should return java parser', () => {
      const plugin = getParserPlugin('java');
      expect(plugin.name).toBe('java-parser');
    });

    it('should return csharp parser', () => {
      const plugin = getParserPlugin('csharp');
      expect(plugin.name).toBe('csharp-parser');
    });

    it('returned plugins should have install method', () => {
      const plugin = getParserPlugin('typescript');
      expect(typeof plugin.install).toBe('function');
    });
  });

  describe('autoDetectPlugins', () => {
    it('should return empty array when no extensions match', () => {
      const plugins = autoDetectPlugins(new Set(['.xyz', '.abc']));
      expect(plugins).toEqual([]);
    });

    it('should not include typescript parser (already core)', () => {
      const plugins = autoDetectPlugins(new Set(['.ts', '.tsx', '.js', '.jsx']));
      const tsPlugin = plugins.find((p) => p.name === 'typescript-parser');
      expect(tsPlugin).toBeUndefined();
    });

    it('should detect go parser from .go extension', () => {
      const plugins = autoDetectPlugins(new Set(['.go']));
      const goPlugin = plugins.find((p) => p.name === 'go-parser');
      expect(goPlugin).toBeDefined();
    });

    it('should detect python parser from .py extension', () => {
      const plugins = autoDetectPlugins(new Set(['.py']));
      const pyPlugin = plugins.find((p) => p.name === 'python-parser');
      expect(pyPlugin).toBeDefined();
    });

    it('should detect rust parser from .rs extension', () => {
      const plugins = autoDetectPlugins(new Set(['.rs']));
      const rustPlugin = plugins.find((p) => p.name === 'rust-parser');
      expect(rustPlugin).toBeDefined();
    });

    it('should detect php parser from .php extension', () => {
      const plugins = autoDetectPlugins(new Set(['.php']));
      const phpPlugin = plugins.find((p) => p.name === 'php-parser');
      expect(phpPlugin).toBeDefined();
    });

    it('should detect java parser from .java extension', () => {
      const plugins = autoDetectPlugins(new Set(['.java']));
      const javaPlugin = plugins.find((p) => p.name === 'java-parser');
      expect(javaPlugin).toBeDefined();
    });

    it('should detect csharp parser from .cs extension', () => {
      const plugins = autoDetectPlugins(new Set(['.cs']));
      const csPlugin = plugins.find((p) => p.name === 'csharp-parser');
      expect(csPlugin).toBeDefined();
    });

    it('should detect multiple parsers from mixed extensions', () => {
      const plugins = autoDetectPlugins(new Set(['.go', '.py', '.rs']));
      expect(plugins.length).toBe(3);
    });

    it('should handle empty set', () => {
      const plugins = autoDetectPlugins(new Set());
      expect(plugins).toEqual([]);
    });

    it('should deduplicate by language (mjs and mts both map to typescript)', () => {
      const plugins = autoDetectPlugins(new Set(['.mjs', '.mts']));
      // Both map to typescript which is a core plugin, so no extra plugins
      expect(plugins.length).toBe(0);
    });
  });

  describe('getFormatterPlugins', () => {
    it('should return empty array for compact format (core plugin)', () => {
      const plugins = getFormatterPlugins(['compact']);
      expect(plugins).toEqual([]);
    });

    it('should return json formatter for json format', () => {
      const plugins = getFormatterPlugins(['json']);
      expect(plugins.length).toBe(1);
      expect(plugins[0]!.name).toBe('json-formatter');
    });

    it('should return markdown formatter for markdown format', () => {
      const plugins = getFormatterPlugins(['markdown']);
      expect(plugins.length).toBe(1);
      expect(plugins[0]!.name).toBe('markdown-formatter');
    });

    it('should return llms-txt formatter for llms-txt format', () => {
      const plugins = getFormatterPlugins(['llms-txt']);
      expect(plugins.length).toBe(1);
      expect(plugins[0]!.name).toBe('llms-txt-formatter');
    });

    it('should return multiple formatters for multiple formats', () => {
      const plugins = getFormatterPlugins(['json', 'markdown']);
      expect(plugins.length).toBe(2);
    });

    it('should skip unknown format types silently', () => {
      const plugins = getFormatterPlugins(['compact', 'unknown-format']);
      expect(plugins.length).toBe(0);
    });

    it('should handle empty array', () => {
      const plugins = getFormatterPlugins([]);
      expect(plugins).toEqual([]);
    });
  });

  describe('getFeaturePlugins', () => {
    it('should always include ignore plugin', () => {
      const plugins = getFeaturePlugins({});
      const ignorePlugin = plugins.find((p) => p.name === 'ignore');
      expect(ignorePlugin).toBeDefined();
    });

    it('should include complexity plugin when enabled', () => {
      const plugins = getFeaturePlugins({ complexity: true });
      const complexityPlugin = plugins.find((p) => p.name === 'complexity');
      expect(complexityPlugin).toBeDefined();
    });

    it('should not include complexity plugin when disabled', () => {
      const plugins = getFeaturePlugins({ complexity: false });
      const complexityPlugin = plugins.find((p) => p.name === 'complexity');
      expect(complexityPlugin).toBeUndefined();
    });

    it('should include incremental plugin when enabled', () => {
      const plugins = getFeaturePlugins({ incremental: true });
      const incrementalPlugin = plugins.find((p) => p.name === 'incremental');
      expect(incrementalPlugin).toBeDefined();
    });

    it('should not include incremental plugin when disabled', () => {
      const plugins = getFeaturePlugins({ incremental: false });
      const incrementalPlugin = plugins.find((p) => p.name === 'incremental');
      expect(incrementalPlugin).toBeUndefined();
    });

    it('should include monorepo plugin when enabled', () => {
      const plugins = getFeaturePlugins({ monorepo: true });
      const monorepoPlugin = plugins.find((p) => p.name === 'monorepo');
      expect(monorepoPlugin).toBeDefined();
    });

    it('should not include monorepo plugin when disabled', () => {
      const plugins = getFeaturePlugins({ monorepo: false });
      const monorepoPlugin = plugins.find((p) => p.name === 'monorepo');
      expect(monorepoPlugin).toBeUndefined();
    });

    it('should include all feature plugins when all enabled', () => {
      const plugins = getFeaturePlugins({
        complexity: true,
        incremental: true,
        monorepo: true,
      });
      // ignore + complexity + incremental + monorepo = 4
      expect(plugins.length).toBe(4);
    });

    it('should only include ignore plugin when none enabled', () => {
      const plugins = getFeaturePlugins({});
      expect(plugins.length).toBe(1);
      expect(plugins[0]!.name).toBe('ignore');
    });
  });

  describe('re-exported plugin factories', () => {
    it('should export createGitHooksPlugin', () => {
      expect(typeof createGitHooksPlugin).toBe('function');
      const plugin = createGitHooksPlugin();
      expect(plugin.name).toBe('git-hooks');
    });

    it('should export createClaudeMdPlugin', () => {
      expect(typeof createClaudeMdPlugin).toBe('function');
      const plugin = createClaudeMdPlugin();
      expect(plugin.name).toBe('claude-md');
    });
  });
});
