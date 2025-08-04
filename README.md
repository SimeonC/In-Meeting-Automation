# In-Meeting Automation

Automatically turns your Philips Hue light red when you join a meeting (Slack, Zoom, Google Meet) and restores the light state when your meeting ends.

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

Run the interactive setup to:

- Enter your Hue Bridge IP address
- Register a new Hue API token (press the bridge button when prompted)
- Select the main Hue light to control
- (Optionally) select a sibling light to match its state when off
- Generate a `LaunchAgent` plist (macOS) and optionally load it via `launchctl`

```bash
bun run setup.ts
```

This will create or update a `.env` file in the project root with:

```dotenv
HUE_BRIDGE_IP=<your-bridge-ip>
HUE_TOKEN=<your-username-token>
HUE_LIGHT_ID=<main-light-id>
HUE_LIGHT_SIBLING_ID=<optional-sibling-light-id>
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
- Listen for Slack huddles and Zoom meetings via window polling
- Listen for Google Meet start/end events on `http://localhost:1234` from the browser extension
- Turn your Hue light red when a meeting starts, and restore it when it ends

## Browser Extension (Google Meet Support)

To get Google Meet events into this tool, install the companion content script in your browser. This can be done by an extension like scriptmonkey, arc boosts or the following to create your own custom chrome extension.

1. Create a new folder (e.g. `meet-extension`).
2. Inside that folder, place `browser-extension.js` (from this repo) and a `manifest.json`:
   ```json
   {
     "manifest_version": 3,
     "name": "In-Meeting Automation (Meet Extension)",
     "version": "1.0",
     "description": "Detects Google Meet start/end and notifies the local service",
     "permissions": [],
     "host_permissions": [
       "https://meet.google.com/*",
       "http://localhost:1234/*"
     ],
     "content_scripts": [
       {
         "matches": ["https://meet.google.com/*"],
         "js": ["browser-extension.js"]
       }
     ]
   }
   ```
3. In Chrome/Edge/Brave, go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `meet-extension` folder.

Once enabled, the extension will POST to `http://localhost:1234/meeting-start` and `/meeting-end` on Meet join/leave.

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
