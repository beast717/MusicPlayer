import ExpoModulesCore

public class StreamProxyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StreamProxy")

    // Starts the proxy if needed and returns its port on 127.0.0.1
    AsyncFunction("start") { () async throws -> Int in
      return try await StreamProxyServer.shared.start()
    }
  }
}
