(function () {
  const ENDPOINT = "http://localhost:1234";
  const HEARTBEAT_INTERVAL = 10000; // 10 seconds
  const LEAVE_CALL_SELECTOR = 'button[aria-label="Leave call"]';

  class GoogleMeetMonitor {
    constructor() {
      this.inMeeting = false;
      this.startObserver = null;
      this.endObserver = null;
      this.heartbeatInterval = null;
    }

    // Network communication methods
    async sendStart() {
      try {
        await fetch(`${ENDPOINT}/meeting-start`, { method: "POST" });
      } catch (err) {
        console.error("meet‑start error", err);
      }
    }

    async sendEnd() {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${ENDPOINT}/meeting-end`);
        } else {
          await fetch(`${ENDPOINT}/meeting-end`, {
            method: "POST",
            keepalive: true,
          });
        }
      } catch (err) {
        console.error("meet‑end error", err);
      }
    }

    async sendHeartbeat() {
      if (!this.inMeeting) return;

      try {
        await fetch(`${ENDPOINT}/meeting-heartbeat`, { method: "POST" });
      } catch (err) {
        console.error("meet‑heartbeat error", err);
      }
    }

    // State management methods
    async onMeetingStart() {
      if (this.inMeeting) return;

      this.inMeeting = true;
      console.debug("🎯 Meeting detected, sending start signal");
      await this.sendStart();

      this.stopStartObserver();
      this.startEndObserver();
      this.startHeartbeat();
    }

    async onMeetingEnd() {
      if (!this.inMeeting) return;

      this.inMeeting = false;
      console.debug("🏁 Meeting ended, sending end signal");
      await this.sendEnd();

      this.stopEndObserver();
      this.stopHeartbeat();
      this.startStartObserver();
    }

    // Observer management methods
    startStartObserver() {
      if (this.startObserver) return;

      console.debug("👀 Starting observer for meeting start");
      this.startObserver = new MutationObserver(() => {
        const btn = document.querySelector(LEAVE_CALL_SELECTOR);
        if (btn) {
          this.onMeetingStart();
        }
      });

      this.startObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    stopStartObserver() {
      if (this.startObserver) {
        this.startObserver.disconnect();
        this.startObserver = null;
        console.debug("⏹️ Stopped start observer");
      }
    }

    startEndObserver() {
      if (this.endObserver) return;

      console.debug("👀 Starting observer for meeting end");
      this.endObserver = new MutationObserver(() => {
        const btn = document.querySelector(LEAVE_CALL_SELECTOR);
        if (!btn) {
          this.onMeetingEnd();
        }
      });

      this.endObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    stopEndObserver() {
      if (this.endObserver) {
        this.endObserver.disconnect();
        this.endObserver = null;
        console.debug("⏹️ Stopped end observer");
      }
    }

    // Heartbeat management methods
    startHeartbeat() {
      if (this.heartbeatInterval) return;

      console.debug("💓 Starting heartbeat with 10s intervals");
      this.heartbeatInterval = setInterval(() => {
        this.sendHeartbeat();
      }, HEARTBEAT_INTERVAL);
    }

    stopHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        console.debug("💓 Stopped heartbeat");
      }
    }

    // Cleanup method
    cleanup() {
      this.stopStartObserver();
      this.stopEndObserver();
      this.stopHeartbeat();
      console.debug("⏹️ Stopped all observers and heartbeat");
    }

    // Initialization method
    async initialize() {
      if (!document.body) {
        setTimeout(() => this.initialize(), 500);
        return;
      }

      console.debug("⏱️ Initializing Google Meet monitoring");

      // Check if already in a meeting
      const btn = document.querySelector(LEAVE_CALL_SELECTOR);
      if (btn) {
        await this.onMeetingStart();
      } else {
        this.startStartObserver();
      }
    }

    // Cleanup on page unload
    handleUnload() {
      this.cleanup();
      if (this.inMeeting) {
        this.sendEnd();
      }
    }
  }

  // Initialize the monitor
  const monitor = new GoogleMeetMonitor();

  // Start monitoring when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => monitor.initialize());
  } else {
    monitor.initialize();
  }

  // Clean up when page is unloaded
  window.addEventListener("beforeunload", () => monitor.handleUnload());
})();
