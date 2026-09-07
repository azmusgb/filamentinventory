import Foundation
@preconcurrency import CoreBluetooth

enum CompanionProtocolV1 {
    static let version = 1

    static let serviceUUID = CBUUID(string: "A3D10000-7A4B-4B82-9C52-57534F533530")
    static let bootstrapUUID = CBUUID(string: "A3D10001-7A4B-4B82-9C52-57534F533530")
    static let deviceEventUUID = CBUUID(string: "A3D10002-7A4B-4B82-9C52-57534F533530")
    static let phoneCommandUUID = CBUUID(string: "A3D10003-7A4B-4B82-9C52-57534F533530")
    static let deviceStateUUID = CBUUID(string: "A3D10004-7A4B-4B82-9C52-57534F533530")

    enum DeviceEvent: String, Codable, CaseIterable {
        case hello
        case lanHandoff = "lan.handoff"
        case cameraRequest = "camera.request"
        case ttsRequest = "tts.request"
        case notificationRequest = "notification.request"
        case ping
    }

    enum PhoneCommand: String, Codable, CaseIterable {
        case hello
        case cameraResult = "camera.result"
        case ttsResult = "tts.result"
        case notificationResult = "notification.result"
        case lanReady = "lan.ready"
        case pong
    }
}

struct CompanionEnvelope: Codable, Identifiable, Equatable {
    let v: Int
    let id: String
    let t: String
    let p: [String: JSONValue]?
}

struct CompanionBootstrap: Codable, Equatable {
    let v: Int
    let device: String
    let name: String?
    let host: String
    let port: Int
    let tls: Bool
    let auth: String

    var baseURL: URL? {
        var parts = URLComponents()
        parts.scheme = tls ? "https" : "http"
        parts.host = host
        parts.port = port
        return parts.url
    }
}

struct CompanionDeviceState: Codable, Equatable {
    let v: Int
    let online: Bool?
    let phone: Bool?
    let lan: Bool?
    let session: Bool?
}

enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
}
