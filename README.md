# In-Meeting Automation

Automatically controls your Philips Hue lights when you join/leave meetings (Slack, Zoom, Google Meet). Lights turn red during meetings and cool blue when not in meetings.

---

## Prerequisites

- A Philips Hue Bridge on your network
- At least one Hue light configured in the Hue app
- Bun installed
- macOS (for the optional LaunchAgent auto-start)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/in-meeting-automation.git
   cd in-meeting-automation
   ```
2. Install dependencies with Bun:

   ```bash
   bun install
   ```

## Setup

Before running setup, create 2 scenes in your Hue app:

- **"Not Meeting"** - Scene to activate when not in a meeting
- **"Meeting"** - Scene to activate when in a meeting

Run the interactive setup to:

- Enter your Hue Bridge IP address
- Register a new Hue API token (press the bridge button when prompted)
- Select a zone for the "Off" state (used when service shuts down)
- Select the 2 scenes (Not Meeting, Meeting)
- Generate a `LaunchAgent` plist (macOS) and optionally load it via `launchctl`

```bash
bun run setup.ts
```

This will create or update a `.env` file in the project root with:

```dotenv
HUE_BRIDGE_IP=<your-bridge-ip>
HUE_TOKEN=<your-username-token>
HUE_OFF_ZONE=zone:<zone-id>
HUE_SCENE_NOT_MEETING=<scene-id>
HUE_SCENE_MEETING=<scene-id>
NODE_TLS_REJECT_UNAUTHORIZED=0
```

On macOS, the script can also generate a `com.<user>.meeting-light.plist` in the current directory and offer to `launchctl load` it so the service runs at login.

## Running the Service

After setup, start the light controller:

```bash
bun run index.ts
```

The service will:

- Clear `error.log` and `output.log` on startup
- Initialize lights to the "Not Meeting" scene on startup
- Listen for Slack huddles and Zoom meetings via window polling
- Listen for Google Meet start/end events on `https://localhost:1234` from the browser extension
- Activate the "Meeting" scene when a meeting starts
- Activate the "Not Meeting" scene when a meeting ends
- Turn off the selected zone when the service shuts down
- Handle browser tab closures with a 30-second timeout for Google Meet

## Browser Extension (Google Meet Support)

To get Google Meet events into this tool, install the companion content script in your browser. This can be done by an extension like scriptmonkey, arc boosts or the following to create your own custom chrome extension.

1. Create a new folder (e.g. `meet-extension`).
2. Inside that folder, place `browser-extension/index.js` (from this repo) and a `manifest.json`:
   ```json
   {
     "manifest_version": 3,
     "name": "In-Meeting Automation (Meet Extension)",
     "version": "1.0",
     "description": "Detects Google Meet start/end and notifies the local service",
     "permissions": [],
     "host_permissions": [
       "https://meet.google.com/*",
       "https://localhost:1234/*"
     ],
     "content_scripts": [
       {
         "matches": ["https://meet.google.com/*"],
         "js": ["index.js"]
       }
     ]
   }
   ```
3. In Chrome/Edge/Brave, go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `meet-extension` folder.

Once enabled, the extension will POST to `https://localhost:1234/meeting-start` and `/meeting-end` on Meet join/leave.

## Logs & Troubleshooting

- **output.log**: normal runtime logs
- **error.log**: any errors encountered

If you encounter issues:

- Verify your `.env` values
- Check your Hue Bridge network connectivity
- Inspect logs:
  ```bash
  tail -f output.log error.log
  ```
- Ensure your browser extension is loaded and active on Google Meet pages

## Debugging Tools

### Window Title Debugger

To see all currently open windows and their titles (useful for checking what the system detects during meetings):

```bash
bun run debug-windows.ts
```

This will display all window titles, owner applications, and counts of windows by application.

### Hue Lights Debugger

To view detailed information about all your Hue lights including their current color settings:

```bash
bun run debug-hue-lights.ts
```

This displays comprehensive information for each light including:

- On/off state
- Brightness percentage
- Hue value (in degrees)
- Saturation percentage
- Color temperature
- Color mode
- Model information
- Other light-specific details

---

Enjoy automated light control for your meetings! 🎉
