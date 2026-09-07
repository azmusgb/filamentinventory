import Foundation
@preconcurrency import CoreBluetooth

@MainActor
final class BLECentral: NSObject, ObservableObject {
    enum Phase: String {
        case bluetoothUnavailable = "Bluetooth unavailable"
        case idle = "Ready"
        case scanning = "Scanning"
        case connecting = "Connecting"
        case connected = "BLE connected"
        case failed = "Connection failed"
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var peripheralName: String?
    @Published private(set) var bootstrap: CompanionBootstrap?
    @Published private(set) var deviceState: CompanionDeviceState?
    @Published private(set) var lastEvent: CompanionEnvelope?
    @Published private(set) var lastError: String?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var bootstrapCharacteristic: CBCharacteristic?
    private var deviceEventCharacteristic: CBCharacteristic?
    private var phoneCommandCharacteristic: CBCharacteristic?
    private var deviceStateCharacteristic: CBCharacteristic?

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func scan() {
        guard central.state == .poweredOn else {
            phase = .bluetoothUnavailable
            return
        }
        resetConnectionState(keepError: false)
        phase = .scanning
        central.scanForPeripherals(
            withServices: [CompanionProtocolV1.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func disconnect() {
        central.stopScan()
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        resetConnectionState(keepError: true)
        phase = central.state == .poweredOn ? .idle : .bluetoothUnavailable
    }

    func refreshBootstrap() {
        guard let peripheral, let characteristic = bootstrapCharacteristic else { return }
        peripheral.readValue(for: characteristic)
    }

    func send(type: CompanionProtocolV1.PhoneCommand, correlationID: String = UUID().uuidString, payload: [String: JSONValue]? = nil) {
        guard let peripheral, let characteristic = phoneCommandCharacteristic else { return }
        let envelope = CompanionEnvelope(v: CompanionProtocolV1.version, id: correlationID, t: type.rawValue, p: payload)
        guard let data = try? encoder.encode(envelope), data.count <= 180 else {
            lastError = "Companion command exceeded the BLE v1 payload limit."
            return
        }
        peripheral.writeValue(data, for: characteristic, type: .withResponse)
    }

    func acknowledgeForegroundRequired(for event: CompanionEnvelope) {
        let state: [String: JSONValue] = ["state": .string("foreground-required")]
        switch event.t {
        case CompanionProtocolV1.DeviceEvent.cameraRequest.rawValue:
            send(type: .cameraResult, correlationID: event.id, payload: state)
        case CompanionProtocolV1.DeviceEvent.ttsRequest.rawValue:
            send(type: .ttsResult, correlationID: event.id, payload: state)
        default:
            break
        }
    }

    private func resetConnectionState(keepError: Bool) {
        peripheral = nil
        peripheralName = nil
        bootstrap = nil
        deviceState = nil
        lastEvent = nil
        bootstrapCharacteristic = nil
        deviceEventCharacteristic = nil
        phoneCommandCharacteristic = nil
        deviceStateCharacteristic = nil
        if !keepError { lastError = nil }
    }

    private func consume(_ characteristic: CBCharacteristic) {
        guard let data = characteristic.value else { return }

        switch characteristic.uuid {
        case CompanionProtocolV1.bootstrapUUID:
            do {
                let value = try decoder.decode(CompanionBootstrap.self, from: data)
                guard value.v == CompanionProtocolV1.version, value.auth == "portal-session" else {
                    lastError = "Unsupported or insecure Workshop Companion bootstrap."
                    return
                }
                bootstrap = value
            } catch {
                lastError = "Invalid Workshop Companion bootstrap: \(error.localizedDescription)"
            }

        case CompanionProtocolV1.deviceStateUUID:
            do {
                let value = try decoder.decode(CompanionDeviceState.self, from: data)
                guard value.v == CompanionProtocolV1.version else {
                    lastError = "Unsupported Workshop Companion device-state version."
                    return
                }
                deviceState = value
            } catch {
                lastError = "Invalid Workshop Companion device state: \(error.localizedDescription)"
            }

        case CompanionProtocolV1.deviceEventUUID:
            do {
                let value = try decoder.decode(CompanionEnvelope.self, from: data)
                guard value.v == CompanionProtocolV1.version else {
                    lastError = "Unsupported Workshop Companion event version."
                    return
                }
                lastEvent = value
                handleEvent(value)
            } catch {
                lastError = "Invalid Workshop Companion event: \(error.localizedDescription)"
            }

        default:
            break
        }
    }

    private func handleEvent(_ event: CompanionEnvelope) {
        switch event.t {
        case CompanionProtocolV1.DeviceEvent.ping.rawValue:
            send(type: .pong, correlationID: event.id)
        case CompanionProtocolV1.DeviceEvent.lanHandoff.rawValue:
            refreshBootstrap()
        default:
            break
        }
    }

    private func sendHello() {
        send(type: .hello, payload: [
            "caps": .array([.string("camera"), .string("tts"), .string("notify")]),
            "app": .string("1.0")
        ])
    }
}

extension BLECentral: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                if phase == .bluetoothUnavailable { phase = .idle }
            case .unsupported, .unauthorized, .poweredOff:
                phase = .bluetoothUnavailable
            default:
                break
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        // Do not carry the non-Sendable CoreBluetooth advertisement dictionary
        // across the MainActor boundary. Extract the only value the UI needs.
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        Task { @MainActor in
            guard self.peripheral == nil else { return }
            self.central.stopScan()
            self.peripheral = peripheral
            self.peripheralName = peripheral.name ?? advertisedName
            self.phase = .connecting
            peripheral.delegate = self
            self.central.connect(peripheral)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            self.phase = .connected
            peripheral.discoverServices([CompanionProtocolV1.serviceUUID])
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            self.lastError = error?.localizedDescription ?? "Unable to connect to Workshop OS."
            self.phase = .failed
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in
            if let error { self.lastError = error.localizedDescription }
            self.resetConnectionState(keepError: true)
            self.phase = central.state == .poweredOn ? .idle : .bluetoothUnavailable
        }
    }
}

extension BLECentral: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        Task { @MainActor in
            if let error {
                self.lastError = error.localizedDescription
                return
            }
            guard let service = peripheral.services?.first(where: { $0.uuid == CompanionProtocolV1.serviceUUID }) else {
                self.lastError = "Workshop Companion service was not found."
                return
            }
            peripheral.discoverCharacteristics([
                CompanionProtocolV1.bootstrapUUID,
                CompanionProtocolV1.deviceEventUUID,
                CompanionProtocolV1.phoneCommandUUID,
                CompanionProtocolV1.deviceStateUUID
            ], for: service)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        Task { @MainActor in
            if let error {
                self.lastError = error.localizedDescription
                return
            }
            for characteristic in service.characteristics ?? [] {
                switch characteristic.uuid {
                case CompanionProtocolV1.bootstrapUUID:
                    self.bootstrapCharacteristic = characteristic
                    peripheral.readValue(for: characteristic)
                case CompanionProtocolV1.deviceEventUUID:
                    self.deviceEventCharacteristic = characteristic
                    peripheral.setNotifyValue(true, for: characteristic)
                case CompanionProtocolV1.phoneCommandUUID:
                    self.phoneCommandCharacteristic = characteristic
                case CompanionProtocolV1.deviceStateUUID:
                    self.deviceStateCharacteristic = characteristic
                    peripheral.readValue(for: characteristic)
                    peripheral.setNotifyValue(true, for: characteristic)
                default:
                    break
                }
            }
            if self.phoneCommandCharacteristic != nil { self.sendHello() }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            if let error {
                self.lastError = error.localizedDescription
                return
            }
            self.consume(characteristic)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        Task { @MainActor in
            if let error { self.lastError = error.localizedDescription }
        }
    }
}
