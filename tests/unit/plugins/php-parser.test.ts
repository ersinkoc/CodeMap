import { describe, it, expect } from 'vitest';
import { createPhpParserPlugin } from '../../../src/plugins/optional/php-parser.js';

describe('PHP Parser Plugin', () => {
  let parser: { name: string; extensions: readonly string[]; parse: (content: string, filePath: string) => any };

  const mockKernel = {
    registerParser: (p: any) => { parser = p; },
    registerFormatter: () => {},
    getParser: () => undefined,
    getParserForExtension: () => undefined,
    getFormatter: () => undefined,
    listParsers: () => [],
    listFormatters: () => [],
    emit: () => {},
    on: () => {},
    off: () => {},
    getConfig: () => ({ root: '.', output: '.codemap', format: 'compact' as const }),
  };

  const plugin = createPhpParserPlugin();
  plugin.install(mockKernel as any);

  it('should register parser with language "php"', () => {
    expect(parser.name).toBe('php');
    expect(parser.extensions).toContain('.php');
  });

  it('should parse a class with extends and implements', () => {
    const code = `<?php
class UserController extends Controller implements JsonSerializable {
}`;
    const result = parser.parse(code, 'UserController.php');
    expect(result.language).toBe('php');
    expect(result.classes.length).toBeGreaterThanOrEqual(1);
    const cls = result.classes[0];
    expect(cls.name).toBe('UserController');
    expect(cls.extends).toBe('Controller');
    expect(cls.implements).toContain('JsonSerializable');
  });

  it('should parse an interface with methods', () => {
    const code = `<?php
interface Repository {
  public function find(int $id): ?User;
}`;
    const result = parser.parse(code, 'Repository.php');
    // PHP interfaces are stored in classes array with abstract=true
    const iface = result.classes.find((c: any) => c.name === 'Repository');
    expect(iface).toBeDefined();
    expect(iface.abstract).toBe(true);
    expect(iface.methods.length).toBeGreaterThanOrEqual(1);
    expect(iface.methods[0].name).toBe('find');
  });

  it('should parse a trait', () => {
    const code = `<?php
trait Cacheable {
  public function cache(): void {
  }
}`;
    const result = parser.parse(code, 'Cacheable.php');
    expect(result.traits).toBeDefined();
    expect(result.traits.length).toBeGreaterThanOrEqual(1);
    expect(result.traits[0].name).toBe('Cacheable');
    expect(result.traits[0].methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse namespace', () => {
    const code = `<?php
namespace App\\Http\\Controllers;`;
    const result = parser.parse(code, 'test.php');
    expect(result.packages).toBeDefined();
    expect(result.packages.length).toBeGreaterThanOrEqual(1);
    expect(result.packages[0].name).toBe('App\\Http\\Controllers');
  });

  it('should parse use statements', () => {
    const code = `<?php
use App\\Models\\User;`;
    const result = parser.parse(code, 'test.php');
    expect(result.imports.length).toBeGreaterThanOrEqual(1);
    expect(result.imports[0].from).toBe('App\\Models\\User');
    expect(result.imports[0].names).toContain('User');
  });

  it('should parse functions with visibility modifiers', () => {
    const code = `<?php
class Foo {
  public function index(): Response {
  }
  private static function validate(): bool {
  }
}`;
    const result = parser.parse(code, 'Foo.php');
    const cls = result.classes.find((c: any) => c.name === 'Foo');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBe(2);

    const indexMethod = cls.methods.find((m: any) => m.name === 'index');
    expect(indexMethod).toBeDefined();
    expect(indexMethod.scope).toBe('public');
    expect(indexMethod.returnType).toBe('Response');

    const validateMethod = cls.methods.find((m: any) => m.name === 'validate');
    expect(validateMethod).toBeDefined();
    expect(validateMethod.scope).toBe('private');
    expect(validateMethod.static).toBe(true);
    expect(validateMethod.returnType).toBe('bool');
  });

  it('should handle empty file', () => {
    const result = parser.parse('', 'empty.php');
    expect(result.classes).toEqual([]);
    expect(result.functions).toEqual([]);
    expect(result.imports).toEqual([]);
  });

  it('should set language to "php"', () => {
    const result = parser.parse('<?php\n', 'test.php');
    expect(result.language).toBe('php');
  });

  it('should parse abstract class', () => {
    const code = `<?php
abstract class BaseController {
  public abstract function handle(): Response;
  public function run(): void {
  }
}`;
    const result = parser.parse(code, 'BaseController.php');
    const cls = result.classes.find((c: any) => c.name === 'BaseController');
    expect(cls).toBeDefined();
    expect(cls.abstract).toBe(true);
    expect(cls.methods.length).toBe(2);
  });

  it('should parse abstract method in class', () => {
    const code = `<?php
abstract class Shape {
  protected abstract function area(): float;
}`;
    const result = parser.parse(code, 'Shape.php');
    const cls = result.classes.find((c: any) => c.name === 'Shape');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'area');
    expect(method).toBeDefined();
    expect(method.scope).toBe('protected');
  });

  it('should parse constructor with typed params and promoted properties', () => {
    const code = `<?php
class User {
  public function __construct(
    public readonly string $name,
    private int $age
  ) {
  }
}`;
    const result = parser.parse(code, 'User.php');
    const cls = result.classes.find((c: any) => c.name === 'User');
    expect(cls).toBeDefined();
    const ctor = cls.methods.find((m: any) => m.name === '__construct');
    expect(ctor).toBeDefined();
    expect(ctor.params.length).toBe(2);
    expect(ctor.params[0].name).toBe('$name');
    expect(ctor.params[1].name).toBe('$age');
  });

  it('should parse free functions', () => {
    const code = `<?php
function helper(string $input): string {
  return $input;
}`;
    const result = parser.parse(code, 'helper.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].name).toBe('helper');
    expect(result.functions[0].returnType).toBe('string');
    expect(result.functions[0].params.length).toBe(1);
    expect(result.functions[0].params[0].name).toBe('$input');
    expect(result.functions[0].params[0].type).toBe('string');
  });

  it('should parse trait methods with visibility', () => {
    const code = `<?php
trait Loggable {
  public function log(string $message): void {
  }
  protected function format(string $msg): string {
    return $msg;
  }
}`;
    const result = parser.parse(code, 'Loggable.php');
    expect(result.traits).toBeDefined();
    expect(result.traits.length).toBe(1);
    expect(result.traits[0].methods.length).toBe(2);

    const log = result.traits[0].methods.find((m: any) => m.name === 'log');
    expect(log).toBeDefined();
    expect(log.scope).toBe('public');

    const format = result.traits[0].methods.find((m: any) => m.name === 'format');
    expect(format).toBeDefined();
    expect(format.scope).toBe('protected');
  });

  it('should parse properties with type hints', () => {
    const code = `<?php
class Config {
  public string $name;
  protected int $count = 0;
  private static bool $initialized = false;
  public readonly array $items;
}`;
    const result = parser.parse(code, 'Config.php');
    const cls = result.classes.find((c: any) => c.name === 'Config');
    expect(cls).toBeDefined();
    expect(cls.properties.length).toBe(4);

    const name = cls.properties.find((p: any) => p.name === '$name');
    expect(name).toBeDefined();
    expect(name.type).toBe('string');
    expect(name.scope).toBe('public');

    const count = cls.properties.find((p: any) => p.name === '$count');
    expect(count).toBeDefined();
    expect(count.type).toBe('int');
    expect(count.scope).toBe('protected');

    const initialized = cls.properties.find((p: any) => p.name === '$initialized');
    expect(initialized).toBeDefined();
    expect(initialized.static).toBe(true);
    expect(initialized.scope).toBe('private');

    const items = cls.properties.find((p: any) => p.name === '$items');
    expect(items).toBeDefined();
    expect(items.readonly).toBe(true);
  });

  it('should parse group use statements', () => {
    const code = `<?php
use App\\Models\\{User, Post, Comment};`;
    const result = parser.parse(code, 'test.php');
    expect(result.imports.length).toBe(1);
    expect(result.imports[0].from).toBe('App\\Models');
    expect(result.imports[0].names).toContain('User');
    expect(result.imports[0].names).toContain('Post');
    expect(result.imports[0].names).toContain('Comment');
  });

  it('should parse use with alias', () => {
    const code = `<?php
use App\\Services\\UserService as US;`;
    const result = parser.parse(code, 'test.php');
    expect(result.imports.length).toBe(1);
    expect(result.imports[0].names).toContain('US');
  });

  it('should parse final class', () => {
    const code = `<?php
final class Singleton {
  public static function getInstance(): self {
  }
}`;
    const result = parser.parse(code, 'Singleton.php');
    const cls = result.classes.find((c: any) => c.name === 'Singleton');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBe(1);
    expect(cls.methods[0].static).toBe(true);
  });

  it('should parse method with nullable return type', () => {
    const code = `<?php
class Repo {
  public function find(int $id): ?User {
    return null;
  }
}`;
    const result = parser.parse(code, 'Repo.php');
    const cls = result.classes.find((c: any) => c.name === 'Repo');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'find');
    expect(method).toBeDefined();
    expect(method.returnType).toContain('User');
  });

  it('should parse variadic params', () => {
    const code = `<?php
function sum(int ...$numbers): int {
  return 0;
}`;
    const result = parser.parse(code, 'sum.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].params.length).toBe(1);
    expect(result.functions[0].params[0].name).toBe('...$numbers');
    expect(result.functions[0].params[0].type).toBe('int');
  });

  it('should parse param with default value', () => {
    const code = `<?php
function greet(string $name = null): string {
  return $name;
}`;
    const result = parser.parse(code, 'greet.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].params.length).toBe(1);
    expect(result.functions[0].params[0].optional).toBe(true);
  });

  it('should parse interface extending another interface', () => {
    const code = `<?php
interface CrudRepository extends Repository {
  public function findAll(): array;
}`;
    const result = parser.parse(code, 'CrudRepository.php');
    const iface = result.classes.find((c: any) => c.name === 'CrudRepository');
    expect(iface).toBeDefined();
    expect(iface.extends).toBe('Repository');
    expect(iface.abstract).toBe(true);
  });

  it('should parse properties without type hint', () => {
    const code = `<?php
class Legacy {
  public $data;
}`;
    const result = parser.parse(code, 'Legacy.php');
    const cls = result.classes.find((c: any) => c.name === 'Legacy');
    expect(cls).toBeDefined();
    expect(cls.properties.length).toBe(1);
    expect(cls.properties[0].name).toBe('$data');
    expect(cls.properties[0].type).toBe('mixed');
  });

  it('should handle nullable typed params', () => {
    const code = `<?php
function process(?string $input): void {
}`;
    const result = parser.parse(code, 'process.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].params.length).toBe(1);
    expect(result.functions[0].params[0].type).toContain('string');
  });

  it('should handle method with very long multi-line signature (fallback)', () => {
    const lines = ['<?php', 'class BigController {', '  public function handle('];
    for (let i = 0; i < 16; i++) {
      lines.push(`    string $p${i},`);
    }
    lines.push('    string $last): void {');
    lines.push('  }');
    lines.push('}');
    const code = lines.join('\n');
    const result = parser.parse(code, 'BigController.php');
    const cls = result.classes.find((c: any) => c.name === 'BigController');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle unrecognized param format gracefully', () => {
    // Param format that doesn't match the regex should return null
    const code = `<?php
function test(): void {
}`;
    const result = parser.parse(code, 'test.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].params.length).toBe(0);
  });

  it('should parse interface with static method', () => {
    const code = `<?php
interface Factory {
  public static function create(): self;
}`;
    const result = parser.parse(code, 'Factory.php');
    const iface = result.classes.find((c: any) => c.name === 'Factory');
    expect(iface).toBeDefined();
    expect(iface.methods.length).toBe(1);
    expect(iface.methods[0].static).toBe(true);
  });

  it('should handle function with return type on next line', () => {
    const code = `<?php
function compute(int $x)
    : string
{
    return (string)$x;
}`;
    const result = parser.parse(code, 'compute.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].name).toBe('compute');
    expect(result.functions[0].returnType).toBe('string');
  });

  it('should handle method with very long params that exceed 15-line limit', () => {
    const lines = ['<?php', 'class LargeController {', '  public function handle('];
    for (let i = 0; i < 20; i++) {
      lines.push(`    int $p${i},`);
    }
    lines.push('    int $last): void {');
    lines.push('  }');
    lines.push('}');
    const code = lines.join('\n');
    const result = parser.parse(code, 'LargeController.php');
    const cls = result.classes.find((c: any) => c.name === 'LargeController');
    expect(cls).toBeDefined();
    // The method should still be detected
    expect(cls.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle collectPhpSignature brace fallback with unclosed parens', () => {
    // Malformed signature where { appears before closing paren
    const code = `<?php
class Broken {
  public function process(
      string $data
  {
    return;
  }
}`;
    const result = parser.parse(code, 'Broken.php');
    const cls = result.classes.find((c: any) => c.name === 'Broken');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse union type property', () => {
    const code = `<?php
class Foo {
    public int|string $id;
}`;
    const result = parser.parse(code, 'Foo.php');
    const cls = result.classes.find((c: any) => c.name === 'Foo');
    expect(cls).toBeDefined();
    expect(cls.properties.length).toBe(1);
    expect(cls.properties[0].name).toBe('$id');
    expect(cls.properties[0].type).toBe('int|string');
  });

  it('should extract promoted properties from constructor', () => {
    const code = `<?php
class User {
    public function __construct(
        private string $name,
        protected int $age = 0
    ) {}
}`;
    const result = parser.parse(code, 'User.php');
    const cls = result.classes.find((c: any) => c.name === 'User');
    expect(cls).toBeDefined();
    // Promoted properties should appear in properties array
    const nameProp = cls.properties.find((p: any) => p.name === '$name');
    expect(nameProp).toBeDefined();
    expect(nameProp.scope).toBe('private');
    expect(nameProp.type).toBe('string');
    const ageProp = cls.properties.find((p: any) => p.name === '$age');
    expect(ageProp).toBeDefined();
    expect(ageProp.scope).toBe('protected');
    expect(ageProp.type).toBe('int');
  });

  it('should parse intersection type param', () => {
    const code = `<?php
function process(Foo&Bar $item): void {}`;
    const result = parser.parse(code, 'process.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].params.length).toBe(1);
    expect(result.functions[0].params[0].name).toBe('$item');
    expect(result.functions[0].params[0].type).toBe('Foo&Bar');
  });

  it('should parse union return type', () => {
    const code = `<?php
function getId(): int|string { return 1; }`;
    const result = parser.parse(code, 'getId.php');
    expect(result.functions.length).toBe(1);
    expect(result.functions[0].returnType).toBe('int|string');
  });

  it('should handle parseOnePhpParam returning null for unrecognized format', () => {
    // A param that does not match the PHP param regex (no $) is skipped
    const code = `<?php
function test(callback): void {
}`;
    const result = parser.parse(code, 'test.php');
    expect(result.functions.length).toBe(1);
    // The 'callback' param without $ should be skipped (returns null)
    expect(result.functions[0].params.length).toBe(0);
  });
});
