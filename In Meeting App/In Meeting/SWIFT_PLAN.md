# In Meeting — Swift Conversion Plan

Convert the TypeScript `in-meeting-automation` (Hue light controller + Google Meet browser extension) into a native macOS **menu-bar app**, then layer on Unforget-style Calendar features.

**Approach:** Hue-first. Get the existing light controller working in Swift, *then* add the new alert/Calendar features.

**Decisions (already made):**
- Config storage: **UserDefaults** (replaces `.env`)
- Google Meet: **keep the browser extension + localhost HTTPS server** (port 1234)
- Auto-start: **SMAppService** login item
- Platform: macOS (menu-bar app, `LSUIElement`)
- App bundle id: `com.simeonc.InMeeting`

---

## Project state

- Xcode project: `Untitled Project/In Meeting.xcodeproj`
- Source dir: `Untitled Project/In Meeting/`
- Existing files: `MyApp.swift`, `ContentView.swift`, `Config.swift` (if created), `CalendarService.swift` (if created)
- Leftover `.ts` files referenced by the project — **leave in place until conversion is done**, then remove from the Xcode target.
- `LSUIElement = YES` is set (app runs headless, no main window).

---

## Checklist

### Stage 0 — Toolchain & project  ✅ DONE
- [x] Xcode installed; project created as macOS App template
- [x] `LSUIElement` set → headless menu-bar app
- [x] Menu-bar icon + menu working (`NSStatusItem` + `NSMenu`)

### Stage A — Config in UserDefaults
- [x] Created `Config.swift` (`bridgeIP`, `hueToken`, `offZoneID`, `sceneNotMeetingID`, `sceneMeetingID`)
- [x] `Config.load()` / `Config.save()` via `UserDefaults.standard`
- [x] `hueBaseURL` computed property + `isComplete` check
- [x] Wire `refreshConfig` into the menu; verify value persists across restarts
- [x] **Remove the TEMP test line** from `applicationDidFinishLaunching` when done

### Stage B — Hue API client (`URLSession`)
- [x] New file `HueService.swift`
- [x] `activateScene(_ sceneID:)` — port of `activateScene` (GET `/scenes/:id` → PUT `/groups/:group/action` `{scene: id}`)
- [x] `turnOffZone(_ zoneID:)` — port of `turnOffZone` (PUT `{on: false}`)
- [x] `listScenes()` + `listGroups()` — for the setup flow
- [x] Register new Hue user (token) — port of `setup.ts` POST `/api` with `devicetype` (error type 101 = button not pressed, retry)
- [x] `turnOffLights()` + `shutdown()` semantics
- [x] Test against the real bridge: activate "Meeting" then "Not Meeting" scenes

### Stage C — Window detection (`NSWorkspace`)
- [x] New file `WindowDetector.swift` (or fold into a `MeetingDetector`)
- [x] Use `NSWorkspace.shared.runningApplications` (`.regular` policy) → `app.localizedName` + `app.windows` titles
- [x] `detectSlackHuddle` — app "Slack", title contains "🏠" or "huddle"
- [x] `detectZoomMeeting` — app name contains "zoom", title contains "zoom meeting"
- [x] **No screen-recording permission needed** — verify by running without granting any permission

### Stage D — Localhost HTTPS server (`NWListener`)
- [x] New file `MeetServer.swift`
- [x] `NWListener` on `NWEndpoint.hostPort(host: "127.0.0.1", port: 1234)` with TLS
- [x] Reuse existing `.certs/cert.pem` + `key.pem`; keep keychain trust step
- [x] CORS headers (`Access-Control-Allow-Origin: *`, methods `POST, OPTIONS`)
- [x] Routes: `POST /meeting-start`, `POST /meeting-end`, `POST /meeting-heartbeat` → 200
- [x] Wire to the controller's `onGoogleMeetStart/End/Heartbeat`
- [ ] **Browser extension unchanged** — confirm it still posts and lights react

### Stage E — State machine + polling loop
- [x] Port `check()` logic: `inSlack || inZoom || inGoogle` → transition
- [x] Meeting started → `setLight(true)`; ended → `setLight(false)`
- [x] Polling interval (default 2000ms) via `Timer`
- [x] Google Meet 30s heartbeat timeout (`googleMeetTimeout`)
- [x] Network monitor: reachability check of bridge every 15 min; pause/resume controller
- [x] Initialize lights to "Not Meeting" on startup

### Stage F — Setup flow
- [ ] Menu-bar "Set up Hue…" flow (replaces `setup.ts` interactive prompts)
- [ ] Enter bridge IP → register token (press bridge button) → pick Off zone, Not-Meeting scene, Meeting scene
- [ ] Save to `UserDefaults`
- [ ] Generate + trust SSL cert if missing (reuse `cert-utils` logic via `Process`/`security`)

### Stage G — Auto-start (`SMAppService`)
- [ ] `SMAppService.mainApp.register()` (macOS 13+)
- [ ] "Start at login" menu toggle using `SMAppService.mainApp.status`
- [ ] Remove old LaunchAgent / Terminal-wrapper plist once this works
- [ ] Graceful shutdown on quit: turn off lights (port `turnOffLights` + `shutdown`)

### Stage H — (Later) Unforget-style features
- [ ] Calendar alerts: full-screen takeover on all displays ~1 min before event (also 5/15 min optional)
- [ ] Countdown ring + Join button (detect Zoom/Meet/Teams/Webex via `NSWorkspace`, launch URL scheme)
- [ ] Snooze ("2 more minutes"), quiet hours, calendar/keyword filters
- [ ] Plain-language reminders ("in 20 min pizza") → parse relative time
- [ ] Multi-monitor: one overlay window per `NSScreen`

---

## TS → Swift reference map

| TS | Swift |
|---|---|
| `openWindowsSync()` (get-windows) | `NSWorkspace.shared.runningApplications` / `.windows` |
| `fetch(url)` | `URLSession.shared.data(from:)` (async/await) |
| `https.createServer` :1234 | `NWListener` (Network.framework) + TLS |
| `setInterval` / `setTimeout` | `Timer.scheduledTimer` / `DispatchSourceTimer` / `Task` + `Task.sleep` |
| `process.env.X` | `UserDefaults.standard.string(forKey:)` |
| `watchFile(".env")` | not needed (UserDefaults is live) |
| `SIGINT`/`SIGTERM` handlers | `NSApp` termination (`applicationWillTerminate`) / `SMAppService` |
| LaunchAgent plist (Terminal wrapper) | `SMAppService.mainApp.register()` |

## Current TS behavior to preserve
- Lights red during meetings, cool blue otherwise (via Hue scenes on a group).
- "Off zone" turned off on shutdown.
- Google Meet via extension → `https://localhost:1234` → start/end/heartbeat with 30s timeout.
- Network monitor pauses/resumes the controller when the bridge drops.
