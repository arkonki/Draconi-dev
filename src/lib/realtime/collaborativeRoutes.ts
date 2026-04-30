export function getCollaborativeScope(pathname: string): string | null {
  if (/^\/party\/[^/]+$/.test(pathname)) {
    const partyId = pathname.split('/')[2];
    return partyId ? `party:${partyId}` : null;
  }

  return null;
}

export function isLiveCollaborativePath(pathname: string): boolean {
  return getCollaborativeScope(pathname) !== null || /^\/(?:d|display)\/[^/]+$/.test(pathname);
}
