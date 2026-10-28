import type { Character } from '../types/character';
import type { CampaignMembership } from './api/parties';

/**
 * Who "/poke @name" means: a character's name or a campaign member's username or full name, so a GM without a
 * character can be poked too. The leading "@" is optional. An exact name wins over one that only starts with it,
 * and that over one that only contains it.
 */
export function findPokeTarget(typed: string, members: Character[], campaignMembers: CampaignMembership[]): { userId: string; name: string } | null {
  const wanted = typed.replace(/^@/, '').trim().toLowerCase();
  if (!wanted) return null;
  const candidates = [
    ...members.filter((member) => member.user_id).map((member) => ({ userId: member.user_id as string, names: [member.name] })),
    ...campaignMembers.filter((member) => member.user_id).map((member) => ({
      userId: member.user_id,
      names: [member.users?.username, [member.users?.first_name, member.users?.last_name].filter(Boolean).join(' ')],
    })),
  ].flatMap(({ userId, names }) => names.filter((name): name is string => Boolean(name?.trim())).map((name) => ({ userId, name })));
  const match = candidates.find((c) => c.name.toLowerCase() === wanted)
    || candidates.find((c) => c.name.toLowerCase().startsWith(wanted))
    || candidates.find((c) => c.name.toLowerCase().includes(wanted));
  return match ?? null;
}

export interface PokeOption {
  userId: string;
  /** The character name when they have one in the party, otherwise their own name. */
  label: string;
  /** Their own name and role, shown under the label. */
  detail: string;
}

const ROLE_LABELS: Record<string, string> = { owner: 'GM', gm: 'GM', player: 'Player', observer: 'Observer' };

/** Everyone in the campaign the viewer can poke, one entry per person, by character name where they have one. */
export function pokeOptions(members: Character[], campaignMembers: CampaignMembership[], selfId: string | undefined): PokeOption[] {
  const people = new Map<string, PokeOption>();
  for (const member of campaignMembers) {
    if (!member.user_id || member.user_id === selfId) continue;
    const fullName = [member.users?.first_name, member.users?.last_name].filter(Boolean).join(' ').trim();
    const ownName = fullName || member.users?.username || 'Member';
    const characters = members.filter((character) => character.user_id === member.user_id).map((character) => character.name);
    people.set(member.user_id, {
      userId: member.user_id,
      label: characters.length ? characters.join(', ') : ownName,
      detail: [characters.length ? ownName : '', ROLE_LABELS[member.role] ?? ''].filter(Boolean).join(' · '),
    });
  }
  // Players whose membership row has not loaded yet still show up by their character.
  for (const character of members) {
    if (!character.user_id || character.user_id === selfId || people.has(character.user_id)) continue;
    people.set(character.user_id, { userId: character.user_id, label: character.name, detail: 'Player' });
  }
  return [...people.values()].sort((left, right) => left.label.localeCompare(right.label));
}
