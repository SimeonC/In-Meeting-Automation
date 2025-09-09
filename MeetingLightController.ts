import { openWindowsSync } from "get-windows";
import http from "http";

export default class MeetingLightController {
  private bridgeIp: string;
  private username: string;
  private lightIds: string[] = [];
  private baseUrl: string;
  private inMeeting: boolean = false;
  private googleMeetActive: boolean = false;
  private pollIntervalMs: number;
  private server?: http.Server;
  private pollingInterval?: NodeJS.Timeout;
  private networkOnline: boolean = false;
  private networkCheckInterval?: NodeJS.Timeout;
  private networkPollIntervalMs: number = 15 * 60 * 1000; // 15 minutes in milliseconds
  private googleMeetTimeout?: NodeJS.Timeout;
  private screenRecordingErrorLogged: boolean = false;

  constructor(pollIntervalMs: number = 2000) {
    const bridgeIp = process.env.HUE_BRIDGE_IP;
    const username = process.env.HUE_TOKEN;
    const lightIdsEnv = process.env.HUE_LIGHT_IDS;

    if (!bridgeIp || !username) {
      console.error("Missing HUE_BRIDGE_IP or HUE_TOKEN in .env");
      process.exit(1);
    }

    this.bridgeIp = bridgeIp;
    this.username = username;

    if (lightIdsEnv) {
      this.lightIds = lightIdsEnv
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
    }

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

  private async setLight(isInMeeting: boolean) {
    if (this.lightIds.length === 0) return;

    try {
      const lightPromises = this.lightIds.map((lightId) =>
        this.setSingleLight(lightId, isInMeeting)
      );
      await Promise.all(lightPromises);
    } catch (err) {
      console.error("Error setting light states:", err);
    }
  }

  private async setSingleLight(lightId: string, isInMeeting: boolean) {
    try {
      if (isInMeeting) {
        // Set to red with full brightness when in meeting
        await fetch(`${this.baseUrl}/lights/${lightId}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: true, bri: 254, hue: 0, sat: 254 }),
        });
      } else {
        // Set to cool blue when not in meeting
        await fetch(`${this.baseUrl}/lights/${lightId}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            on: true,
            bri: 200,
            hue: 46920,
            sat: 200,
          }),
        });
      }
    } catch (err) {
      console.error(`Error setting light ${lightId}:`, err);
    }
  }

  private async turnOffLights() {
    if (this.lightIds.length === 0) return;

    try {
      const lightPromises = this.lightIds.map((lightId) =>
        fetch(`${this.baseUrl}/lights/${lightId}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: false }),
        })
      );
      await Promise.all(lightPromises);
    } catch (err) {
      console.error("Error turning off lights:", err);
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
        "Set HUE_LIGHT_IDS to a comma-separated list of light IDs you want to control in .env"
      );
    } catch (err) {
      console.error("Error listing lights:", err);
    }
  }

  public async run() {
    this.startNetworkMonitor();
  }

  public async initializeLights() {
    if (this.lightIds.length === 0) return;
    console.log("Initializing lights to cool blue...");
    await this.setLight(false); // Set to cool blue (not in meeting)
  }

  private startPolling() {
    this.pollingInterval = setInterval(() => this.check(), this.pollIntervalMs);
  }

  private async check() {
    try {
      const { inSlack, inZoom } = this.getStatusFromWindows();
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
        console.log("Meeting ended, setting light to cool blue");
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
      } else if (req.method === "POST" && req.url === "/meeting-heartbeat") {
        await this.onGoogleMeetHeartbeat();
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

      if (this.googleMeetTimeout) {
        clearTimeout(this.googleMeetTimeout);
      }

      this.googleMeetTimeout = setTimeout(() => {
        console.log("Google Meet timeout reached, assuming meeting ended");
        this.onGoogleMeetEnd();
      }, 30 * 1000); // 30 seconds timeout
    }
  }

  private async onGoogleMeetHeartbeat() {
    if (this.googleMeetActive && this.googleMeetTimeout) {
      // Reset the timeout when we receive a heartbeat
      clearTimeout(this.googleMeetTimeout);
      this.googleMeetTimeout = setTimeout(() => {
        console.log("Google Meet timeout reached, assuming meeting ended");
        this.onGoogleMeetEnd();
      }, 30 * 1000); // 30 seconds timeout
      console.debug("💓 Google Meet heartbeat received, timeout reset");
    }
  }

  private getStatusFromWindows(): {
    inSlack: boolean;
    inZoom: boolean;
  } {
    try {
      const windows = openWindowsSync();
      const inSlack = this.detectSlackHuddle(windows);
      const inZoom = this.detectZoomMeeting(windows);
      return { inSlack, inZoom };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("screen recording permission")
      ) {
        // Only log this error once to avoid spam
        if (!this.screenRecordingErrorLogged) {
          console.warn("⚠️  Screen recording permission not available.");
          console.warn("   To enable Slack and Zoom detection:");
          console.warn(
            "   1. Open System Settings > Privacy & Security > Screen & System Audio Recording"
          );
          console.warn("   2. Add 'Bun' to the list of allowed applications");
          console.warn("   3. Restart this service");
          console.warn("   Currently only Google Meet detection is working.");
          this.screenRecordingErrorLogged = true;
        }
      } else {
        console.error("Error getting status from windows:", err);
      }
      return { inSlack: false, inZoom: false };
    }
  }

  private async onGoogleMeetEnd() {
    console.log("Google Meet end event received");

    if (this.googleMeetTimeout) {
      clearTimeout(this.googleMeetTimeout);
      this.googleMeetTimeout = undefined;
    }

    // Only turn off if not in Slack or Zoom
    try {
      const { inSlack, inZoom } = this.getStatusFromWindows();
      if (!inSlack && !inZoom && this.inMeeting) {
        console.log(
          "Meeting ended (Google Meet extension), setting light to cool blue"
        );
        await this.setLight(false);
        this.inMeeting = false;
        this.googleMeetActive = false;
      } else if (inSlack || inZoom) {
        console.log(
          "Meeting ended (Google Meet extension), but in Slack or Zoom"
        );
      } else {
        console.log(
          "Meeting ended (Google Meet extension), but not in meeting"
        );
      }
    } catch (err) {
      console.error("Error in Google Meet end event:", err);
      await this.setLight(false);
      this.googleMeetActive = false;
      this.inMeeting = false;
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
    if (this.googleMeetTimeout) {
      clearTimeout(this.googleMeetTimeout);
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
      this.turnOffLights(),
    ]);
    console.log("Cleanup complete, lights turned off");
  }

  private startNetworkMonitor(): void {
    const check = async () => {
      const available = await this.checkNetworkAvailable();
      if (available && !this.networkOnline) {
        this.networkOnline = true;
        console.log("Hue bridge reachable, starting controller");
        this.startServer();
        if (this.lightIds.length === 0) {
          await this.listLights();
          process.exit(0);
        }
        await this.initializeLights();
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
