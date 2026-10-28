// A tiny publish/subscribe point so any part of the server can report something an administrator may want to hear
// about, without importing the code that sends the emails (which would create import cycles with the database layer).

const handlers = new Set();

export function onAlert(handler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Reports an event. Never throws and never waits: a broken alert path must not break the request that raised it. */
export function emitAlert(type, details = {}, options = {}) {
  for (const handler of handlers) {
    try {
      const result = handler(type, details, options);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Alerting is best effort.
    }
  }
}
