//
//  SettingsView.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/24.
//

import SwiftUI

struct SettingsView: View {
    @Bindable var model: AppModel
    
    @State private var scenes: [String: String] = [:]
    @State private var groups: [String: String] = [:]
    
    var body: some View {
        Text("Settings")
    }
}
