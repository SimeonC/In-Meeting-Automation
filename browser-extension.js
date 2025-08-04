(function () {
  const ENDPOINT = "http://localhost:1234";
  let inMeeting = false;

  function sendStart() {
    fetch(`${ENDPOINT}/meeting-start`, { method: "POST" }).catch((err) =>
      console.error("meet‑start error", err)
    );
  }
  function sendEnd() {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${ENDPOINT}/meeting-end`);
    } else {
      fetch(`${ENDPOINT}/meeting-end`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }
  }

  function checkCallButton() {
    // detect the "Leave call" button when in a meeting
    const btn = document.querySelector('button[aria-label="Leave call"]');
    if (btn && !inMeeting) {
      inMeeting = true;
      sendStart();
    } else if (!btn && inMeeting) {
      inMeeting = false;
      sendEnd();
    }
  }

  // Initialize observer once DOM is ready
  function initObserver() {
    if (!document.body) {
      setTimeout(initObserver, 500);
      return;
    }
    // Initial check in case button is already present
    checkCallButton();
    // Observe DOM changes (Meet loads parts lazily)
    const obs = new MutationObserver(checkCallButton);
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Start observer on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initObserver);
  } else {
    initObserver();
  }
})();
