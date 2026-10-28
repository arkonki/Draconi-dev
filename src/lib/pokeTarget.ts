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
