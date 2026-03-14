import { describe, it, expect } from 'vitest';
import { createSwiftParserPlugin } from '../../../src/plugins/optional/swift-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createSwiftParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Swift parser', () => {
  const parser = getParser();

  it('should set language to swift', () => {
    const result = parser.parse('import Foundation', 'App.swift');
    expect(result.language).toBe('swift');
  });

  it('should support .swift extension', () => {
    expect(parser.extensions).toContain('.swift');
  });

  it('should have correct parser name', () => {
    expect(parser.name).toBe('swift');
  });

  it('should extract import', () => {
    const code = `import Foundation`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('Foundation');
    expect(result.imports[0]!.names).toContain('Foundation');
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should distinguish external vs internal imports', () => {
    const code = `import Foundation
import MyLocalModule`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(2);
    const foundation = result.imports.find((i) => i.from === 'Foundation');
    const local = result.imports.find((i) => i.from === 'MyLocalModule');
    expect(foundation!.kind).toBe('external');
    expect(local!.kind).toBe('internal');
  });

  it('should extract UIKit and SwiftUI as external', () => {
    const code = `import UIKit
import SwiftUI`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.kind).toBe('external');
    expect(result.imports[1]!.kind).toBe('external');
  });

  it('should extract Combine and CoreData as external', () => {
    const code = `import Combine
import CoreData`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.kind).toBe('external');
    expect(result.imports[1]!.kind).toBe('external');
  });

  it('should extract top-level function', () => {
    const code = `func greet(name: String) -> String {
    return "Hello, \\(name)"
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('greet');
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.type).toBe('String');
    expect(result.functions[0]!.returnType).toBe('String');
  });

  it('should extract public function', () => {
    const code = `public func publicFunc() -> Bool {
    return true
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.exported).toBe(true);
    expect(result.functions[0]!.scope).toBe('public');
  });

  it('should extract private function', () => {
    const code = `private func helper() {
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.exported).toBe(false);
    expect(result.functions[0]!.scope).toBe('private');
  });

  it('should extract function with default parameters', () => {
    const code = `func greet(name: String, greeting: String = "Hello") -> String {
    return "\\(greeting), \\(name)"
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[1]!.defaultValue).toBe('default');
  });

  it('should extract function with Void return type when no return', () => {
    const code = `func doWork() {
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.returnType).toBe('Void');
  });

  it('should extract function loc', () => {
    const code = `func multiLine(a: Int, b: Int) -> Int {
    let sum = a + b
    return sum
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.loc).toBe(4);
  });

  it('should extract class', () => {
    const code = `class BaseService {
    func start() {
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('BaseService');
    expect(result.classes[0]!.methods).toHaveLength(1);
  });

  it('should extract class with inheritance', () => {
    const code = `class UserService: BaseService, Repository {
    func findById(id: String) -> Any? {
        return nil
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.extends).toBe('BaseService');
    expect(result.classes[0]!.implements).toBeDefined();
    expect(result.classes[0]!.implements).toContain('Repository');
  });

  it('should extract final class', () => {
    const code = `public final class Singleton {
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Singleton');
    expect(result.classes[0]!.exported).toBe(true);
  });

  it('should extract open class', () => {
    const code = `open class OpenBase {
    open func override_me() {
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.exported).toBe(true);
  });

  it('should extract class with properties', () => {
    const code = `class Config {
    let name: String = "default"
    var count: Int = 0
    private var secret: String = "xxx"
    static let shared = Config()
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.properties).toHaveLength(4);
    const nameProp = result.classes[0]!.properties.find((p) => p.name === 'name');
    expect(nameProp!.readonly).toBe(true);
    expect(nameProp!.type).toBe('String');

    const countProp = result.classes[0]!.properties.find((p) => p.name === 'count');
    expect(countProp!.readonly).toBe(false);

    const secretProp = result.classes[0]!.properties.find((p) => p.name === 'secret');
    expect(secretProp!.scope).toBe('private');
  });

  it('should extract init method', () => {
    const code = `class Service {
    init(name: String) {
        self.name = name
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('init');
    expect(result.classes[0]!.methods[0]!.params).toHaveLength(1);
  });

  it('should extract deinit method', () => {
    const code = `class Resource {
    deinit {
        cleanup()
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('deinit');
    expect(result.classes[0]!.methods[0]!.params).toHaveLength(0);
  });

  it('should extract static method', () => {
    const code = `class Factory {
    static func create() -> Factory {
        return Factory()
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.static).toBe(true);
  });

  it('should extract mutating func name prefix', () => {
    const code = `struct Point {
    var x: Int
    mutating func move(dx: Int) {
        x += dx
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs![0]!.methods).toHaveLength(1);
    expect(result.structs![0]!.methods[0]!.name).toContain('mutating');
  });

  it('should extract struct', () => {
    const code = `struct Point {
    let x: Int
    let y: Int
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    expect(result.structs![0]!.name).toBe('Point');
    expect(result.structs![0]!.fields).toHaveLength(2);
  });

  it('should extract struct with protocol conformance', () => {
    const code = `struct UserDTO: Codable, Equatable {
    let id: UUID
    let name: String
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs![0]!.embeds).toBeDefined();
    expect(result.structs![0]!.embeds).toContain('Codable');
    expect(result.structs![0]!.embeds).toContain('Equatable');
  });

  it('should extract protocol', () => {
    const code = `protocol Repository {
    func findById(id: String) -> Any?
    func save(entity: Any) -> Bool
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.name).toBe('Repository');
    expect(result.interfaces[0]!.methods).toBeDefined();
    expect(result.interfaces[0]!.methods).toHaveLength(2);
  });

  it('should extract protocol with inheritance', () => {
    const code = `protocol CacheableRepository: Repository, Codable {
    func invalidateCache()
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.extends).toBeDefined();
    expect(result.interfaces[0]!.extends).toContain('Repository');
    expect(result.interfaces[0]!.extends).toContain('Codable');
  });

  it('should extract protocol properties', () => {
    const code = `protocol Named {
    var name: String { get set }
    var id: Int { get }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces[0]!.properties).toHaveLength(2);
    const nameProp = result.interfaces[0]!.properties.find((p) => p.name === 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp!.readonly).toBe(false);

    const idProp = result.interfaces[0]!.properties.find((p) => p.name === 'id');
    expect(idProp!.readonly).toBe(true);
  });

  it('should extract protocol with mutating method', () => {
    const code = `protocol Resettable {
    mutating func reset()
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces[0]!.methods).toHaveLength(1);
    expect(result.interfaces[0]!.methods![0]!.name).toContain('mutating');
  });

  it('should extract protocol with init requirement', () => {
    const code = `protocol Initializable {
    init(value: Int)
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces[0]!.methods).toHaveLength(1);
    expect(result.interfaces[0]!.methods![0]!.name).toBe('init');
  });

  it('should extract enum', () => {
    const code = `enum Status: String, Codable {
    case active
    case inactive
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Status');
    expect(result.classes[0]!.extends).toBe('String');
    expect(result.classes[0]!.implements).toBeDefined();
    expect(result.classes[0]!.implements).toContain('Codable');
  });

  it('should extract indirect enum', () => {
    const code = `indirect enum TreeNode {
    case leaf
    case node
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('TreeNode');
  });

  it('should extract extension as struct', () => {
    const code = `extension String {
    func toSlug() -> String {
        return self.lowercased()
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs).toHaveLength(1);
    expect(result.structs![0]!.name).toBe('String');
    expect(result.structs![0]!.methods).toHaveLength(1);
    expect(result.structs![0]!.methods[0]!.name).toBe('toSlug');
  });

  it('should extract extension with protocol conformance', () => {
    const code = `extension Int: CustomStringConvertible {
    var description: String {
        return "\\(self)"
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs![0]!.embeds).toBeDefined();
    expect(result.structs![0]!.embeds).toContain('CustomStringConvertible');
  });

  it('should extract typealias', () => {
    const code = `typealias JSON = [String: Any]`;
    const result = parser.parse(code, 'App.swift');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.name).toBe('JSON');
  });

  it('should extract public typealias as exported', () => {
    const code = `public typealias Handler = (Data) -> Void`;
    const result = parser.parse(code, 'App.swift');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.exported).toBe(true);
  });

  it('should extract top-level let constant', () => {
    const code = `public let APP_VERSION = "2.0.0"`;
    const result = parser.parse(code, 'App.swift');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('APP_VERSION');
    expect(result.constants[0]!.exported).toBe(true);
  });

  it('should extract top-level var as constant', () => {
    const code = `private var isDebug = false`;
    const result = parser.parse(code, 'App.swift');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('isDebug');
    expect(result.constants[0]!.exported).toBe(false);
  });

  it('should extract @attribute decorators', () => {
    const code = `@available(iOS 15.0, *)
@MainActor
class ModernView {
    func render() -> String {
        return "<view />"
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.decorators).toBeDefined();
    expect(result.classes[0]!.decorators).toContain('available');
    expect(result.classes[0]!.decorators).toContain('MainActor');
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'App.swift');

    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.interfaces).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
    expect(result.constants).toHaveLength(0);
    expect(result.types).toHaveLength(0);
  });

  it('should handle comments correctly', () => {
    const code = `// This is a comment
/* func fakeFunc() {} */
func realFunc() {
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('realFunc');
  });

  it('should set path in result', () => {
    const result = parser.parse('import Foundation', 'Sources/App.swift');
    expect(result.path).toBe('Sources/App.swift');
  });

  it('should compute loc and estimatedTokens', () => {
    const code = `import Foundation

func hello() -> String {
    return "world"
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.loc).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('should extract required init', () => {
    const code = `class Service {
    required init(name: String) {
        self.name = name
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('init');
  });

  it('should extract convenience init', () => {
    const code = `class Service {
    convenience init() {
        self.init(name: "default")
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('init');
  });

  it('should handle fileprivate visibility', () => {
    const code = `fileprivate func internalHelper() {
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.exported).toBe(false);
    expect(result.functions[0]!.scope).toBe('private');
  });

  it('plugin should have correct name and version', () => {
    const plugin = createSwiftParserPlugin();
    expect(plugin.name).toBe('swift-parser');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should extract enum with methods', () => {
    const code = `enum Direction {
    func description() -> String {
        return "direction"
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
  });

  it('should extract protocol with static method', () => {
    const code = `protocol Factory {
    static func create() -> Self
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces[0]!.methods).toHaveLength(1);
    expect(result.interfaces[0]!.methods![0]!.static).toBe(true);
  });

  it('should extract override method in class', () => {
    const code = `class Sub: Base {
    override func start() {
        super.start()
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('start');
  });

  it('should extract static property in struct', () => {
    const code = `struct Constants {
    static let maxRetries = 3
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs![0]!.fields).toHaveLength(1);
    const field = result.structs![0]!.fields[0]!;
    expect(field.name).toBe('maxRetries');
    expect(field.static).toBe(true);
  });

  it('should extract top-level let with explicit type', () => {
    const code = `let timeout: TimeInterval = 30.0`;
    const result = parser.parse(code, 'App.swift');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.type).toBe('TimeInterval');
  });

  it('should handle Darwin and Dispatch as external imports', () => {
    const code = `import Darwin
import Dispatch`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.kind).toBe('external');
    expect(result.imports[1]!.kind).toBe('external');
  });

  it('should handle enum with Int raw type', () => {
    const code = `enum Priority: Int {
    case low
    case high
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.extends).toBe('Int');
  });

  it('should handle method attributes in class body', () => {
    const code = `class View {
    @discardableResult
    func render() -> String {
        return ""
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.decorators).toBeDefined();
    expect(result.classes[0]!.methods[0]!.decorators).toContain('discardableResult');
  });

  it('should handle extension with static method', () => {
    const code = `extension Array {
    static func empty() -> Array {
        return []
    }
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.structs).toBeDefined();
    expect(result.structs![0]!.methods).toHaveLength(1);
    expect(result.structs![0]!.methods[0]!.static).toBe(true);
  });

  it('should handle os import as external', () => {
    const code = `import os`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should handle XCTest import as external', () => {
    const code = `import XCTest`;
    const result = parser.parse(code, 'App.swift');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should extract protocol let property', () => {
    const code = `protocol Config {
    let value: Int
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.interfaces[0]!.properties).toHaveLength(1);
    expect(result.interfaces[0]!.properties[0]!.readonly).toBe(true);
  });

  it('should extract top-level init function', () => {
    const code = `public init(name: String) {
    self.name = name
}`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('init');
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.exported).toBe(true);
  });

  it('should handle unrecognized lines and reset annotations', () => {
    const code = `@SomeAttr
some random unrecognized line
func afterReset() {
}`;
    const result = parser.parse(code, 'App.swift');

    // The annotation should NOT be attached since it was reset
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('afterReset');
    expect(result.functions[0]!.decorators).toBeUndefined();
  });

  it('should handle top-level init without body', () => {
    const code = `init(value: Int)`;
    const result = parser.parse(code, 'App.swift');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('init');
    expect(result.functions[0]!.loc).toBe(1);
  });
});
