export function canWritePartyNotes(role, isAdmin = false) {
  return isAdmin || ['owner', 'gm', 'player'].includes(role);
}

export function canEditNote(note, { userId, campaignRole, isAdmin = false }) {
  if (isAdmin) return true;
  if (!note.party_id) return Boolean(userId && note.user_id === userId);
  return canWritePartyNotes(campaignRole)
    && (note.user_id === userId || ['owner', 'gm'].includes(campaignRole));
}
