//
//  DebugWindow.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//
import AppKit

final class DebugWindow {
    static let shared = DebugWindow()
    private var window: NSWindow?
    private var controller: DebugWindowController?
    
    func toggle() {
        if let win = window {
            win.isVisible ? win.orderOut(nil) : present(win)
            return
        }
        let controller = DebugWindowController()
        let win = NSWindow(contentViewController: controller)
        win.title = "In Meeting — Debug"
        win.styleMask = [.titled, .closable, .resizable]
        win.isReleasedWhenClosed = false
        win.level = .floating
        win.center()
        window = win
        self.controller = controller
        present(win)
    }
    
    private func present(_ win: NSWindow) {
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
