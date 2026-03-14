import { describe, it, expect } from 'vitest';
import { stripComments } from '../../../src/utils/comment-stripper.js';

describe('stripComments', () => {
  describe('TypeScript/JavaScript', () => {
    it('should strip single-line comments', () => {
      const result = stripComments('const x = 1; // comment', 'typescript');
      expect(result).toContain('const x = 1;');
      expect(result).not.toContain('comment');
    });

    it('should strip block comments', () => {
      const result = stripComments('const x = /* value */ 1;', 'typescript');
      expect(result).toContain('const x =');
      expect(result).toContain('1;');
      expect(result).not.toContain('value');
    });

    it('should strip multi-line block comments', () => {
      const input = `const x = 1;
/* this is
   a multi-line
   comment */
const y = 2;`;
      const result = stripComments(input, 'typescript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
      expect(result).not.toContain('multi-line');
    });

    it('should strip double-quoted strings', () => {
      const result = stripComments('const s = "hello world";', 'typescript');
      expect(result).toContain('const s =');
      expect(result).not.toContain('hello world');
    });

    it('should strip single-quoted strings', () => {
      const result = stripComments("const s = 'hello';", 'typescript');
      expect(result).toContain('const s =');
      expect(result).not.toContain('hello');
    });

    it('should strip template literals', () => {
      const result = stripComments('const s = `template ${x}`;', 'typescript');
      expect(result).toContain('const s =');
    });

    it('should handle escaped quotes in strings', () => {
      const result = stripComments('const s = "hello \\"world\\"";', 'typescript');
      expect(result).toContain('const s =');
    });

    it('should preserve line structure', () => {
      const input = 'line1\nline2 // comment\nline3';
      const result = stripComments(input, 'typescript');
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should handle empty input', () => {
      expect(stripComments('', 'typescript')).toBe('');
    });
  });

  describe('Python', () => {
    it('should strip # comments', () => {
      const result = stripComments('x = 1  # comment', 'python');
      expect(result).toContain('x = 1');
      expect(result).not.toContain('comment');
    });

    it('should strip triple-quoted strings', () => {
      const result = stripComments('x = """hello\nworld"""', 'python');
      expect(result).toContain('x =');
      expect(result).not.toContain('hello');
    });

    it('should strip single triple-quoted strings', () => {
      const result = stripComments("x = '''hello'''", 'python');
      expect(result).toContain('x =');
      expect(result).not.toContain('hello');
    });

    it('should handle regular strings', () => {
      const result = stripComments('x = "hello"', 'python');
      expect(result).toContain('x =');
    });
  });

  describe('Go', () => {
    it('should strip line comments', () => {
      const result = stripComments('x := 1 // comment', 'go');
      expect(result).toContain('x := 1');
      expect(result).not.toContain('comment');
    });

    it('should strip block comments', () => {
      const result = stripComments('x := /* val */ 1', 'go');
      expect(result).toContain('x :=');
      expect(result).toContain('1');
    });

    it('should strip backtick strings', () => {
      const result = stripComments('x := `raw string`', 'go');
      expect(result).toContain('x :=');
      expect(result).not.toContain('raw string');
    });

    it('should handle unterminated Go raw string at EOF', () => {
      const result = stripComments('x := `unterminated', 'go');
      expect(result).toContain('x :=');
      expect(result).not.toContain('unterminated');
    });
  });

  describe('PHP', () => {
    it('should strip # comments', () => {
      const result = stripComments('$x = 1; # comment', 'php');
      expect(result).toContain('$x = 1;');
      expect(result).not.toContain('comment');
    });

    it('should strip // comments', () => {
      const result = stripComments('$x = 1; // comment', 'php');
      expect(result).toContain('$x = 1;');
    });
  });

  describe('Ruby', () => {
    it('should strip # single-line comments', () => {
      const result = stripComments('x = 1 # comment', 'ruby');
      expect(result).toContain('x = 1');
      expect(result).not.toContain('comment');
    });

    it('should strip =begin...=end block comments', () => {
      const input = `code_before
=begin
this is a block comment
spanning multiple lines
=end
code_after`;
      const result = stripComments(input, 'ruby');
      expect(result).toContain('code_before');
      expect(result).toContain('code_after');
      expect(result).not.toContain('block comment');
    });

    it('should strip double-quoted strings', () => {
      const result = stripComments('x = "hello world"', 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain('hello world');
    });

    it('should strip single-quoted strings', () => {
      const result = stripComments("x = 'hello world'", 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain('hello world');
    });

    it('should handle escaped characters in double-quoted Ruby strings', () => {
      const result = stripComments('x = "say \\"hi\\""', 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain('hi');
    });

    it('should handle escaped characters in single-quoted Ruby strings', () => {
      const result = stripComments("x = 'it\\'s'", 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain("it\\'s");
    });
  });

  describe('Rust', () => {
    it('should strip line comments', () => {
      const result = stripComments('let x = 1; // comment', 'rust');
      expect(result).toContain('let x = 1;');
    });

    it('should strip block comments', () => {
      const result = stripComments('let x = /* val */ 1;', 'rust');
      expect(result).toContain('let x =');
    });

    it('should strip char literals like \'x\'', () => {
      const result = stripComments("let c = 'x';", 'rust');
      expect(result).toContain('let c =');
      // The char literal content should be replaced with spaces
      expect(result).not.toContain("'x'");
    });

    it('should preserve lifetime params like \'a', () => {
      const result = stripComments("fn foo<'a>(x: &'a str) {}", 'rust');
      expect(result).toContain("'a");
    });

    it('should strip r"..." raw strings', () => {
      const result = stripComments('let x = r"raw string value";', 'rust');
      expect(result).toContain('let x =');
      expect(result).not.toContain('raw string value');
    });

    it('should strip r#"..."# raw strings', () => {
      const result = stripComments('let x = r#"raw with hashes"#;', 'rust');
      expect(result).toContain('let x =');
      expect(result).not.toContain('raw with hashes');
    });

    it('should strip r##"..."## raw strings with multiple hashes', () => {
      const result = stripComments('let x = r##"deeply raw"##;', 'rust');
      expect(result).toContain('let x =');
      expect(result).not.toContain('deeply raw');
    });

    it('should handle raw string with newlines', () => {
      const input = 'let x = r#"line1\nline2"#;';
      const result = stripComments(input, 'rust');
      expect(result).toContain('let x =');
      expect(result).not.toContain('line1');
    });
  });

  describe('Escaped single-quoted strings', () => {
    it('should handle escaped single quotes in single-quoted strings', () => {
      const result = stripComments("const s = 'it\\'s working';", 'typescript');
      expect(result).toContain('const s =');
      expect(result).not.toContain('working');
    });
  });

  describe('Unterminated strings', () => {
    it('should handle unterminated double-quoted string at end of line', () => {
      const result = stripComments('let x = "unterminated\nlet y = 2;', 'typescript');
      // Should preserve line structure
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('let y = 2;');
    });

    it('should handle unterminated single-quoted string at end of line', () => {
      const result = stripComments("let x = 'unterminated\nlet y = 2;", 'typescript');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('let y = 2;');
    });

    it('should handle unterminated Python regular string at end of line', () => {
      const result = stripComments('x = "unterminated\ny = 2', 'python');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('y = 2');
    });

    it('should handle unterminated Python single-quoted string at end of line', () => {
      const result = stripComments("x = 'unterminated\ny = 2", 'python');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('y = 2');
    });
  });

  describe('Template literals with nested expressions', () => {
    it('should handle template literal with nested template expression', () => {
      const result = stripComments('const s = `outer ${inner} end`;', 'typescript');
      expect(result).toContain('const s =');
    });

    it('should handle deeply nested template expressions', () => {
      const result = stripComments('const s = `a ${b} c ${d} e`;', 'javascript');
      expect(result).toContain('const s =');
    });

    it('should handle template literal with escaped backtick', () => {
      const result = stripComments('const s = `escaped \\` backtick`;', 'typescript');
      expect(result).toContain('const s =');
    });

    it('should handle template literal with newlines', () => {
      const input = 'const s = `line1\nline2\nline3`;';
      const result = stripComments(input, 'typescript');
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
    });
  });

  describe('Python edge cases', () => {
    it('should handle escaped quotes in triple-quoted strings', () => {
      const result = stripComments('x = """escaped \\"quote\\" inside"""', 'python');
      expect(result).toContain('x =');
      expect(result).not.toContain('escaped');
    });

    it('should handle escaped quotes in regular Python strings', () => {
      const result = stripComments('x = "escaped \\"quote\\""', 'python');
      expect(result).toContain('x =');
      expect(result).not.toContain('escaped');
    });
  });

  describe('Ruby', () => {
    it('should strip # comments', () => {
      const result = stripComments('x = 1 # comment', 'ruby');
      expect(result).toContain('x = 1');
      expect(result).not.toContain('comment');
    });

    it('should strip =begin...=end block comments', () => {
      const result = stripComments('x = 1\n=begin\nblock comment\n=end\ny = 2', 'ruby');
      expect(result).toContain('x = 1');
      expect(result).toContain('y = 2');
      expect(result).not.toContain('block comment');
    });

    it('should strip double-quoted strings', () => {
      const result = stripComments('x = "hello"', 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain('hello');
    });

    it('should strip single-quoted strings', () => {
      const result = stripComments("x = 'hello'", 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain('hello');
    });

    it('should handle escaped chars in strings', () => {
      const result = stripComments('x = "escaped \\"quote"', 'ruby');
      expect(result).toContain('x =');
      expect(result).not.toContain('escaped');
    });

    it('should handle escaped chars in single-quoted strings', () => {
      const result = stripComments("x = 'escaped \\'quote'", 'ruby');
      expect(result).toContain('x =');
    });
  });

  describe('Rust', () => {
    it('should preserve lifetime parameters', () => {
      const result = stripComments("struct Foo<'a> { x: &'a str }", 'rust');
      expect(result).toContain("'a");
      expect(result).toContain('Foo');
    });

    it('should strip char literals', () => {
      const result = stripComments("let c = 'x';", 'rust');
      expect(result).toContain('let c =');
      expect(result).not.toContain("'x'");
    });

    it('should strip escaped char literals', () => {
      const result = stripComments("let c = '\\n';", 'rust');
      expect(result).toContain('let c =');
    });
  });
});
