import { openWindowsSync } from "get-windows";
import http from "http";

export default class MeetingLightController {
  private bridgeIp: string;
  private username: string;
  private lightId?: string;
  private siblingLightId?: string;
  private baseUrl: string;
  private inMeeting: boolean = false;
  private googleMeetActive: boolean = false;
  private pollIntervalMs: number;
  private server?: http.Server;
  private pollingInterval?: NodeJS.Timeout;
  private networkOnline: boolean = false;
  private networkCheckInterval?: NodeJS.Timeout;
  private networkPollIntervalMs: number = 15 * 60 * 1000; // 15 minutes in milliseconds

  constructor(pollIntervalMs: number = 2000) {
    const bridgeIp = process.env.HUE_BRIDGE_IP;
    const username = process.env.HUE_TOKEN;
    const lightId = process.env.HUE_LIGHT_ID;
    const siblingLightId = process.env.HUE_LIGHT_SIBLING_ID;

    if (!bridgeIp || !username) {
      console.error("Missing HUE_BRIDGE_IP or HUE_TOKEN in .env.local");
      process.exit(1);
    }

    this.bridgeIp = bridgeIp;
    this.username = username;
    this.lightId = lightId;
    this.siblingLightId = siblingLightId;
    this.baseUrl = `https://${this.bridgeIp}/api/${this.username}`;
    this.pollIntervalMs = pollIntervalMs;
  }

  private detectSlackHuddle(windows: any[]): boolean {
    return windows.some((w) => {
      if (w.owner.name !== "Slack") return false;
      return w.title.includes("🏠") || w.title.toLowerCase().includes("huddle");
    });
  }

  private detectZoomMeeting(windows: any[]): boolean {
    return windows.some(
      (w) =>
        w.owner.name.toLowerCase().includes("zoom") &&
        w.title.toLowerCase().includes("zoom meeting")
    );
  }

  private async setLight(isOn: boolean) {
    if (!this.lightId) return;
    try {
      if (isOn) {
        // Set to red with full brightness when ON
        await fetch(`${this.baseUrl}/lights/${this.lightId}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: true, bri: 254, hue: 0, sat: 254 }),
        });
      } else {
        // When OFF, match the sibling light
        if (this.siblingLightId) {
          // Get sibling light state
          const siblingRes = await fetch(
            `${this.baseUrl}/lights/${this.siblingLightId}`
          );
          const siblingData = (await siblingRes.json()) as { state: any };
          const siblingState = siblingData.state;

          if (siblingState.on) {
            // Apply sibling state to this light
            await fetch(`${this.baseUrl}/lights/${this.lightId}/state`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(siblingState),
            });
            return;
          }
        }
        // If no sibling ID, or sibling is off, just turn off
        await fetch(`${this.baseUrl}/lights/${this.lightId}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            on: true,
            bri: 254,
            hue: 17165,
            sat: 38,
            ct: 274,
          }),
        });
      }
    } catch (err) {
      console.error("Error setting light state:", err);
    }
  }

  private async listLights() {
    try {
      const res = await fetch(`${this.baseUrl}/lights`);
      const lights = (await res.json()) as Record<string, { name: string }>;
      console.log("Available lights:");
      for (const [id, light] of Object.entries(lights)) {
        console.log(`${id}: ${light.name}`);
      }
      console.log(
        "Set HUE_LIGHT_ID to the ID of the light you want to control in .env.local"
      );
    } catch (err) {
      console.error("Error listing lights:", err);
    }
  }

  public async run() {
    this.startNetworkMonitor();
  }

  private startPolling() {
    this.pollingInterval = setInterval(() => this.check(), this.pollIntervalMs);
  }

  private async check() {
    try {
      const windows = openWindowsSync();
      const inSlack = this.detectSlackHuddle(windows);
      const inZoom = this.detectZoomMeeting(windows);
      const inGoogle = this.googleMeetActive;
      if ((inSlack || inZoom || inGoogle) && !this.inMeeting) {
        this.inMeeting = true;
        const source = inSlack
          ? "Slack huddle"
          : inZoom
          ? "Zoom meeting"
          : "Google Meet extension";
        console.log(`Meeting started (${source}), setting light to red`);
        await this.setLight(true);
      } else if (!(inSlack || inZoom || inGoogle) && this.inMeeting) {
        this.inMeeting = false;
        console.log("Meeting ended, turning light off");
        await this.setLight(false);
      }
    } catch (err) {
      console.error("Error in meeting check:", err);
    }
  }

  private startServer(): void {
    this.server = http.createServer(async (req, res) => {
      // Add CORS headers to allow the browser extension's origin
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      // Handle preflight CORS requests
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST" && req.url === "/meeting-start") {
        await this.onGoogleMeetStart();
      } else if (req.method === "POST" && req.url === "/meeting-end") {
        await this.onGoogleMeetEnd();
      }
      res.writeHead(200);
      res.end();
    });
    this.server.listen(1234, () =>
      console.log("Listening for Google Meet events on http://localhost:1234")
    );
  }

  private async onGoogleMeetStart() {
    console.log("Google Meet start event received");
    if (!this.inMeeting) {
      this.inMeeting = true;
      this.googleMeetActive = true;
      console.log(
        "Meeting started (Google Meet extension), setting light to red"
      );
      await this.setLight(true);
    }
  }

  private async onGoogleMeetEnd() {
    console.log("Google Meet end event received");
    // Only turn off if not in Slack or Zoom
    const windows = openWindowsSync();
    const inSlack = this.detectSlackHuddle(windows);
    const inZoom = this.detectZoomMeeting(windows);
    if (!inSlack && !inZoom && this.inMeeting) {
      console.log("Meeting ended (Google Meet extension), turning light off");
      await this.setLight(false);
      this.inMeeting = false;
      this.googleMeetActive = false;
    } else if (inSlack || inZoom) {
      console.log(
        "Meeting ended (Google Meet extension), but in Slack or Zoom"
      );
    } else {
      console.log("Meeting ended (Google Meet extension), but not in meeting");
    }
  }

  public async shutdown(): Promise<void> {
    console.log("Shutting down server and cleaning up...");

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
    }

    await Promise.all([
      new Promise<void>((resolve) => {
        if (this.server) {
          this.server.close(() => {
            console.log("Server closed successfully");
            resolve();
          });
        } else {
          resolve();
        }
      }),
      this.setLight(false),
    ]);
    console.log("Cleanup complete, light reset");
  }

  private startNetworkMonitor(): void {
    const check = async () => {
      const available = await this.checkNetworkAvailable();
      if (available && !this.networkOnline) {
        this.networkOnline = true;
        console.log("Hue bridge reachable, starting controller");
        this.startServer();
        if (!this.lightId) {
          await this.listLights();
          process.exit(0);
        }
        this.startPolling();
      } else if (!available && this.networkOnline) {
        this.networkOnline = false;
        console.log("Hue bridge unreachable, pausing controller");
        this.pauseController();
      }
    };
    check().catch(console.error);
    this.networkCheckInterval = setInterval(() => {
      check().catch(console.error);
    }, this.networkPollIntervalMs);
  }

  private async checkNetworkAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/lights`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private pauseController(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      console.log("Polling paused");
    }
    if (this.server) {
      this.server.close(() => {
        console.log("Server paused");
        this.server = undefined;
      });
    }
  }
}
