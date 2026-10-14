import { useState } from 'react';
import { Heart, X } from 'lucide-react';
import { conditionBadge, hpColor, hpFraction, type TokenStatus } from '../../lib/tableStatus';
import { CHARACTER_CONDITIONS, MONSTER_CONDITIONS } from '../../lib/tableQuickStatus';
import type { TableItem } from '../../types/virtualTable';

interface TokenQuickPanelProps {
  item: TableItem;
  status: TokenStatus | null;
  /** True when a hit-point change can be made: the creature is in the running fight, or is a character. */
  canChangeHp: boolean;
  /** True when conditions can be set: the same cases as hit points. */
  canChangeConditions: boolean;
  busy: boolean;
  onChangeHp: (delta: number) => void;
  onToggleCondition: (name: string) => void;
  onClose: () => void;
}

/** A small card for the GM: hurt or heal the selected token and set its conditions without leaving the table. */
export function TokenQuickPanel({ item, status, canChangeHp, canChangeConditions, busy, onChangeHp, onToggleCondition, onClose }: TokenQuickPanelProps) {
  const [amount, setAmount] = useState('');
  const names = item.character_id ? CHARACTER_CONDITIONS : MONSTER_CONDITIONS;
  const active = new Set((status?.conditions ?? []).map((name) => name.toLowerCase()));
  const typed = Math.max(0, Math.min(1000, Math.floor(Number(amount) || 0)));
  const fraction = status ? hpFraction(status) : 0;

  const change = (delta: number) => { if (delta !== 0) onChangeHp(delta); };

  return (
    <section aria-label={`Quick changes for ${item.label}`} className="w-64 rounded-xl border border-stone-300 bg-white p-3 text-sm shadow-xl" onPointerDown={(event) => event.stopPropagation()}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate font-bold text-stone-900">{item.label}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X size={16} /></button>
      </div>

      {status ? (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-xs text-stone-600">
            <span className="flex items-center gap-1"><Heart size={12} /> Hit points</span>
            <span className="font-mono font-bold text-stone-900">{status.hp} / {status.maxHp}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full" style={{ width: `${fraction * 100}%`, backgroundColor: hpColor(fraction) }} /></div>
        </div>
      ) : (
        <p className="mb-2 text-xs text-stone-500">Hit points are not known for this token.</p>
      )}

      {canChangeHp ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1">
            {[-5, -1, 1, 5].map((delta) => (
              <button key={delta} type="button" disabled={busy} onClick={() => change(delta)}
                className={`rounded-md border py-1 font-semibold disabled:opacity-50 ${delta < 0 ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <input type="number" min={0} max={1000} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount" placeholder="Amount"
              className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1" />
            <button type="button" disabled={busy || typed === 0} onClick={() => { change(-typed); setAmount(''); }} className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50">Hurt</button>
            <button type="button" disabled={busy || typed === 0} onClick={() => { change(typed); setAmount(''); }} className="rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Heal</button>
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-stone-100 p-2 text-xs text-stone-600">This creature is not in the running fight. Add it to the encounter to change its hit points here.</p>
      )}

      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Conditions</p>
        <div className="flex flex-wrap gap-1">
          {names.map((name) => {
            const on = active.has(name.toLowerCase());
            return (
              <button key={name} type="button" aria-pressed={on} disabled={busy || !canChangeConditions} onClick={() => onToggleCondition(name)}
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize disabled:opacity-50 ${on ? 'border-purple-700 bg-purple-700 text-white' : 'border-stone-300 text-stone-700 hover:bg-stone-100'}`}
                title={name}>
                <span className="mr-1 opacity-70">{conditionBadge(name)}</span>{name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
