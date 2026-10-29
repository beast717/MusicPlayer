import Foundation

/// YouTube's audio is fragmented MP4: every sample lives in the fragments,
/// yet the header (moov) already claims the full length. AVFoundation counts
/// both, so iOS reports twice the real duration, including on the lock screen.
/// For a file whose samples are all in fragments the header durations should
/// be 0, so the proxy zeroes them as the bytes pass through.
enum FragmentedMP4 {
  /// Bytes of the file start the proxy reads to find the header.
  static let headerProbeSize: Int64 = 64 * 1024

  /// Absolute byte ranges to zero, given the start of a file. Empty unless
  /// the file is fragmented and its header holds no samples.
  static func durationFieldsToZero(inFileStart data: Data) -> [ClosedRange<Int64>] {
    let bytes = [UInt8](data)
    guard let moov = box("moov", in: bytes, within: 0..<bytes.count),
          box("mvex", in: bytes, within: moov.body) != nil
    else { return [] }

    var fields: [ClosedRange<Int64>] = []
    if let mvhd = box("mvhd", in: bytes, within: moov.body),
       let field = durationField(of: mvhd, in: bytes, version0Offset: 16, version1Offset: 24) {
      fields.append(field)
    }

    var cursor = moov.body.lowerBound
    var foundTrack = false
    while let trak = box("trak", in: bytes, within: cursor..<moov.body.upperBound) {
      cursor = trak.body.upperBound
      foundTrack = true
      guard let mdia = box("mdia", in: bytes, within: trak.body),
            let minf = box("minf", in: bytes, within: mdia.body),
            let stbl = box("stbl", in: bytes, within: minf.body),
            let stts = box("stts", in: bytes, within: stbl.body),
            stts.body.count >= 8,
            readUInt32(bytes, stts.body.lowerBound + 4) == 0
      else {
        // This track keeps samples in the header; its durations are real
        return []
      }
      if let tkhd = box("tkhd", in: bytes, within: trak.body),
         let field = durationField(of: tkhd, in: bytes, version0Offset: 20, version1Offset: 28) {
        fields.append(field)
      }
      if let mdhd = box("mdhd", in: bytes, within: mdia.body),
         let field = durationField(of: mdhd, in: bytes, version0Offset: 16, version1Offset: 24) {
        fields.append(field)
      }
    }
    return foundTrack ? fields : []
  }

  /// Zeroes the parts of `piece` (which starts at `pieceStart` in the file) that fall in `fields`.
  static func zero(_ fields: [ClosedRange<Int64>], in piece: Data, pieceStart: Int64) -> Data {
    let pieceEnd = pieceStart + Int64(piece.count) - 1
    let overlapping = fields.filter { $0.lowerBound <= pieceEnd && $0.upperBound >= pieceStart }
    guard !overlapping.isEmpty else { return piece }

    var bytes = [UInt8](piece)
    for field in overlapping {
      let from = max(field.lowerBound, pieceStart) - pieceStart
      let to = min(field.upperBound, pieceEnd) - pieceStart
      for index in Int(from)...Int(to) {
        bytes[index] = 0
      }
    }
    return Data(bytes)
  }

  // MARK: - Box parsing

  private struct Box {
    let body: Range<Int>
  }

  /// First box named `name` among the boxes laid out back to back in `range`.
  private static func box(_ name: String, in bytes: [UInt8], within range: Range<Int>) -> Box? {
    let type = Array(name.utf8)
    var offset = range.lowerBound
    while offset + 8 <= range.upperBound {
      var size = Int(readUInt32(bytes, offset))
      var headerSize = 8
      if size == 1 {
        guard offset + 16 <= range.upperBound else { return nil }
        size = Int(clamping: readUInt64(bytes, offset + 8))
        headerSize = 16
      } else if size == 0 {
        size = range.upperBound - offset
      }
      guard size >= headerSize, size <= range.upperBound - offset else { return nil }
      if Array(bytes[(offset + 4)..<(offset + 8)]) == type {
        return Box(body: (offset + headerSize)..<(offset + size))
      }
      offset += size
    }
    return nil
  }

  /// The duration field of a full box; its offset from the body depends on the box version.
  private static func durationField(
    of box: Box,
    in bytes: [UInt8],
    version0Offset: Int,
    version1Offset: Int
  ) -> ClosedRange<Int64>? {
    guard !box.body.isEmpty else { return nil }
    let isVersion1 = bytes[box.body.lowerBound] == 1
    let start = box.body.lowerBound + (isVersion1 ? version1Offset : version0Offset)
    let width = isVersion1 ? 8 : 4
    guard start + width <= box.body.upperBound else { return nil }
    return Int64(start)...Int64(start + width - 1)
  }

  private static func readUInt32(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
    var value: UInt32 = 0
    for index in offset..<(offset + 4) {
      value = value << 8 | UInt32(bytes[index])
    }
    return value
  }

  private static func readUInt64(_ bytes: [UInt8], _ offset: Int) -> UInt64 {
    var value: UInt64 = 0
    for index in offset..<(offset + 8) {
      value = value << 8 | UInt64(bytes[index])
    }
    return value
  }
}
