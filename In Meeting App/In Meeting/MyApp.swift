import SwiftUI
import AppKit

@main struct MyApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        MenuBarExtra (
            "In Meeting",
            systemImage: appDelegate.model.isInMeeting ?  "person.crop.square.badge.video.fill" : "bolt.fill"
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
            TabView {
                SettingsView(model: appDelegate.model)
                    .tabItem { Label("Settings", systemImage: "gearshape") }
                DebugView(model: appDelegate.model)
                    .tabItem { Label("Debugging", systemImage: "ladybug.fill") }
            }
            .tabViewStyle(.sidebarAdaptable)
            .onAppear {
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = AppModel()
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // for later in dev manually add;
        // ~/Library/Developer/Xcode/DerivedData/In*/Build/Products/Debug/In Meeting.app
        // to "Privacy & Security > Device Control..."
        Config.requestAccessibilityPermission()
        Task {
            do {
                try await model.start()
            } catch {
                print("Startup failed: \(error)")
            }
        }
    }
}
