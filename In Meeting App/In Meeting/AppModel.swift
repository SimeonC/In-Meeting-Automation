//
//  AppModel.swift
//  In Meeting
//
//  Created by Simeon Cheeseman on 2026/09/24.
//

import Foundation

@Observable @MainActor
final class AppModel {
    var config: Config
    var status: MeetingStatus
    
    var isInMeeting: Bool { status.isMeeting }
    
    init() {
        let config = Config.load()
        self.config = config
        self.status = MeetingStatus(config: config)
    }
    
    func start() async throws {
        try await status.start()
    }
}
