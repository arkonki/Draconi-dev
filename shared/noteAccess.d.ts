export function canWritePartyNotes(role?: string | null, isAdmin?: boolean): boolean;
export function canEditNote(note: { user_id: string; party_id?: string | null }, access: { userId?: string; campaignRole?: string | null; isAdmin?: boolean }): boolean;
