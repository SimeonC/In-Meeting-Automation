//
//  Config.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//

import Foundation
import ApplicationServices

let d = UserDefaults.standard

@Observable
final class Config {
    var bridgeIP: String { didSet { d.set(bridgeIP, forKey: Key.bridgeIP) } }
    var hueToken: String { didSet { d.set(hueToken, forKey: Key.hueToken) } }
    var offGroupID: String { didSet { d.set(offGroupID, forKey: Key.offGroup) } }
    var sceneNotMeetingID: String { didSet { d.set(sceneNotMeetingID, forKey: Key.sceneNotMeeting) } }
    var sceneMeetingID: String { didSet { d.set(sceneMeetingID, forKey: Key.sceneMeeting) } }
    
    init() {
        self.bridgeIP = d.string(forKey: Key.bridgeIP) ?? ""
        self.hueToken = d.string(forKey: Key.hueToken) ?? ""
        self.offGroupID = d.string(forKey: Key.offGroup) ?? ""
        self.sceneNotMeetingID = d.string(forKey: Key.sceneNotMeeting) ?? ""
        self.sceneMeetingID = d.string(forKey: Key.sceneMeeting) ?? ""
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
        static let offGroup = "hueoffGroup"
        static let sceneNotMeeting = "hueSceneNotMeeting"
        static let sceneMeeting = "hueSceneMeeting"
    }
    
    var hueBaseURL: URL? {
        guard !bridgeIP.isEmpty, !hueToken.isEmpty else { return nil }
        return URL(string: "http://\(bridgeIP)/api/\(hueToken)")
    }
    
    var isComplete: Bool {
        hasBridgeIP && !hueToken.isEmpty && !sceneMeetingID.isEmpty && !sceneNotMeetingID.isEmpty
    }
    
    var hasBridgeIP: Bool {
        !bridgeIP.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    var isConnected: Bool { hasBridgeIP && !hueToken.isEmpty }
}
