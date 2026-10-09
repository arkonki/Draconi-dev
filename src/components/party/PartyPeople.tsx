import { Eye, Shield, Swords, UserCog } from 'lucide-react';
import type { CampaignMembership, CampaignRole, Party } from '../../lib/api/parties';

const ROLE_LABEL: Record<CampaignRole, { label: string; className: string; icon: typeof Shield }> = {
  owner: { label: 'Owner', className: 'bg-indigo-100 text-indigo-700', icon: Shield },
  gm: { label: 'GM', className: 'bg-amber-100 text-amber-800', icon: UserCog },
  player: { label: 'Player', className: 'bg-emerald-100 text-emerald-800', icon: Swords },
  observer: { label: 'Observer', className: 'bg-gray-100 text-gray-700', icon: Eye },
};

const ROLE_ORDER: CampaignRole[] = ['owner', 'gm', 'player', 'observer'];

function personName(member: CampaignMembership) {
  const profile = member.users;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return profile?.username || fullName || 'Campaign member';
}

/** Who is in the campaign and in what role, visible to everyone in it. */
export function PartyPeople({ party, currentUserId }: { party: Party; currentUserId?: string }) {
  const people = [...party.campaign_memberships].sort(
    (left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role) || personName(left).localeCompare(personName(right)),
  );
  if (people.length === 0) return null;

  return (
    <section aria-labelledby="party-people-heading" className="mt-8">
      <h2 id="party-people-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">People</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((member) => {
          const role = ROLE_LABEL[member.role];
          const characters = party.members.filter((character) => character.user_id === member.user_id);
          return (
            <li key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {personName(member)}{member.user_id === currentUserId ? <span className="font-normal text-gray-500"> (you)</span> : null}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {characters.length > 0 ? characters.map((character) => character.name).join(', ') : 'No characters in the party'}
                </p>
              </div>
              <span className={`inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${role.className}`}>
                <role.icon className="h-3 w-3" /> {role.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
