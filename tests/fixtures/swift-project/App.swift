import Foundation
import UIKit
import MyLocalModule

// Top-level constants
public let APP_VERSION = "2.0.0"
private var isDebug = false

// Typealias
public typealias CompletionHandler = (Result<Data, Error>) -> Void
typealias JSON = [String: Any]

// Protocol
public protocol Repository {
    var name: String { get }
    func findById(id: String) -> Any?
    func save(entity: Any) -> Bool
    mutating func reset()
}

// Protocol with inheritance
protocol CacheableRepository: Repository, Codable {
    var cacheKey: String { get set }
    func invalidateCache()
}

// Struct with protocol conformance
public struct UserDTO: Codable, Equatable {
    let id: UUID
    let name: String
    var email: String
    static let defaultUser = UserDTO(id: UUID(), name: "Unknown", email: "")
}

// Class with inheritance
open class BaseService {
    private let logger: String
    public var isRunning: Bool = false

    public init(logger: String) {
        self.logger = logger
    }

    deinit {
        print("Service deallocated")
    }

    open func start() {
        isRunning = true
    }
}

// Final class
public final class UserService: BaseService, Repository {
    private var users: [String: Any] = [:]

    public override func start() {
        super.start()
    }

    public func findById(id: String) -> Any? {
        return users[id]
    }

    public func save(entity: Any) -> Bool {
        return true
    }

    public var name: String { return "UserService" }

    public func mutating reset() {
        users = [:]
    }
}

// Enum with raw type
enum Status: String, Codable {
    case active
    case inactive
    case pending
}

// Indirect enum
indirect enum TreeNode<T> {
    case leaf(T)
    case node(TreeNode, TreeNode)
}

// Extension
extension String {
    func toSlug() -> String {
        return self.lowercased().replacingOccurrences(of: " ", with: "-")
    }

    static func random(length: Int) -> String {
        return ""
    }
}

// Top-level function
public func greet(name: String, greeting: String = "Hello") -> String {
    return "\(greeting), \(name)!"
}

// Static function
func processItems(_ items: [String]) {
    for item in items {
        print(item)
    }
}

// @attribute decorator
@available(iOS 15.0, *)
@MainActor
class ModernView {
    func render() -> String {
        return "<view />"
    }
}
