//
//  MeetServer.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//
import Network
import Foundation

final class MeetServer {
    private static let certsDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("InMeeting/certs", isDirectory: true)
    }()

    private static let certPath: String = certsDir.appendingPathComponent("cert.pem").path
    private static let keyPath:  String = certsDir.appendingPathComponent("key.pem").path

    private static let loginKeychainPath: String = {
        NSHomeDirectory() + "/Library/Keychains/login.keychain-db"
    }()
    
    static func ensureCerts() throws {
        try! run("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", certPath, "-days", "365", "-nodes", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"])
        try! run("/usr/bin/security", ["import", keyPath, "-k", loginKeychainPath])
        try! run("/usr/bin/security", ["add-trusted-cert", "-d", "-r", "trustRoot", "-k", loginKeychainPath, certPath])
    }
    
    private static func run(_ launchPath: String, _ args: [String]) throws -> String {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: launchPath)
        p.arguments = args
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        try p.run()
        p.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard p.terminationStatus == 0 else {
            throw NSError(domain: "setup", code: Int(p.terminationStatus),
                          userInfo: [NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? ""])
        }
        return String(data: data, encoding: .utf8) ?? ""
    }
    
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "meetserver")
    private var inMeeting = false
    private var meetingTimeout: DispatchWorkItem?
    
    func isInMeeting() -> Bool {
        return self.inMeeting
    }
    
    func start() throws {
        let params = NWParameters.tls
        let listener = try NWListener(using: params, on: 1234)
        
        listener.stateUpdateHandler = { state in
            print(state)
        }
        listener.newConnectionHandler = { [weak self] conn in
            self?.handle(conn)
        }
        listener.start(queue: queue)
        self.listener = listener
    }
    
    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self, weak conn] data, _, _, error in
            guard let conn, let data, data.count > 0 else {
                conn?.cancel(); return
            }
            self?.process(conn, data)
        }
    }
    
    private func process(_ conn: NWConnection, _ data: Data) {
        let requestLines = data.base64EncodedString().split(separator: "\r\n")
        let urlParts = requestLines[0].split(separator: " ")
        guard urlParts.count >= 2 else {
            reply(conn, "400")
            return
        }
        switch (method: urlParts[0], path: urlParts[1]) {
        case ("Options", _):
            reply(conn, "204 No Content")
        case ("POST", "/meeting-start"):
            inMeeting = true
            scheduleLiveCheckup()
            reply(conn, "200 OK")
        case ("POST", "/meeting-end"):
            inMeeting = false
            clearLiveCheckup()
            reply(conn, "200 OK")
        case ("POST", "/meeting-heartbeat"):
            scheduleLiveCheckup()
            reply(conn, "200 OK")
        default:
            reply(conn, "404 Not Found")
        }
    }
    
    private func clearLiveCheckup() {
        meetingTimeout?.cancel()
    }
    private func scheduleLiveCheckup() {
        clearLiveCheckup()
        guard inMeeting else {
            return
        }
        let item = DispatchWorkItem { [weak self] in
            self?.inMeeting = false
        }
        meetingTimeout = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: item)
    }
    
    private func reply(_ conn: NWConnection, _ status: String) {
        let message = """
         HTTP/1.1 \(status)
         Access-Control-Allow-Origin: *
         Access-Control-Allow-Methods: POST, OPTIONS
         Access-Control-Allow-Headers: Content-Type
         Connection: close
         Content-Length: 0
         """
        conn.send(content: message.data(using: .utf8), completion: .idempotent)
    }
}

extension MeetServer {
    static var shared: MeetServer!
    
    static func start() throws {
        try! Self.ensureCerts()
        Self.shared = Self.init()
        try! Self.shared.start()
    }
}
