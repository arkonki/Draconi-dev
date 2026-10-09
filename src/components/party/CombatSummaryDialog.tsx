import { useState } from 'react';
import { Flag, Skull, Swords } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import type { CombatSummary } from '../../lib/combatSummary';

interface CombatSummaryDialogProps {
  isOpen: boolean;
  summary: CombatSummary;
  isSaving: boolean;
  onClose: () => void;
  onFinish: (clearConditions: boolean) => void;
}

const list = (names: string[]) => (names.length ? names.join(', ') : 'none');

/** Shown when the GM ends an encounter: the numbers from the fight, and a chance to tidy up. */
export function CombatSummaryDialog({ isOpen, summary, isSaving, onClose, onFinish }: CombatSummaryDialogProps) {
  const [clearConditions, setClearConditions] = useState(false);

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      title="End this encounter?"
      description={`${summary.rounds} round${summary.rounds === 1 ? '' : 's'} fought.`}
      icon={<div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100"><Flag className="h-6 w-6 text-stone-700" /></div>}
      size="md"
      closeDisabled={isSaving}
      footer={(
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Keep fighting</Button>
          <Button variant="primary" onClick={() => onFinish(clearConditions)} loading={isSaving}>End encounter</Button>
        </div>
      )}
    >
      <div className="space-y-4 text-sm text-stone-700">
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-stone-200 p-2"><dt className="text-xs text-stone-500">Damage to enemies</dt><dd className="text-lg font-bold">{summary.damageToMonsters}</dd></div>
          <div className="rounded-lg border border-stone-200 p-2"><dt className="text-xs text-stone-500">Damage to the party</dt><dd className="text-lg font-bold">{summary.damageToPlayers}</dd></div>
          <div className="rounded-lg border border-stone-200 p-2"><dt className="text-xs text-stone-500">Stopped by armor</dt><dd className="text-lg font-bold">{summary.armorAbsorbed}</dd></div>
          <div className="rounded-lg border border-stone-200 p-2"><dt className="text-xs text-stone-500">Parries</dt><dd className="text-lg font-bold">{summary.parries}</dd></div>
        </dl>

        <ul className="space-y-1.5">
          <li className="flex gap-2"><Swords className="mt-0.5 h-4 w-4 flex-none text-stone-500" /><span><strong>Defeated:</strong> {list(summary.defeated)}</span></li>
          <li className="flex gap-2"><Skull className="mt-0.5 h-4 w-4 flex-none text-stone-500" /><span><strong>Went down:</strong> {list(summary.wentDown)}{summary.died.length ? ` (died outright: ${summary.died.join(', ')})` : ''}</span></li>
        </ul>

        {summary.stillDown.length > 0 && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
            Still at 0 HP: <strong>{summary.stillDown.join(', ')}</strong>. Their death rolls stay on the character sheet after the fight.
          </p>
        )}

        <div>
          <h4 className="mb-1 text-xs font-bold uppercase text-stone-500">Party hit points</h4>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {summary.playerHp.map((player) => (
              <li key={player.name} className="flex justify-between"><span className="truncate">{player.name}</span><span className="font-mono">{player.current}/{player.max}</span></li>
            ))}
          </ul>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
          <input type="checkbox" className="mt-0.5" checked={clearConditions} onChange={(event) => setClearConditions(event.target.checked)} />
          <span>Clear all conditions (Dazed, Scared and so on) on the player characters</span>
        </label>
      </div>
    </AccessibleDialog>
  );
}
