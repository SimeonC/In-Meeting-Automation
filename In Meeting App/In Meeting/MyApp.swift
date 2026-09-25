import SwiftUI
import AppKit

@main struct MyApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        let model = appDelegate.model
        MenuBarExtra (
            "In Meeting",
            systemImage: model.isInMeeting ?  "person.crop.square.badge.video.fill" : "bolt.fill"
        ) {
            Group {
                Text("In Meeting")
                SettingsLink {
                    Text("Settings")
                }.keyboardShortcut(",")
                Divider()
                Button("Quit") {
                    NSApp.terminate(nil)
                }.keyboardShortcut("q")
            }
        }
        Settings {
            @Bindable var boundModel = appDelegate.model
            TabView(selection: $boundModel.activeSettingsTab) {
                SettingsView(model: model)
                    .tabItem { Label("Settings", systemImage: "gearshape.2.fill") }
                    .tag(SettingsTab.general)
                SetupView(config: model.config, hueService: model.status.hueService)
                    .tabItem { Label("Setup", systemImage: "wand.and.sparkles") }
                    .tag(SettingsTab.setup)
                DebugView(model: model)
                    .tabItem { Label("Debugging", systemImage: "ladybug.fill") }
                    .tag(SettingsTab.debug)
            }
            .tabViewStyle(.sidebarAdaptable)
            .onAppear {
                if !model.config.isComplete {
                    model.activeSettingsTab = .setup
                }
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    @Environment(\.openSettings) private var openSettings
    
    let model = AppModel()
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // for later in dev manually add;
        // ~/Library/Developer/Xcode/DerivedData/In*/Build/Products/Debug/In Meeting.app
        // to "Privacy & Security > Device Control..."
        Config.requestAccessibilityPermission()
        Task {
            do {
                try await model.start()
                if !model.config.isComplete {
                    openSettings()
                }
            } catch {
                print("Startup failed: \(error)")
            }
        }
    }
}
