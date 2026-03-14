import { describe, it, expect } from 'vitest';
import { createPythonParserPlugin } from '../../../src/plugins/optional/python-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createPythonParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Python parser', () => {
  const parser = getParser();

  it('should extract typed functions with return type', () => {
    const code = `def hello(name: str) -> str:
    return name`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('hello');
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.type).toBe('str');
    expect(result.functions[0]!.returnType).toBe('str');
  });

  it('should extract classes with base classes', () => {
    const code = `class MyClass(BaseClass):
    def method(self) -> None:
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('MyClass');
    expect(cls.extends).toBe('BaseClass');
    expect(cls.methods).toHaveLength(1);
    expect(cls.methods[0]!.name).toBe('method');
  });

  it('should extract decorators on functions', () => {
    const code = `@decorator
def hello(name: str) -> str:
    return name`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.decorators).toBeDefined();
    expect(result.functions[0]!.decorators).toContain('decorator');
  });

  it('should treat underscore-prefixed names as non-exported by default', () => {
    const code = `def hello():
    pass

def _private():
    pass

class MyClass:
    pass

class _InternalClass:
    pass`;
    const result = parser.parse(code, 'test.py');

    const helloFn = result.functions.find((f) => f.name === 'hello');
    expect(helloFn).toBeDefined();
    expect(helloFn!.exported).toBe(true);

    const privateFn = result.functions.find((f) => f.name === '_private');
    expect(privateFn).toBeDefined();
    expect(privateFn!.exported).toBe(false);

    const myClass = result.classes.find((c) => c.name === 'MyClass');
    expect(myClass).toBeDefined();
    expect(myClass!.exported).toBe(true);

    const internalClass = result.classes.find((c) => c.name === '_InternalClass');
    expect(internalClass).toBeDefined();
    expect(internalClass!.exported).toBe(false);
  });

  it('should extract from-imports', () => {
    const code = `from module import name`;
    const result = parser.parse(code, 'test.py');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('module');
    expect(result.imports[0]!.names).toContain('name');
  });

  it('should extract plain imports', () => {
    const code = `import os`;
    const result = parser.parse(code, 'test.py');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('os');
    expect(result.imports[0]!.names).toContain('os');
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should set language to python', () => {
    const result = parser.parse('x = 1', 'test.py');
    expect(result.language).toBe('python');
  });

  it('should extract async functions', () => {
    const code = `async def fetch_data(url: str) -> dict:
    pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.async).toBe(true);
    expect(result.functions[0]!.name).toBe('fetch_data');
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'test.py');

    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
  });

  it('should extract class methods with self filtered out of params', () => {
    const code = `class Greeter:
    def greet(self, name: str) -> str:
        return name`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const method = result.classes[0]!.methods[0]!;
    expect(method.name).toBe('greet');
    // 'self' should be filtered out of params
    expect(method.params).toHaveLength(1);
    expect(method.params[0]!.name).toBe('name');
  });

  it('should extract class with multiple bases', () => {
    const code = `class MyClass(Base1, Base2, Base3):
    def method(self) -> None:
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.extends).toBe('Base1');
    expect(cls.implements).toBeDefined();
    expect(cls.implements).toContain('Base2');
    expect(cls.implements).toContain('Base3');
  });

  it('should detect method visibility rules (dunder, protected, private)', () => {
    const code = `class Visibility:
    def __init__(self) -> None:
        pass
    def _protected_method(self) -> None:
        pass
    def __private_method(self) -> None:
        pass
    def public_method(self) -> None:
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    expect(methods).toHaveLength(4);

    const init = methods.find((m: any) => m.name === '__init__');
    expect(init).toBeDefined();
    expect(init!.scope).toBe('public'); // dunder is public

    const prot = methods.find((m: any) => m.name === '_protected_method');
    expect(prot).toBeDefined();
    expect(prot!.scope).toBe('protected');

    const priv = methods.find((m: any) => m.name === '__private_method');
    expect(priv).toBeDefined();
    expect(priv!.scope).toBe('private');

    const pub = methods.find((m: any) => m.name === 'public_method');
    expect(pub).toBeDefined();
    expect(pub!.scope).toBe('public');
  });

  it('should handle @property and @staticmethod decorators on methods', () => {
    const code = `class Config:
    @property
    def name(self) -> str:
        return self._name
    @staticmethod
    def default() -> Config:
        return Config()
    @classmethod
    def from_dict(cls, data: dict) -> Config:
        return cls()`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;

    const prop = methods.find((m: any) => m.name === 'name');
    expect(prop).toBeDefined();
    expect(prop!.decorators).toContain('property');

    const staticMethod = methods.find((m: any) => m.name === 'default');
    expect(staticMethod).toBeDefined();
    expect(staticMethod!.decorators).toContain('staticmethod');
    expect(staticMethod!.static).toBeTruthy();

    const classMethod = methods.find((m: any) => m.name === 'from_dict');
    expect(classMethod).toBeDefined();
    expect(classMethod!.decorators).toContain('classmethod');
    expect(classMethod!.static).toBeTruthy();
  });

  it('should handle __all__ for export detection', () => {
    const code = `__all__ = ["exported_func", "ExportedClass"]

def exported_func():
    pass

def not_exported():
    pass

class ExportedClass:
    pass

class NotExportedClass:
    pass`;
    const result = parser.parse(code, 'test.py');

    const exportedFn = result.functions.find((f: any) => f.name === 'exported_func');
    expect(exportedFn!.exported).toBe(true);

    const notExportedFn = result.functions.find((f: any) => f.name === 'not_exported');
    expect(notExportedFn!.exported).toBe(false);

    const exportedCls = result.classes.find((c: any) => c.name === 'ExportedClass');
    expect(exportedCls!.exported).toBe(true);

    const notExportedCls = result.classes.find((c: any) => c.name === 'NotExportedClass');
    expect(notExportedCls!.exported).toBe(false);
  });

  it('should handle multi-line from-imports', () => {
    const code = `from module import (
    name1,
    name2,
    name3
)

def func():
    pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.names).toContain('name1');
    expect(result.imports[0]!.names).toContain('name2');
    expect(result.imports[0]!.names).toContain('name3');
  });

  it('should handle import with alias', () => {
    const code = `import numpy as np`;
    const result = parser.parse(code, 'test.py');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.names).toContain('np');
    expect(result.imports[0]!.from).toBe('numpy');
  });

  it('should handle relative imports', () => {
    const code = `from .utils import helper`;
    const result = parser.parse(code, 'test.py');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.kind).toBe('internal');
  });

  it('should handle *args and **kwargs', () => {
    const code = `def func(*args: int, **kwargs: str) -> None:
    pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('*args');
    expect(result.functions[0]!.params[0]!.type).toBe('int');
    expect(result.functions[0]!.params[1]!.name).toBe('**kwargs');
    expect(result.functions[0]!.params[1]!.type).toBe('str');
  });

  it('should handle param with default value but no type', () => {
    const code = `def func(name=42) -> str:
    return name`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.optional).toBe(true);
  });

  it('should handle param with typed default value', () => {
    const code = `def func(count: int = 10) -> int:
    return count`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('count');
    expect(result.functions[0]!.params[0]!.type).toBe('int');
    expect(result.functions[0]!.params[0]!.optional).toBe(true);
    expect(result.functions[0]!.params[0]!.defaultValue).toBe('10');
  });

  it('should extract class properties from annotations and __init__', () => {
    const code = `class User:
    name: str
    age: int = 0
    def __init__(self) -> None:
        self.email = "default"
        self.name = "test"`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    // name and age from annotations, email from __init__ (name already seen)
    expect(props.length).toBeGreaterThanOrEqual(3);
    expect(props.find((p: any) => p.name === 'name')).toBeDefined();
    expect(props.find((p: any) => p.name === 'age')).toBeDefined();
    expect(props.find((p: any) => p.name === 'email')).toBeDefined();
  });

  it('should detect abstract class via ABC base', () => {
    const code = `class AbstractService(ABC):
    def serve(self) -> None:
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.abstract).toBeTruthy();
  });

  it('should skip / and * in params', () => {
    const code = `def func(a, /, b, *, c) -> None:
    pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(3);
    const names = result.functions[0]!.params.map((p: any) => p.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
    expect(names).toContain('c');
  });

  it('should handle class with metaclass= keyword arg in bases', () => {
    const code = `class Singleton(Base, metaclass=ABCMeta):
    def instance(self) -> Singleton:
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.extends).toBe('Base');
    // metaclass=ABCMeta should be skipped
    expect(result.classes[0]!.implements).toBeUndefined();
  });

  it('should handle class with no parentheses', () => {
    const code = `class SimpleClass:
    def method(self) -> None:
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('SimpleClass');
    expect(result.classes[0]!.extends).toBeUndefined();
  });

  it('should handle async class method', () => {
    const code = `class Worker:
    async def process(self, item: str) -> bool:
        return True`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.async).toBe(true);
  });

  it('should handle from-import with as alias', () => {
    const code = `from collections import OrderedDict as OD`;
    const result = parser.parse(code, 'test.py');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.names).toContain('OD');
  });

  it('should handle method with no return type (void branch)', () => {
    const code = `class Worker:
    def process(self):
        pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const method = result.classes[0]!.methods[0]!;
    expect(method.name).toBe('process');
    expect(method.returnType).toBe('void');
  });

  it('should extract dataclass with typed fields and mark defaults as optional', () => {
    const code = `@dataclass
class User:
    name: str
    age: int = 0`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('User');
    expect(cls.decorators).toContain('dataclass');
    expect(cls.properties).toHaveLength(2);

    const nameProp = cls.properties.find((p: any) => p.name === 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp!.type).toBe('str');
    expect(nameProp!.optional).toBeFalsy();

    const ageProp = cls.properties.find((p: any) => p.name === 'age');
    expect(ageProp).toBeDefined();
    expect(ageProp!.type).toBe('int');
    expect(ageProp!.optional).toBe(true);
  });

  it('should extract dataclass with field() defaults as optional', () => {
    const code = `@dataclass
class Config:
    items: list = field(default_factory=list)`;
    const result = parser.parse(code, 'test.py');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('Config');
    expect(cls.properties).toHaveLength(1);

    const itemsProp = cls.properties.find((p: any) => p.name === 'items');
    expect(itemsProp).toBeDefined();
    expect(itemsProp!.type).toBe('list');
    expect(itemsProp!.optional).toBe(true);
  });

  it('should extract top-level functions at different indent levels', () => {
    const code = `def first():
    pass

def second():
    pass`;
    const result = parser.parse(code, 'test.py');

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0]!.name).toBe('first');
    expect(result.functions[1]!.name).toBe('second');
  });

  it('should not capture class methods as top-level functions', () => {
    const code = `def standalone():
    pass

class MyClass:
    def method(self):
        pass`;
    const result = parser.parse(code, 'test.py');

    const funcNames = result.functions.map((f: any) => f.name);
    expect(funcNames).toContain('standalone');
    expect(funcNames).not.toContain('method');

    // method should be a class method
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('method');
  });
});
