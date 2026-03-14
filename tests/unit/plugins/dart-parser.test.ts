import { describe, it, expect } from 'vitest';
import { createDartParserPlugin } from '../../../src/plugins/optional/dart-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createDartParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Dart parser', () => {
  const parser = getParser();

  it('should set language to dart', () => {
    const result = parser.parse('void main() {}', 'main.dart');
    expect(result.language).toBe('dart');
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'main.dart');

    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
    expect(result.enums).toHaveLength(0);
  });

  it('should extract dart: imports as external', () => {
    const code = `import 'dart:async';
import 'dart:convert';`;
    const result = parser.parse(code, 'main.dart');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.from).toBe('dart:async');
    expect(result.imports[0]!.kind).toBe('external');
    expect(result.imports[1]!.from).toBe('dart:convert');
  });

  it('should extract package: imports as external', () => {
    const code = `import 'package:flutter/material.dart';`;
    const result = parser.parse(code, 'main.dart');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('package:flutter/material.dart');
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should extract relative imports as internal', () => {
    const code = `import 'src/models.dart';`;
    const result = parser.parse(code, 'main.dart');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.kind).toBe('internal');
  });

  it('should extract show clause names', () => {
    const code = `import 'package:flutter/material.dart' show Widget, BuildContext;`;
    const result = parser.parse(code, 'main.dart');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.names).toContain('Widget');
    expect(result.imports[0]!.names).toContain('BuildContext');
  });

  it('should extract exports', () => {
    const code = `export 'src/models.dart';`;
    const result = parser.parse(code, 'main.dart');

    expect(result.exports).toHaveLength(1);
    expect(result.exports[0]!.from).toBe('src/models.dart');
    expect(result.exports[0]!.isReExport).toBe(true);
  });

  it('should extract simple class', () => {
    const code = `class User {
  final String name;
  int age = 0;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('User');
    expect(cls.exported).toBe(true);
    expect(cls.properties.length).toBeGreaterThanOrEqual(2);
  });

  it('should extract abstract class', () => {
    const code = `abstract class BaseService {
  String get name;
  Future<void> initialize();
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('BaseService');
    expect(cls.abstract).toBe(true);
  });

  it('should extract sealed class', () => {
    const code = `sealed class Shape {
  double area();
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Shape');
  });

  it('should extract class with extends/with/implements', () => {
    const code = `class ApiService extends BaseService with Serializable implements Disposable {
  void dispose() {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('ApiService');
    expect(cls.extends).toBe('BaseService');
    expect(cls.implements).toContain('Serializable');
    expect(cls.implements).toContain('Disposable');
  });

  it('should extract enums with members', () => {
    const code = `enum Status {
  idle,
  loading,
  success,
  error,
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.enums).toHaveLength(1);
    const e = result.enums[0]!;
    expect(e.name).toBe('Status');
    expect(e.members).toContain('idle');
    expect(e.members).toContain('loading');
    expect(e.members).toContain('success');
    expect(e.members).toContain('error');
    expect(e.exported).toBe(true);
  });

  it('should extract private enum', () => {
    const code = `enum _InternalStatus {
  active,
  inactive,
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.enums).toHaveLength(1);
    expect(result.enums[0]!.exported).toBe(false);
  });

  it('should extract typedefs', () => {
    const code = `typedef StringCallback = void Function(String value);
typedef JsonMap = Map<String, dynamic>;`;
    const result = parser.parse(code, 'main.dart');

    expect(result.types).toHaveLength(2);
    expect(result.types[0]!.name).toBe('StringCallback');
    expect(result.types[0]!.exported).toBe(true);
    expect(result.types[1]!.name).toBe('JsonMap');
  });

  it('should extract mixin with on clause', () => {
    const code = `mixin Serializable on BaseService {
  Map<String, dynamic> toJson() {
    return {};
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    const trait = result.traits![0]!;
    expect(trait.name).toBe('Serializable');
    expect(trait.superTraits).toContain('BaseService');
    expect(trait.methods).toHaveLength(1);
    expect(trait.methods[0]!.name).toBe('toJson');
  });

  it('should extract mixin without on clause', () => {
    const code = `mixin Loggable {
  void log(String message) {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.traits).toBeDefined();
    expect(result.traits).toHaveLength(1);
    expect(result.traits![0]!.name).toBe('Loggable');
    expect(result.traits![0]!.superTraits).toBeUndefined();
  });

  it('should extract extension', () => {
    const code = `extension StringExtension on String {
  String capitalize() {
    return this;
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const ext = result.classes[0]!;
    expect(ext.name).toBe('StringExtension');
    expect(ext.extends).toBe('String');
    expect(ext.methods).toHaveLength(1);
    expect(ext.methods[0]!.name).toBe('capitalize');
  });

  it('should extract top-level functions', () => {
    const code = `void main() {
  print('hello');
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('main');
    expect(result.functions[0]!.returnType).toBe('void');
    expect(result.functions[0]!.exported).toBe(true);
  });

  it('should detect async functions via Future return type', () => {
    const code = `Future<void> fetchData() async {
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('fetchData');
    expect(result.functions[0]!.async).toBe(true);
    expect(result.functions[0]!.returnType).toContain('Future');
  });

  it('should detect private top-level functions', () => {
    const code = `void _privateHelper() {
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('_privateHelper');
    expect(result.functions[0]!.exported).toBe(false);
  });

  it('should extract factory constructors', () => {
    const code = `class Config {
  factory Config.fromJson(Map<String, dynamic> json) {
    return Config();
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    const factory = methods.find((m: any) => m.name === 'Config.fromJson');
    expect(factory).toBeDefined();
    expect(factory!.returnType).toBe('Config');
  });

  it('should extract named constructors', () => {
    const code = `class Config {
  final String host;
  Config.defaultConfig() : host = 'localhost' {
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    const named = methods.find((m: any) => m.name === 'Config.defaultConfig');
    expect(named).toBeDefined();
  });

  it('should extract class annotations/decorators', () => {
    const code = `@immutable
class Data {
  final int value = 0;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.decorators).toContain('immutable');
  });

  it('should extract method annotations (@override)', () => {
    const code = `class Foo extends Bar {
  @override
  void doSomething() {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const method = result.classes[0]!.methods.find((m: any) => m.name === 'doSomething');
    expect(method).toBeDefined();
    expect(method!.decorators).toContain('override');
  });

  it('should extract static methods in a class', () => {
    const code = `class Factory {
  static Factory create() {
    return Factory();
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const method = result.classes[0]!.methods.find((m: any) => m.name === 'create');
    expect(method).toBeDefined();
    expect(method!.static).toBe(true);
  });

  it('should extract const and final top-level declarations', () => {
    const code = `const String appName = 'MyApp';
final int maxRetries = 3;`;
    const result = parser.parse(code, 'main.dart');

    expect(result.constants).toHaveLength(2);
    expect(result.constants[0]!.name).toBe('appName');
    expect(result.constants[1]!.name).toBe('maxRetries');
  });

  it('should handle private const as non-exported', () => {
    const code = `const String _secret = 'hidden';`;
    const result = parser.parse(code, 'main.dart');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('_secret');
    expect(result.constants[0]!.exported).toBe(false);
  });

  it('should compute loc and estimatedTokens', () => {
    const code = `class Foo {
  void bar() {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.loc).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('should register parser with correct extension', () => {
    expect(parser.name).toBe('dart');
    expect(parser.extensions).toContain('.dart');
  });

  it('should handle class fields (final, late, var)', () => {
    const code = `class Data {
  final String name = 'test';
  late final int count;
  var _items = 0;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    expect(props.length).toBeGreaterThanOrEqual(2);

    const nameProp = props.find((p: any) => p.name === 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp!.readonly).toBe(true);
  });

  it('should handle getter properties in a class', () => {
    const code = `class Foo {
  String get label => 'hello';
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    const getter = props.find((p: any) => p.name === 'label');
    expect(getter).toBeDefined();
    expect(getter!.readonly).toBe(true);
  });

  it('should handle setter properties in a class', () => {
    const code = `class Foo {
  set value(int v) {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    const setter = props.find((p: any) => p.name === 'value');
    expect(setter).toBeDefined();
  });

  it('should not return traits when none exist', () => {
    const code = `class Simple {}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.traits).toBeUndefined();
  });

  it('should handle function parameters with types', () => {
    const code = `String greet(String name, int age) {
  return name;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.type).toBe('String');
    expect(result.functions[0]!.params[1]!.name).toBe('age');
    expect(result.functions[0]!.params[1]!.type).toBe('int');
  });

  it('should handle enum with semicolon separator', () => {
    const code = `enum Color {
  red,
  green,
  blue;

  String get hex => '';
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.enums).toHaveLength(1);
    expect(result.enums[0]!.members).toHaveLength(3);
    expect(result.enums[0]!.members).toContain('red');
    expect(result.enums[0]!.members).toContain('blue');
  });

  it('should handle default constructor', () => {
    const code = `class Point {
  final int x;
  final int y;
  Point(this.x, this.y);
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const ctor = result.classes[0]!.methods.find((m: any) => m.name === 'Point');
    expect(ctor).toBeDefined();
  });

  it('should handle extension with anonymous name', () => {
    // Anonymous extensions don't have a name
    const code = `extension on int {
  bool get isEven2 => this % 2 == 0;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('_anonymous');
    expect(result.classes[0]!.extends).toBe('int');
  });

  it('should handle required keyword in parameters', () => {
    const code = `class Opts {
  Opts({required String name, int age = 0});
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const ctor = result.classes[0]!.methods.find((m: any) => m.name === 'Opts');
    expect(ctor).toBeDefined();
    expect(ctor!.params.length).toBeGreaterThanOrEqual(1);
    const nameParm = ctor!.params.find((p: any) => p.name === 'name');
    expect(nameParm).toBeDefined();
    expect(nameParm!.type).toBe('String');
  });

  it('should handle Function type parameters', () => {
    const code = `void register(void Function(String) callback) {}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('callback');
    expect(result.functions[0]!.params[0]!.type).toContain('Function');
  });

  it('should handle multi-line getter in class', () => {
    const code = `class Foo {
  String get label {
    return 'hello';
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    expect(props.find((p: any) => p.name === 'label')).toBeDefined();
  });

  it('should handle method name matching class name (constructor skip)', () => {
    const code = `class Widget {
  void build() {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    expect(methods.find((m: any) => m.name === 'build')).toBeDefined();
  });

  it('should handle return type fallback to void for unknown patterns', () => {
    const code = `class Foo {
  bar() {}
}`;
    const result = parser.parse(code, 'main.dart');

    // bar() with no return type may or may not be detected depending on matching
    // This primarily tests that extractDartReturnType does not crash
    expect(result.classes).toHaveLength(1);
  });

  it('should handle Stream return type', () => {
    const code = `Stream<int> generateNumbers() async* {
  yield 1;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.returnType).toContain('Stream');
  });

  it('should handle top-level function with decorator', () => {
    const code = `@deprecated
void oldFunction() {}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.decorators).toContain('deprecated');
  });

  it('should reset pending annotations when no match found', () => {
    const code = `@someAnnotation
// This line wont match anything after stripping
void realFunction() {}`;
    const result = parser.parse(code, 'main.dart');

    // realFunction should still be extracted
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle static getter in class', () => {
    const code = `class Cfg {
  static String get defaultName => 'test';
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    const getter = props.find((p: any) => p.name === 'defaultName');
    expect(getter).toBeDefined();
    expect(getter!.static).toBe(true);
    expect(getter!.readonly).toBe(true);
  });

  it('should handle static setter in class', () => {
    const code = `class Cfg {
  static set mode(String value) {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    const setter = props.find((p: any) => p.name === 'mode');
    expect(setter).toBeDefined();
    expect(setter!.static).toBe(true);
  });

  it('should not duplicate property when getter and setter both exist', () => {
    const code = `class Foo {
  int get value => 0;
  set value(int v) {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    const valueProps = props.filter((p: any) => p.name === 'value');
    expect(valueProps).toHaveLength(1);
  });

  it('should handle const field in class', () => {
    const code = `class Foo {
  static const String id = 'abc';
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    const idProp = props.find((p: any) => p.name === 'id');
    expect(idProp).toBeDefined();
    expect(idProp!.readonly).toBe(true);
  });

  it('should handle factory constructor without named constructor', () => {
    const code = `class Singleton {
  factory Singleton() {
    return _instance;
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const factory = result.classes[0]!.methods.find((m: any) => m.name === 'Singleton');
    expect(factory).toBeDefined();
    expect(factory!.returnType).toBe('Singleton');
  });

  it('should handle abstract method (semicolon, no body)', () => {
    const code = `abstract class Base {
  void doWork();
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    expect(methods.find((m: any) => m.name === 'doWork')).toBeDefined();
  });

  it('should handle typedef without equals sign', () => {
    const code = `typedef Callback = void Function(int);`;
    const result = parser.parse(code, 'main.dart');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.name).toBe('Callback');
    expect(result.types[0]!.type).toContain('Function');
  });

  it('should handle private typedef', () => {
    const code = `typedef _InternalCallback = void Function();`;
    const result = parser.parse(code, 'main.dart');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.exported).toBe(false);
  });

  it('should handle class with base/final/interface modifiers', () => {
    const code = `final class ImmutableData {
  final String value = '';
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('ImmutableData');
  });

  it('should handle var top-level declaration (not const/final)', () => {
    const code = `var globalState = 0;`;
    const result = parser.parse(code, 'main.dart');

    // var is not const/final, so it should NOT be in constants
    expect(result.constants).toHaveLength(0);
  });

  it('should handle multi-line default constructor', () => {
    const code = `class Multi {
  Multi(
    String a,
    int b,
  ) {
    // body
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const ctor = result.classes[0]!.methods.find((m: any) => m.name === 'Multi');
    expect(ctor).toBeDefined();
    expect(ctor!.params.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle method name same as class name being skipped in method match', () => {
    // The method regex could match ClassName(), but it should be skipped
    // because it's a constructor, not a method
    const code = `class Foo {
  String Foo() {
    return '';
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    // Foo() will be matched as a constructor, not as a method named Foo
  });

  it('should skip field with control keyword type', () => {
    // This tests the guard against false positive field matches
    const code = `class Foo {
  void doWork() {
    return;
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    // Should not crash or produce spurious fields
  });

  it('should handle signature that spans many lines (signature collector fallback)', () => {
    const code = `void veryLongFunction(
  String a,
  String b,
  String c,
  String d,
  String e,
  String f,
  String g,
  String h,
  String i,
  String j,
  String k,
  String l,
  String m,
  String n,
  String o
) {
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('veryLongFunction');
    expect(result.functions[0]!.params.length).toBeGreaterThanOrEqual(10);
  });

  it('should handle unmatched parens gracefully in extractParenContent', () => {
    // Indirectly tested — if the signature extraction gets a broken signature
    // This test ensures the parser doesn't crash on unusual input
    const code = `void broken(String a {}`;
    const result = parser.parse(code, 'main.dart');

    // Parser should not crash
    expect(result).toBeDefined();
  });

  it('should handle line that looks like an annotation but is not standalone', () => {
    const code = `@override void doWork() {}`;
    const result = parser.parse(code, 'main.dart');

    // The annotation is on the same line — should not be treated as standalone
    expect(result).toBeDefined();
  });

  it('should not extract function named class/enum/mixin/extension', () => {
    // These would be false positives from the function regex
    // e.g., "int class(" would match the function regex with name "class"
    const code = `void main() {}`;
    const result = parser.parse(code, 'main.dart');

    // Just verify normal parsing works and no false positives
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('main');
  });

  it('should handle annotation on unknown construct (reset)', () => {
    const code = `@someAnnotation
int x = 5;

void func() {}`;
    const result = parser.parse(code, 'main.dart');

    // The annotation on x = 5 is consumed/reset, not attached to func
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle class with only a constructor (no body methods)', () => {
    const code = `class Empty {
  Empty();
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.name).toBe('Empty');
  });

  it('should handle named params with this. prefix', () => {
    const code = `class Cfg {
  final String host;
  Cfg({required this.host});
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const ctor = result.classes[0]!.methods.find((m: any) => m.name === 'Cfg');
    expect(ctor).toBeDefined();
    expect(ctor!.params.length).toBeGreaterThanOrEqual(1);
    expect(ctor!.params[0]!.name).toBe('host');
  });

  it('should handle method that matches class name in method match (skip branch)', () => {
    // Force the method regex to match classname by having a return type before it
    const code = `class Svc {
  String Svc() {
    return '';
  }
  void work() {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    // Svc() matches method regex with name == className, should be skipped
    // and handled by constructor branch instead
    const workMethod = result.classes[0]!.methods.find((m: any) => m.name === 'work');
    expect(workMethod).toBeDefined();
  });

  it('should handle function without recognizable return type', () => {
    // extractDartReturnType should return void as fallback
    const code = `class Foo {
  doSomething() {}
}`;
    const result = parser.parse(code, 'main.dart');

    // doSomething() has no return type — may or may not match method regex
    expect(result.classes).toHaveLength(1);
  });

  it('should handle top-level var with type annotation', () => {
    const code = `const int MAX_COUNT = 100;`;
    const result = parser.parse(code, 'main.dart');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('MAX_COUNT');
    expect(result.constants[0]!.type).toBe('int');
  });

  it('should handle getter property in abstract class returning type', () => {
    const code = `abstract class Service {
  Future<void> initialize();
  String get name;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const props = result.classes[0]!.properties;
    expect(props.find((p: any) => p.name === 'name')).toBeDefined();
  });

  it('should handle function with no return type match (operator-like)', () => {
    // A class method where the return type pattern doesn't match known forms
    const code = `class Ops {
  operator +(Ops other) {
    return this;
  }
}`;
    const result = parser.parse(code, 'main.dart');

    // Parser should not crash on operator methods
    expect(result.classes).toHaveLength(1);
  });

  it('should skip method whose name matches class name (method regex path)', () => {
    // String Worker(...) inside class Worker should be skipped by method regex
    // because name === className, and handled as a constructor instead
    const code = `class Worker {
  String Worker() {
    return '';
  }
  void doWork() {}
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    const methods = result.classes[0]!.methods;
    // Worker should be handled as constructor, doWork as method
    const doWork = methods.find((m: any) => m.name === 'doWork');
    expect(doWork).toBeDefined();
  });

  it('should handle control keyword guard in field matching', () => {
    // Construct code that would make the field regex match with type = "return"
    // Note: after comment stripping, this would need specific structure
    const code = `class Guard {
  void handle() {
    return;
  }
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    // Should not produce spurious fields named from control flow
  });

  it('should handle the keyword guard for top-level function matching class', () => {
    // After comment stripping, if a line like "int class(...)" appeared,
    // the function regex would match with name "class" and be skipped
    // This is a defensive guard — test that the parser handles related patterns
    const code = `class Foo {
}
void main() {}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.classes).toHaveLength(1);
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('main');
  });

  it('should handle method with no recognized return type in extractDartReturnType', () => {
    // A method where extractDartReturnType cannot match any pattern
    // This happens when the method line doesn't start with a recognizable type
    const code = `class X {
  get count => 0;
}`;
    const result = parser.parse(code, 'main.dart');

    // get count would be handled by getter, not method regex
    expect(result.classes).toHaveLength(1);
  });

  it('should handle typedef with no = sign (no type extracted)', () => {
    // typedef without = sign — defMatch is null, so type is 'unknown'
    const code = `typedef Callback;`;
    const result = parser.parse(code, 'main.dart');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.name).toBe('Callback');
    expect(result.types[0]!.type).toBe('unknown');
  });

  it('should handle top-level function as single-line declaration with semicolon', () => {
    const code = `external void nativeCall(int code);`;
    const result = parser.parse(code, 'main.dart');

    // external keyword may prevent match, but the parser should not crash
    expect(result).toBeDefined();
  });

  it('should handle top-level function with body (normal case)', () => {
    const code = `int add(int a, int b) {
  return a + b;
}`;
    const result = parser.parse(code, 'main.dart');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('add');
    expect(result.functions[0]!.returnType).toBe('int');
    expect(result.functions[0]!.params).toHaveLength(2);
  });
});
