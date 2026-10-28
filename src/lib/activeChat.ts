// Which party chat is on screen, so new messages there do not also pop up as notifications. Several chat panels can
// show the same party at once (the Chat tab and the drawer), so each one registers itself and the party counts as
// viewed until the last of them goes away.

const STORAGE_KEY = 'active_chat_context';
const viewers = new Map<string, number>();

function publish(partyId: string, active: boolean) {
  try {
    if (active) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ partyId, active: true }));
    } else {
      const current = sessionStorage.getItem(STORAGE_KEY);
      const parsed = current ? JSON.parse(current) as { partyId?: string } : null;
      if (!parsed || parsed.partyId === partyId) sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: 'ACTIVE_CHAT_CONTEXT', partyId, active });
    });
  }
}

/** One chat panel starts or stops showing `partyId` on a visible page. */
export function setChatViewing(partyId: string, viewing: boolean) {
  const before = viewers.get(partyId) ?? 0;
  const after = Math.max(0, before + (viewing ? 1 : -1));
  if (after === 0) viewers.delete(partyId);
  else viewers.set(partyId, after);
  if (before === 0 && after > 0) publish(partyId, true);
  if (before > 0 && after === 0) publish(partyId, false);
}
