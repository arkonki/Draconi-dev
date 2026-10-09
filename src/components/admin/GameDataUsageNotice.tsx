import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import type { GameDataUsage } from '../../lib/api/gameDataUsage';

interface GameDataUsageNoticeProps {
  usage: GameDataUsage | null;
  error: string | null;
}

function listExamples(examples: string[], count: number) {
  const shown = examples.join(', ');
  return count > examples.length ? `${shown} and ${count - examples.length} more` : shown;
}

/** Shows, inside a delete confirmation, where the entry is still in use. */
export function GameDataUsageNotice({ usage, error }: GameDataUsageNoticeProps) {
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        Could not check where this is used ({error}). You can still delete it, but make sure nothing depends on it.
      </p>
    );
  }
  if (!usage) {
    return <div className="py-3"><LoadingSpinner size="sm" text="Checking where this is used…" /></div>;
  }
  if (usage.total === 0) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-900">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
        Nothing refers to this entry, so deleting it affects no characters, stashes or encounters.
      </p>
    );
  }
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> This entry is in use</p>
      <ul className="space-y-1">
        {usage.usage.map((entry) => (
          <li key={entry.key}>
            <strong>{entry.count}</strong> {entry.label}
            {entry.examples.length > 0 && <span className="text-amber-800"> ({listExamples(entry.examples, entry.count)})</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-800">
        They keep the name, but lose the entry&rsquo;s details and rules, and it can no longer be picked for new characters.
      </p>
    </div>
  );
}
