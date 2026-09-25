//
//  HueService.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//
import Foundation

struct SceneInfo: Decodable { let group: String?; let name: String? }
struct SceneAction: Encodable {
    let scene: String?
    let on: Bool?
    
    var print: String {
        if scene != nil {
            return "Scene \(scene!) activated"
        }
        return (on ?? false) ? "Switch On" : "Switch Off"
    }
}

final class HueService {
    private let config: Config
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 30
        return URLSession(configuration: config)
    }()
    
    init(config: Config) {
        self.config = config
    }
    
    func connect() async throws {
        let bridgeIP = config.bridgeIP
        if bridgeIP.isEmpty {
            throw HueError.bridgeError("No Bridge IP set")
        }
        struct RegisterBody: Encodable { let devicetype: String }
        struct RegisterResult: Decodable { let success: Success?; let error: HueError? }
        struct Success: Decodable { let username: String }
        var request = URLRequest(url: URL(string: "http://\(bridgeIP)/api")!)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(RegisterBody(devicetype: "in-meeting-automation#setup"))
        
        for _ in 1...30 {
            do {
                let (data, _) = try await session.data(for: request)
                let results = try JSONDecoder().decode([RegisterResult].self, from: data)
                print(results)
                if let token = results.first(where: { $0.success != nil })?.success?.username {
                    config.hueToken = token
                }
            } catch {
                throw HueError.bridgeError("Cannot reach \(bridgeIP): \(error.localizedDescription)")
            }
            try await Task.sleep(for: .seconds(1))
        }
        throw HueError.bridgeError("Could not register: press the bridge's link button")
    }
    
    func listScenes() async throws -> [String: String] {
        let all = try await get([String: SceneInfo].self, path: "/scenes")
        return Dictionary(uniqueKeysWithValues: all.map { ($0.key, $0.value.name ?? "?") })
    }
    
    func listGroups() async throws -> [String: String] {
        let all = try await get([String: SceneInfo].self, path: "/groups")
        return Dictionary(uniqueKeysWithValues: all.map { ($0.key, $0.value.name ?? "?") })
    }
    
    func toggleMeeting(_ inMeeting: Bool) async throws {
        try await activateScene(inMeeting ? config.sceneMeetingID : config.sceneNotMeetingID)
    }
    
    private func activateScene(_ sceneID: String) async throws {
        let scene = try await getScene(sceneID)
        try await groupAction(scene.group!, action: SceneAction(scene: sceneID, on: nil))
    }
    
    func turnOffLights() async throws {
        guard !config.offGroupID.isEmpty else { return }
        try await groupAction(config.offGroupID, action: SceneAction(scene: nil, on: false))
    }
    
    private func getScene(_ sceneID: String) async throws -> SceneInfo {
        let scene = try await get(SceneInfo.self, path: "/scenes/\(sceneID)")
        guard scene.group != nil else {
            throw HueError.sceneHasNoGroup(sceneID)
        }
        return scene
    }
    
    private func get<T: Decodable>(_ type: T.Type, path: String) async throws -> T {
        let (data, response) = try await session.data(from: url(path))
        let code = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else {
            throw HueError.bridgeError("fetch \"\(path)\" \(String(code))")
        }
        return try JSONDecoder().decode(type.self, from: data)
    }
    
    private func groupAction(_ groupID: String, action: SceneAction) async throws {
        struct HueResponse: Decodable { let error: HueAPIError? }
        struct HueAPIError: Decodable { let type: Int; let address: String; let description: String }
        
        var input = URLRequest(url: try url("/groups/\(groupID)/action"))
        input.httpMethod = "PUT"
        input.setValue("application/json", forHTTPHeaderField: "Content-Type")
        input.httpBody = try JSONEncoder().encode(action)
        
        let (putData, _) = try await session.data(for: input)
        
        // hue can return [ {}, {} ] on success
        let results = try JSONDecoder().decode([HueResponse].self, from: putData)
        if let apiError = results.compactMap({ $0.error }).first {
            throw HueError.bridgeError("\(apiError.type): \(apiError.description)")
        }
        print("\(action.print) for group \(groupID)")
    }
    
    private func url(_ path: String) throws -> URL {
        guard let base = config.hueBaseURL else {
            throw HueError.notConfigured
        }
        return base.appending(path: path)
    }
}

enum HueError: LocalizedError, Decodable {
    case notConfigured
    case bridgeError(String)
    case sceneHasNoGroup(String)
    
    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Hue bridge not configured"
        case .bridgeError(let detail): return "Hue bridge error: \(detail)"
        case .sceneHasNoGroup(let id): return "Scene \(id) has no group"
        }
    }
}
