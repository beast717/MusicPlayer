import Foundation
import Network

/// Local HTTP server the player streams from:
///
///   http://127.0.0.1:<port>/stream.m4a?len=<bytes>&type=<mime>&u=<upstream url>
///
/// AVPlayer asks for large byte ranges (often the whole file), but YouTube
/// throttles any single request over ~10 MB to a crawl. Each player request is
/// answered by fetching the upstream file in pieces that stay under that limit,
/// starting small so playback can begin quickly.
final class StreamProxyServer: @unchecked Sendable {
  static let shared = StreamProxyServer()

  private static let firstPieceSize: Int64 = 256 * 1024
  private static let maxPieceSize: Int64 = 8 * 1024 * 1024

  // Listener state is only touched on this queue
  private let queue = DispatchQueue(label: "musicplayer.streamproxy")
  private var listener: NWListener?
  private var port: Int?
  private var pendingStarts: [CheckedContinuation<Int, Error>] = []

  private let session: URLSession = {
    let config = URLSessionConfiguration.default
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.urlCache = nil
    config.timeoutIntervalForRequest = 30
    return URLSession(configuration: config)
  }()

  enum ProxyError: Error {
    case listenerStopped
    case upstream(status: Int)
    case shortRead
  }

  // MARK: - Listener

  func start() async throws -> Int {
    try await withCheckedThrowingContinuation { continuation in
      queue.async {
        if let port = self.port {
          continuation.resume(returning: port)
          return
        }
        self.pendingStarts.append(continuation)
        if self.listener == nil {
          self.startListener()
        }
      }
    }
  }

  private func startListener() {
    do {
      let parameters = NWParameters.tcp
      // Only reachable from this device
      parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: .any)
      let listener = try NWListener(using: parameters)
      listener.stateUpdateHandler = { [weak self, weak listener] state in
        guard let self, let listener, listener === self.listener else { return }
        self.handleListenerState(state, of: listener)
      }
      listener.newConnectionHandler = { [weak self] connection in
        self?.accept(connection)
      }
      self.listener = listener
      listener.start(queue: queue)
    } catch {
      finishStarts(.failure(error))
    }
  }

  private func handleListenerState(_ state: NWListener.State, of listener: NWListener) {
    switch state {
    case .ready:
      if let port = listener.port?.rawValue {
        self.port = Int(port)
        finishStarts(.success(Int(port)))
      } else {
        stopListener()
        finishStarts(.failure(ProxyError.listenerStopped))
      }
    case .failed(let error):
      // e.g. the app was suspended; the next start() creates a new listener
      stopListener()
      finishStarts(.failure(error))
    case .cancelled:
      stopListener()
      finishStarts(.failure(ProxyError.listenerStopped))
    default:
      break
    }
  }

  private func stopListener() {
    let old = listener
    listener = nil
    port = nil
    old?.cancel()
  }

  private func finishStarts(_ result: Result<Int, Error>) {
    let waiting = pendingStarts
    pendingStarts = []
    for continuation in waiting {
      continuation.resume(with: result)
    }
  }

  // MARK: - Connections

  private func accept(_ connection: NWConnection) {
    connection.start(queue: queue)
    receiveHead(of: connection, buffer: Data())
  }

  private func receiveHead(of connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, isComplete, error in
      guard let self else {
        connection.cancel()
        return
      }
      var buffer = buffer
      if let data {
        buffer.append(data)
      }
      if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
        let head = String(decoding: buffer[buffer.startIndex..<end.lowerBound], as: UTF8.self)
        Task {
          await self.respond(to: head, on: connection)
        }
      } else if error != nil || isComplete || buffer.count > 64 * 1024 {
        connection.cancel()
      } else {
        self.receiveHead(of: connection, buffer: buffer)
      }
    }
  }

  private func respond(to head: String, on connection: NWConnection) async {
    defer { connection.cancel() }

    guard let request = ProxyRequest(head: head) else {
      try? await send(Self.header(status: "400 Bad Request", fields: ["Content-Length": "0"]), on: connection, isComplete: true)
      return
    }

    let total = request.length
    let start: Int64
    let end: Int64
    var fields = [
      "Content-Type": request.contentType,
      "Accept-Ranges": "bytes",
    ]
    let status: String

    switch request.range {
    case .whole:
      start = 0
      end = total - 1
      status = "200 OK"
    case .partial(let first, let last):
      start = first
      end = last
      status = "206 Partial Content"
      fields["Content-Range"] = "bytes \(first)-\(last)/\(total)"
    case .unsatisfiable:
      fields["Content-Range"] = "bytes */\(total)"
      fields["Content-Length"] = "0"
      try? await send(Self.header(status: "416 Range Not Satisfiable", fields: fields), on: connection, isComplete: true)
      return
    }
    fields["Content-Length"] = String(end - start + 1)
    let header = Self.header(status: status, fields: fields)

    if request.method == "HEAD" {
      try? await send(header, on: connection, isComplete: true)
      return
    }

    var offset = start
    var pieceSize = Self.firstPieceSize
    var sentHeader = false
    do {
      while offset <= end {
        let pieceEnd = min(offset + pieceSize - 1, end)
        let piece = try await fetch(request.upstream, from: offset, to: pieceEnd)
        let isLast = pieceEnd == end
        if sentHeader {
          try await send(piece, on: connection, isComplete: isLast)
        } else {
          // Sent together with the first piece, so an upstream failure can
          // still reach the player as an error status
          try await send(header + piece, on: connection, isComplete: isLast)
          sentHeader = true
        }
        offset = pieceEnd + 1
        pieceSize = min(pieceSize * 2, Self.maxPieceSize)
      }
    } catch {
      // After the header is out the only signal left is closing early, which
      // the player reports as a playback error
      guard !sentHeader else { return }
      var upstreamStatus = 502
      if case ProxyError.upstream(let code) = error, code >= 400 {
        upstreamStatus = code
      }
      try? await send(
        Self.header(status: "\(upstreamStatus) Upstream Error", fields: ["Content-Length": "0"]),
        on: connection,
        isComplete: true
      )
    }
  }

  private func fetch(_ url: URL, from start: Int64, to end: Int64) async throws -> Data {
    var request = URLRequest(url: url)
    request.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
    let (data, response) = try await session.data(for: request)
    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard statusCode == 206 || statusCode == 200 else {
      throw ProxyError.upstream(status: statusCode)
    }
    let expected = Int(end - start + 1)
    if statusCode == 200 {
      // The server ignored Range and sent the file from byte 0
      guard start == 0, data.count >= expected else { throw ProxyError.shortRead }
      return data.prefix(expected)
    }
    guard data.count == expected else { throw ProxyError.shortRead }
    return data
  }

  private func send(_ data: Data, on connection: NWConnection, isComplete: Bool) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      connection.send(content: data, isComplete: isComplete, completion: .contentProcessed { error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume()
        }
      })
    }
  }

  private static func header(status: String, fields: [String: String]) -> Data {
    var text = "HTTP/1.1 \(status)\r\n"
    for (name, value) in fields {
      text += "\(name): \(value)\r\n"
    }
    text += "Connection: close\r\n\r\n"
    return Data(text.utf8)
  }
}

/// A parsed player request for /stream...
struct ProxyRequest {
  enum ByteRange {
    case whole
    case partial(Int64, Int64)
    case unsatisfiable
  }

  let method: String
  let upstream: URL
  let length: Int64
  let contentType: String
  let range: ByteRange

  init?(head: String) {
    let lines = head.components(separatedBy: "\r\n")
    let requestLine = lines.first?.split(separator: " ") ?? []
    guard requestLine.count >= 2,
          let components = URLComponents(string: "http://127.0.0.1" + requestLine[1]),
          components.path.hasPrefix("/stream")
    else { return nil }

    let items = components.queryItems ?? []
    func value(_ name: String) -> String? {
      items.first { $0.name == name }?.value
    }
    guard let upstreamString = value("u"),
          let upstream = URL(string: upstreamString),
          upstream.scheme == "https",
          let length = value("len").flatMap({ Int64($0) }),
          length > 0
    else { return nil }

    var range = ByteRange.whole
    for line in lines.dropFirst() {
      let pair = line.split(separator: ":", maxSplits: 1)
      guard pair.count == 2,
            pair[0].trimmingCharacters(in: .whitespaces).lowercased() == "range"
      else { continue }
      range = Self.parseRange(pair[1].trimmingCharacters(in: .whitespaces), length: length)
    }

    self.method = String(requestLine[0]).uppercased()
    self.upstream = upstream
    self.length = length
    self.contentType = value("type") ?? "application/octet-stream"
    self.range = range
  }

  /// Parses "bytes=a-b", "bytes=a-" and "bytes=-n" (first range only).
  static func parseRange(_ value: String, length: Int64) -> ByteRange {
    guard value.lowercased().hasPrefix("bytes=") else { return .whole }
    let spec = value.dropFirst("bytes=".count).split(separator: ",").first.map(String.init) ?? ""
    let bounds = spec
      .split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
      .map { $0.trimmingCharacters(in: .whitespaces) }
    guard bounds.count == 2 else { return .whole }

    if bounds[0].isEmpty {
      guard let suffix = Int64(bounds[1]), suffix > 0 else { return .unsatisfiable }
      return .partial(max(0, length - suffix), length - 1)
    }
    guard let start = Int64(bounds[0]) else { return .whole }
    guard start < length else { return .unsatisfiable }
    let end = Int64(bounds[1]).map { min($0, length - 1) } ?? (length - 1)
    guard end >= start else { return .unsatisfiable }
    return .partial(start, end)
  }
}
