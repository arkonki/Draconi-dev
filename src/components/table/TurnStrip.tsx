import { Swords } from 'lucide-react';
import type { TurnEntry } from '../../lib/tableTurn';

interface TurnStripProps {
  round: number | null;
  entries: TurnEntry[];
  /** The GM can click an entry to find its token. */
  onSelect?: (entry: TurnEntry) => void;
}

/** The next few actions of the running encounter, with the one acting now first. */
export function TurnStrip({ round, entries, onSelect }: TurnStripProps) {
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-stone-700 bg-stone-900 px-3 py-2 text-white" aria-label="Turn order">
      <span className="flex flex-none items-center gap-1 text-xs font-bold uppercase tracking-wide text-amber-300">
        <Swords size={14} /> {round ? `Round ${round}` : 'Combat'}
      </span>
      <ol className="flex items-center gap-1.5">
        {entries.map((entry) => {
          const content = (
            <>
              <span className="font-mono text-[11px] opacity-70">{entry.initiative ?? '–'}</span>
              <span className="max-w-[9rem] truncate">{entry.label}</span>
            </>
          );
          const className = `flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
            entry.isCurrent ? 'border-amber-300 bg-amber-400 font-bold text-stone-900' : entry.isPlayerCharacter ? 'border-indigo-400/50 bg-indigo-500/20' : 'border-white/15 bg-white/10'
          } ${entry.concealed ? 'italic opacity-80' : ''}`;
          return (
            <li key={entry.key} aria-current={entry.isCurrent ? 'true' : undefined}>
              {onSelect && entry.itemId ? (
                <button type="button" onClick={() => onSelect(entry)} className={`${className} hover:brightness-110`}>{content}</button>
              ) : (
                <span className={className}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
