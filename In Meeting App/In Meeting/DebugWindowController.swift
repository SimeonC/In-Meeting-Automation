//
//  DebugWindowController.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/18.
//


import AppKit
import Foundation

final class DebugWindowController: NSViewController {
    private let textView = NSTextView()
    private let scrollView = NSScrollView()
    private var timer: Timer?

    override func loadView() {
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder

        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        textView.autoresizingMask = [.width, .height]
        textView.textContainer?.widthTracksTextView = true

        scrollView.documentView = textView
        view = scrollView
        view.setFrameSize(NSSize(width: 560, height: 420))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        refresh()
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    override func viewDidDisappear() {
        super.viewDidDisappear()
        timer?.invalidate()
        timer = nil
    }

    private func refresh() {
        textView.string = MeetingStatus.shared.debugText()
    }
}
