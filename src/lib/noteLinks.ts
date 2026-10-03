import { getAppPath } from './appUrl';

export function getNotePath(noteId: string, partyId?: string | null) {
  const path = partyId ? `/party/${encodeURIComponent(partyId)}` : '/notes';
  return `${path}?${new URLSearchParams({ noteId })}`;
}

// Recognize both current links and links copied before the route was corrected.
export function parseNoteLink(href: string): { noteId: string; partyId?: string } | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const base = getAppPath();
    const path = base === '/' ? url.pathname : `/${url.pathname.slice(base.length)}`;
    if (base !== '/' && !url.pathname.startsWith(base)) return null;
    const noteId = url.searchParams.get('noteId');
    if (!noteId) return null;
    const party = path.match(/^\/(?:party|adventure-party)\/([^/]+)\/?$/);
    if (party) return { noteId, partyId: decodeURIComponent(party[1]) };
    return /^\/notes\/?$/.test(path) ? { noteId } : null;
  } catch { return null; }
}
