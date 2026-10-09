import { useState } from 'react';
import { CheckCircle, Info, Minus, Plus, Skull, XCircle, Zap } from 'lucide-react';
import type { EncounterCombatant } from '../../types/encounter';
import { DEATH_ROLL_REMINDER } from '../../lib/dragonbaneReference';
import { CONDITIONS, activeConditionLabels, type ConditionKey } from '../../lib/conditions';

export function ConditionChips({ combatant, canEdit, onToggle }: { combatant: EncounterCombatant; canEdit: boolean; onToggle: (key: ConditionKey) => void }) {
  const conditions = combatant.character?.conditions;
  if (!combatant.character) return null;
  const anyActive = activeConditionLabels(conditions).length > 0;
  // Players and the GM see what is active; only those who may edit see the rest as buttons to switch on.
  const visible = CONDITIONS.filter(({ key }) => canEdit || conditions?.[key]);
  if (visible.length === 0 && !anyActive) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label={`Conditions for ${combatant.display_name}`} onPointerDownCapture={(event) => event.stopPropagation()}>
      {visible.map(({ key, label, attribute }) => {
        const active = Boolean(conditions?.[key]);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            disabled={!canEdit}
            title={`${label}: bane on ${attribute} skills${canEdit ? (active ? ' (click to clear)' : ' (click to apply)') : ''}`}
            onClick={(event) => { event.stopPropagation(); if (canEdit) onToggle(key); }}
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${active ? 'border-rose-300 bg-rose-100 text-rose-800' : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-rose-200 hover:text-rose-700'} ${canEdit ? '' : 'cursor-default'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Pips({ count, tone }: { count: number; tone: 'success' | 'failure' }) {
  return (
    <span className="flex gap-1" aria-label={`${count} of 3`}>
      {[1, 2, 3].map((index) => (
        <span key={index} className={`h-3.5 w-3.5 rounded-full border ${index <= count ? (tone === 'success' ? 'border-green-700 bg-green-500' : 'border-red-800 bg-red-600') : 'border-stone-400 bg-white'}`} />
      ))}
    </span>
  );
}

interface DeathRollPanelProps {
  combatant: EncounterCombatant;
  canEdit: boolean;
  onChange: (changes: { passed?: number; failed?: number; rallied?: boolean }) => void;
  onStabilise: (hp: number) => void;
}

/** Shows how a downed player character is doing and lets the GM (or the player) record rolls made at the table. */
export function DeathRollPanel({ combatant, canEdit, onChange, onStabilise }: DeathRollPanelProps) {
  const [recovery, setRecovery] = useState('');
  const character = combatant.character;
  if (!character) return null;
  const passed = character.death_rolls_passed ?? 0;
  const failed = character.death_rolls_failed ?? 0;
  const rallied = Boolean(character.is_rallied);
  const attributes = typeof character.attributes === 'string' ? safeParse(character.attributes) : character.attributes;
  const con = attributes?.CON;
  const dead = failed >= 3;
  const stable = passed >= 3 && !dead;
  const recoveryHp = parseInt(recovery, 10);

  const adjust = (kind: 'passed' | 'failed', delta: number) => {
    const next = Math.max(0, Math.min(3, (kind === 'passed' ? passed : failed) + delta));
    onChange(kind === 'passed' ? { passed: next } : { failed: next });
  };

  return (
    <div role="presentation" className="mt-2 rounded-lg border border-red-200 bg-red-50/70 p-2 text-xs text-stone-700" onPointerDownCapture={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-bold uppercase tracking-wide text-red-800"><Skull size={12} /> {dead ? 'Dead' : stable ? 'Stabilised' : 'Death rolls'}</span>
        {con != null && !dead && !stable && <span className="flex items-center gap-1 text-[11px] text-stone-500"><Info size={11} /> D20 ≤ CON {con}</span>}
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {(['passed', 'failed'] as const).map((kind) => (
          <div key={kind} className="flex items-center justify-between gap-1">
            <span className={`flex items-center gap-1 font-semibold ${kind === 'passed' ? 'text-green-700' : 'text-red-700'}`}>
              {kind === 'passed' ? <CheckCircle size={12} /> : <XCircle size={12} />}
              <Pips count={kind === 'passed' ? passed : failed} tone={kind === 'passed' ? 'success' : 'failure'} />
            </span>
            {canEdit && (
              <span className="flex gap-1">
                <button type="button" aria-label={`Remove a ${kind === 'passed' ? 'success' : 'failure'}`} onClick={() => adjust(kind, -1)} className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-white hover:bg-stone-100"><Minus size={12} /></button>
                <button type="button" aria-label={`Add a ${kind === 'passed' ? 'success' : 'failure'}`} onClick={() => adjust(kind, 1)} className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-white hover:bg-stone-100"><Plus size={12} /></button>
              </span>
            )}
          </div>
        ))}
      </div>

      {!dead && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canEdit}
            aria-pressed={rallied}
            onClick={() => onChange({ rallied: !rallied })}
            title={canEdit ? 'Record whether a rally succeeded' : undefined}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${rallied ? 'border-yellow-400 bg-yellow-100 text-yellow-900' : 'border-stone-300 bg-white text-stone-500 hover:border-yellow-300'} ${canEdit ? '' : 'cursor-default'}`}
          >
            <Zap size={11} /> {rallied ? 'Rallied: can act' : 'Not rallied'}
          </button>
          {stable && canEdit && (
            <span className="flex items-center gap-1">
              <label className="text-[11px] text-stone-600" htmlFor={`recovery-${combatant.id}`}>Recovers D6 HP</label>
              <input id={`recovery-${combatant.id}`} type="number" min={1} max={6} value={recovery} onChange={(event) => setRecovery(event.target.value)} className="w-12 rounded border border-stone-300 px-1 py-0.5 text-center font-mono" />
              <button type="button" disabled={!(recoveryHp >= 1 && recoveryHp <= 6)} onClick={() => { onStabilise(recoveryHp); setRecovery(''); }} className="rounded bg-green-600 px-2 py-0.5 font-bold text-white disabled:opacity-40">Apply</button>
            </span>
          )}
        </div>
      )}
      {!dead && !stable && <p className="mt-1.5 text-[11px] leading-snug text-stone-500">{DEATH_ROLL_REMINDER}</p>}
    </div>
  );
}

function safeParse(value: string): Record<string, number> | undefined {
  try { return JSON.parse(value) as Record<string, number>; } catch { return undefined; }
}
