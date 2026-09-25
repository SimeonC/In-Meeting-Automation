//
//  MeetServer.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//
import Network
import Foundation

final class MeetServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "meetserver")
    private var inMeeting = false
    private var meetingTimeout: DispatchWorkItem?
    
    func isInMeeting() -> Bool {
        print("check isInMeeting \(self.inMeeting)")
        return self.inMeeting
    }
    
    func start() throws {
        let listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: 16338)!)
        print("Google Meet Extension starting...")
        
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("Server listening on port 16338")
            case .failed(let error):
                print("Server failed: \(error)")
                self?.listener?.cancel()
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] conn in
            self?.handle(conn)
        }
        listener.start(queue: queue)
        self.listener = listener
    }
    
    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn)
    }
    
    private func receive(_ conn: NWConnection) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self, weak conn] data, _, isComplete, error in
            guard let conn, let data, data.count > 0 else {
                conn?.cancel(); return
            }
            self?.process(conn, data)
            if isComplete && conn.state != NWConnection.State.cancelled {
                conn.cancel()
            } else if error == nil {
                self?.receive(conn)
            }
        }
    }
    
    private func process(_ conn: NWConnection, _ data: Data) {
        let requestData = String(data: data, encoding: .utf8)
        let requestLines = requestData?.split(separator: "\r\n")
        guard let urlParts = requestLines?[0].split(separator: " "),
            urlParts.count >= 2 else {
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
        Content-Length: 0
        Connection: close
        
        """
        conn.send(content: message.data(using: .utf8), completion: .contentProcessed { _ in
            conn.cancel()
        })
    }
}
