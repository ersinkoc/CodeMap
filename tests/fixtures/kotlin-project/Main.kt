package com.example.app

import java.util.UUID
import kotlinx.coroutines.Dispatchers
import com.example.utils.Logger as AppLogger

// Top-level constant
const val MAX_RETRIES = 3
val DEFAULT_TIMEOUT = 30_000L
private var debugMode = false

// Typealias
typealias StringMap = Map<String, String>
internal typealias Handler = (String) -> Unit

// Annotation
@Target(AnnotationTarget.CLASS)
annotation class Serializable

// Interface
interface Repository<T> {
    fun findById(id: String): T?
    fun save(entity: T): Boolean
    val name: String
}

// Sealed interface
sealed interface Result {
    data class Success(val data: String) : Result
    data class Error(val message: String) : Result
}

// Data class
data class User(val id: UUID, val name: String, val email: String)

// Abstract class
abstract class BaseService(private val logger: AppLogger) {
    abstract fun initialize()
    open fun shutdown() {
        logger.info("Shutting down")
    }
}

// Regular class with inheritance
class UserService(
    private val repository: Repository<User>,
    logger: AppLogger
) : BaseService(logger), Repository<User> {
    override fun initialize() {
        // init logic
    }

    override fun findById(id: String): User? {
        return null
    }

    override fun save(entity: User): Boolean {
        return true
    }

    override val name: String = "UserService"

    suspend fun fetchUser(id: String): User? {
        return findById(id)
    }
}

// Object declaration
object AppConfig {
    val version = "1.0.0"
    fun getEnv(): String = "production"
}

// Enum class
enum class Status {
    ACTIVE,
    INACTIVE,
    PENDING
}

// Extension function
fun String.toSlug(): String {
    return this.lowercase().replace(" ", "-")
}

// Inline function with generics
inline fun <T> measure(block: () -> T): T {
    val start = System.nanoTime()
    return block()
}

// Suspend function
suspend fun loadData(url: String): String {
    return ""
}
