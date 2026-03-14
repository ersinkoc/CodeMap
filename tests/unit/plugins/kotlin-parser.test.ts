import { describe, it, expect } from 'vitest';
import { createKotlinParserPlugin } from '../../../src/plugins/optional/kotlin-parser.js';
import type { LanguageParser, CodemapKernel } from '../../../src/types.js';

function getParser(): LanguageParser {
  let captured: LanguageParser | undefined;
  const kernel = {
    registerParser(parser: LanguageParser) {
      captured = parser;
    },
  } as unknown as CodemapKernel;

  const plugin = createKotlinParserPlugin();
  plugin.install(kernel);

  if (!captured) throw new Error('Parser was not registered');
  return captured;
}

describe('Kotlin parser', () => {
  const parser = getParser();

  it('should set language to kotlin', () => {
    const result = parser.parse('package com.example', 'Main.kt');
    expect(result.language).toBe('kotlin');
  });

  it('should support .kt and .kts extensions', () => {
    expect(parser.extensions).toContain('.kt');
    expect(parser.extensions).toContain('.kts');
  });

  it('should have correct parser name', () => {
    expect(parser.name).toBe('kotlin');
  });

  it('should extract package declaration', () => {
    const code = `package com.example.app`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.packages).toBeDefined();
    expect(result.packages).toHaveLength(1);
    expect(result.packages![0]!.name).toBe('com.example.app');
  });

  it('should extract single import', () => {
    const code = `package com.example
import java.util.UUID`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.from).toBe('java.util.UUID');
    expect(result.imports[0]!.names).toContain('UUID');
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should extract aliased import', () => {
    const code = `import com.example.utils.Logger as AppLogger`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.names).toContain('AppLogger');
    expect(result.imports[0]!.from).toBe('com.example.utils.Logger');
  });

  it('should distinguish external vs internal imports', () => {
    const code = `import java.util.UUID
import myproject.utils.Helper`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.imports).toHaveLength(2);
    const javaImport = result.imports.find((i) => i.from.includes('java'));
    const internalImport = result.imports.find((i) => i.from.includes('myproject'));
    expect(javaImport!.kind).toBe('external');
    expect(internalImport!.kind).toBe('internal');
  });

  it('should extract kotlinx import as external', () => {
    const code = `import kotlinx.coroutines.Dispatchers`;
    const result = parser.parse(code, 'Main.kt');
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should extract top-level function', () => {
    const code = `fun greet(name: String): String {
    return "Hello, $name"
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('greet');
    expect(result.functions[0]!.params).toHaveLength(1);
    expect(result.functions[0]!.params[0]!.name).toBe('name');
    expect(result.functions[0]!.params[0]!.type).toBe('String');
    expect(result.functions[0]!.returnType).toBe('String');
    expect(result.functions[0]!.exported).toBe(true);
  });

  it('should extract private function', () => {
    const code = `private fun helper(): Unit {
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.exported).toBe(false);
    expect(result.functions[0]!.scope).toBe('private');
  });

  it('should extract suspend function', () => {
    const code = `suspend fun loadData(url: String): String {
    return ""
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('loadData');
    expect(result.functions[0]!.async).toBe(true);
  });

  it('should extract inline function', () => {
    const code = `inline fun <T> measure(block: () -> T): T {
    return block()
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('measure');
  });

  it('should extract extension function with receiver type', () => {
    const code = `fun String.toSlug(): String {
    return this.lowercase()
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('String.toSlug');
    expect(result.functions[0]!.returnType).toBe('String');
  });

  it('should extract data class', () => {
    const code = `data class User(val id: String, val name: String)`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('User');
    expect(result.classes[0]!.exported).toBe(true);
  });

  it('should extract sealed class as abstract', () => {
    const code = `sealed class Result {
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Result');
    expect(result.classes[0]!.abstract).toBe(true);
  });

  it('should extract abstract class', () => {
    const code = `abstract class BaseService {
    abstract fun initialize()
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('BaseService');
    expect(result.classes[0]!.abstract).toBe(true);
    expect(result.classes[0]!.methods).toHaveLength(1);
  });

  it('should extract class with inheritance and implements', () => {
    const code = `class UserService : BaseService(), Repository<User> {
    override fun initialize() {
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0]!;
    expect(cls.name).toBe('UserService');
    expect(cls.extends).toBe('BaseService');
    expect(cls.implements).toBeDefined();
    expect(cls.implements).toContain('Repository');
  });

  it('should extract open class', () => {
    const code = `open class Plugin {
    open fun run() {
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Plugin');
  });

  it('should extract class methods including override and suspend', () => {
    const code = `class Service {
    override fun start() {
    }
    suspend fun fetch(): String {
        return ""
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes[0]!.methods).toHaveLength(2);
    const fetchMethod = result.classes[0]!.methods.find((m) => m.name === 'fetch');
    expect(fetchMethod).toBeDefined();
    expect(fetchMethod!.async).toBe(true);
  });

  it('should extract class properties', () => {
    const code = `class Config {
    val name: String = "default"
    var count: Int = 0
    private val secret: String = "xxx"
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes[0]!.properties).toHaveLength(3);
    const nameProp = result.classes[0]!.properties.find((p) => p.name === 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp!.readonly).toBe(true);
    expect(nameProp!.type).toBe('String');

    const countProp = result.classes[0]!.properties.find((p) => p.name === 'count');
    expect(countProp!.readonly).toBe(false);

    const secretProp = result.classes[0]!.properties.find((p) => p.name === 'secret');
    expect(secretProp!.scope).toBe('private');
  });

  it('should extract interface', () => {
    const code = `interface Repository {
    fun findById(id: String): Any?
    fun save(entity: Any): Boolean
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.name).toBe('Repository');
    expect(result.interfaces[0]!.methods).toBeDefined();
    expect(result.interfaces[0]!.methods).toHaveLength(2);
  });

  it('should extract sealed interface', () => {
    const code = `sealed interface Result {
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.name).toBe('Result');
  });

  it('should extract interface with generics', () => {
    const code = `interface Repository<T> {
    fun findById(id: String): T?
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.generics).toBeDefined();
    expect(result.interfaces[0]!.generics).toContain('T');
  });

  it('should extract interface with extends', () => {
    const code = `interface CacheRepository : Repository, Closeable {
    fun invalidate()
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.extends).toBeDefined();
    expect(result.interfaces[0]!.extends).toContain('Repository');
    expect(result.interfaces[0]!.extends).toContain('Closeable');
  });

  it('should extract interface properties', () => {
    const code = `interface Named {
    val name: String
    var label: String
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.properties).toHaveLength(2);
    const nameProp = result.interfaces[0]!.properties.find((p) => p.name === 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp!.readonly).toBe(true);
  });

  it('should extract object declaration', () => {
    const code = `object AppConfig {
    val version = "1.0.0"
    fun getEnv(): String {
        return "prod"
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('AppConfig');
    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.properties).toHaveLength(1);
  });

  it('should extract companion object', () => {
    const code = `companion object Factory {
    fun create(): User {
        return User()
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Factory');
    expect(result.classes[0]!.abstract).toBe(true); // companion marked as abstract
  });

  it('should extract companion object without name', () => {
    const code = `companion object {
    fun create(): User {
        return User()
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Companion');
  });

  it('should extract enum class', () => {
    const code = `enum class Status {
    ACTIVE,
    INACTIVE
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Status');
  });

  it('should extract top-level const val', () => {
    const code = `const val MAX_RETRIES = 3`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.name).toBe('MAX_RETRIES');
    expect(result.constants[0]!.exported).toBe(true);
  });

  it('should extract top-level val and var', () => {
    const code = `val DEFAULT_TIMEOUT = 30_000L
private var debugMode = false`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.constants).toHaveLength(2);
    expect(result.constants[0]!.name).toBe('DEFAULT_TIMEOUT');
    expect(result.constants[0]!.exported).toBe(true);
    expect(result.constants[1]!.name).toBe('debugMode');
    expect(result.constants[1]!.exported).toBe(false);
  });

  it('should extract typealias', () => {
    const code = `typealias StringMap = Map<String, String>`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.name).toBe('StringMap');
    expect(result.types[0]!.type).toContain('Map');
    expect(result.types[0]!.exported).toBe(true);
  });

  it('should extract internal typealias', () => {
    const code = `internal typealias Handler = (String) -> Unit`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.name).toBe('Handler');
    expect(result.types[0]!.exported).toBe(true); // internal is still exported
  });

  it('should extract private typealias as non-exported', () => {
    const code = `private typealias InternalHandler = () -> Unit`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.types).toHaveLength(1);
    expect(result.types[0]!.exported).toBe(false);
  });

  it('should extract annotations (decorators)', () => {
    const code = `@Serializable
@Target(AnnotationTarget.CLASS)
data class Config(val name: String)`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.decorators).toBeDefined();
    expect(result.classes[0]!.decorators).toContain('Serializable');
    expect(result.classes[0]!.decorators).toContain('Target');
  });

  it('should extract function parameters with defaults', () => {
    const code = `fun greet(name: String, greeting: String = "Hello"): String {
    return "$greeting, $name"
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions[0]!.params).toHaveLength(2);
    expect(result.functions[0]!.params[1]!.defaultValue).toBe('default');
  });

  it('should handle empty input', () => {
    const result = parser.parse('', 'Main.kt');

    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.interfaces).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
    expect(result.constants).toHaveLength(0);
    expect(result.types).toHaveLength(0);
  });

  it('should handle comments correctly', () => {
    const code = `// This is a comment
/* fun fakeFunction() {} */
fun realFunction(): Unit {
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('realFunction');
  });

  it('should extract function with Unit return type when no return specified', () => {
    const code = `fun doStuff() {
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.returnType).toBe('Unit');
  });

  it('should extract function loc', () => {
    const code = `fun multiLine(a: Int, b: Int): Int {
    val sum = a + b
    return sum
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.loc).toBe(4);
  });

  it('should extract expression-body function', () => {
    const code = `fun add(a: Int, b: Int): Int = a + b`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('add');
    expect(result.functions[0]!.returnType).toBe('Int');
  });

  it('should extract object with interface implementation', () => {
    const code = `object Singleton : Runnable {
    override fun run() {
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Singleton');
    expect(result.classes[0]!.implements).toBeDefined();
    expect(result.classes[0]!.implements).toContain('Runnable');
  });

  it('should extract internal visibility', () => {
    const code = `internal fun internalFun(): Unit {
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.exported).toBe(true); // internal is still exported
  });

  it('should extract protected visibility', () => {
    const code = `class Foo {
    protected fun bar(): Unit {
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.scope).toBe('protected');
  });

  it('should set path in result', () => {
    const result = parser.parse('package test', 'src/main/kotlin/App.kt');
    expect(result.path).toBe('src/main/kotlin/App.kt');
  });

  it('should compute loc and estimatedTokens', () => {
    const code = `package com.example

fun hello(): String {
    return "world"
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.loc).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('should handle interface without body', () => {
    const code = `interface Marker`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0]!.name).toBe('Marker');
    expect(result.interfaces[0]!.methods).toHaveLength(0);
  });

  it('should handle class without body', () => {
    const code = `data class Empty(val id: String)`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.name).toBe('Empty');
  });

  it('should handle method annotations in class body', () => {
    const code = `class Service {
    @Deprecated
    fun oldMethod(): Unit {
    }
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes[0]!.methods).toHaveLength(1);
    expect(result.classes[0]!.methods[0]!.decorators).toBeDefined();
    expect(result.classes[0]!.methods[0]!.decorators).toContain('Deprecated');
  });

  it('should extract enum class with interface implementation', () => {
    const code = `enum class Direction : Serializable {
    NORTH,
    SOUTH
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]!.implements).toBeDefined();
    expect(result.classes[0]!.implements).toContain('Serializable');
  });

  it('should handle top-level val with explicit type', () => {
    const code = `val timeout: Long = 5000L`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0]!.type).toBe('Long');
  });

  it('should handle android and io imports as external', () => {
    const code = `import android.os.Bundle
import io.ktor.client.HttpClient`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.imports).toHaveLength(2);
    expect(result.imports[0]!.kind).toBe('external');
    expect(result.imports[1]!.kind).toBe('external');
  });

  it('should handle net imports as external', () => {
    const code = `import net.example.Foo`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]!.kind).toBe('external');
  });

  it('should extract interface method annotations', () => {
    const code = `interface Api {
    @GET
    fun getUsers(): List
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.interfaces[0]!.methods).toHaveLength(1);
    expect(result.interfaces[0]!.methods![0]!.decorators).toBeDefined();
    expect(result.interfaces[0]!.methods![0]!.decorators).toContain('GET');
  });

  it('should handle function without body (expression body, no block)', () => {
    const code = `fun getId() = UUID.randomUUID()`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('getId');
    expect(result.functions[0]!.loc).toBe(1);
  });

  it('should handle abstract property in class body', () => {
    const code = `abstract class Base {
    abstract val id: String
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.classes[0]!.properties).toHaveLength(1);
    expect(result.classes[0]!.properties[0]!.name).toBe('id');
  });

  it('plugin should have correct name and version', () => {
    const plugin = createKotlinParserPlugin();
    expect(plugin.name).toBe('kotlin-parser');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should handle extension function with generic receiver', () => {
    const code = `fun List<String>.joinToSentence(): String {
    return this.joinToString(", ")
}`;
    const result = parser.parse(code, 'Main.kt');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('List<String>.joinToSentence');
  });

  it('should handle unrecognized lines and reset annotations', () => {
    const code = `@MyAnnotation
some random line that does not match
fun afterReset(): Unit {
}`;
    const result = parser.parse(code, 'Main.kt');

    // The annotation should NOT be attached to the function since it was reset
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]!.name).toBe('afterReset');
    expect(result.functions[0]!.decorators).toBeUndefined();
  });
});
