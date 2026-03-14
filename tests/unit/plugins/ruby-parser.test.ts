import { describe, it, expect } from 'vitest';
import { createRubyParserPlugin } from '../../../src/plugins/optional/ruby-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createRubyParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Ruby parser', () => {
  const parser = getParser();

  it('should set language to ruby', () => {
    const result = parser.parse('x = 1', 'test.rb');
    expect(result.language).toBe('ruby');
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'test.rb');

    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
    expect(result.constants).toHaveLength(0);
  });

  it('should extract require imports', () => {
    const code = `require 'json'
require 'net/http'`;
    const result = parser.parse(code, 'test.rb');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.from).toBe('json');
    expect(result.imports[0]!.kind).toBe('external');
    expect(result.imports[1]!.from).toBe('net/http');
    expect(result.imports[1]!.names).toContain('http');
  });

  it('should extract require_relative imports as internal', () => {
    const code = `require_relative 'config'`;
    const result = parser.parse(code, 'test.rb');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('config');
    expect(result.imports[0]!.kind).toBe('internal');
  });

  it('should extract class with inheritance', () => {
    const code = `class Dog < Animal
  def bark
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('Dog');
    expect(cls.extends).toBe('Animal');
    expect(cls.exported).toBe(true);
  });

  it('should extract class without inheritance', () => {
    const code = `class Simple
  def hello
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Simple');
    expect(result.classes[0]!.extends).toBeUndefined();
  });

  it('should extract module as class', () => {
    const code = `module Serializable
  def to_json
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('Serializable');
    expect(cls.methods).toHaveLength(1);
    expect(cls.methods[0]!.name).toBe('to_json');
  });

  it('should extract instance methods', () => {
    const code = `class Greeter
  def greet(name)
    puts name
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
    const method = result.classes[0]!.methods[0]!;
    expect(method.name).toBe('greet');
    expect(method.params).toHaveLength(1);
    expect(method.params[0]!.name).toBe('name');
    expect(method.static).toBeFalsy();
  });

  it('should extract static methods (self.method)', () => {
    const code = `class Factory
  def self.create_default
    new
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const method = result.classes[0]!.methods[0]!;
    expect(method.name).toBe('self.create_default');
    expect(method.static).toBe(true);
  });

  it('should extract methods with special characters (?, !, =)', () => {
    const code = `class Checker
  def valid?
  end

  def destroy!
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    expect(methods).toHaveLength(2);
    expect(methods[0]!.name).toBe('valid?');
    expect(methods[1]!.name).toBe('destroy!');
  });

  it('should extract attr_accessor properties', () => {
    const code = `class User
  attr_accessor :name, :age
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    expect(props).toHaveLength(2);
    expect(props[0]!.name).toBe('name');
    expect(props[1]!.name).toBe('age');
  });

  it('should extract attr_reader as readonly properties', () => {
    const code = `class Config
  attr_reader :settings
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    expect(props).toHaveLength(1);
    expect(props[0]!.name).toBe('settings');
    expect(props[0]!.readonly).toBe(true);
  });

  it('should extract attr_writer properties', () => {
    const code = `class Logger
  attr_writer :output
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    expect(props).toHaveLength(1);
    expect(props[0]!.name).toBe('output');
    expect(props[0]!.readonly).toBeFalsy();
  });

  it('should extract constants', () => {
    const code = `MAX_RETRIES = 3
VERSION = '1.0.0'`;
    const result = parser.parse(code, 'test.rb');

    expect(result.constants).toHaveLength(2);
    expect(result.constants[0]!.name).toBe('MAX_RETRIES');
    expect(result.constants[0]!.exported).toBe(true);
    expect(result.constants[1]!.name).toBe('VERSION');
  });

  it('should extract include/extend as imports', () => {
    const code = `class User
  include Comparable
  extend ClassMethods
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.from).toBe('Comparable');
    expect(result.imports[1]!.from).toBe('ClassMethods');
  });

  it('should track include as implements on classes', () => {
    const code = `class User
  include Comparable
  include Enumerable
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.implements).toBeDefined();
    expect(result.classes[0]!.implements).toContain('Comparable');
    expect(result.classes[0]!.implements).toContain('Enumerable');
  });

  it('should handle visibility keywords (private)', () => {
    const code = `class Secured
  def public_method
  end

  private

  def secret_method
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    expect(methods).toHaveLength(2);

    const pub = methods.find((m: any) => m.name === 'public_method');
    expect(pub!.scope).toBe('public');
    expect(pub!.exported).toBe(true);

    const priv = methods.find((m: any) => m.name === 'secret_method');
    expect(priv!.scope).toBe('private');
    expect(priv!.exported).toBe(false);
  });

  it('should handle visibility keywords (protected)', () => {
    const code = `class Base
  protected

  def helper
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const method = result.classes[0]!.methods[0]!;
    expect(method.scope).toBe('protected');
    expect(method.exported).toBe(false);
  });

  it('should extract method parameters with defaults', () => {
    const code = `def greet(name, greeting = 42)
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[1]!.name).toBe('greeting');
    expect(result.functions[0]!.params[1]!.optional).toBe(true);
    expect(result.functions[0]!.params[1]!.defaultValue).toBe('42');
  });

  it('should handle parameters with string defaults (stripped by comment stripper)', () => {
    const code = `def greet(name, greeting = 'Hello')
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[1]!.name).toBe('greeting');
    expect(result.functions[0]!.params[1]!.optional).toBe(true);
  });

  it('should handle *args and **kwargs', () => {
    const code = `def variadic(*args, **kwargs)
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('*args');
    expect(result.functions[0]!.params[0]!.type).toBe('Array');
    expect(result.functions[0]!.params[1]!.name).toBe('**kwargs');
    expect(result.functions[0]!.params[1]!.type).toBe('Hash');
  });

  it('should handle &block parameter', () => {
    const code = `def with_block(&block)
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('&block');
    expect(result.functions[0]!.params[0]!.type).toBe('block');
  });

  it('should handle keyword arguments', () => {
    const code = `def configure(host:, port: 8080)
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('host');
    expect(result.functions[0]!.params[1]!.name).toBe('port');
    expect(result.functions[0]!.params[1]!.optional).toBe(true);
  });

  it('should extract top-level functions', () => {
    const code = `def helper(x)
  x * 2
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('helper');
    expect(result.functions[0]!.exported).toBe(true);
  });

  it('should handle method without parentheses', () => {
    const code = `class Foo
  def bar
    42
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('bar');
    expect(result.classes[0]!.methods[0]!.params).toHaveLength(0);
  });

  it('should extract namespaced module', () => {
    const code = `module Networking
  class HttpClient
    def get(url)
    end
  end
end`;
    const result = parser.parse(code, 'test.rb');

    // Both module and nested class should be extracted
    expect(result.classes.length).toBeGreaterThanOrEqual(2);
    const mod = result.classes.find((c: any) => c.name === 'Networking');
    expect(mod).toBeDefined();
    const client = result.classes.find((c: any) => c.name === 'HttpClient');
    expect(client).toBeDefined();
    expect(client!.methods).toHaveLength(1);
  });

  it('should handle class with namespace separator', () => {
    const code = `class Foo < Bar::Baz
  def hello
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.extends).toBe('Bar::Baz');
  });

  it('should handle include with namespace', () => {
    const code = `class Foo
  include ActiveModel::Validations
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('ActiveModel::Validations');
    expect(result.imports[0]!.names).toContain('Validations');
  });

  it('should compute loc and estimatedTokens', () => {
    const code = `class Foo
  def bar
    42
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.loc).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('should register parser with correct extensions', () => {
    expect(parser.name).toBe('ruby');
    expect(parser.extensions).toContain('.rb');
    expect(parser.extensions).toContain('.rake');
    expect(parser.extensions).toContain('.gemspec');
  });

  it('should handle constants inside class body', () => {
    const code = `class App
  VERSION = '1.0'
  def run
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('VERSION');
  });

  it('should handle empty params string', () => {
    const code = `def no_params()
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(0);
  });

  it('should handle extend as import and mixin', () => {
    const code = `class Foo
  extend ClassMethods
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('ClassMethods');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.implements).toContain('ClassMethods');
  });

  it('should handle public visibility after private', () => {
    const code = `class Toggle
  private

  def secret
  end

  public

  def visible
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    const secret = methods.find((m: any) => m.name === 'secret');
    expect(secret!.scope).toBe('private');
    const visible = methods.find((m: any) => m.name === 'visible');
    expect(visible!.scope).toBe('public');
  });

  it('should handle method with loc computation', () => {
    const code = `def long_method(a, b)
  x = a + b
  y = x * 2
  z = y - 1
  z
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.loc).toBe(6);
  });

  it('should handle class without include (no implements)', () => {
    const code = `class Plain
  def method_a
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.implements).toBeUndefined();
  });

  it('should handle do...end blocks within methods', () => {
    const code = `class Worker
  def process(items)
    items.each do |item|
      puts item
    end
  end
end`;
    const result = parser.parse(code, 'test.rb');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('process');
  });

  it('should handle unterminated class gracefully (flush fallback)', () => {
    // Missing `end` for the class — the flush fallback should handle it
    const code = `class Broken
  def hello
  end`;
    const result = parser.parse(code, 'test.rb');

    // Should still extract the class despite missing end
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Broken');
    expect(result.classes[0]!.methods).toHaveLength(1);
    // No includes, so implements should be undefined
    expect(result.classes[0]!.implements).toBeUndefined();
  });

  it('should handle extend outside a class (top-level)', () => {
    const code = `extend SomeModule`;
    const result = parser.parse(code, 'test.rb');

    // Should still register as import even without a class context
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('SomeModule');
  });

  it('should handle visibility keyword outside a class (no-op)', () => {
    const code = `private
def secret
end`;
    const result = parser.parse(code, 'test.rb');

    // Top-level visibility keyword is a no-op — function still extracted
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('secret');
    // Top-level visibility keyword outside a class doesn't affect the function's scope
    expect(result.functions[0]!.scope).toBe('public');
  });

  it('should handle attr_accessor outside a class', () => {
    const code = `attr_accessor :name`;
    const result = parser.parse(code, 'test.rb');

    // attr_accessor outside a class is parsed but not attached to any class
    expect(result.classes).toHaveLength(0);
  });
});
