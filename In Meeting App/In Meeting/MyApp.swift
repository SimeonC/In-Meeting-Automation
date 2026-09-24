import SwiftUI
import AppKit

@main struct MyApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        Settings {
            Text("In Meeting - settings")
                .padding()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // for later in dev manually add;
        // ~/Library/Developer/Xcode/DerivedData/In*/Build/Products/Debug/In Meeting.app
        // to "Privacy & Security > Device Control..."
        Config.requestAccessibilityPermission()
        Task {
            do {
                try MeetServer.start()
                try await MeetingStatus.start(hueService: HueService(config: Config.load()))
            } catch {
                print("Startup failed: \(error)")
            }
        }
        statusItem = {
            let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
            item.button?.title = "🕐"
            item.menu = {
                let menu = NSMenu()
                menu.addItem(withTitle: "In Meeting", action: nil, keyEquivalent: "").isEnabled = false
                let configItem = menu.addItem(withTitle: "Loading Config...", action: nil, keyEquivalent: "")
                configItem.isEnabled = false
                refreshConfig(item: configItem)
                menu.addItem(.separator())
                menu.addItem(withTitle: "Toggle Debugger", action: #selector(AppDelegate.toggleDebugWindow), keyEquivalent: "")
                menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
                return menu
            }()
            return item
        }()
    }
    
    @objc func toggleDebugWindow() {
        DebugWindow.shared.toggle()
    }
    
    private func refreshConfig(item: NSMenuItem) {
        let config = Config.load()
        if config.isComplete {
            item.title = "Hue: \(config.bridgeIP)"
        } else {
            item.title = "Hue: not configured"
        }
    }
}
