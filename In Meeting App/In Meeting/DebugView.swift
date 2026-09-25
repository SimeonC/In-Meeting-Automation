
//
//  SettingsView.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/24.
//

import SwiftUI

struct DebugView: View {
    @Bindable var model: AppModel
    
    var isMeeting: Bool { model.status.isMeeting }
    
    var body: some View {
        Form {
            Section("Status") {
                HStack {
                    imageIcon(isActive: model.status.isMeeting, icon: "video")
                    Text("Meeting Active")
                }
                ForEach(model.status.meetingDetectors) { detector in
                    HStack {
                        imageIcon(isActive: model.status.isActive(detector), icon: "video")
                        Text(detector.name.label)
                    }
                }
            }
            Section("Active Windows") {
                if Config.isTrusted {
                    if model.status.windows.count > 0 {
                        ForEach(model.status.windows) { w in
                            Text("\(w.appName): \(w.title)")
                        }
                    } else {
                        Text("No windows detected...")
                    }
                } else {
                    Text("Accessibility: NOT granted ⚠️")
                }
            }
        }
        .formStyle(.grouped)
    }
    
    func imageIcon(isActive: Bool, icon: String) -> some View {
        Image(systemName: "\(icon).\(isActive ? "fill" : "slash")")
            .foregroundStyle(isActive ? .green : .gray)
            .frame(width: 20)
    }
}
