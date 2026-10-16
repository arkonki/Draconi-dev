import { BookOpen, Heart, Skull, Swords, Zap } from 'lucide-react';
import { activeConditionLabels } from '../../lib/conditions';
import type { QuickCharacter } from '../../hooks/useTableCharacters';
import { PortraitImage } from '../shared/PortraitImage';

interface TableCharacterBarProps {
  characters: QuickCharacter[];
  isGm: boolean;
  currentUserId?: string;
  onOpenSheet: (characterId: string) => void;
  /** GM only: opens the combat page in a modal. */
  onOpenCombat?: () => void;
  combatActive?: boolean;
}

function Meter({ label, current, max, tone, icon: Icon }: { label: string; current: number; max: number; tone: 'hp' | 'wp'; icon: typeof Heart }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = tone === 'wp' ? 'bg-sky-400' : ratio <= 0.25 ? 'bg-red-500' : ratio <= 0.5 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="min-w-0 flex-1" role="group" aria-label={`${label} ${current} of ${max}`}>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/70">
        <span className="flex items-center gap-1"><Icon size={11} aria-hidden="true" /> {label}</span>
        <span className="font-mono text-white">{current}/{max}</span>
      </div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-white/15">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function Pips({ count, tone }: { count: number; tone: 'good' | 'bad' }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[1, 2, 3].map((index) => (
        <span key={index} className={`h-2 w-2 rounded-full border ${index <= count ? (tone === 'good' ? 'border-green-300 bg-green-400' : 'border-red-300 bg-red-500') : 'border-white/40'}`} />
      ))}
    </span>
  );
}

function CharacterCard({ character, mine, onOpenSheet }: { character: QuickCharacter; mine: boolean; onOpenSheet: (id: string) => void }) {
  const conditions = activeConditionLabels(character.conditions);
  const dying = character.current_hp <= 0;
  const dead = character.death_rolls_failed >= 3;
  return (
    <div className={`flex w-[17rem] flex-none flex-col gap-1.5 rounded-xl border p-2 text-white ${dying ? 'border-red-400/70 bg-red-950/70' : mine ? 'border-amber-300/60 bg-stone-800' : 'border-white/15 bg-stone-800/90'}`}>
      <div className="flex items-center gap-2">
        {character.portrait_url ? (
          <PortraitImage value={character.portrait_url} variant="thumbnail" className="h-9 w-9 flex-none rounded-full border border-white/25 object-cover" />
        ) : (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/15 text-sm font-bold">{character.name.slice(0, 2).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{character.name}</p>
          {dying && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-200">
              <Skull size={11} aria-hidden="true" /> {dead ? 'Dead' : 'Dying'} <Pips count={character.death_rolls_passed} tone="good" /> <Pips count={character.death_rolls_failed} tone="bad" />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenSheet(character.id)}
          className="flex flex-none items-center gap-1 rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
          aria-label={`Open ${character.name}'s character sheet`}
        >
          <BookOpen size={14} aria-hidden="true" /> Sheet
        </button>
      </div>
      <div className="flex gap-3">
        <Meter label="HP" current={character.current_hp} max={character.max_hp} tone="hp" icon={Heart} />
        <Meter label="WP" current={character.current_wp} max={character.max_wp} tone="wp" icon={Zap} />
      </div>
      {conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {conditions.map((label) => <span key={label} className="rounded-full bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-100">{label}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * The strip along the bottom of the table. A player sees their own character's quick stats; the GM sees every
 * character in the party. Either can open the full sheet in a modal.
 */
export function TableCharacterBar({ characters, isGm, currentUserId, onOpenSheet, onOpenCombat, combatActive }: TableCharacterBarProps) {
  const visible = isGm ? characters : characters.filter((character) => character.user_id === currentUserId);
  if (visible.length === 0 && !isGm) return null;
  const ordered = [...visible].sort((left, right) => Number(right.user_id === currentUserId) - Number(left.user_id === currentUserId) || left.name.localeCompare(right.name));

  return (
    <div className="flex items-stretch gap-2 border-t border-stone-700 bg-stone-900 py-2 pl-3 pr-3 sm:pr-20" aria-label={isGm ? 'Party quick stats' : 'Your character'}>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
        {ordered.map((character) => (
          <CharacterCard key={character.id} character={character} mine={character.user_id === currentUserId} onOpenSheet={onOpenSheet} />
        ))}
        {ordered.length === 0 && <p className="self-center px-2 text-sm text-white/60">No characters are in the party yet.</p>}
      </div>
      {isGm && onOpenCombat && (
        <button
          type="button"
          onClick={onOpenCombat}
          className={`flex flex-none flex-col items-center justify-center gap-1 rounded-xl border px-3 text-xs font-bold uppercase tracking-wide ${combatActive ? 'border-amber-300 bg-amber-400 text-stone-900 hover:bg-amber-300' : 'border-white/20 bg-white/10 text-white hover:bg-white/20'}`}
          aria-label="Open the combat page"
        >
          <Swords size={20} aria-hidden="true" />
          Combat
        </button>
      )}
    </div>
  );
}
