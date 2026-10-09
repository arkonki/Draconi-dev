import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ShieldCheck, Skull, Sword, Target, XCircle } from 'lucide-react';
import { Button } from '../shared/Button';
import { useDice } from '../dice/useDice';
import type { EncounterCombatant } from '../../types/encounter';
import type { DamageEntry } from '../../lib/api/encounters';
import { resolveDamage, resolveHp } from '../../lib/combatDamage';
import {
  CRITICAL_HIT_OPTIONS,
  MELEE_DEMON_TABLE,
  PARRY_REMINDER,
  RANGED_DEMON_TABLE,
} from '../../lib/dragonbaneReference';
import type { MonsterAttackTableDie } from '../../lib/monsterAttackTable';

export interface AttackContext {
  roll: number;
  tableDie: MonsterAttackTableDie;
  attackName: string;
  damage: number | null;
  damageFormula: string | null;
}

export interface AttackResolution {
  entries: DamageEntry[];
  /** A skill on the attacker's sheet to mark for advancement after a dragon or demon. */
  markSkill: string | null;
}

interface AttackResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  attacker: EncounterCombatant;
  targets: EncounterCombatant[];
  attackName?: string;
  attackContext?: AttackContext | null;
  /** The armor rating a target starts with (worn gear for players, the stat block for monsters). */
  armorFor: (target: EncounterCombatant) => number;
  isSaving?: boolean;
  onConfirm: (resolution: AttackResolution) => void;
}

interface TargetSettings { armor: string; parried: boolean }

const baseName = (name: string) => name.replace(/ \(Act \d+\)$/, '');

export function AttackResolutionModal({ isOpen, onClose, attacker, targets, attackName, attackContext, armorFor, isSaving = false, onConfirm }: AttackResolutionModalProps) {
  const { rollHistory } = useDice();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [damage, setDamage] = useState('');
  const [settings, setSettings] = useState<Record<string, TargetSettings>>({});
  const [special, setSpecial] = useState<'none' | 'dragon' | 'demon'>('none');
  const [demonKind, setDemonKind] = useState<'melee' | 'ranged'>('melee');
  const [pierce, setPierce] = useState(false);
  const [markSkill, setMarkSkill] = useState('');
  const damageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setSettings({});
    setSpecial('none');
    setPierce(false);
    setMarkSkill('');
    setDamage(attackContext?.damage != null ? String(attackContext.damage) : '');
    damageInputRef.current?.focus();
  }, [attackContext?.damage, isOpen]);

  const isAttackerMonster = Boolean(attacker.monster_id);

  const uniqueTargets = useMemo(() => {
    const seen = new Set<string>();
    return targets.filter((target) => {
      if (!target.monster_id) return true;
      const key = `${target.monster_id}:${baseName(target.display_name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [targets]);

  const sortedTargets = useMemo(() => [...uniqueTargets].sort((a, b) => {
    const aIsMonster = Boolean(a.monster_id);
    const bIsMonster = Boolean(b.monster_id);
    if (aIsMonster === bIsMonster) return 0;
    return isAttackerMonster ? (aIsMonster ? 1 : -1) : (aIsMonster ? -1 : 1);
  }), [uniqueTargets, isAttackerMonster]);

  const settingsFor = (target: EncounterCombatant): TargetSettings => settings[target.id] ?? { armor: String(armorFor(target)), parried: false };
  const updateSettings = (target: EncounterCombatant, patch: Partial<TargetSettings>) => (
    setSettings((previous) => ({ ...previous, [target.id]: { ...settingsFor(target), ...patch } }))
  );

  const parsedDamage = damage.trim() === '' ? NaN : parseInt(damage, 10);
  const hasDamage = Number.isInteger(parsedDamage) && parsedDamage !== 0;
  const attackerSkills = attacker.character?.skill_levels ? Object.keys(attacker.character.skill_levels).sort() : [];
  const canMarkSkill = special !== 'none' && attackerSkills.length > 0;
  const recentRolls = rollHistory.slice(0, 3);

  const submit = () => {
    if (!hasDamage || selectedIds.length === 0) return;
    const entries: DamageEntry[] = sortedTargets
      .filter((target) => selectedIds.includes(target.id))
      .map((target) => {
        const own = settingsFor(target);
        return {
          combatant_id: target.id,
          damage: parsedDamage,
          armor: Math.max(0, parseInt(own.armor, 10) || 0),
          ignore_armor: pierce,
          parried: own.parried,
        };
      });
    onConfirm({ entries, markSkill: canMarkSkill && markSkill ? markSkill : null });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold font-serif flex items-center gap-2"><Sword className="w-5 h-5 text-red-400" /> Resolve Action</h3>
            <p className="text-xs text-stone-400">{attacker.display_name} is acting{attackName ? ` using ${attackName}` : ''}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24} /></button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 bg-stone-50 space-y-4">
          {attackContext ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              <div className="font-semibold">Attack table roll: {attackContext.roll} on {attackContext.tableDie.toUpperCase()} ({attackContext.attackName})</div>
              <div className="text-xs text-orange-700">
                {attackContext.damageFormula
                  ? `Last damage roll ${attackContext.damageFormula}${attackContext.damage != null ? ` = ${attackContext.damage}` : ''}`
                  : 'No damage roll captured yet. Roll from the active action text or enter damage manually.'}
              </div>
            </div>
          ) : null}

          {recentRolls.length > 0 && (
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <div className="text-xs font-bold uppercase text-stone-500 mb-2">Recent dice rolls</div>
              <div className="space-y-1.5">
                {recentRolls.map((entry) => {
                  const total = typeof entry.finalOutcome === 'number' ? entry.finalOutcome : entry.results.reduce((sum, result) => sum + result.value, 0);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setDamage(String(total))}
                      className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${damage !== '' && Number(damage) === total ? 'border-red-300 bg-red-50' : 'border-stone-100 bg-stone-50 hover:border-red-200 hover:bg-red-50/60'}`}
                    >
                      <div className="text-xs font-semibold text-stone-700">{entry.description || 'Dice Roll'}</div>
                      <div className="text-[11px] text-stone-500">{entry.dicePool.join(' + ')} = <span className="font-bold text-stone-800">{total}</span></div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-stone-500">Tap a roll to use it as the damage amount.</div>
            </div>
          )}

          <div>
            <label htmlFor="damage-amount" className="text-xs font-bold text-stone-500 uppercase mb-2 block">Damage rolled</label>
            <input
              id="damage-amount"
              ref={damageInputRef}
              type="number"
              placeholder="0"
              className="w-full p-3 text-lg font-bold border rounded shadow-sm focus:ring-2 focus:ring-red-500 outline-none"
              value={damage}
              onChange={(event) => setDamage(event.target.value)}
            />
            <p className="text-xs text-stone-400 mt-1">Before armor. Enter a negative number to heal.</p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-stone-500 uppercase mb-2 flex items-center gap-1"><Target size={12} /> Targets <span className="font-normal normal-case text-stone-400">({selectedIds.length} selected)</span></h4>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sortedTargets.map((target) => {
                const isFoe = isAttackerMonster !== Boolean(target.monster_id);
                const isDead = Boolean(target.monster_id) && target.current_hp === 0;
                const isSelected = selectedIds.includes(target.id);
                const own = settingsFor(target);
                const result = resolveDamage({ raw: hasDamage ? parsedDamage : 0, armor: parseInt(own.armor, 10) || 0, ignoreArmor: pierce, parried: own.parried });
                const outcome = resolveHp(target.current_hp, target.max_hp, result, !target.monster_id);
                const displayName = target.monster_id ? baseName(target.display_name) : target.display_name;
                return (
                  <div key={target.id} className={`rounded border bg-white ${isSelected ? 'ring-2 ring-red-500 border-red-500' : 'border-stone-200'} ${isDead ? 'opacity-50 grayscale' : ''}`}>
                    <button
                      type="button"
                      disabled={isDead}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedIds((previous) => (previous.includes(target.id) ? previous.filter((id) => id !== target.id) : [...previous, target.id]))}
                      className="w-full p-3 flex justify-between items-center text-left"
                    >
                      <div>
                        <span className={`font-bold ${isFoe ? 'text-red-700' : 'text-blue-700'}`}>{displayName}</span>
                        <div className="text-xs text-stone-500">{isFoe ? 'Enemy' : 'Ally'} • HP {target.current_hp}/{target.max_hp}</div>
                      </div>
                      {isSelected && <Check className="text-red-600 w-5 h-5" />}
                    </button>
                    {isSelected && (
                      <div className="border-t border-stone-100 px-3 py-2 space-y-2 bg-stone-50/60">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                          <label className="flex items-center gap-1.5">
                            Armor
                            <input
                              type="number"
                              min={0}
                              aria-label={`Armor for ${displayName}`}
                              className="w-14 rounded border border-stone-300 px-1.5 py-1 text-center font-mono"
                              value={own.armor}
                              disabled={pierce}
                              onChange={(event) => updateSettings(target, { armor: event.target.value })}
                            />
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={own.parried} onChange={(event) => updateSettings(target, { parried: event.target.checked })} />
                            <ShieldCheck size={13} /> Parried
                          </label>
                        </div>
                        {hasDamage && (
                          <p className={`text-xs font-medium ${outcome.instantDeath ? 'text-red-700' : 'text-stone-600'}`}>
                            {parsedDamage < 0
                              ? `Heals ${result.healing}: HP ${target.current_hp} → ${outcome.hpAfter}`
                              : own.parried
                                ? 'Parried: no damage.'
                                : `${parsedDamage} damage${result.absorbed ? `, armor stops ${result.absorbed}` : ''} → takes ${result.dealt}. HP ${target.current_hp} → ${outcome.hpAfter}`}
                            {outcome.instantDeath && <strong className="ml-1 inline-flex items-center gap-1"><Skull size={12} /> Instant death</strong>}
                            {!outcome.instantDeath && outcome.dying && <strong className="ml-1">Goes down: death rolls begin.</strong>}
                            {Boolean(target.monster_id) && outcome.hpAfter === 0 && target.current_hp > 0 && <strong className="ml-1">Defeated.</strong>}
                          </p>
                        )}
                        {own.parried && <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1">{PARRY_REMINDER}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="flex gap-2">
              <button type="button" aria-pressed={special === 'dragon'} onClick={() => setSpecial(special === 'dragon' ? 'none' : 'dragon')} className={`flex-1 rounded border px-3 py-1.5 text-sm font-semibold ${special === 'dragon' ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>Dragon (critical)</button>
              <button type="button" aria-pressed={special === 'demon'} onClick={() => setSpecial(special === 'demon' ? 'none' : 'demon')} className={`flex-1 rounded border px-3 py-1.5 text-sm font-semibold ${special === 'demon' ? 'border-purple-500 bg-purple-100 text-purple-900' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>Demon (fumble)</button>
            </div>

            {special === 'dragon' && (
              <div className="mt-3 space-y-2 text-xs text-stone-700">
                <p className="font-semibold">Choose one:</p>
                <ul className="space-y-1.5">
                  {CRITICAL_HIT_OPTIONS.map((option) => (
                    <li key={option.id} className="rounded bg-amber-50 px-2 py-1.5">
                      <strong>{option.label}.</strong> {option.detail}
                      {option.id === 'pierce' && (
                        <label className="mt-1 flex items-center gap-1.5"><input type="checkbox" checked={pierce} onChange={(event) => setPierce(event.target.checked)} /> Ignore armor for this hit</label>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {special === 'demon' && (
              <div className="mt-3 space-y-2 text-xs text-stone-700">
                <div className="flex gap-2">
                  {(['melee', 'ranged'] as const).map((kind) => (
                    <button key={kind} type="button" onClick={() => setDemonKind(kind)} className={`rounded border px-2 py-1 font-semibold capitalize ${demonKind === kind ? 'border-purple-500 bg-purple-100 text-purple-900' : 'border-stone-200 text-stone-600'}`}>{kind}</button>
                  ))}
                  <span className="self-center text-stone-500">Roll a D6:</span>
                </div>
                <ol className="space-y-1">
                  {(demonKind === 'melee' ? MELEE_DEMON_TABLE : RANGED_DEMON_TABLE).map((effect, index) => (
                    <li key={effect} className="flex gap-2 rounded bg-purple-50 px-2 py-1"><span className="font-bold">{index + 1}</span><span>{effect}</span></li>
                  ))}
                </ol>
              </div>
            )}

            {canMarkSkill && (
              <label className="mt-3 block text-xs text-stone-600">
                Mark a skill for advancement (a dragon or demon on a skill roll earns a mark)
                <select value={markSkill} onChange={(event) => setMarkSkill(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm">
                  <option value="">Don't mark a skill</option>
                  {attackerSkills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="danger" icon={Sword} loading={isSaving} disabled={selectedIds.length === 0 || !hasDamage} onClick={submit}>
            Apply to {selectedIds.length || 0}
          </Button>
        </div>
      </div>
    </div>
  );
}
