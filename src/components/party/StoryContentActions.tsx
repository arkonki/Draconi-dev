import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Plus, Skull } from 'lucide-react';
import { Button } from '../shared/Button';
import { parseStoryItems } from '../../lib/storyItems';
import { parseStoryMonsters } from '../../lib/storyMonsters';
import { addItemsToPartyStash } from '../../lib/api/partyStash';
import { createCampaignMonster } from '../../lib/api/monsters';
import { queryKeys } from '../../lib/queryKeys';

interface Entry {
  key: string;
  label: string;
  run: () => Promise<void>;
}

/** One row of buttons: each puts one entry where it belongs, and "Add all" does the rest at once. */
function ActionRow({ icon: Icon, title, entries, tone }: { icon: typeof KeyRound; title: string; entries: Entry[]; tone: 'amber' | 'teal' }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (entries.length === 0) return null;

  const run = async (busyKey: string, chosen: Entry[]) => {
    setBusy(busyKey);
    setError(null);
    try {
      for (const entry of chosen) {
        await entry.run();
        setDone((current) => new Set([...current, entry.key]));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save it.');
    } finally {
      setBusy(null);
    }
  };

  const colors = tone === 'amber'
    ? { row: 'border-amber-100 bg-amber-50', title: 'text-amber-800', chip: 'border-amber-200 text-amber-900 hover:bg-amber-100' }
    : { row: 'border-teal-100 bg-teal-50', title: 'text-teal-800', chip: 'border-teal-200 text-teal-900 hover:bg-teal-100' };
  const remaining = entries.filter((entry) => !done.has(entry.key));
  return (
    <div className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs ${colors.row}`}>
      <span className={`flex items-center gap-1 font-bold uppercase ${colors.title}`}><Icon size={12} /> {title}</span>
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          disabled={busy !== null || done.has(entry.key)}
          onClick={() => void run(entry.key, [entry])}
          title={done.has(entry.key) ? 'Saved' : `Save ${entry.label}`}
          className={`flex items-center gap-1 rounded border bg-white px-2 py-1 font-medium disabled:opacity-60 ${colors.chip}`}
        >
          {done.has(entry.key) ? <Check size={12} /> : <Plus size={12} />} {entry.label}
        </button>
      ))}
      {entries.length > 1 && (
        <Button size="sm" variant="secondary" icon={Plus} loading={busy === 'all'} disabled={busy !== null || remaining.length === 0} onClick={() => void run('all', remaining)}>
          Add all
        </Button>
      )}
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </div>
  );
}

/**
 * What a Story Helper answer can be turned into: its item blocks go to the party stash, its monster and NPC blocks to
 * the campaign's own bestiary, where the encounter view can bring them into a fight.
 */
export function StoryContentActions({ partyId, markdown }: { partyId: string; markdown: string }) {
  const queryClient = useQueryClient();
  const items = useMemo(() => parseStoryItems(markdown), [markdown]);
  const monsters = useMemo(() => parseStoryMonsters(markdown), [markdown]);

  const itemEntries = items.map((item, index): Entry => ({
    key: `item-${index}-${item.name}`,
    label: item.name,
    run: () => addItemsToPartyStash(partyId, [{ ...item, quantity: 1 }]),
  }));
  const monsterEntries = monsters.map((monster, index): Entry => ({
    key: `monster-${index}-${monster.name}`,
    label: `${monster.name}${monster.stats.IS_NPC ? ' (NPC)' : ''}`,
    run: async () => {
      await createCampaignMonster(partyId, monster);
      await queryClient.invalidateQueries({ queryKey: queryKeys.monsters });
    },
  }));

  return (
    <>
      <ActionRow icon={KeyRound} title="Party stash" entries={itemEntries} tone="amber" />
      <ActionRow icon={Skull} title="Campaign bestiary" entries={monsterEntries} tone="teal" />
    </>
  );
}
