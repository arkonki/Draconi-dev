import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PlusCircle, XCircle } from 'lucide-react';
import { Button } from '../shared/Button';
import { MonsterForm } from '../admin/Forms/MonsterForm';
import { createCampaignMonster } from '../../lib/api/monsters';
import { queryKeys } from '../../lib/queryKeys';
import type { MonsterData } from '../../types/bestiary';

interface CustomMonsterModalProps {
  partyId: string;
  /** Start as an NPC rather than a monster. The GM can still switch it in the form. */
  asNpc: boolean;
  onClose: () => void;
  /** Called with the saved monster, how many to add, and an optional name for them in the fight. */
  onCreated: (monster: MonsterData, count: number, customName: string) => void;
}

/**
 * Makes a monster or NPC for this campaign from the encounter view. It is saved to the campaign's own bestiary, so it
 * can join later fights too, and no other campaign sees it.
 */
export function CustomMonsterModal({ partyId, asNpc, onClose, onCreated }: CustomMonsterModalProps) {
  const queryClient = useQueryClient();
  const [initial] = useState<MonsterData>(() => ({
    name: '',
    category: asNpc ? 'NPC' : '',
    stats: { FEROCITY: 1, SIZE: 'Normal', MOVEMENT: 10, ARMOR: 0, HP: 10, WP: 0, IS_NPC: asNpc },
    attacks: [],
    effectsSummary: '',
  }));
  const [draft, setDraft] = useState<MonsterData>(initial);
  const [count, setCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Give it a name first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createCampaignMonster(partyId, draft);
      await queryClient.invalidateQueries({ queryKey: queryKeys.monsters });
      onCreated(created, count, '');
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save it.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="custom-monster-title" className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-50 flex justify-between items-center">
          <div>
            <h3 id="custom-monster-title" className="text-xl font-bold font-serif text-stone-800">{asNpc ? 'Custom NPC' : 'Custom monster'}</h3>
            <p className="text-xs text-stone-500">Saved to this campaign's bestiary only. No other campaign sees it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-stone-600"><XCircle size={24} /></button>
        </div>
        <div className="flex-grow overflow-y-auto p-4">
          <MonsterForm entry={initial} onChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))} />
        </div>
        <div className="border-t bg-white p-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="custom-monster-count" className="text-[10px] font-bold text-stone-500 uppercase">Add to fight</label>
            <input id="custom-monster-count" type="number" min="0" className="block w-24 p-1.5 border rounded text-sm" value={count} onChange={(e) => setCount(Math.max(0, parseInt(e.target.value) || 0))} />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button icon={PlusCircle} loading={saving} disabled={saving} onClick={() => void save()}>{count > 0 ? 'Save & add to fight' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
