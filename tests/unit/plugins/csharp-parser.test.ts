import { describe, it, expect } from 'vitest';
import { createCsharpParserPlugin } from '../../../src/plugins/optional/csharp-parser.js';

describe('C# Parser Plugin', () => {
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

  const plugin = createCsharpParserPlugin();
  plugin.install(mockKernel as any);

  it('should register parser with language "csharp"', () => {
    expect(parser.name).toBe('csharp');
    expect(parser.extensions).toContain('.cs');
  });

  it('should parse a class with base class and interface', () => {
    const code = `public class UserService : BaseService, IUserService {
}`;
    const result = parser.parse(code, 'UserService.cs');
    expect(result.language).toBe('csharp');
    expect(result.classes.length).toBeGreaterThanOrEqual(1);
    const cls = result.classes[0];
    expect(cls.name).toBe('UserService');
    expect(cls.extends).toBe('BaseService');
    expect(cls.implements).toContain('IUserService');
    expect(cls.exported).toBe(true);
  });

  it('should parse an interface with methods', () => {
    const code = `public interface IUserService {
  Task<User> GetById(string id);
}`;
    const result = parser.parse(code, 'IUserService.cs');
    expect(result.interfaces.length).toBeGreaterThanOrEqual(1);
    const iface = result.interfaces[0];
    expect(iface.name).toBe('IUserService');
    expect(iface.methods.length).toBeGreaterThanOrEqual(1);
    expect(iface.methods[0].name).toBe('GetById');
  });

  it('should parse a struct', () => {
    const code = `public struct Point {
  public int X;
  public int Y;
}`;
    const result = parser.parse(code, 'Point.cs');
    expect(result.structs).toBeDefined();
    expect(result.structs.length).toBeGreaterThanOrEqual(1);
    const s = result.structs[0];
    expect(s.name).toBe('Point');
    expect(s.fields.length).toBe(2);
  });

  it('should parse a record', () => {
    const code = `public record UserDto(string Name, int Age);`;
    const result = parser.parse(code, 'UserDto.cs');
    // Records are stored in classes array
    const record = result.classes.find((c: any) => c.name === 'UserDto');
    expect(record).toBeDefined();
    expect(record.properties.length).toBe(2);
    expect(record.properties[0].name).toBe('Name');
    expect(record.properties[1].name).toBe('Age');
  });

  it('should parse file-scoped namespace', () => {
    const code = `namespace MyApp.Services;`;
    const result = parser.parse(code, 'Test.cs');
    expect(result.packages).toBeDefined();
    expect(result.packages.length).toBeGreaterThanOrEqual(1);
    expect(result.packages[0].name).toBe('MyApp.Services');
  });

  it('should parse using statements', () => {
    const code = `using System.Linq;`;
    const result = parser.parse(code, 'Test.cs');
    expect(result.imports.length).toBeGreaterThanOrEqual(1);
    expect(result.imports[0].from).toBe('System.Linq');
    expect(result.imports[0].names).toContain('Linq');
  });

  it('should parse methods with attributes', () => {
    const code = `public class MyController {
  [HttpGet]
  public IActionResult Index() {
    return View();
  }
}`;
    const result = parser.parse(code, 'MyController.cs');
    const cls = result.classes.find((c: any) => c.name === 'MyController');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'Index');
    expect(method).toBeDefined();
    expect(method.decorators).toContain('HttpGet');
    expect(method.returnType).toBe('IActionResult');
  });

  it('should set language to "csharp"', () => {
    const result = parser.parse('', 'Test.cs');
    expect(result.language).toBe('csharp');
  });

  it('should parse record struct', () => {
    const code = `public record struct Point(int X, int Y);`;
    const result = parser.parse(code, 'Point.cs');
    expect(result.structs).toBeDefined();
    expect(result.structs.length).toBeGreaterThanOrEqual(1);
    const point = result.structs.find((s: any) => s.name === 'Point');
    expect(point).toBeDefined();
    expect(point.fields.length).toBe(2);
    expect(point.fields[0].name).toBe('X');
    expect(point.fields[1].name).toBe('Y');
  });

  it('should parse block-scoped namespace', () => {
    const code = `namespace MyApp.Services {
  public class Service {
  }
}`;
    const result = parser.parse(code, 'Test.cs');
    expect(result.packages).toBeDefined();
    expect(result.packages.length).toBeGreaterThanOrEqual(1);
    expect(result.packages[0].name).toBe('MyApp.Services');
    expect(result.classes.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse auto-properties with get/set', () => {
    const code = `public class User {
  public string Name { get; set; }
  public int Age { get; init; }
  public string Id { get; }
}`;
    const result = parser.parse(code, 'User.cs');
    const cls = result.classes.find((c: any) => c.name === 'User');
    expect(cls).toBeDefined();
    const props = cls.properties;
    expect(props.length).toBe(3);

    const name = props.find((p: any) => p.name === 'Name');
    expect(name).toBeDefined();
    expect(name.readonly).toBe(false);

    const age = props.find((p: any) => p.name === 'Age');
    expect(age).toBeDefined();
    expect(age.readonly).toBe(false); // has init

    const id = props.find((p: any) => p.name === 'Id');
    expect(id).toBeDefined();
    expect(id.readonly).toBe(true); // get only
  });

  it('should parse class with attributes on class level', () => {
    const code = `[Serializable]
public class MyEntity {
}`;
    const result = parser.parse(code, 'MyEntity.cs');
    const cls = result.classes.find((c: any) => c.name === 'MyEntity');
    expect(cls).toBeDefined();
    expect(cls.decorators).toBeDefined();
    expect(cls.decorators).toContain('Serializable');
  });

  it('should parse async methods', () => {
    const code = `public class Service {
  public async Task<string> GetDataAsync(int id) {
    return await Task.FromResult("");
  }
}`;
    const result = parser.parse(code, 'Service.cs');
    const cls = result.classes.find((c: any) => c.name === 'Service');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'GetDataAsync');
    expect(method).toBeDefined();
    expect(method.async).toBe(true);
  });

  it('should parse abstract class with abstract methods', () => {
    const code = `public abstract class BaseService {
  public abstract Task Process();
  public void Run() {
  }
}`;
    const result = parser.parse(code, 'BaseService.cs');
    const cls = result.classes.find((c: any) => c.name === 'BaseService');
    expect(cls).toBeDefined();
    expect(cls.abstract).toBe(true);
    expect(cls.methods.length).toBe(2);
  });

  it('should parse static methods', () => {
    const code = `public class MathHelper {
  public static int Add(int a, int b) {
    return a + b;
  }
}`;
    const result = parser.parse(code, 'MathHelper.cs');
    const cls = result.classes.find((c: any) => c.name === 'MathHelper');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'Add');
    expect(method).toBeDefined();
    expect(method.static).toBe(true);
    expect(method.params.length).toBe(2);
  });

  it('should parse sealed class', () => {
    const code = `public sealed class Singleton {
  public void DoWork() {
  }
}`;
    const result = parser.parse(code, 'Singleton.cs');
    const cls = result.classes.find((c: any) => c.name === 'Singleton');
    expect(cls).toBeDefined();
    expect(cls.exported).toBe(true);
  });

  it('should parse constructor', () => {
    const code = `public class Config {
  private readonly string _name;
  Config(string name) {
    _name = name;
  }
}`;
    const result = parser.parse(code, 'Config.cs');
    const cls = result.classes.find((c: any) => c.name === 'Config');
    expect(cls).toBeDefined();
    const ctor = cls.methods.find((m: any) => m.name === 'Config');
    expect(ctor).toBeDefined();
    expect(ctor.returnType).toBe('');
    expect(ctor.params.length).toBe(1);
  });

  it('should parse fields with readonly and const', () => {
    const code = `public class Constants {
  private readonly int MaxSize = 100;
  public const string Version = "1.0";
}`;
    const result = parser.parse(code, 'Constants.cs');
    const cls = result.classes.find((c: any) => c.name === 'Constants');
    expect(cls).toBeDefined();
    const fields = cls.properties.filter((p: any) => p.name === 'MaxSize' || p.name === 'Version');
    expect(fields.length).toBe(2);
    fields.forEach((f: any) => {
      expect(f.readonly).toBe(true);
    });
  });

  it('should parse expression-bodied property', () => {
    const code = `public class Circle {
  public double Radius { get; set; }
  public double Area => Math.PI;
}`;
    const result = parser.parse(code, 'Circle.cs');
    const cls = result.classes.find((c: any) => c.name === 'Circle');
    expect(cls).toBeDefined();
    // Area is detected by both field parser and auto-property parser
    const areaProps = cls.properties.filter((p: any) => p.name === 'Area');
    expect(areaProps.length).toBeGreaterThanOrEqual(1);
    expect(areaProps[0].type).toBe('double');
  });

  it('should parse expression-bodied method', () => {
    const code = `public class Calc {
  public int Double(int x) => x * 2;
}`;
    const result = parser.parse(code, 'Calc.cs');
    const cls = result.classes.find((c: any) => c.name === 'Calc');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'Double');
    expect(method).toBeDefined();
    expect(method.returnType).toBe('int');
  });

  it('should parse interface with properties', () => {
    const code = `public interface IConfig {
  string Name { get; set; }
  int ReadOnly { get; }
}`;
    const result = parser.parse(code, 'IConfig.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IConfig');
    expect(iface).toBeDefined();
    expect(iface.properties.length).toBe(2);
    const readOnly = iface.properties.find((p: any) => p.name === 'ReadOnly');
    expect(readOnly).toBeDefined();
    expect(readOnly.readonly).toBe(true);
  });

  it('should parse struct with interface implementations', () => {
    const code = `public struct Vector : IEquatable<Vector> {
  public float X;
  public float Y;
  public bool Equals(Vector other) {
    return true;
  }
}`;
    const result = parser.parse(code, 'Vector.cs');
    expect(result.structs).toBeDefined();
    const vec = result.structs.find((s: any) => s.name === 'Vector');
    expect(vec).toBeDefined();
    expect(vec.embeds).toBeDefined();
    expect(vec.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse record with base class', () => {
    const code = `public record Employee(string Name, int Age) : Person;`;
    const result = parser.parse(code, 'Employee.cs');
    const cls = result.classes.find((c: any) => c.name === 'Employee');
    expect(cls).toBeDefined();
    expect(cls.extends).toBe('Person');
  });

  it('should parse using static', () => {
    const code = `using static System.Math;`;
    const result = parser.parse(code, 'Test.cs');
    expect(result.imports.length).toBeGreaterThanOrEqual(1);
    expect(result.imports[0].names).toContain('Math');
  });

  it('should parse class with multiple interfaces (no base class)', () => {
    const code = `public class Handler : IHandler, IDisposable {
  public void Handle() {
  }
  public void Dispose() {
  }
}`;
    const result = parser.parse(code, 'Handler.cs');
    const cls = result.classes.find((c: any) => c.name === 'Handler');
    expect(cls).toBeDefined();
    // Both start with I, so both are interfaces
    expect(cls.implements).toBeDefined();
    expect(cls.implements.length).toBe(2);
  });

  it('should parse default interface method', () => {
    const code = `public interface IGreeter {
  void Greet(string name) {
    Console.WriteLine(name);
  }
}`;
    const result = parser.parse(code, 'IGreeter.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IGreeter');
    expect(iface).toBeDefined();
    expect(iface.methods.length).toBe(1);
    expect(iface.methods[0].name).toBe('Greet');
    expect(iface.methods[0].loc).toBeGreaterThan(1);
  });

  it('should parse attributes on methods', () => {
    const code = `public class Controller {
  [HttpPost]
  [Authorize]
  public IActionResult Create(string data) {
    return Ok();
  }
}`;
    const result = parser.parse(code, 'Controller.cs');
    const cls = result.classes.find((c: any) => c.name === 'Controller');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'Create');
    expect(method).toBeDefined();
    expect(method.decorators).toContain('HttpPost');
    expect(method.decorators).toContain('Authorize');
  });

  it('should parse params with modifiers (ref, out, in)', () => {
    const code = `public class Util {
  public void Swap(ref int a, ref int b) {
  }
  public bool TryParse(string input, out int result) {
  }
}`;
    const result = parser.parse(code, 'Util.cs');
    const cls = result.classes.find((c: any) => c.name === 'Util');
    expect(cls).toBeDefined();
    const swap = cls.methods.find((m: any) => m.name === 'Swap');
    expect(swap).toBeDefined();
    expect(swap.params.length).toBe(2);
    const tryParse = cls.methods.find((m: any) => m.name === 'TryParse');
    expect(tryParse).toBeDefined();
    expect(tryParse.params.length).toBe(2);
  });

  it('should handle method with very long multi-line signature (fallback)', () => {
    const lines = ['public class BigService {'];
    lines.push('  public void Process(');
    for (let i = 0; i < 12; i++) {
      lines.push(`    string p${i},`);
    }
    lines.push('    string last) {');
    lines.push('  }');
    lines.push('}');
    const code = lines.join('\n');
    const result = parser.parse(code, 'BigService.cs');
    const cls = result.classes.find((c: any) => c.name === 'BigService');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse static class', () => {
    const code = `public static class Extensions {
  public static string Trim(string input) {
    return input;
  }
}`;
    const result = parser.parse(code, 'Extensions.cs');
    const cls = result.classes.find((c: any) => c.name === 'Extensions');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBe(1);
    expect(cls.methods[0].static).toBe(true);
  });

  it('should parse internal visibility', () => {
    const code = `internal class InternalService {
  internal void DoWork() {
  }
}`;
    const result = parser.parse(code, 'InternalService.cs');
    const cls = result.classes.find((c: any) => c.name === 'InternalService');
    expect(cls).toBeDefined();
    // internal is not 'public', so exported = false
    expect(cls.exported).toBe(false);
  });

  it('should handle interface with non-method line (attribute reset)', () => {
    const code = `public interface IProcessor {
  void Process(string data);
  string Default { get; }
  void Run();
}`;
    const result = parser.parse(code, 'IProcessor.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IProcessor');
    expect(iface).toBeDefined();
    // Method Process should be detected, Default is a property
    expect(iface.methods.length).toBeGreaterThanOrEqual(1);
    // Properties in interface
    expect(iface.properties.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle class with non-method/non-property lines (attribute reset)', () => {
    const code = `public class Worker {
  public void DoWork() {
  }
  int x = 5;
  public void Finish() {
  }
}`;
    const result = parser.parse(code, 'Worker.cs');
    const cls = result.classes.find((c: any) => c.name === 'Worker');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBe(2);
  });

  it('should handle record with body containing methods', () => {
    const code = `public record Person(string Name, int Age) {
  public string Greeting() {
    return Name;
  }
}`;
    const result = parser.parse(code, 'Person.cs');
    const record = result.classes.find((c: any) => c.name === 'Person');
    expect(record).toBeDefined();
    expect(record.properties.length).toBe(2);
    expect(record.methods.length).toBe(1);
  });

  it('should handle partial class', () => {
    const code = `public partial class Service {
  public void Run() {
  }
}`;
    const result = parser.parse(code, 'Service.cs');
    const cls = result.classes.find((c: any) => c.name === 'Service');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBe(1);
  });

  it('should handle interface with non-matching line that resets attributes', () => {
    const code = `public interface IService {
  void Run(string input);
  const int MAX = 100;
  void Stop();
}`;
    const result = parser.parse(code, 'IService.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IService');
    expect(iface).toBeDefined();
    // Methods should be detected
    expect(iface.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should skip interface method whose captured name is a control keyword', () => {
    // The regex might match a line like "void return(...);" where name = "return"
    const code = `public interface IBad {
  void return(string x);
  void Valid(int y);
}`;
    const result = parser.parse(code, 'IBad.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IBad');
    expect(iface).toBeDefined();
    // "return" should be skipped by CONTROL_KEYWORDS guard
    const returnMethod = iface.methods.find((m: any) => m.name === 'return');
    expect(returnMethod).toBeUndefined();
    // Valid should still be detected
    const validMethod = iface.methods.find((m: any) => m.name === 'Valid');
    expect(validMethod).toBeDefined();
  });

  it('should handle collectCsharpSignature brace fallback with unclosed parens', () => {
    // Malformed signature where { appears before closing paren
    const code = `public class Broken {
  public void Process(
      string data
  {
    return;
  }
}`;
    const result = parser.parse(code, 'Broken.cs');
    const cls = result.classes.find((c: any) => c.name === 'Broken');
    expect(cls).toBeDefined();
    // Method should still be detected even with malformed signature
    expect(cls.methods.length).toBeGreaterThanOrEqual(1);
  });

  it('should parse expression-bodied method with lambda return (triggers expr method inside property-skip)', () => {
    // This method returns a lambda: the line matches both \w+\s*=> and the exprMethodMatch regex
    const code = `public class Builder {
  public Func<int> Get(int n) => x => x + n;
}`;
    const result = parser.parse(code, 'Builder.cs');
    const cls = result.classes.find((c: any) => c.name === 'Builder');
    expect(cls).toBeDefined();
    const method = cls.methods.find((m: any) => m.name === 'Get');
    expect(method).toBeDefined();
    expect(method.returnType).toContain('Func');
  });

  it('should skip class method whose captured name is a control keyword', () => {
    // Tests the CONTROL_KEYWORDS guard in extractClassMethods
    const code = `public class BadClass {
  public void return(string x) {
  }
  public void Valid(int y) {
  }
}`;
    const result = parser.parse(code, 'BadClass.cs');
    const cls = result.classes.find((c: any) => c.name === 'BadClass');
    expect(cls).toBeDefined();
    // "return" should be skipped
    const returnMethod = cls.methods.find((m: any) => m.name === 'return');
    expect(returnMethod).toBeUndefined();
    // Valid should still be detected
    const validMethod = cls.methods.find((m: any) => m.name === 'Valid');
    expect(validMethod).toBeDefined();
  });

  it('should parse interface with extends clause', () => {
    const code = `public interface IReadWriter : IReader, IWriter {
  void ReadWrite();
}`;
    const result = parser.parse(code, 'IReadWriter.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IReadWriter');
    expect(iface).toBeDefined();
    expect(iface.extends).toBeDefined();
    expect(iface.extends).toContain('IReader');
    expect(iface.extends).toContain('IWriter');
  });

  it('should skip auto-property whose captured type is a control keyword', () => {
    // When method bodies contain lines that match the property regex
    // but with a control keyword as the type, they should be skipped
    const code = `public class WithLock {
  public void Method() {
    lock this { get; }
  }
  public string Name { get; set; }
}`;
    const result = parser.parse(code, 'WithLock.cs');
    const cls = result.classes.find((c: any) => c.name === 'WithLock');
    expect(cls).toBeDefined();
    // "lock" / "this" should not appear as properties
    const lockProp = cls.properties.find((p: any) => p.name === 'this' || p.name === 'lock');
    expect(lockProp).toBeUndefined();
    // But Name should be detected
    const nameProp = cls.properties.find((p: any) => p.name === 'Name');
    expect(nameProp).toBeDefined();
  });

  it('should handle method with multi-line params where brace is on separate line', () => {
    const code = `public class Service {
  public void Process(
      string data)
  {
    return;
  }
}`;
    const result = parser.parse(code, 'Service.cs');
    const cls = result.classes.find((c: any) => c.name === 'Service');
    expect(cls).toBeDefined();
    expect(cls.methods.length).toBe(1);
    expect(cls.methods[0].name).toBe('Process');
  });

  it('should handle interface with attributes that get reset on non-method', () => {
    const code = `public interface IRepo {
  [Obsolete]
  void OldMethod();
  int SomeProp { get; }
  void NewMethod();
}`;
    const result = parser.parse(code, 'IRepo.cs');
    const iface = result.interfaces.find((i: any) => i.name === 'IRepo');
    expect(iface).toBeDefined();
    const oldMethod = iface.methods.find((m: any) => m.name === 'OldMethod');
    expect(oldMethod).toBeDefined();
    expect(oldMethod.decorators).toContain('Obsolete');
    // NewMethod should NOT have Obsolete
    const newMethod = iface.methods.find((m: any) => m.name === 'NewMethod');
    expect(newMethod).toBeDefined();
    expect(newMethod.decorators).toBeUndefined();
  });
});
