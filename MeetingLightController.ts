import { openWindowsSync } from "get-windows";
import https from "https";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default class MeetingLightController {
  private bridgeIp: string;
  private username: string;
  private scenes: {
    not_meeting: string;
    meeting: string;
  } = {
    not_meeting: "",
    meeting: "",
  };
  private offZoneId: string = "";
  private baseUrl: string;
  private inMeeting: boolean = false;
  private googleMeetActive: boolean = false;
  private pollIntervalMs: number;
  private server?: https.Server;
  private pollingInterval?: NodeJS.Timeout;
  private networkOnline: boolean = false;
  private networkCheckInterval?: NodeJS.Timeout;
  private networkPollIntervalMs: number = 15 * 60 * 1000; // 15 minutes in milliseconds
  private googleMeetTimeout?: NodeJS.Timeout;
  private screenRecordingErrorLogged: boolean = false;

  constructor(pollIntervalMs: number = 2000) {
    const bridgeIp = process.env.HUE_BRIDGE_IP;
    const username = process.env.HUE_TOKEN;
    const sceneOffEnv = process.env.HUE_OFF_ZONE;
    const sceneNotMeetingEnv = process.env.HUE_SCENE_NOT_MEETING;
    const sceneMeetingEnv = process.env.HUE_SCENE_MEETING;

    if (!bridgeIp || !username) {
      console.error("Missing HUE_BRIDGE_IP or HUE_TOKEN in .env");
      process.exit(1);
    }

    this.bridgeIp = bridgeIp;
    this.username = username;

    if (sceneOffEnv) {
      this.offZoneId = sceneOffEnv.trim();
    }
    if (sceneNotMeetingEnv) {
      this.scenes.not_meeting = sceneNotMeetingEnv.trim();
    }
    if (sceneMeetingEnv) {
      this.scenes.meeting = sceneMeetingEnv.trim();
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
    const sceneId = isInMeeting ? this.scenes.meeting : this.scenes.not_meeting;
    if (!sceneId) return;

    try {
      await this.activateScene(sceneId);
    } catch (err) {
      console.error("Error activating scene:", err);
    }
  }

  private async activateScene(sceneId: string) {
    try {
      const sceneRes = await fetch(`${this.baseUrl}/scenes/${sceneId}`);
      if (!sceneRes.ok) {
        throw new Error(`Failed to fetch scene details: ${sceneRes.statusText}`);
      }
      const scene = (await sceneRes.json()) as { group?: string; name?: string };
      const groupId = scene.group;

      if (!groupId) {
        throw new Error(`Scene ${sceneId} does not have an associated group`);
      }

      const response = await fetch(`${this.baseUrl}/groups/${groupId}/action`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: sceneId }),
      });

      const responseData = await response.json().catch(() => ({}));

      if (Array.isArray(responseData) && responseData.some((item: any) => item.error)) {
        const errors = responseData.filter((item: any) => item.error);
        throw new Error(`Failed to activate scene: ${JSON.stringify(errors)}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to activate scene: ${JSON.stringify(responseData)}`);
      }

      console.log(`Scene ${sceneId} activated on group ${groupId}`);
    } catch (err) {
      console.error(`Error activating scene ${sceneId}:`, err);
      throw err;
    }
  }

  private async turnOffZone(zoneId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/groups/${zoneId}/action`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: false }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to turn off zone: ${JSON.stringify(errorData)}`
        );
      }
    } catch (err) {
      console.error(`Error turning off zone ${zoneId}:`, err);
      throw err;
    }
  }

  public turnOffLights(): Promise<unknown[]> {
    if (!this.offZoneId) return Promise.resolve([]);

    return this.turnOffZone(this.offZoneId)
      .then(() => {
        console.log("Off zone activated");
        return [];
      })
      .catch((err) => {
        console.error("Error turning off zone:", err);
        return [];
      });
  }

  private async listScenes() {
    try {
      const res = await fetch(`${this.baseUrl}/scenes`);
      const scenes = (await res.json()) as Record<string, { name: string }>;
      console.log("Available scenes:");
      for (const [id, scene] of Object.entries(scenes)) {
        console.log(`${id}: ${scene.name}`);
      }
      console.log(
        `Set HUE_OFF_ZONE (${this.offZoneId}), HUE_SCENE_NOT_MEETING (${this.scenes.not_meeting}), and HUE_SCENE_MEETING (${this.scenes.meeting}) in .env`
      );
    } catch (err) {
      console.error("Error listing scenes:", err);
    }
  }

  public async run() {
    this.startNetworkMonitor();
  }

  public async initializeLights() {
    if (!this.scenes.not_meeting) return;
    console.log("Initializing lights to 'Not Meeting' scene...");
    await this.setLight(false);
  }

  private startPolling() {
    this.pollingInterval = setInterval(() => this.check(), this.pollIntervalMs);
  }

  private async check() {
    try {
      const { inSlack, inZoom } = this.getStatusFromWindows();
      const inGoogle = this.googleMeetActive;
      const anyMeetingActive = inSlack || inZoom || inGoogle;

      if (anyMeetingActive && !this.inMeeting) {
        this.inMeeting = true;
        const source = inSlack
          ? "Slack huddle"
          : inZoom
          ? "Zoom meeting"
          : "Google Meet extension";
        console.log(`Meeting started (${source}), activating meeting scene`);
        await this.setLight(true);
      } else if (!anyMeetingActive) {
        if (this.inMeeting) {
          console.log("Meeting ended, activating not meeting scene");
          await this.setLight(false);
        }
        this.inMeeting = false;
      }
    } catch (err) {
      console.error("Error in meeting check:", err);
    }
  }

  private startServer(): void {
    const certPath = join(".certs", "cert.pem");
    const keyPath = join(".certs", "key.pem");

    if (!existsSync(certPath) || !existsSync(keyPath)) {
      console.error(
        "SSL certificates not found. Please run setup first: bun run setup.ts"
      );
      process.exit(1);
    }

    const options = {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    };

    this.server = https.createServer(options, async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
      console.log("Listening for Google Meet events on https://localhost:1234")
    );
  }

  private async onGoogleMeetStart() {
    console.log("Google Meet start event received");
    if (!this.inMeeting) {
      this.inMeeting = true;
      this.googleMeetActive = true;
      console.log(
        "Meeting started (Google Meet extension), activating meeting scene"
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
      if (!windows?.length) {
        return { inSlack: false, inZoom: false };
      }
      const inSlack = this.detectSlackHuddle(windows);
      const inZoom = this.detectZoomMeeting(windows);
      return { inSlack, inZoom };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("screen recording permission")
      ) {
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
    this.googleMeetActive = false;

    // Only turn off if not in Slack or Zoom
    try {
      const { inSlack, inZoom } = this.getStatusFromWindows();
      if (!inSlack && !inZoom && this.inMeeting) {
        console.log(
          "Meeting ended (Google Meet extension), activating not meeting scene"
        );
        await this.setLight(false);
        this.inMeeting = false;
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

  public shutdown(): Promise<void> {
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

    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log("Server closed successfully");
          resolve();
        });
      } else {
        resolve();
        console.log("No server to close");
      }
    });
  }

  private startNetworkMonitor(): void {
    const check = async () => {
      const available = await this.checkNetworkAvailable();
      if (available && !this.networkOnline) {
        this.networkOnline = true;
        console.log("Hue bridge reachable, starting controller");
        this.startServer();
        if (
          !this.offZoneId ||
          !this.scenes.not_meeting ||
          !this.scenes.meeting
        ) {
          await this.listScenes();
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
