import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var bluetooth = BLECentral()
    @StateObject private var capabilities = CompanionCapabilities()

    var body: some View {
        NavigationStack {
            List {
                Section("Connection") {
                    LabeledContent("Bluetooth", value: bluetooth.phase.rawValue)
                    if let name = bluetooth.peripheralName {
                        LabeledContent("Device", value: name)
                    }
                    HStack {
                        Button("Scan for Workshop OS") { bluetooth.scan() }
                            .disabled(bluetooth.phase == .scanning || bluetooth.phase == .connecting)
                        if bluetooth.phase == .connected {
                            Button("Disconnect", role: .destructive) { bluetooth.disconnect() }
                        }
                    }
                }

                Section("Workshop OS") {
                    if let bootstrap = bluetooth.bootstrap {
                        LabeledContent("Identity", value: bootstrap.device)
                        LabeledContent("Authentication", value: bootstrap.auth)
                        if let url = bootstrap.baseURL {
                            LabeledContent("LAN endpoint", value: url.absoluteString)
                            Link("Open authenticated Workshop OS", destination: loginURL(from: url))
                        }
                    } else {
                        Text("Connect over BLE to discover the local Workshop OS endpoint. BLE discovery does not authenticate protected routes.")
                            .foregroundStyle(.secondary)
                    }
                }

                if let state = bluetooth.deviceState {
                    Section("Device state") {
                        statusRow("Device online", state.online)
                        statusRow("Phone present", state.phone)
                        statusRow("LAN reachable", state.lan)
                        statusRow("LAN session", state.session)
                    }
                }

                Section("Companion request") {
                    if let event = bluetooth.lastEvent {
                        LabeledContent("Type", value: event.t)
                        Text("Correlation: \(event.id)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)

                        if isActionable(event) {
                            Button(actionTitle(event)) { perform(event) }
                                .disabled(capabilities.cameraActive)
                        } else {
                            Text("No user action is required for this event.")
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Text("No companion event received yet.")
                            .foregroundStyle(.secondary)
                    }
                }

                if let photo = capabilities.lastPhotoURL {
                    Section("Latest camera capture") {
                        Text(photo.lastPathComponent)
                            .font(.caption.monospaced())
                        Text("The image stays on the iPhone in v1. A later authenticated Wi-Fi transport can transfer images; BLE never carries photo payloads.")
                            .foregroundStyle(.secondary)
                    }
                }

                if let error = bluetooth.lastError ?? capabilities.lastError {
                    Section("Needs attention") {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Workshop Companion")
        }
    }

    @ViewBuilder
    private func statusRow(_ label: String, _ value: Bool?) -> some View {
        LabeledContent(label, value: value.map { $0 ? "Yes" : "No" } ?? "Unknown")
    }

    private func loginURL(from base: URL) -> URL {
        base.appendingPathComponent("login")
    }

    private func isActionable(_ event: CompanionEnvelope) -> Bool {
        [
            CompanionProtocolV1.DeviceEvent.cameraRequest.rawValue,
            CompanionProtocolV1.DeviceEvent.ttsRequest.rawValue,
            CompanionProtocolV1.DeviceEvent.notificationRequest.rawValue
        ].contains(event.t)
    }

    private func actionTitle(_ event: CompanionEnvelope) -> String {
        switch event.t {
        case CompanionProtocolV1.DeviceEvent.cameraRequest.rawValue: return "Take requested photo"
        case CompanionProtocolV1.DeviceEvent.ttsRequest.rawValue: return "Speak requested text"
        case CompanionProtocolV1.DeviceEvent.notificationRequest.rawValue: return "Post requested notification"
        default: return "Handle request"
        }
    }

    private func perform(_ event: CompanionEnvelope) {
        switch event.t {
        case CompanionProtocolV1.DeviceEvent.cameraRequest.rawValue:
            capabilities.capturePhoto(isApplicationActive: scenePhase == .active) { state, url in
                var payload: [String: JSONValue] = ["state": .string(state.rawValue)]
                if url != nil { payload["stored-on-phone"] = .bool(true) }
                bluetooth.send(type: .cameraResult, correlationID: event.id, payload: payload)
            }

        case CompanionProtocolV1.DeviceEvent.ttsRequest.rawValue:
            let text = string("text", in: event.p) ?? ""
            let state = capabilities.speak(text)
            bluetooth.send(type: .ttsResult, correlationID: event.id, payload: ["state": .string(state.rawValue)])

        case CompanionProtocolV1.DeviceEvent.notificationRequest.rawValue:
            let title = string("title", in: event.p) ?? "Workshop OS"
            let body = string("body", in: event.p) ?? "Workshop needs attention."
            Task {
                let state = await capabilities.requestNotification(title: title, body: body)
                bluetooth.send(type: .notificationResult, correlationID: event.id, payload: ["state": .string(state.rawValue)])
            }

        default:
            break
        }
    }

    private func string(_ key: String, in payload: [String: JSONValue]?) -> String? {
        guard case .string(let value)? = payload?[key] else { return nil }
        return value
    }
}

#Preview {
    ContentView()
}
