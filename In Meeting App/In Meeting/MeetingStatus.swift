//
//  MeetingDetector.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//

import Foundation
import AppKit
import ApplicationServices
import SwiftUI

struct MeetingWindowInfo {
    let appName: String
    let title: String
    let pid: pid_t
}
extension MeetingWindowInfo: Identifiable {
    var id: pid_t { pid }
}

struct MeetingDetector {
    let name: MeetingType
    let isActive: ([MeetingWindowInfo]) -> Bool
}
extension MeetingDetector: Identifiable {
    var id: MeetingType { name }
}

enum MeetingType: String {
    case Slack, Zoom, Google
    
    var label: String { String(rawValue) }
}

@Observable
final class MeetingStatus {
    let hueService: HueService
    let googleMeetServer: MeetServer
    var activeMeetings: [MeetingType]
    var windows: [MeetingWindowInfo]
    let meetingDetectors: [MeetingDetector]
    
    private var pollTask: Task<Void, Never>?
    private var interval: Duration = .seconds(2)
    
    var isMeeting: Bool { activeMeetings.count > 0 }
    
    func isActive(_ md: MeetingDetector) -> Bool {
        activeMeetings.contains(md.name)
    }
    
    init(config: Config) {
        self.hueService = HueService(config: config)
        self.activeMeetings = []
        self.windows = []
        let googleMeetServer = MeetServer()
        self.googleMeetServer = googleMeetServer
        self.meetingDetectors = [
            MeetingDetector(
                name: MeetingType.Slack,
                isActive: { $0.contains(where: { $0.appName == "Slack" && ($0.title.contains("🏠") || $0.title.lowercased().contains("huddle")) }) }
            ),
            MeetingDetector(
                name: MeetingType.Zoom,
                isActive: { $0.contains(where: {  $0.appName.lowercased().contains("zoom") && $0.title.lowercased().contains("zoom meeting") }) }
            ),
            MeetingDetector(
                name: MeetingType.Google,
                isActive: { _ in googleMeetServer.isInMeeting() }
            )
        ]
    }
    
    func start() async throws {
        print("Set initial meeting")
        try? await hueService.toggleMeeting(false)
        print("Start google meet server")
        try googleMeetServer.start()
        print("Start Meeting service checks!")
        stop()
        pollTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await check()
                try? await Task.sleep(for: interval)
            }
        }
    }
    
    func stop() {
        pollTask?.cancel()
        pollTask = nil
    }
    
    func check() async throws {
        let wasMeeting = isMeeting
        try! updateWindows()
        activeMeetings = meetingDetectors.compactMap {
            $0.isActive(windows) ? $0.name : nil
        }
        print("Active meetings \(activeMeetings)")
        if wasMeeting == isMeeting { return }
        try await hueService.toggleMeeting(isMeeting)
    }
    
    private func updateWindows() throws {
        var result: [MeetingWindowInfo] = []
        for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
            guard let name = app.localizedName else { continue }
            for title in windowTitles(for: app.processIdentifier) {
                result.append(MeetingWindowInfo(appName: name, title: title, pid: app.processIdentifier))
            }
        }
        windows = result
    }
    
    /// Window titles for a given app, via the Accessibility API.
    /// Returns [] if the Accessibility permission hasn't been granted yet.
    private func windowTitles(for pid: pid_t) -> [String] {
        let appElement = AXUIElementCreateApplication(pid)
        var windowsRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef) == .success,
              let windows = windowsRef as? [AXUIElement] else {
            return []
        }
        return windows.compactMap { window in
            var titleRef: CFTypeRef?
            guard AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &titleRef) == .success else {
                return nil
            }
            return titleRef as? String
        }
    }
}
