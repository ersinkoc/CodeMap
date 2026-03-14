import { describe, it, expect } from 'vitest';
import { createRustParserPlugin } from '../../../src/plugins/optional/rust-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createRustParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Rust parser', () => {
  const parser = getParser();

  it('should extract pub functions', () => {
    const code = `pub fn hello(name: &str) -> String {
    name.to_string()
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('hello');
    expect(result.functions[0]!.exported).toBe(true);
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.type).toBe('&str');
    expect(result.functions[0]!.returnType).toBe('String');
  });

  it('should extract pub structs with fields', () => {
    const code = `pub struct Server {
    port: u16,
    host: String,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const server = result.structs![0]!;
    expect(server.name).toBe('Server');
    expect(server.exported).toBe(true);
    expect(server.fields).toHaveLength(2);
    expect(server.fields[0]!.name).toBe('port');
    expect(server.fields[0]!.type).toBe('u16');
    expect(server.fields[1]!.name).toBe('host');
  });

  it('should extract pub traits with methods', () => {
    const code = `pub trait Handler {
    fn handle(&self);
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    const trait = result.traits![0]!;
    expect(trait.name).toBe('Handler');
    expect(trait.exported).toBe(true);
    expect(trait.methods).toHaveLength(1);
    expect(trait.methods[0]!.name).toBe('handle');
    expect(trait.methods[0]!.params).toHaveLength(1);
    expect(trait.methods[0]!.params[0]!.name).toBe('&self');
  });

  it('should extract pub enums with variants', () => {
    const code = `pub enum Color {
    Red,
    Green,
    Blue,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.enums).toHaveLength(1);
    expect(result.enums[0]!.name).toBe('Color');
    expect(result.enums[0]!.exported).toBe(true);
    expect(result.enums[0]!.members).toContain('Red');
    expect(result.enums[0]!.members).toContain('Green');
    expect(result.enums[0]!.members).toContain('Blue');
  });

  it('should extract derive macros on structs', () => {
    const code = `#[derive(Debug, Clone)]
pub struct Config {
    name: String,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const config = result.structs![0]!;
    expect(config.derives).toBeDefined();
    expect(config.derives).toContain('Debug');
    expect(config.derives).toContain('Clone');
  });

  it('should extract use statements', () => {
    const code = `use std::io;`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('std');
    expect(result.imports[0]!.names).toContain('io');
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should set language to rust', () => {
    const result = parser.parse('fn main() {}', 'main.rs');
    expect(result.language).toBe('rust');
  });

  it('should extract async functions', () => {
    const code = `pub async fn fetch(url: &str) -> Result<String, Error> {
    todo!()
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.async).toBe(true);
    expect(result.functions[0]!.name).toBe('fetch');
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'lib.rs');

    expect(result.functions).toHaveLength(0);
    expect(result.enums).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
  });

  it('should distinguish pub from non-pub functions', () => {
    const code = `fn private_fn() {
}

pub fn public_fn() {
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(2);
    const privateFn = result.functions.find((f) => f.name === 'private_fn');
    const publicFn = result.functions.find((f) => f.name === 'public_fn');
    expect(privateFn!.exported).toBe(false);
    expect(publicFn!.exported).toBe(true);
  });

  it('should extract impl block for struct', () => {
    const code = `pub struct Server {
    port: u16,
}

impl Server {
    pub fn new(port: u16) -> Self {
        Server { port }
    }

    fn private_helper(&self) -> u16 {
        self.port
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const server = result.structs![0]!;
    expect(server.methods).toHaveLength(2);

    const newMethod = server.methods.find((m: any) => m.name === 'new');
    expect(newMethod).toBeDefined();
    expect(newMethod!.exported).toBe(true);

    const helper = server.methods.find((m: any) => m.name === 'private_helper');
    expect(helper).toBeDefined();
    expect(helper!.exported).toBe(false);
  });

  it('should extract impl Trait for Type', () => {
    const code = `pub struct Dog {
    name: String,
}

pub trait Animal {
    fn speak(&self) -> String;
}

impl Animal for Dog {
    fn speak(&self) -> String {
        String::from("Woof")
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    const dog = result.structs!.find((s: any) => s.name === 'Dog');
    expect(dog).toBeDefined();
    // impl Animal for Dog attaches to Dog struct
    expect(dog!.methods).toHaveLength(1);
    expect(dog!.methods[0]!.name).toBe('speak');
  });

  it('should handle pub(crate) visibility', () => {
    const code = `pub(crate) fn internal_fn() -> bool {
    true
}

pub(crate) struct Config {
    pub(crate) value: String,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('internal_fn');
    expect(result.functions[0]!.exported).toBe(true);

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    expect(result.structs![0]!.exported).toBe(true);
  });

  it('should handle derive macros on enums', () => {
    const code = `#[derive(Debug, Serialize)]
pub enum Status {
    Active,
    Inactive,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.enums).toHaveLength(1);
    expect(result.enums[0]!.name).toBe('Status');
    expect(result.enums[0]!.members).toContain('Active');
    expect(result.enums[0]!.members).toContain('Inactive');
  });

  it('should handle module declarations', () => {
    const code = `pub mod handlers;
mod internal;`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.from).toBe('handlers');
    expect(result.imports[1]!.from).toBe('internal');

    // pub mod is also an export
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]!.names).toContain('handlers');
  });

  it('should handle unsafe fn', () => {
    const code = `pub unsafe fn dangerous() -> *const u8 {
    std::ptr::null()
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('dangerous');
    expect(result.functions[0]!.exported).toBe(true);
  });

  it('should handle use with braces (multiple imports)', () => {
    const code = `use std::collections::{HashMap, HashSet};`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('std::collections');
    expect(result.imports[0]!.names).toContain('HashMap');
    expect(result.imports[0]!.names).toContain('HashSet');
  });

  it('should handle pub use re-exports', () => {
    const code = `pub use crate::models::User;`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.kind).toBe('internal');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]!.isReExport).toBe(true);
    expect(result.exports[0]!.names).toContain('User');
  });

  it('should handle trait with super traits', () => {
    const code = `pub trait Drawable: Display + Debug {
    fn draw(&self);
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    expect(result.traits![0]!.name).toBe('Drawable');
    expect(result.traits![0]!.superTraits).toBeDefined();
    expect(result.traits![0]!.superTraits).toContain('Display');
    expect(result.traits![0]!.superTraits).toContain('Debug');
  });

  it('should handle &mut self params', () => {
    const code = `pub struct Counter {
    value: i32,
}

impl Counter {
    pub fn increment(&mut self) {
        self.value += 1;
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    const counter = result.structs![0]!;
    expect(counter.methods).toHaveLength(1);
    expect(counter.methods[0]!.params).toHaveLength(1);
    expect(counter.methods[0]!.params[0]!.name).toBe('&mut self');
    expect(counter.methods[0]!.params[0]!.type).toBe('Self');
  });

  it('should handle inline module with pub', () => {
    const code = `pub mod utils {
    pub fn helper() -> bool {
        true
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]!.names).toContain('utils');
  });

  it('should handle impl block without matching struct (creates qualified functions)', () => {
    const code = `impl MyEnum {
    pub fn variant() -> Self {
        MyEnum::A
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    // No struct found, so methods become functions with qualified names
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('MyEnum::variant');
  });

  it('should handle trait impl for type not defined in file', () => {
    const code = `impl Display for MyType {
    fn fmt(&self, f: &mut Formatter) -> Result {
        Ok(())
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    // No struct for MyType, so it becomes a qualified function
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toContain('MyType');
    expect(result.functions[0]!.name).toContain('Display');
  });

  it('should handle unit struct and tuple struct', () => {
    const code = `pub struct Unit;
pub struct Wrapper(u32);`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(2);
    expect(result.structs![0]!.name).toBe('Unit');
    expect(result.structs![0]!.fields).toHaveLength(0);
    expect(result.structs![1]!.name).toBe('Wrapper');
  });

  it('should handle use with as alias', () => {
    const code = `use std::io::Result as IoResult;`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.names).toContain('IoResult');
  });

  it('should handle pub(crate) mod declaration', () => {
    const code = `pub(crate) mod internal;`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.imports).toHaveLength(1);
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]!.names).toContain('internal');
  });

  it('should handle trait method with default body', () => {
    const code = `pub trait Greet {
    fn greet(&self) -> String {
        String::from("hello")
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    expect(result.traits![0]!.methods).toHaveLength(1);
    expect(result.traits![0]!.methods[0]!.name).toBe('greet');
    expect(result.traits![0]!.methods[0]!.loc).toBeGreaterThan(1);
  });

  it('should handle const fn', () => {
    const code = `pub const fn max_size() -> usize {
    1024
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('max_size');
  });

  it('should extract struct fields with pub scope', () => {
    const code = `pub struct Mixed {
    pub name: String,
    age: u32,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    const mixed = result.structs![0]!;
    expect(mixed.fields).toHaveLength(2);
    const nameField = mixed.fields.find((f: any) => f.name === 'name');
    expect(nameField!.scope).toBe('public');
    const ageField = mixed.fields.find((f: any) => f.name === 'age');
    expect(ageField!.scope).toBe('private');
  });

  it('should handle self (owned) and mut self params', () => {
    const code = `pub struct Wrapper {
    value: i32,
}

impl Wrapper {
    pub fn consume(self) -> i32 {
        self.value
    }

    pub fn mutate(mut self) -> Self {
        self.value = 0;
        self
    }
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    const wrapper = result.structs![0]!;
    expect(wrapper.methods).toHaveLength(2);

    const consume = wrapper.methods.find((m: any) => m.name === 'consume');
    expect(consume).toBeDefined();
    expect(consume!.params[0]!.name).toBe('self');
    expect(consume!.params[0]!.type).toBe('Self');

    const mutate = wrapper.methods.find((m: any) => m.name === 'mutate');
    expect(mutate).toBeDefined();
    expect(mutate!.params[0]!.name).toBe('mut self');
    expect(mutate!.params[0]!.type).toBe('Self');
  });

  it('should extract lifetime generics from struct', () => {
    const code = `pub struct Ref<'a> {
    data: &'a str,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const ref = result.structs![0]!;
    expect(ref.name).toBe('Ref');
    expect(ref.generics).toBeDefined();
    expect(ref.generics).toContain("'a");
  });

  it('should capture where clause in function return type', () => {
    const code = `pub fn process<T>(item: T) -> T where T: Clone + Debug {
    item.clone()
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('process');
    expect(result.functions[0]!.returnType).toContain('where');
    expect(result.functions[0]!.returnType).toContain('T');
  });

  it('should extract lifetime and type generics from trait', () => {
    const code = `pub trait Parser<'a, T> {
    fn parse(&'a self) -> T;
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    const trait = result.traits![0]!;
    expect(trait.name).toBe('Parser');
    expect(trait.generics).toBeDefined();
    expect(trait.generics).toContain("'a");
    expect(trait.generics).toContain('T');
  });

  it('should handle function with very long multi-line signature (fallback)', () => {
    // Create a function with params spanning more than 15 lines
    const lines = ['pub fn big_func('];
    for (let i = 0; i < 16; i++) {
      lines.push(`    p${i}: String,`);
    }
    lines.push('    ) -> bool {');
    lines.push('    true');
    lines.push('}');
    const code = lines.join('\n');
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('big_func');
  });

  it('should handle function with return type on next line after closing paren', () => {
    const code = `pub fn compute(x: i32)
    -> Result<i32, Error>
{
    Ok(x)
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('compute');
    expect(result.functions[0]!.returnType).toContain('Result');
  });

  it('should handle trait method with async and return on next line', () => {
    const code = `pub trait Service {
    async fn process(&self, data: Vec<u8>)
        -> Result<(), Error>;
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    expect(result.traits![0]!.methods).toHaveLength(1);
    expect(result.traits![0]!.methods[0]!.async).toBe(true);
    expect(result.traits![0]!.methods[0]!.returnType).toContain('Result');
  });

  it('should handle collectRustSignature brace fallback with unclosed parens', () => {
    // Malformed signature where { appears before closing paren
    const code = `pub fn process(
    data: String
{
    todo!()
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('process');
  });

  it('should extract multiple type generics from struct (comma-separated type params)', () => {
    const code = `pub struct Pair<K: Clone, V: Debug> {
    key: K,
    value: V,
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    const pair = result.structs![0]!;
    expect(pair.name).toBe('Pair');
    expect(pair.generics).toBeDefined();
    expect(pair.generics).toContain('K');
    expect(pair.generics).toContain('V');
  });

  it('should handle collectRustSignature when return type spans to end without brace or semicolon', () => {
    // Trait method where closing paren and return type are on the same line,
    // but there is no { or ; on any subsequent line within the scan window.
    // This triggers the fallback return at line 551 in collectRustSignature.
    const code = `pub trait Processor {
    fn transform(&self, data: Vec<u8>) -> Vec<u8>
}`;
    const result = parser.parse(code, 'lib.rs');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    expect(result.traits![0]!.methods).toHaveLength(1);
    expect(result.traits![0]!.methods[0]!.name).toBe('transform');
  });
});
