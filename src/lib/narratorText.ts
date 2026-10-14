/** The part of a streamed reply the player should read: everything before the machine-readable ACTIONS line. */
export function visibleNarration(raw: string): string {
  const marker = raw.indexOf('ACTIONS:');
  return (marker === -1 ? raw : raw.slice(0, marker)).trimEnd();
}
