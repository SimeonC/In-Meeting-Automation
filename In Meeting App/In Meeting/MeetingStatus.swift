//
//  MeetingDetector.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//

import Foundation
import AppKit
import ApplicationServices

struct MeetingWindowInfo {
    let appName: String
    let title: String
    let pid: pid_t
}

struct MeetingDetector {
    let name: MeetingType
    let detect: (MeetingWindowInfo) -> Bool
}

enum MeetingType {
    case Slack, Zoom, Google
}

let googleMeetServer = MeetServer.init()

let meetingDetectors = [
    MeetingDetector(
        name: MeetingType.Slack,
        detect: { $0.appName == "Slack" && ($0.title.contains("🏠") || $0.title.lowercased().contains("huddle")) }
    ),
    MeetingDetector(
        name: MeetingType.Zoom,
        detect: { $0.appName.lowercased().contains("zoom") && $0.title.lowercased().contains("zoom meeting") }
    ),
    MeetingDetector(
        name: MeetingType.Google,
        detect: {_ in 
            MeetServer.shared.isInMeeting()
        }
    )
]

final class MeetingStatus {
    let hueService: HueService
    var activeMeetings: [MeetingType]
    var windows: [MeetingWindowInfo]
    
    private var pollTask: Task<Void, Never>?
    private var interval: Duration = .seconds(2)
    
    var isMeeting: Bool { activeMeetings.count > 0 }
    
    init(hueService: HueService) {
        self.hueService = hueService
        self.activeMeetings = []
        self.windows = []
    }
    
    func start() {
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
        updateWindows()
        activeMeetings = meetingDetectors.compactMap({
            let isActive = windows.contains(where: $0.detect)
            if isActive { return $0.name }
            else { return nil }
        })
        if wasMeeting == isMeeting { return }
        try await hueService.toggleMeeting(isMeeting)
    }
    
    private func updateWindows() {
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

extension MeetingStatus {
    static var shared: MeetingStatus!
    
    static func start(hueService: HueService) async throws {
        Self.shared = Self.init(hueService: hueService)
        try await hueService.toggleMeeting(false)
    }
    
    func debugText() -> String {
        var lines: [String] = []
        lines.append("-- In Meeting [Debug] --")
        meetingDetectors.forEach {
            let isActive = activeMeetings.contains($0.name)
            lines.append("\(isActive ? "💡" : "⏻") \($0.name)")
        }
        lines.append("")
        if Config.isTrusted {
            lines.append("── Open windows (\(windows.count)) ──")
            if windows.isEmpty {
                lines.append("  (none)")
            } else {
                for (i, w) in windows.enumerated() {
                    lines.append("\(i + 1). \(w.appName) [\(w.pid)]")
                    lines.append("   \"\(w.title)\"")
                }
            }
        } else {
            lines.append("Accessibility: NOT granted ⚠️")
        }
        lines.append("")
        lines.append("Updated: \(Date().formatted(date: .omitted, time: .standard))")
        return lines.joined(separator: "\n")
    }
}
