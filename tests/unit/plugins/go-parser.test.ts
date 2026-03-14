import { describe, it, expect } from 'vitest';
import { createGoParserPlugin } from '../../../src/plugins/optional/go-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createGoParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Go parser', () => {
  const parser = getParser();

  it('should extract package declaration', () => {
    const code = `package main`;
    const result = parser.parse(code, 'main.go');

    expect(result.packages).toBeDefined();
    expect(result.packages).toHaveLength(1);
    expect(result.packages![0]!.name).toBe('main');
  });

  it('should extract functions', () => {
    const code = `package main

func Hello(name string) string {
  return name
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('Hello');
    expect(result.functions[0]!.exported).toBe(true);
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.type).toBe('string');
    expect(result.functions[0]!.returnType).toBe('string');
  });

  it('should extract methods with receivers', () => {
    const code = `package main

type Server struct {
  port int
}

func (s *Server) Start() error {
  return nil
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const server = result.structs![0]!;
    expect(server.name).toBe('Server');
    expect(server.methods).toHaveLength(1);
    expect(server.methods[0]!.name).toBe('Start');
    expect(server.methods[0]!.returnType).toBe('error');
  });

  it('should extract structs with fields', () => {
    const code = `package main

type Server struct {
  port int
  host string
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const server = result.structs![0]!;
    expect(server.name).toBe('Server');
    expect(server.exported).toBe(true);
    expect(server.fields).toHaveLength(2);
    expect(server.fields[0]!.name).toBe('port');
    expect(server.fields[0]!.type).toBe('int');
    expect(server.fields[1]!.name).toBe('host');
  });

  it('should extract interfaces with methods', () => {
    const code = `package main

type Handler interface {
  Handle() error
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.interfaces).toHaveLength(1);
    const iface = result.interfaces[0]!;
    expect(iface.name).toBe('Handler');
    expect(iface.exported).toBe(true);
    expect(iface.methods).toBeDefined();
    expect(iface.methods).toHaveLength(1);
    expect(iface.methods![0]!.name).toBe('Handle');
  });

  it('should extract single imports', () => {
    const code = `package main

import "fmt"`;
    const result = parser.parse(code, 'main.go');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('fmt');
    expect(result.imports[0]!.names).toContain('fmt');
  });

  it('should extract grouped imports', () => {
    const code = `package main

import (
  "fmt"
  "net/http"
)`;
    const result = parser.parse(code, 'main.go');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.from).toBe('fmt');
    expect(result.imports[1]!.from).toBe('net/http');
    expect(result.imports[1]!.names).toContain('http');
  });

  it('should set language to go', () => {
    const code = `package main`;
    const result = parser.parse(code, 'main.go');
    expect(result.language).toBe('go');
  });

  it('should handle unexported functions (lowercase)', () => {
    const code = `package main

func helper() {
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('helper');
    expect(result.functions[0]!.exported).toBe(false);
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'main.go');

    expect(result.functions).toHaveLength(0);
    expect(result.interfaces).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
  });

  it('should extract function with multiple return values', () => {
    const code = `package main

func Divide(a, b int) (int, error) {
  return a / b, nil
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('Divide');
    expect(result.functions[0]!.returnType).toBe('(int, error)');
    // grouped params: a, b int
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('a');
    expect(result.functions[0]!.params[0]!.type).toBe('int');
    expect(result.functions[0]!.params[1]!.name).toBe('b');
    expect(result.functions[0]!.params[1]!.type).toBe('int');
  });

  it('should extract struct with embedded types', () => {
    const code = `package main

type Animal struct {
  Name string
}

type Dog struct {
  Animal
  Breed string
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(2);
    const dog = result.structs!.find((s: any) => s.name === 'Dog');
    expect(dog).toBeDefined();
    expect(dog!.embeds).toBeDefined();
    expect(dog!.embeds).toContain('Animal');
    expect(dog!.fields).toHaveLength(1);
    expect(dog!.fields[0]!.name).toBe('Breed');
  });

  it('should extract interface with embedded types', () => {
    const code = `package main

type ReadWriter interface {
  Reader
  Writer
  Flush() error
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.interfaces).toHaveLength(1);
    const iface = result.interfaces[0]!;
    expect(iface.name).toBe('ReadWriter');
    expect(iface.extends).toBeDefined();
    expect(iface.extends).toContain('Reader');
    expect(iface.extends).toContain('Writer');
    expect(iface.methods).toHaveLength(1);
    expect(iface.methods![0]!.name).toBe('Flush');
  });

  it('should extract method on pointer receiver', () => {
    const code = `package main

type Config struct {
  Value int
}

func (c *Config) Set(v int) {
  c.Value = v
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const config = result.structs![0]!;
    expect(config.methods).toHaveLength(1);
    expect(config.methods[0]!.name).toBe('Set');
  });

  it('should extract method on value receiver', () => {
    const code = `package main

type Point struct {
  X int
  Y int
}

func (p Point) String() string {
  return ""
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    const point = result.structs![0]!;
    expect(point.methods).toHaveLength(1);
    expect(point.methods[0]!.name).toBe('String');
    expect(point.methods[0]!.exported).toBe(true);
  });

  it('should handle aliased grouped imports', () => {
    const code = `package main

import (
  mylog "github.com/sirupsen/logrus"
  "fmt"
)`;
    const result = parser.parse(code, 'main.go');

    expect(result.imports).toHaveLength(2);
    const aliased = result.imports.find((i: any) => i.names.includes('mylog'));
    expect(aliased).toBeDefined();
    expect(aliased!.from).toBe('github.com/sirupsen/logrus');
    expect(aliased!.kind).toBe('external');
  });

  it('should handle variadic params', () => {
    const code = `package main

func Printf(format string, args ...interface{}) {
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('format');
    expect(result.functions[0]!.params[1]!.name).toBe('args');
    expect(result.functions[0]!.params[1]!.type).toContain('...');
  });

  it('should handle methods on a receiver type without a matching struct', () => {
    const code = `package main

func (t MyType) DoSomething() {
}`;
    const result = parser.parse(code, 'main.go');

    // Method without struct definition goes into functions
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('DoSomething');
  });

  it('should handle external vs internal single imports', () => {
    const code = `package main

import "fmt"
import "github.com/pkg/errors"`;
    const result = parser.parse(code, 'main.go');

    expect(result.imports).toHaveLength(2);
    const fmt = result.imports.find((i: any) => i.from === 'fmt');
    expect(fmt!.kind).toBe('internal');
    const errors = result.imports.find((i: any) => i.from === 'github.com/pkg/errors');
    expect(errors!.kind).toBe('external');
  });

  it('should extract interface method with params', () => {
    const code = `package main

type Saver interface {
  Save(data []byte) error
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.methods).toHaveLength(1);
    const method = result.interfaces[0]!.methods![0]!;
    expect(method.name).toBe('Save');
    expect(method.params).toHaveLength(1);
    expect(method.params[0]!.name).toBe('data');
  });

  it('should handle unexported struct', () => {
    const code = `package main

type config struct {
  host string
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    expect(result.structs![0]!.exported).toBe(false);
  });

  it('should handle function with named return values', () => {
    const code = `package main

func Split(sum int) (x, y int) {
  return 0, 0
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.returnType).toBe('(x, y int)');
  });

  it('should handle type-only params (unnamed)', () => {
    const code = `package main

type Handler interface {
  Handle(int, string) error
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.interfaces).toHaveLength(1);
    const method = result.interfaces[0]!.methods![0]!;
    expect(method.name).toBe('Handle');
    // type-only params have empty name
    expect(method.params.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle struct field that resolves as embed when field name equals type', () => {
    const code = `package main

type MyStruct struct {
  sync.Mutex
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    // sync.Mutex is an embedded type
    const s = result.structs![0]!;
    expect(s.embeds).toBeDefined();
  });

  it('should handle unnamed non-word type-only params (e.g., *int, []byte)', () => {
    const code = `package main

type Processor interface {
  Process(*int, []byte) error
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.interfaces).toHaveLength(1);
    const method = result.interfaces[0]!.methods![0]!;
    expect(method.name).toBe('Process');
    // Non-word type-only params have empty name
    expect(method.params.length).toBe(2);
    expect(method.params[0]!.name).toBe('');
    expect(method.params[0]!.type).toContain('int');
    expect(method.params[1]!.name).toBe('');
  });

  it('should handle struct with embedded field that has tag (embed via empty typeStr)', () => {
    const code = `package main

type Embedded struct {
  *io.Reader
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    const s = result.structs![0]!;
    // *io.Reader is an embedded type
    expect(s.embeds).toBeDefined();
    expect(s.embeds!.some((e: string) => e.includes('io.Reader') || e.includes('Reader'))).toBe(true);
  });

  it('should treat struct field as embed when typeStr equals name', () => {
    // When a field like "Bar Bar" is parsed, typeStr === name, so it's treated as an embed
    const code = `package main

type Foo struct {
  Bar Bar
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    const s = result.structs![0]!;
    expect(s.embeds).toBeDefined();
    expect(s.embeds).toContain('Bar');
  });

  it('should extract generic function', () => {
    const code = `package main

func Map[T any, U any](items []T, fn func(T) U) []U {
  return nil
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('Map');
    expect(result.functions[0]!.exported).toBe(true);
  });

  it('should extract generic struct', () => {
    const code = `package main

type Set[T comparable] struct {
  items map[T]bool
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    expect(result.structs![0]!.name).toBe('Set');
    expect(result.structs![0]!.exported).toBe(true);
  });

  it('should extract generic interface', () => {
    const code = `package main

type Container[T any] interface {
  Get() T
}`;
    const result = parser.parse(code, 'main.go');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.name).toBe('Container');
    expect(result.interfaces[0]!.exported).toBe(true);
    expect(result.interfaces[0]!.methods).toHaveLength(1);
    expect(result.interfaces[0]!.methods![0]!.name).toBe('Get');
  });

  it('should extract single const', () => {
    const code = `package main

const MaxRetries = 3`;
    const result = parser.parse(code, 'main.go');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('MaxRetries');
    expect(result.constants[0]!.exported).toBe(true);
  });

  it('should extract grouped const block', () => {
    const code = `package main

const (
  StatusOK = 200
  StatusNotFound = 404
)`;
    const result = parser.parse(code, 'main.go');

    expect(result.constants).toHaveLength(2);
    expect(result.constants[0]!.name).toBe('StatusOK');
    expect(result.constants[0]!.exported).toBe(true);
    expect(result.constants[1]!.name).toBe('StatusNotFound');
    expect(result.constants[1]!.exported).toBe(true);
  });
});
