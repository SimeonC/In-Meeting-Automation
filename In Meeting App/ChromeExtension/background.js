const ENDPOINT = 'http://localhost:16338';

chrome.runtime.onMessage.addListener((msg, _, send) => {
  (async () => {
    try {
      console.debug(`Received:`, msg);
      if (['start', 'end', 'heartbeat'].includes(msg.type)) {
        await fetch(`${ENDPOINT}/meeting-${msg.type}`, { method: 'POST' });
        send({ ok: true });
      } else {
        send({ ok: false, error: `invalid message type ${msg.type}` });
      }
    } catch (error) {
      console.error('bg relay', msg.type, error);
      send({ ok: false, error: String(error) });
    }
  })();
  return true;
});
