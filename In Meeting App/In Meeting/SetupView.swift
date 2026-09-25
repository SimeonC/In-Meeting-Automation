//
//  SettingsView.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/24.
//

import SwiftUI

enum RequestState {
    case rest, loading, success, error
}

struct SetupView: View {
    @Bindable var config: Config
    var hueService: HueService
    
    @State private var hueConnectionMessage: String = ""
    @State private var hueDataErrorMessage: String = ""
    @State private var hueHandshaking: RequestState = .rest
    @State private var scenes: [String: String] = [:]
    @State private var groups: [String: String] = [:]
    
    private var orderedScenes: [(key: String, value: String)] {
        scenes.sorted { $0.value < $1.value }
    }
    private var orderedGroups: [(key: String, value: String)] {
        groups.sorted { $0.value < $1.value }
    }
    
    var body: some View {
        Form {
            Section("Hue Bridge Connection") {
                TextField("Bridge IP", text: $config.bridgeIP, prompt: Text("192.168.1.42"))
                    .autocorrectionDisabled()
                if hueHandshaking == .loading {
                    ProgressView() {
                        Text(hueConnectionMessage)
                    }.progressViewStyle(.linear)
                } else {
                    Button(config.isConnected ? "Re-connect" : "Register Bridge") {
                        Task {
                            hueHandshaking = .loading
                            hueConnectionMessage = "Press the link button on your Hue Bridge device now"
                            defer { hueHandshaking = .rest }
                            do {
                                try await hueService.connect()
                                hueHandshaking = .success
                            } catch {
                                print(error.localizedDescription)
                                hueHandshaking = .error
                                hueConnectionMessage = error.localizedDescription
                            }
                        }
                    }.disabled(!config.hasBridgeIP)
                    if hueHandshaking == .error {
                        Text(hueConnectionMessage)
                    }
                }
                
                if config.isConnected {
                    Section("Light Settings") {
                        if !hueDataErrorMessage.isEmpty {
                            Text(hueDataErrorMessage).foregroundStyle(.red)
                        }
                        HStack {
                            Picker("In Meeting Scene", selection: $config.sceneMeetingID) {
                                if config.sceneMeetingID.isEmpty {
                                    Text("Choose...").tag("")
                                }
                                ForEach(Array(orderedScenes), id: \.key) { id, name in
                                    Text(name).tag(id)
                                }
                            }.disabled(scenes.isEmpty)
                            Button("Test") {
                                Task {
                                    try await hueService.toggleMeeting(true)
                                }
                            }.disabled(config.sceneMeetingID.isEmpty)
                        }
                        HStack {
                            Picker("Not-Meeting Scene", selection: $config.sceneNotMeetingID) {
                                if config.sceneNotMeetingID.isEmpty {
                                    Text("Choose...").tag("")
                                }
                                ForEach(Array(orderedScenes), id: \.key) { id, name in
                                    Text(name).tag(id)
                                }
                            }.disabled(scenes.isEmpty)
                            Button("Test") {
                                Task {
                                    try await hueService.toggleMeeting(false)
                                }
                            }.disabled(config.sceneNotMeetingID.isEmpty)
                        }
                        HStack {
                            Picker("Group to turn off at shutdown", selection: $config.offGroupID) {
                                if config.offGroupID.isEmpty {
                                    Text("Choose...").tag("")
                                }
                                ForEach(Array(orderedGroups), id: \.key) { id, name in
                                    Text(name).tag(id)
                                }
                            }.disabled(groups.isEmpty)
                            Button("Test") {
                                Task {
                                    try await hueService.turnOffLights()
                                }
                            }.disabled(config.offGroupID.isEmpty)
                        }
                    }.task {
                        do {
                            scenes = try await hueService.listScenes()
                            groups = try await hueService.listGroups()
                        } catch {
                            hueDataErrorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
    }
}

#Preview {
    SetupView(config: Config(), hueService: HueService(config: Config()))
}
