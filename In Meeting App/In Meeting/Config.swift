//
//  Config.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//

import Foundation
import ApplicationServices

@Observable
final class Config {
    var bridgeIP: String
    var hueToken: String
    var offZoneID: String
    var sceneNotMeetingID: String
    var sceneMeetingID: String
    
    init(bridgeIP: String, hueToken: String, offZoneID: String, sceneNotMeetingID: String, sceneMeetingID: String) {
        self.bridgeIP = bridgeIP
        self.hueToken = hueToken
        self.offZoneID = offZoneID
        self.sceneNotMeetingID = sceneNotMeetingID
        self.sceneMeetingID = sceneMeetingID
    }
    
    static var isTrusted: Bool {
        AXIsProcessTrusted()
    }
    
    /// Prompts the user for Accessibility permission if not yet granted.
    /// Returns true if the app is currently trusted.
    static func requestAccessibilityPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }
    
    private enum Key {
        static let bridgeIP = "hueBridgeIP"
        static let hueToken = "hueToken"
        static let offZone = "hueOffZone"
        static let sceneNotMeeting = "hueSceneNotMeeting"
        static let sceneMeeting = "hueSceneMeeting"
    }
    
    static func load() -> Config {
        let d = UserDefaults.standard
        return Config(
            bridgeIP: d.string(forKey: Key.bridgeIP) ?? "",
            hueToken: d.string(forKey: Key.hueToken) ?? "",
            offZoneID: d.string(forKey: Key.offZone) ?? "",
            sceneNotMeetingID: d.string(forKey: Key.sceneNotMeeting) ?? "",
            sceneMeetingID: d.string(forKey: Key.sceneMeeting) ?? ""
        )
    }
    
    func save() {
        let d = UserDefaults.standard
        d.set(bridgeIP, forKey: Key.bridgeIP)
        d.set(hueToken, forKey: Key.hueToken)
        d.set(offZoneID, forKey: Key.offZone)
        d.set(sceneNotMeetingID, forKey: Key.sceneNotMeeting)
        d.set(sceneMeetingID, forKey: Key.sceneMeeting)
    }
    
    var hueBaseURL: URL? {
        guard !bridgeIP.isEmpty, !hueToken.isEmpty else { return nil }
        return URL(string: "https://\(bridgeIP)/api/\(hueToken)")
    }
    
    var isComplete: Bool {
        !bridgeIP.isEmpty && !hueToken.isEmpty && !sceneMeetingID.isEmpty && !sceneNotMeetingID.isEmpty
    }
}
