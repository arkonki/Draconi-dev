// The pieces the encounter view is built from: monster details, the combat log, the modals and the combatant cards.

import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../shared/Button';
import { TextWithDice } from '../shared/TextWithDice';
import { RandomTableManager } from '../tools/RandomTableManager';
import {
  PlusCircle,
  Trash2,
  XCircle,
  Heart,
  Zap,
  Dice6,
  ArrowUpDown,
  RotateCcw,
  ShieldAlert,
  Skull,
  Dices,
  Search,
  User,
  Sword,
  Crosshair,
  Link as LinkIcon,
  Hourglass,
  AlertCircle,
} from 'lucide-react';
import { useDice } from '../dice/useDice';
import type { EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';
import { FEAR_STATUS_EFFECT, hasEncounterStatusEffect, POISONED_STATUS_EFFECT } from '../../lib/encounterStatusEffects';
import { initiativeSlotsFor, usesArmyOfOne } from '../../lib/initiativeSlots';
import { ConditionChips, DeathRollPanel } from './CombatantStatus';
import { type ConditionKey } from '../../lib/conditions';

import {
  FEAR_ATTACK_QUICK_INFO,
  FEAR_EFFECT_ROWS,
  generateDeck,
  hasRollableMonsterAttacks,
  getDefaultMonsterAttack,
  NPC_STRUCTURED_HIDDEN_KEYS,
  getMonsterDamageBonusLabel,
  getMonsterSkillEntries,
  getMonsterHeroicAbilityEntries,
  getMonsterGearDamageFormula,
  buildMonsterGearDamageRoll,
  getEffectiveMonsterWp,
  getEquippedArmorValue,
  createMonsterGearAttackDescription,
} from './partyEncounterShared';
import type {
  MonsterStats,
  MonsterAttack,
  MonsterData,
  MonsterGearItem,
  EditableCombatantStats,
  AttackDescriptionRendererProps,
  CombatLogEntry,
  InitiativeUpdate,
} from './partyEncounterShared';

// --- SUB-COMPONENTS ---
export const StatsTableView = ({ stats, hiddenKeys = [] }: { stats: object; hiddenKeys?: string[] }) => (
  <div className="grid grid-cols-3 gap-2 text-xs">
    {Object.entries(stats)
      .filter(([key, value]) =>
        key !== 'IS_NPC'
        && !hiddenKeys.includes(key)
        && value !== ''
        && value !== null
        && value !== undefined
      )
      .map(([key, value]) => (
      <div key={key} className="bg-white/50 p-1 rounded border border-stone-200 flex flex-col items-center">
        <span className="font-bold text-stone-500 uppercase text-[10px] truncate w-full text-center" title={key}>{key.replace(/_/g, ' ')}</span>
        <span className="font-mono font-bold text-stone-800">{String(value)}</span>
      </div>
    ))}
  </div>
);

export const MonsterNpcDetails = ({
  stats,
  onRollSkill,
}: {
  stats?: MonsterStats;
  onRollSkill?: (skill: { skill_id: string; name: string; level: number; attribute?: string | null }) => void;
}) => {
  if (!stats?.IS_NPC) {
    return null;
  }

  const skills = getMonsterSkillEntries(stats);
  const damageBonus = getMonsterDamageBonusLabel(stats);
  const hasDamageBonus = Boolean(damageBonus);
  const hasGearNotes = Boolean(stats.GEAR && stats.GEAR.trim().length > 0);

  if (!hasDamageBonus && !hasGearNotes && skills.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hasDamageBonus ? (
          <div className="bg-stone-50 p-3 rounded border border-stone-200 text-sm">
            <span className="text-xs font-bold text-stone-500 uppercase block mb-1">Damage Bonus</span>
            <div className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-sm font-semibold text-red-700">
              {damageBonus}
            </div>
            <div className="mt-2 text-[11px] text-stone-500">
              Applied automatically when equipped gear uses the same attribute.
            </div>
          </div>
        ) : null}
      </div>

      {skills.length > 0 ? (
        <div className="bg-stone-50 p-3 rounded border border-stone-200 text-sm">
          <span className="text-xs font-bold text-stone-500 uppercase block mb-2">Skills</span>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              onRollSkill ? (
                <button
                  key={skill.skill_id}
                  type="button"
                  onClick={() => onRollSkill(skill)}
                  className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                  title={`Roll ${skill.name} ${skill.level}`}
                >
                  <div className="font-semibold text-stone-900">{skill.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-700">Lvl {skill.level}</span>
                    {skill.attribute ? <span>{skill.attribute}</span> : null}
                  </div>
                </button>
              ) : (
                <div key={skill.skill_id} className="rounded border border-stone-200 bg-white px-2.5 py-1.5">
                  <div className="font-semibold text-stone-900">{skill.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-700">Lvl {skill.level}</span>
                    {skill.attribute ? <span>{skill.attribute}</span> : null}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      ) : null}

      {hasGearNotes ? (
        <div className="bg-stone-50 p-3 rounded border border-stone-200 text-sm">
          <span className="text-xs font-bold text-stone-500 uppercase block mb-1">Gear Notes</span>
          <div className="whitespace-pre-wrap text-stone-800 leading-relaxed">{stats.GEAR}</div>
        </div>
      ) : null}
    </div>
  );
};

export const MonsterEquippedGear = ({
  gearItems,
  stats,
  currentWp,
  onUseAttack,
  onUseHeroicAbility,
}: {
  gearItems?: MonsterGearItem[];
  stats?: MonsterStats;
  currentWp?: number | null;
  onUseAttack?: (gearItem: MonsterGearItem, result?: { total: number | null; formula: string }) => void;
  onUseHeroicAbility?: (ability: { ability_id: string; name: string; description?: string; willpower_cost?: number | null }) => void;
}) => {
  const heroicAbilities = getMonsterHeroicAbilityEntries(stats);
  const armorValue = getEquippedArmorValue(gearItems, stats);
  const [activeTooltip, setActiveTooltip] = useState<{
    key: string;
    text: string;
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  useEffect(() => {
    const closeTooltipOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-npc-info-tooltip="true"]')) {
        setActiveTooltip(null);
      }
    };

    const closeTooltipOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveTooltip(null);
      }
    };

    const closeTooltipOnScroll = () => setActiveTooltip(null);

    document.addEventListener('pointerdown', closeTooltipOnOutsideClick);
    document.addEventListener('keydown', closeTooltipOnEscape);
    window.addEventListener('scroll', closeTooltipOnScroll, true);
    window.addEventListener('resize', closeTooltipOnScroll);

    return () => {
      document.removeEventListener('pointerdown', closeTooltipOnOutsideClick);
      document.removeEventListener('keydown', closeTooltipOnEscape);
      window.removeEventListener('scroll', closeTooltipOnScroll, true);
      window.removeEventListener('resize', closeTooltipOnScroll);
    };
  }, []);

  const getTooltipLayout = (triggerEl: HTMLElement | null) => {
    if (!triggerEl || typeof window === 'undefined') {
      return null;
    }

    const rect = triggerEl.getBoundingClientRect();
    const width = 256;
    const margin = 12;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centerX, margin + width / 2), window.innerWidth - margin - width / 2);
    const estimatedHeight = 240;
    const showAbove = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
    const placement = showAbove ? 'top' as const : 'bottom' as const;
    const top = placement === 'top'
      ? Math.max(margin + estimatedHeight, rect.top - 8)
      : Math.min(window.innerHeight - margin - estimatedHeight, rect.bottom + 8);

    return { left, placement, top };
  };

  const showTooltip = (triggerEl: HTMLElement, tooltipKey: string, text: string) => {
    const layout = getTooltipLayout(triggerEl);
    if (!layout || !text) {
      return;
    }
    setActiveTooltip({ key: tooltipKey, text, top: layout.top, left: layout.left, placement: layout.placement });
  };

  const hideTooltip = (tooltipKey: string) => {
    setActiveTooltip((previous) => (previous?.key === tooltipKey ? null : previous));
  };

  const toggleTooltip = (event: React.MouseEvent<HTMLButtonElement>, tooltipKey: string, text: string) => {
    event.preventDefault();
    event.stopPropagation();
    const triggerEl = event.currentTarget;
    setActiveTooltip((previous) => {
      if (previous?.key === tooltipKey) {
        return null;
      }
      const layout = getTooltipLayout(triggerEl);
      if (!layout || !text) {
        return null;
      }
      return { key: tooltipKey, text, top: layout.top, left: layout.left, placement: layout.placement };
    });
  };

  const renderTooltipTrigger = (text: string | null, tooltipKey: string) => {
    if (!text) {
      return null;
    }

    const isActive = activeTooltip?.key === tooltipKey;

    return (
      <div className="relative inline-flex items-center" data-npc-info-tooltip="true">
        <button
          type="button"
          aria-label="Show details"
          aria-expanded={isActive}
          onClick={(event) => toggleTooltip(event, tooltipKey, text)}
          onMouseEnter={(event) => showTooltip(event.currentTarget, tooltipKey, text)}
          onMouseLeave={() => hideTooltip(tooltipKey)}
          onFocus={(event) => showTooltip(event.currentTarget, tooltipKey, text)}
          onBlur={() => hideTooltip(tooltipKey)}
          className={`inline-flex items-center rounded-full p-1 transition-colors ${
            isActive ? 'bg-stone-200 text-stone-700' : 'text-stone-400 hover:bg-stone-200 hover:text-stone-700'
          }`}
        >
          <AlertCircle size={14} />
        </button>
      </div>
    );
  };

  if ((!gearItems || gearItems.length === 0) && heroicAbilities.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {gearItems && gearItems.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">Equipped Gear</div>
            <div className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
              Armor {armorValue}
            </div>
          </div>
          <div className="space-y-2">
            {gearItems.map((gearItem) => (
              <div key={gearItem.item_id} className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
                {(() => {
                  const damageConfig = getMonsterGearDamageFormula(gearItem, stats);
                  const tooltipText = [
                    createMonsterGearAttackDescription(gearItem),
                    damageConfig?.appliedBonus
                      ? `NPC damage bonus applied: ${damageConfig.appliedBonus.attribute} + ${damageConfig.appliedBonus.die.toUpperCase()}`
                      : null,
                    damageConfig?.display ? `Effective Damage: ${damageConfig.display}` : null,
                  ].filter(Boolean).join('\n\n');

                  return (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-semibold text-stone-900">
                          {gearItem.name}
                          {gearItem.quantity > 1 ? ` x${gearItem.quantity}` : ''}
                        </div>
                        {renderTooltipTrigger(tooltipText || null, `gear-${gearItem.item_id}`)}
                        {damageConfig?.display ? (
                          <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            {damageConfig.display}
                          </span>
                        ) : null}
                      </div>
                      {damageConfig?.formula && onUseAttack ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Dices}
                          onClick={() => onUseAttack(gearItem)}
                        >
                          Use
                        </Button>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {heroicAbilities.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">Heroic Abilities</div>
          <div className="space-y-2">
            {heroicAbilities.map((ability) => {
              const cost = ability.willpower_cost ?? 0;
              const canAfford = cost <= 0 || (currentWp ?? 0) >= cost;
              const tooltipText = [
                cost > 0 ? `WP Cost: ${cost}` : 'Passive / Free',
                ability.description || null,
              ].filter(Boolean).join('\n\n');

              return (
                <div key={ability.ability_id} className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate font-semibold text-stone-900">{ability.name}</div>
                      {renderTooltipTrigger(tooltipText || null, `ability-${ability.ability_id}`)}
                      {ability.willpower_cost != null ? (
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          WP {ability.willpower_cost}
                        </span>
                      ) : null}
                    </div>
                    {onUseHeroicAbility ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Zap}
                        disabled={!canAfford}
                        onClick={() => onUseHeroicAbility(ability)}
                      >
                        Use
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {activeTooltip && typeof document !== 'undefined' ? createPortal(
        <div
          data-npc-info-tooltip="true"
          style={{ top: `${activeTooltip.top}px`, left: `${activeTooltip.left}px` }}
          className={`fixed z-[110] w-64 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-y-auto rounded-lg bg-stone-900 p-3 text-xs leading-relaxed text-white shadow-2xl ${
            activeTooltip.placement === 'top' ? '-translate-y-full' : ''
          }`}
        >
          {activeTooltip.placement === 'bottom' ? (
            <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-stone-900" />
          ) : (
            <div className="absolute bottom-0 left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rotate-45 bg-stone-900" />
          )}
          <div className="whitespace-pre-wrap">{activeTooltip.text}</div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};

export function AttackDescriptionRenderer({ description, attackName, onDamageRollComplete }: AttackDescriptionRendererProps) {
  const { toggleDiceRoller } = useDice();
  const diceRegex = /((?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*)/gi;
  const parts = description.split(diceRegex);
  return (<p className="text-stone-800 mt-1 leading-relaxed">{parts.map((part, index) => {
    if (part.match(diceRegex) && part.match(/[dD]/)) {
      const normalizedFormula = part.toLowerCase().replace(/\s/g, '');
      return (
        <button
          key={index}
          className="inline-flex items-center justify-center font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors"
          onClick={() => toggleDiceRoller?.({
            dice: normalizedFormula,
            label: `${attackName} - Damage`,
            onRollComplete: (result) => {
              const total = typeof result.finalOutcome === 'number' ? result.finalOutcome : null;
              onDamageRollComplete?.({ total, formula: normalizedFormula });
            },
          })}
        >
          <Dice6 size={10} className="mr-1" />
          {part}
        </button>
      );
    }
    return <span key={index}>{part}</span>;
  })}</p>);
}

export function MarkdownDiceRenderer({ text, contextLabel }: { text: string; contextLabel: string; }) {
  const { toggleDiceRoller } = useDice();
  if (!text) return null;
  const diceRegex = /((?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*)/gi;
  const parts = text.split(diceRegex);
  const renderMarkdown = (str: string): ReactNode[] => str.split(/(\*\*[^*]*?\*\*|\*[^*]*?\*)/g).map((chunk, chunkIndex) => {
    if (chunk.length > 4 && chunk.startsWith('**') && chunk.endsWith('**')) return <strong key={chunkIndex}>{chunk.slice(2, -2)}</strong>;
    if (chunk.length > 2 && chunk.startsWith('*') && chunk.endsWith('*')) return <em key={chunkIndex}>{chunk.slice(1, -1)}</em>;
    return chunk;
  });
  return (<div className="whitespace-pre-wrap leading-relaxed">{parts.map((part, index) => {
    if (part.match(diceRegex) && part.match(/[dD]/)) {
      return (<button key={index} className="inline-flex items-center justify-center font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors" onClick={() => toggleDiceRoller?.({ dice: part.toLowerCase().replace(/\s/g, ''), label: `${contextLabel} - Effects Roll`, })}><Dice6 size={10} className="mr-1" />{part}</button>);
    }
    return <span key={index}>{renderMarkdown(part)}</span>;
  })}</div>);
}

export function LogEntry({ entry }: { entry: CombatLogEntry }) {
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (entry.type === 'round_advanced') return <div className="flex items-center justify-center gap-2 my-2"><div className="h-px bg-stone-300 w-10"></div><span className="font-serif font-bold text-stone-600 text-xs uppercase tracking-widest">Round {entry.round}</span><div className="h-px bg-stone-300 w-10"></div></div>;
  let content = null;
  switch (entry.type) {
    case 'turn_start': content = <span className="text-stone-600">Turn started: <strong>{entry.name}</strong></span>; break;
    case 'turn_end': content = <span className="text-stone-400 italic">Turn ended: {entry.name}</span>; break;
    case 'hp_change': {
      const delta = entry.delta ?? 0;
      const isDamage = delta < 0;
      content = (
        <span className={isDamage ? 'text-red-700' : 'text-green-700'}>
          <strong>{entry.name}</strong> {isDamage ? `took ${Math.abs(delta)} DMG` : `healed ${delta} HP`}
        </span>
      );
      break;
    }
    case 'wp_change': {
      const delta = entry.delta ?? 0;
      const isSpend = delta < 0;
      content = (
        <span className="text-blue-700">
          <strong>{entry.name}</strong> {isSpend ? `spent ${Math.abs(delta)} WP` : `recovered ${delta} WP`}
        </span>
      );
      break;
    }
    case 'monster_attack': content = (<div className="bg-orange-50 p-2 rounded border border-orange-100"><span className="text-orange-800 font-medium flex items-center gap-1"><Sword size={12} /> {entry.name}: {entry.attack?.name || 'Attack'}</span><div className="text-xs text-stone-600 mt-1 italic">Rolled {entry.roll}{entry.attack?.tableDie ? ` on ${entry.attack.tableDie.toUpperCase()}` : ''}</div>{entry.message ? <div className="text-xs text-orange-800 mt-1">{entry.message}</div> : null}</div>); break;
    case 'attack_resolve': {
      if (entry.raw === undefined) {
        content = (<span className="text-stone-700"><Crosshair size={12} className="inline mr-1" /><strong>{entry.attacker}</strong> dealt {entry.damage} damage to <strong>{entry.target}</strong></span>);
        break;
      }
      const healed = (entry.damage ?? 0) < 0;
      const result = entry.parried
        ? 'was parried'
        : healed
          ? `healed ${Math.abs(entry.damage ?? 0)}`
          : `took ${entry.damage} damage${entry.absorbed ? ` (${entry.raw} rolled, armor stopped ${entry.absorbed})` : ''}`;
      content = (
        <span className="text-stone-700">
          <Crosshair size={12} className="inline mr-1" />
          {entry.attacker ? <><strong>{entry.attacker}</strong>{entry.attackName ? ` (${entry.attackName})` : ''}: </> : null}
          <strong>{entry.target}</strong> {result}
          {entry.hpBefore !== undefined && entry.hpAfter !== undefined && entry.hpBefore !== entry.hpAfter ? <span className="text-stone-400"> · HP {entry.hpBefore} → {entry.hpAfter}</span> : null}
          {entry.defeated ? <strong className="ml-1 text-stone-800">Defeated.</strong> : null}
          {entry.instantDeath ? <strong className="ml-1 text-red-700">Dies instantly.</strong> : entry.dying ? <strong className="ml-1 text-red-700">Down: death rolls.</strong> : null}
        </span>
      );
      break;
    }
    case 'encounter_ended': content = <span className="text-stone-500 italic">Encounter ended after {entry.round ?? 0} round{entry.round === 1 ? '' : 's'}.</span>; break;
    default: content = <span>{entry.message || JSON.stringify(entry)}</span>;
  }
  return (<div className="flex gap-2 text-sm py-1 border-b border-stone-100 last:border-0"><time className="text-xs text-stone-300 font-mono mt-0.5 w-10 shrink-0">{formatTime(entry.ts)}</time><div className="flex-grow">{content}</div></div>);
}

export function CombatLogView({ log }: { log: CombatLogEntry[] }) {
  if (!log || log.length === 0) { return <p className="text-sm text-gray-500 mt-2 px-1">No events have been logged yet.</p>; }
  return (<div className="space-y-1 divide-y divide-gray-100">{log.slice().reverse().map((entry, index) => (<LogEntry key={index} entry={entry} />))}</div>);
}

export function FearQuickReferenceContent() {
  return (
    <>
      <div className="p-4 bg-amber-50 border-b border-amber-200">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0">
            <ShieldAlert size={18} />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-stone-900 uppercase tracking-wider text-sm">Fear Quick Reference</h3>
            <p className="text-sm text-amber-900 leading-relaxed">
              <TextWithDice text={FEAR_ATTACK_QUICK_INFO} contextLabel="Fear Attack" />
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-stone-50 text-stone-500 text-xs font-semibold uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 w-14">D8</th>
              <th className="px-4 py-3">Effect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {FEAR_EFFECT_ROWS.map((effect) => (
              <tr key={effect.roll} className="align-top">
                <td className="px-4 py-3 font-mono font-bold text-stone-700">{effect.roll}</td>
                <td className="px-4 py-3 text-stone-700 leading-relaxed">
                  <span className="font-semibold text-stone-900 mr-1">{effect.title}</span>
                  <TextWithDice text={effect.description} contextLabel={`Fear ${effect.roll}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export interface FearReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FearReferenceModal({ isOpen, onClose }: FearReferenceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[65] p-2 md:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden border border-amber-200 flex flex-col">
        <div className="p-3 md:p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <div>
            <h3 className="text-base md:text-lg font-bold font-serif">Fear Quick Reference</h3>
            <p className="text-xs text-stone-300">Roll against WIL, then apply the D8 outcome</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close fear reference">
            <XCircle size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          <FearQuickReferenceContent />
        </div>
      </div>
    </div>
  );
}

// --- MODAL: WAIT / SWAP TURN ---
export interface WaitTurnModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentActor: EncounterCombatant;
  allCombatants: EncounterCombatant[];
  onSwap: (targetId: string) => void;
}

export function WaitTurnModal({ isOpen, onClose, currentActor, allCombatants, onSwap }: WaitTurnModalProps) {
  if (!isOpen) return null;

  const candidates = allCombatants
    .filter(c => c.id !== currentActor.id && !c.has_acted && (c.current_hp > 0 || c.monster_id))
    .sort((a, b) => (a.initiative_roll || 0) - (b.initiative_roll || 0));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-200 flex flex-col max-h-[80vh]">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <h3 className="text-lg font-bold font-serif flex items-center gap-2"><Hourglass className="w-5 h-5" /> Wait & Swap Initiative</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24} /></button>
        </div>
        <div className="p-4 bg-stone-50 overflow-y-auto">
          <p className="text-sm text-stone-600 mb-4">Select a creature who has not acted yet. You will swap Initiative Cards with them.</p>

          {candidates.length === 0 ? (
            <div className="text-center py-6 text-stone-400 italic">No valid targets available. Everyone else has acted.</div>
          ) : (
            <div className="space-y-2">
              {candidates.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSwap(c.id)}
                  className="w-full flex items-center justify-between p-3 bg-white border border-stone-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-10 bg-white border-2 border-stone-800 rounded flex items-center justify-center font-serif font-bold shadow-sm group-hover:border-purple-600 group-hover:text-purple-700">
                      {c.initiative_roll}
                    </div>
                    <div className="text-left">
                      <span className="block font-bold text-stone-800 group-hover:text-purple-900">{c.display_name}</span>
                      <span className="text-[10px] uppercase font-bold text-stone-400">{c.monster_id ? 'Monster' : 'Player'}</span>
                    </div>
                  </div>
                  <ArrowUpDown className="text-stone-300 group-hover:text-purple-500" size={18} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t bg-white flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// --- MODAL: ATTACK RESOLUTION ---
export interface InitiativeDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  combatants: EncounterCombatant[];
  onApply: (updates: InitiativeUpdate[]) => void;
}

export function InitiativeDrawModal({ isOpen, onClose, combatants, onApply }: InitiativeDrawModalProps) {
  const [manualValues, setManualValues] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (isOpen) {
      const init: Record<string, string[]> = {};
      combatants.forEach((c) => {
        init[c.id] = initiativeSlotsFor(c).filter((value): value is number => value !== null).map(String);
      });
      setManualValues(init);
    }
  }, [isOpen, combatants]);
  const handleDraw = () => {
    const updates: InitiativeUpdate[] = [];
    const actionCount = combatants.reduce((total, combatant) => total + (usesArmyOfOne(combatant, combatants) ? 2 : 1), 0);
    const taken = Object.values(manualValues).flat().map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 10);
    const deck = generateDeck(actionCount, taken);
    combatants.forEach((c) => {
      const slotCount = usesArmyOfOne(c, combatants) ? 2 : 1;
      const slots = (manualValues[c.id] || [])
        .map(Number)
        .filter((value, index, values) => Number.isInteger(value) && value >= 1 && value <= 10 && values.indexOf(value) === index)
        .slice(0, slotCount);
      while (slots.length < slotCount) {
        const index = deck.findIndex((card) => !slots.includes(card));
        const card = index >= 0 ? deck.splice(index, 1)[0] : undefined;
        if (card === undefined) break;
        slots.push(card);
      }
      slots.sort((left, right) => left - right);
      if (slots[0] !== undefined) updates.push({ id: c.id, initiative_roll: slots[0], initiative_slots: slots });
    });
    onApply(updates);
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-800 text-white flex justify-between items-center"><h3 className="text-lg font-bold font-serif flex items-center gap-2"><Dices className="w-5 h-5" /> Draw Initiative</h3><button onClick={onClose} className="text-stone-400 hover:text-white"><XCircle size={24} /></button></div>
        <div className="p-3 bg-blue-50 text-blue-900 text-sm border-b border-blue-100">Enter manual values for characters keeping their card (e.g. <strong>Veteran</strong> talent). Leave blank to draw from deck.</div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50 space-y-2">{combatants.map((c) => {
          const slotCount = usesArmyOfOne(c, combatants) ? 2 : 1;
          return <div key={c.id} className="flex items-center justify-between gap-3 bg-white p-3 rounded border shadow-sm">
            <span className="font-bold text-stone-800">{c.display_name}{slotCount === 2 && <span className="ml-2 text-xs font-semibold text-indigo-600">Army of One</span>}</span>
            <div className="flex gap-2">{Array.from({ length: slotCount }, (_, index) => (
              <input
                key={index}
                type="number"
                min="1"
                max="10"
                aria-label={`${c.display_name} initiative card ${index + 1}`}
                placeholder="Auto"
                className={`w-16 px-2 py-1 text-center border rounded font-mono font-bold ${manualValues[c.id]?.[index] ? 'bg-yellow-50 border-yellow-400 text-yellow-900' : 'bg-white'}`}
                value={manualValues[c.id]?.[index] || ''}
                onChange={(event) => setManualValues((previous) => {
                  const values = [...(previous[c.id] || [])];
                  values[index] = event.target.value;
                  return { ...previous, [c.id]: values };
                })}
              />
            ))}</div>
          </div>;
        })}</div>
        <div className="p-4 border-t bg-white flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Dices} onClick={handleDraw}>Draw & Apply</Button></div>
      </div>
    </div>
  );
}

export interface AddCombatantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  partyMembers?: Character[];
  availablePartyMembers: Character[];
  allMonsters: MonsterData[];
  onAddParty: (characterId: string) => void;
  onAddMonster: (monsterId: string, count: number, customName: string) => void;
  /** Opens the form for a new monster or NPC that belongs to this campaign. */
  onCreateCustom: (asNpc: boolean) => void;
}

export function AddCombatantsModal({ isOpen, onClose, availablePartyMembers, allMonsters, onAddParty, onAddMonster, onCreateCustom }: AddCombatantsModalProps) {
  const [tab, setTab] = useState<'party' | 'monsters'>('party');
  const [monsterSearch, setMonsterSearch] = useState('');
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null);
  const [monsterCount, setMonsterCount] = useState(1);
  const [monsterCustomName, setMonsterCustomName] = useState('');
  const monsterSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && tab === 'monsters') {
      monsterSearchInputRef.current?.focus();
    }
  }, [isOpen, tab]);
  if (!isOpen) return null;
  const normalizedSearch = monsterSearch.trim().toLowerCase();
  const filteredMonsters = allMonsters
    ? allMonsters
        .filter((monster) => {
          if (!normalizedSearch) {
            return true;
          }

          const searchHaystack = [
            monster.name,
            monster.category,
            monster.stats?.TYPE,
            monster.stats?.IS_NPC ? 'npc' : 'monster',
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return searchHaystack.includes(normalizedSearch);
        })
        .slice(0, 20)
    : [];
  const selectedMonster = selectedMonsterId ? allMonsters.find((monster) => monster.id === selectedMonsterId) : null;
  const selectedMonsterHiddenStats = selectedMonster?.stats?.IS_NPC
    ? NPC_STRUCTURED_HIDDEN_KEYS
    : ['GEAR_ITEMS'];
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden border border-stone-200">
        <div className="p-4 border-b bg-stone-50 flex justify-between items-center"><h3 className="text-xl font-bold font-serif text-stone-800">Add Combatants</h3><button onClick={onClose} className="text-stone-400 hover:text-stone-600"><XCircle size={24} /></button></div>
        <div className="flex border-b"><button className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${tab === 'party' ? 'bg-white border-b-2 border-blue-600 text-blue-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`} onClick={() => setTab('party')}>Party Members</button><button className={`flex-1 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${tab === 'monsters' ? 'bg-white border-b-2 border-orange-600 text-orange-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`} onClick={() => setTab('monsters')}>Monsters & NPCs</button></div>
        <div className="flex-grow overflow-y-auto p-4 bg-stone-50/50">
          {tab === 'party' && (<div className="space-y-2">{availablePartyMembers.length === 0 ? <p className="text-center text-stone-400 py-8 italic">All party members added.</p> : availablePartyMembers.map((char) => (<div key={char.id} className="flex items-center justify-between bg-white p-3 rounded border shadow-sm"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700"><User size={16} /></div><span className="font-bold text-stone-800">{char.name}</span></div><Button size="sm" onClick={() => onAddParty(char.id)} icon={PlusCircle}>Add</Button></div>))}</div>)}
          {tab === 'monsters' && (
            <div className="flex flex-col h-full gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                <input
                  ref={monsterSearchInputRef}
                  type="text"
                  placeholder="Search monsters, NPCs, categories, or type..."
                  className="w-full pl-9 pr-4 py-2 border rounded shadow-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  value={monsterSearch}
                  onChange={(e) => setMonsterSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-stone-500">
                  NPC entries are highlighted in amber. Entries marked Campaign were made for this campaign.
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={PlusCircle} onClick={() => onCreateCustom(false)}>Custom monster</Button>
                  <Button size="sm" variant="outline" icon={PlusCircle} onClick={() => onCreateCustom(true)}>Custom NPC</Button>
                </div>
              </div>
              <div className="flex-grow min-h-0 overflow-hidden flex flex-col md:flex-row gap-4">
                <div className="flex-1 min-h-0 overflow-y-auto border rounded bg-white divide-y">
                  {filteredMonsters.map((monster) => {
                    const isNpcMonster = Boolean(monster.stats?.IS_NPC);
                    const damageBonusLabel = getMonsterDamageBonusLabel(monster.stats);
                    return (
                      <button
                        type="button"
                        key={monster.id}
                        className={`w-full p-3 cursor-pointer text-left transition-colors ${
                          selectedMonsterId === monster.id
                            ? isNpcMonster
                              ? 'bg-amber-50 border-l-4 border-amber-500'
                              : 'bg-orange-50 border-l-4 border-orange-500'
                            : isNpcMonster
                              ? 'hover:bg-amber-50'
                              : 'hover:bg-orange-50'
                        }`}
                        onClick={() => setSelectedMonsterId(monster.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-stone-900">{monster.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
                              <span>{monster.category || 'Uncategorized'}</span>
                              {monster.stats?.TYPE ? <span>• {monster.stats.TYPE}</span> : null}
                              {monster.party_id ? <span className="rounded bg-teal-50 px-1 font-bold uppercase text-teal-700">Campaign</span> : null}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isNpcMonster
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isNpcMonster ? 'NPC' : 'Monster'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-600">
                          <span className="rounded bg-stone-100 px-1.5 py-0.5">HP {monster.stats?.HP ?? 0}</span>
                          {typeof monster.stats?.WP === 'number' && monster.stats.WP > 0 ? (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">WP {monster.stats.WP}</span>
                          ) : null}
                          {damageBonusLabel ? (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">DMG {damageBonusLabel}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                  {filteredMonsters.length === 0 ? (
                    <div className="p-6 text-center text-sm text-stone-400 italic">
                      No monsters or NPCs matched your search.
                    </div>
                  ) : null}
                </div>
                {selectedMonster && (
                  <div className="w-full md:w-80 md:min-w-80 min-h-0 md:max-h-full bg-white border rounded shadow-sm flex flex-col flex-shrink-0 overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
                      <div className="border-b pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-bold text-stone-800">{selectedMonster.name}</h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              selectedMonster.stats?.IS_NPC
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {selectedMonster.stats?.IS_NPC ? 'NPC' : 'Monster'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          {selectedMonster.category || 'Uncategorized'}
                          {selectedMonster.stats?.TYPE ? ` • ${selectedMonster.stats.TYPE}` : ''}
                        </div>
                      </div>

                      {selectedMonster.stats ? <StatsTableView stats={selectedMonster.stats} hiddenKeys={selectedMonsterHiddenStats} /> : null}
                      <MonsterNpcDetails stats={selectedMonster.stats} />

                      {selectedMonster.effectsSummary ? (
                        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm">
                          <span className="text-xs font-bold text-yellow-800 uppercase block mb-1">Traits & Effects</span>
                          <MarkdownDiceRenderer text={selectedMonster.effectsSummary} contextLabel={selectedMonster.name} />
                        </div>
                      ) : null}

                      <div>
                        <label htmlFor="encounter-monster-count" className="text-[10px] font-bold text-stone-500 uppercase">Count</label>
                        <input id="encounter-monster-count" type="number" min="1" className="w-full p-1.5 border rounded text-sm" value={monsterCount} onChange={(e) => setMonsterCount(Math.max(1, parseInt(e.target.value) || 1))} />
                      </div>
                      <div>
                        <label htmlFor="encounter-monster-name" className="text-[10px] font-bold text-stone-500 uppercase">Name (Opt)</label>
                        <input id="encounter-monster-name" type="text" placeholder={selectedMonster.stats?.IS_NPC ? 'e.g. Captain Rusk' : 'e.g. Boss'} className="w-full p-1.5 border rounded text-sm" value={monsterCustomName} onChange={(e) => setMonsterCustomName(e.target.value)} />
                      </div>
                    </div>
                    <div className="border-t bg-white p-4">
                      <Button className="w-full" onClick={() => { onAddMonster(selectedMonster.id, monsterCount, monsterCustomName); setMonsterCount(1); setMonsterCustomName(''); }} icon={PlusCircle}>Add to Fight</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="p-3 border-t bg-stone-50 flex justify-end"><Button onClick={onClose} variant="secondary">Done</Button></div>
      </div>
    </div>
  );
}

export interface RollTablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
}

export function RollTablesModal({ isOpen, onClose, partyId }: RollTablesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[65] p-2 md:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full h-[96vh] md:h-[92vh] max-w-[1400px] overflow-hidden border border-stone-300 flex flex-col">
        <div className="p-3 md:p-4 border-b bg-stone-800 text-white flex justify-between items-center">
          <div>
            <h3 className="text-base md:text-lg font-bold font-serif">Roll Tables</h3>
            <p className="text-xs text-stone-300">Open and use random tables during combat</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close roll tables">
            <XCircle size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-stone-50 p-4">
          <RandomTableManager partyId={partyId} allowedCategoryKeywords={['combat']} />
        </div>
      </div>
    </div>
  );
}

export function ActiveCombatantSpotlight({ combatant, initiativeSlot, monsterData, currentAttack, onRollAttack, onEndTurn, onOpenAttackModal, onUseHeroicAbility, onWait, onOpenCharacterSheet, isDM }: {
  combatant: EncounterCombatant,
  initiativeSlot?: number | null,
  monsterData?: MonsterData,
  currentAttack?: MonsterAttack | null,
  onRollAttack: () => void,
  onEndTurn: () => void,
  onOpenAttackModal: (result?: { total: number | null; formula: string }, attackName?: string) => void,
  onUseHeroicAbility?: (ability: { ability_id: string; name: string; description?: string; willpower_cost?: number | null }) => void,
  onWait: () => void,
  onOpenCharacterSheet?: () => void,
  isDM: boolean
}) {
  const { toggleDiceRoller } = useDice();
  const isMonster = !!combatant.monster_id;
  const canControl = isDM || (!isMonster);
  const hasAttackTable = hasRollableMonsterAttacks(monsterData);
  const defaultAttack = !currentAttack ? getDefaultMonsterAttack(monsterData) : null;
  const displayedAttack = currentAttack || defaultAttack;
  const effectiveWp = getEffectiveMonsterWp(combatant.current_wp, monsterData?.stats?.WP);
  const spotlightStats = monsterData?.stats
    ? {
        ...monsterData.stats,
        HP: combatant.current_hp,
        ...(effectiveWp > 0 || monsterData.stats.WP != null ? { WP: effectiveWp } : {}),
      }
    : undefined;
  const attackHeading = currentAttack
    ? 'Active Action (Rolled)'
    : defaultAttack
      ? 'Active Action'
      : 'Active Action';

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-blue-500 overflow-hidden mb-6 relative animate-in fade-in slide-in-from-top-2">
      <div className="bg-blue-600 text-white px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2"><div className="bg-white text-blue-800 font-bold font-serif w-8 h-8 flex items-center justify-center rounded shadow">{initiativeSlot ?? combatant.initiative_roll ?? '-'}</div><div><h3 className="font-bold text-lg leading-none">{combatant.display_name}</h3><span className="text-xs text-blue-100 uppercase tracking-wider font-semibold">Current Turn</span></div></div>
        <div className="flex gap-2">
          {canControl && (
            <>
              {isDM && combatant.character_id && onOpenCharacterSheet && (
                <Button size="sm" variant="secondary" onClick={onOpenCharacterSheet} icon={User} title="Open character sheet">
                  Sheet
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={onWait} icon={Hourglass} title="Swap Initiative (Wait)">Wait</Button>
              <Button size="sm" variant="secondary" onClick={onEndTurn} icon={RotateCcw} title="End turn and automatically flip next card">End Turn</Button>
            </>
          )}
        </div>
      </div>
      <div className="p-4">
        {isMonster && monsterData ? (
          <div className="space-y-4">
            {spotlightStats && <StatsTableView stats={spotlightStats} hiddenKeys={monsterData.stats?.IS_NPC ? NPC_STRUCTURED_HIDDEN_KEYS : ['GEAR_ITEMS']} />}
            <MonsterNpcDetails
              stats={monsterData.stats}
              onRollSkill={canControl ? (skill) => {
                toggleDiceRoller?.({
                  initialDice: ['d20'],
                  rollMode: 'skillCheck',
                  targetValue: skill.level,
                  description: `${combatant.display_name}: ${skill.name}`,
                  skillName: skill.name,
                });
              } : undefined}
            />
            <MonsterEquippedGear
              gearItems={monsterData.stats?.GEAR_ITEMS}
              stats={monsterData.stats}
              currentWp={effectiveWp}
              onUseAttack={(gearItem, result) => {
                const damageConfig = getMonsterGearDamageFormula(gearItem, monsterData.stats);
                const damageRoll = buildMonsterGearDamageRoll(gearItem, monsterData.stats);
                if (result) {
                  onOpenAttackModal(result, gearItem.name);
                  return;
                }

                if (damageRoll?.dicePool.length) {
                  toggleDiceRoller?.({
                    rollMode: 'attackDamage',
                    initialDice: damageRoll.dicePool,
                    description: damageRoll.description,
                    onRollComplete: (rollResult) => {
                      const total = typeof rollResult.finalOutcome === 'number' ? rollResult.finalOutcome : null;
                      onOpenAttackModal({ total, formula: damageRoll.display }, gearItem.name);
                    },
                  });
                  return;
                }

                if (damageConfig?.formula) {
                  toggleDiceRoller?.({
                    dice: damageConfig.formula,
                    label: `${gearItem.name} - Damage`,
                    onRollComplete: (rollResult) => {
                      const total = typeof rollResult.finalOutcome === 'number' ? rollResult.finalOutcome : null;
                      onOpenAttackModal({ total, formula: damageConfig.display }, gearItem.name);
                    },
                  });
                  return;
                }

                onOpenAttackModal(undefined, gearItem.name);
              }}
              onUseHeroicAbility={isDM ? onUseHeroicAbility : undefined}
            />
            {monsterData.effectsSummary && (<div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm"><span className="text-xs font-bold text-yellow-800 uppercase block mb-1">Traits & Effects</span><MarkdownDiceRenderer text={monsterData.effectsSummary} contextLabel={monsterData.name} /></div>)}
            <div className="bg-stone-50 rounded-lg border border-stone-200 p-3">
              {displayedAttack ? (
                <div className="animate-in fade-in">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-stone-400 uppercase">{attackHeading}</span>
                  </div>
                  <h4 className="font-bold text-lg text-red-700 mb-1">{displayedAttack.name}</h4>
                  <AttackDescriptionRenderer
                    description={displayedAttack.description}
                    attackName={displayedAttack.name}
                    onDamageRollComplete={(result) => onOpenAttackModal?.(result, displayedAttack.name)}
                  />
                  {!hasAttackTable && (
                    <p className="mt-2 text-xs text-stone-500">
                      This monster has no rollable attack table. Choose targets and apply damage manually.
                    </p>
                  )}
                  <div className="mt-3 pt-2 border-t border-stone-200 flex justify-end gap-2">
                    {isDM && hasAttackTable && <Button size="sm" variant="outline" icon={Dices} onClick={onRollAttack}>Reroll</Button>}
                    {canControl && <Button size="sm" variant="danger" icon={Crosshair} onClick={() => onOpenAttackModal()}>Resolve / Apply</Button>}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-stone-500 text-sm mb-3 italic">
                    {hasAttackTable ? 'No attack selected.' : 'No rollable attack table is available.'}
                  </p>
                  <div className="flex flex-col gap-2">
                    {isDM && hasAttackTable && <Button size="default" variant="danger" icon={Sword} onClick={onRollAttack} className="w-full justify-center shadow-md">Roll Monster Attack</Button>}
                    {canControl && <Button size="default" variant="outline" icon={Crosshair} onClick={() => onOpenAttackModal()} className="w-full justify-center">Resolve / Apply Manual Attack</Button>}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (<div className="text-center py-6 text-stone-500 flex flex-col items-center gap-3"><p className="italic">It's a player's turn.</p>{canControl && <Button size="sm" variant="outline" icon={Crosshair} onClick={() => onOpenAttackModal()}>Record Action / Damage</Button>}</div>)}
      </div>
    </div>
  );
}

export interface DragonbaneCombatantCardProps {
  combatant: EncounterCombatant;
  isSelected: boolean;
  isSwapSource: boolean;
  onSelect: (id: string) => void;
  onSwapRequest: (id: string) => void;
  onFlipCard: (id: string, current: boolean) => void;
  onSaveStats: (id: string) => void;
  onToggleFear: (combatant: EncounterCombatant) => void;
  onTogglePoison: (combatant: EncounterCombatant) => void;
  statsState: EditableCombatantStats;
  setStatsState: (value: EditableCombatantStats) => void;
  monsterData?: MonsterData;
  onRemove: (id: string) => void;
  isDM: boolean;
  myCharacterId: string | null;
  onSetInitiative: (id: string, val: number) => void;
  onOpenCharacterSheet: (combatant: EncounterCombatant) => void;
  onToggleCondition: (combatant: EncounterCombatant, key: ConditionKey) => void;
  onDeathRollChange: (combatant: EncounterCombatant, changes: { passed?: number; failed?: number; rallied?: boolean }) => void;
  onStabilise: (combatant: EncounterCombatant, hp: number) => void;
}

export function DragonbaneCombatantCard({ combatant, isSelected, isSwapSource, onSelect, onSwapRequest, onFlipCard, onSaveStats, onToggleFear, onTogglePoison, statsState, setStatsState, monsterData, onRemove, isDM, myCharacterId, onSetInitiative, onOpenCharacterSheet, onToggleCondition, onDeathRollChange, onStabilise }: DragonbaneCombatantCardProps) {
  const isMonster = !!combatant.monster_id;
  const hasActed = combatant.has_acted || false;
  const initValue = initiativeSlotsFor(combatant).filter((value) => value !== null).join(' / ') || '-';
  const isDefeated = isMonster && combatant.current_hp === 0;
  const isDying = !isMonster && combatant.current_hp === 0;
  const hpVal = statsState.current_hp ?? '';
  const wpVal = statsState.current_wp ?? '';
  const hasFear = hasEncounterStatusEffect(combatant.status_effects, FEAR_STATUS_EFFECT);
  const isPoisoned = hasEncounterStatusEffect(combatant.status_effects, POISONED_STATUS_EFFECT);

  const isMyCharacter = myCharacterId && combatant.character_id === myCharacterId;
  const canEdit = isDM || isMyCharacter;
  const canOpenCharacterSheet = isDM && !!combatant.character_id;

  const handleInitClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    const newInit = prompt("Set Initiative (1-10):", String(combatant.initiative_roll || ''));
    if (newInit !== null) {
      const val = parseInt(newInit);
      if (!isNaN(val) && val >= 1 && val <= 10) {
        onSetInitiative(combatant.id, val);
      }
    }
  };

  const baseMaxWp = combatant.max_wp || combatant.character?.max_wp || 0;
  const npcMaxWp = monsterData?.stats?.WP || combatant.current_wp || 0;
  const maxWp = isMonster ? npcMaxWp : baseMaxWp;
  const showWp = !isMonster || maxWp > 0 || (combatant.current_wp ?? 0) > 0;

  return (
    <div className={`relative flex items-center gap-3 p-2 pr-3 rounded-lg border shadow-sm transition-all cursor-pointer overflow-hidden ${isDefeated ? 'bg-stone-200 border-stone-400 opacity-80' : hasActed ? 'bg-stone-100 border-stone-200 opacity-60 grayscale' : isSelected ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-md'} ${isSwapSource ? 'ring-2 ring-purple-500 bg-purple-50 animate-pulse' : ''}`} onClick={() => onSelect(combatant.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(combatant.id); } }} role="button" tabIndex={0}>
      {isDefeated && (<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden"><span className="text-stone-400/20 font-black text-4xl uppercase -rotate-12 select-none">Defeated</span></div>)}

      {/* Initiative Box */}
      <button
        type="button"
        onClick={handleInitClick}
        title={canEdit ? "Click to set Initiative" : "Initiative"}
        className={`relative z-10 flex-shrink-0 min-w-10 px-1 h-14 rounded flex items-center justify-center shadow-sm border transition-colors ${isDefeated ? 'bg-red-100 border-red-300 text-red-800' : hasActed ? 'bg-stone-200 border-stone-300 text-stone-400' : 'bg-white border-stone-800 text-stone-900'} ${canEdit ? 'hover:bg-blue-50 cursor-pointer' : ''}`}
      >
        <span className="font-serif font-bold text-sm">{initValue}</span>
      </button>

      <div className="relative z-10 flex-grow min-w-0">
        <div className="flex justify-between items-start mb-1">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <p className={`font-bold min-w-0 max-w-full truncate leading-tight ${hasActed || isDefeated ? 'text-stone-500 line-through' : 'text-stone-800'}`}>{combatant.display_name}</p>
            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">{isMonster ? (monsterData?.name || 'Monster') : 'Player'}</span>
            <button
              type="button"
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                hasFear
                  ? 'border-amber-300 bg-amber-100 text-amber-800'
                  : 'border-stone-200 bg-stone-100 text-stone-500 hover:border-amber-200 hover:text-amber-700'
              } ${canEdit ? '' : 'cursor-default'}`}
              disabled={!canEdit}
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit) return;
                onToggleFear(combatant);
              }}
              title={canEdit ? `${hasFear ? 'Remove' : 'Apply'} fear status` : 'Fear status'}
            >
              Fear
            </button>
            <button
              type="button"
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isPoisoned
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : 'border-stone-200 bg-stone-100 text-stone-500 hover:border-emerald-200 hover:text-emerald-700'
              } ${canEdit ? '' : 'cursor-default'}`}
              disabled={!canEdit}
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit) return;
                onTogglePoison(combatant);
              }}
              title={canEdit ? `${isPoisoned ? 'Remove' : 'Apply'} poisoned status` : 'Poisoned status'}
            >
              Poisoned
            </button>
            {isMonster && isDM && (
              <span title="HP synced across all action cards">
                <LinkIcon size={10} className="text-stone-300" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onPointerDownCapture={e => e.stopPropagation()}>
            <div className={`flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm ${combatant.current_hp === 0 ? 'ring-2 ring-red-500 border-red-500' : ''}`}><div className={`px-1.5 py-1 ${combatant.current_hp === 0 ? 'bg-red-100' : 'bg-stone-50'} border-r border-stone-200`}><Heart className={`w-3 h-3 ${combatant.current_hp === 0 ? 'text-red-500' : 'text-red-600'}`} /></div><input type="number" className="w-10 px-1 py-0.5 text-xs text-center font-bold outline-none focus:bg-blue-50" disabled={!canEdit} value={hpVal} onChange={(e) => setStatsState({ ...statsState, current_hp: e.target.value })} onBlur={() => onSaveStats(combatant.id)} /><div className="px-1.5 py-0.5 text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{combatant.max_hp}</div></div>
            {showWp && (
              <div className="flex items-center bg-white border border-stone-200 rounded overflow-hidden shadow-sm"><div className="px-1.5 py-1 bg-stone-50 border-r border-stone-200"><Zap className="w-3 h-3 text-blue-600" /></div><input type="number" className="w-10 px-1 py-0.5 text-xs text-center font-bold outline-none focus:bg-blue-50" disabled={!canEdit} value={wpVal} onChange={(e) => setStatsState({ ...statsState, current_wp: e.target.value })} onBlur={() => onSaveStats(combatant.id)} />{maxWp > 0 && <div className="px-1.5 py-0.5 text-[10px] text-stone-400 bg-stone-50 border-l border-stone-200">/{maxWp}</div>}</div>
            )}
          </div>
        </div>
        {!isMonster && <ConditionChips combatant={combatant} canEdit={Boolean(canEdit)} onToggle={(key) => onToggleCondition(combatant, key)} />}
        {isDying && <DeathRollPanel combatant={combatant} canEdit={Boolean(canEdit)} onChange={(changes) => onDeathRollChange(combatant, changes)} onStabilise={(hp) => onStabilise(combatant, hp)} />}
        <div className="flex items-center justify-between mt-2 h-6">
          {isDying && (<div className="flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-100"><Skull size={10} className="text-red-500" /><span className="text-[10px] font-bold text-red-700 uppercase">Dying</span></div>)}
          {isDefeated && (<div className="flex items-center gap-1 px-2 py-0.5 rounded bg-stone-700 text-white"><Skull size={10} /><span className="text-[10px] font-bold uppercase">Defeated</span></div>)}
          <div className={`flex items-center gap-1 transition-opacity ${hasActed ? 'opacity-50 hover:opacity-100' : ''}`} onPointerDownCapture={e => e.stopPropagation()}>
            {!hasActed && !isDefeated && (<button className={`p-1 rounded transition-colors ${isSwapSource ? 'bg-purple-600 text-white' : 'text-stone-400 hover:text-purple-600 hover:bg-purple-50'}`} title="Swap Initiative (Wait)" onClick={() => onSwapRequest(combatant.id)}><ArrowUpDown size={14} /></button>)}
            {!isDefeated && canEdit && <button className={`p-1 rounded transition-colors ${hasActed ? 'text-stone-400 hover:bg-stone-200' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'}`} title={hasActed ? "Unflip Card" : "Flip Card (End Turn/Reaction)"} onClick={() => onFlipCard(combatant.id, hasActed)}>{hasActed ? <RotateCcw size={14} /> : <ShieldAlert size={14} />}</button>}
            {canOpenCharacterSheet && (
              <button
                className="p-1 rounded transition-colors text-stone-400 hover:text-blue-700 hover:bg-blue-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCharacterSheet(combatant);
                }}
                title="Open Character Sheet"
              >
                <User size={14} />
              </button>
            )}
            {isDM && (<button className={`p-1 rounded transition-colors flex items-center gap-1 ${isDefeated ? 'bg-red-600 text-white hover:bg-red-700 px-2 shadow-sm' : 'text-stone-300 hover:text-red-600 hover:bg-red-50'}`} onClick={() => onRemove(combatant.id)} title="Remove from Encounter"><Trash2 size={14} />{isDefeated && <span className="text-[10px] font-bold uppercase">Remove Corpse</span>}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MAIN PAGE COMPONENT ---

