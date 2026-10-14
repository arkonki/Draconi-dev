import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookMarked, TrendingUp } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useT } from '../../i18n/translate';
import { fetchSoloStories, type SoloStory } from '../../lib/api/soloStories';

interface SoloStoryLibraryProps {
  partyId: string;
  canManage: boolean;
  /** Picks a story up again: it becomes the narrator's story so far and a new mission is planned from it. */
  onContinue: (story: SoloStory) => void;
}

const OUTCOME_STYLE: Record<SoloStory['outcome'], string> = {
  success: 'bg-emerald-100 text-emerald-800',
  failure: 'bg-red-100 text-red-800',
  abandoned: 'bg-stone-200 text-stone-700',
  unfinished: 'bg-amber-100 text-amber-800',
};

const when = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Every finished story, newest first: how it ended, what it improved, and the narrator's telling if it was kept. */
export function SoloStoryLibrary({ partyId, canManage, onContinue }: SoloStoryLibraryProps) {
  const t = useT();
  const stories = useQuery({ queryKey: ['solo-stories', partyId], queryFn: () => fetchSoloStories(partyId), enabled: canManage });

  if (!canManage) return <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">{t('The story library can be used by the campaign owner or a GM.')}</p>;
  if (stories.isLoading) return <div className="flex justify-center py-12"><LoadingSpinner size="md" /></div>;
  if (stories.error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{stories.error.message}</p>;
  const list = stories.data ?? [];

  return (
    <section aria-label={t('Story library')} className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-stone-900"><BookMarked className="h-5 w-5 text-indigo-600" /> {t('Story library')}</h3>
        <p className="text-sm text-stone-500">{t('Every finished story with how it ended and what it improved. Pick one up again to continue from it.')}</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          <BookMarked className="mx-auto mb-3 h-10 w-10 text-stone-300" />
          <p>{t('No story has been finished yet. When you end a story it is kept here.')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((story) => (
            <li key={story.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h4 className="font-bold text-stone-900">{story.title}</h4>
                  {story.objective && <p className="mt-0.5 text-sm text-stone-600">{story.objective}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-bold ${OUTCOME_STYLE[story.outcome]}`}>{t(story.outcome === 'success' ? 'Success' : story.outcome === 'failure' ? 'Failure' : story.outcome === 'abandoned' ? 'Abandoned' : 'Unfinished')}</span>
                  {story.endedAt && <time className="text-stone-400" dateTime={story.endedAt}>{when(story.endedAt)}</time>}
                </div>
              </div>

              {story.summary && <p className="mt-3 whitespace-pre-wrap text-sm text-stone-800">{story.summary}</p>}

              {(story.improvements.length > 0 || story.newAbilities > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  {story.improvements.map((entry) => <span key={entry.skill} className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">{entry.skill} {entry.from} → {entry.to}</span>)}
                  {story.newAbilities > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">{t(story.newAbilities === 1 ? '{count} new heroic ability' : '{count} new heroic abilities', { count: story.newAbilities })}</span>}
                </div>
              )}

              {story.narrative && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-900">{t('Read how it was told')}</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-stone-800">{story.narrative}</p>
                </details>
              )}

              {(story.narrative || story.summary) && (
                <div className="mt-3 border-t border-stone-100 pt-3">
                  <Button type="button" size="sm" variant="outline" icon={ArrowRight} onClick={() => onContinue(story)}>{t('Continue from this story')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
