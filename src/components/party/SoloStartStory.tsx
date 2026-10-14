import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText, Flag, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { useT } from '../../i18n/translate';
import { fetchSoloState, startSoloMission } from '../../lib/api/solo';
import { fetchAiSettings, proposeSoloMission, type MissionProposal } from '../../lib/api/ai';

interface SoloStartStoryProps {
  partyId: string;
  /** Something to start the idea box with, such as a reference to the story just continued. */
  initialIdea?: string;
  /** Opens the plain mission form instead, for someone who would rather write it all. */
  onWriteMyself: () => void;
  /** Called after the mission was created, so the page shows it. */
  onCreated: () => Promise<void> | void;
  onClose: () => void;
  /** Why a mission cannot begin yet, such as an advancement that is still waiting. Planning is still allowed. */
  blockedReason?: string;
}

type Step = 'idea' | 'review';

interface Draft {
  title: string;
  objective: string;
  openingTitle: string;
  openingDescription: string;
  foreseen: Array<{ title: string; description: string }>;
  unknownWaypoints: number;
  threatDescription: string;
  threatRecurring: boolean;
  threatEffect: string;
}

const MAX_WAYPOINTS = 12;

const toDraft = (mission: MissionProposal): Draft => ({
  title: mission.title,
  objective: mission.objective,
  openingTitle: mission.opening.title,
  openingDescription: mission.opening.description,
  foreseen: mission.foreseen.map((entry) => ({ ...entry })),
  unknownWaypoints: mission.unknownWaypoints,
  threatDescription: mission.threat.description,
  threatRecurring: mission.threat.recurring,
  threatEffect: mission.threat.triggerEffect,
});

/**
 * Starts the next story: give a one-line idea, let the narrator propose a mission from it and from everything that has
 * happened so far, change whatever you like, and begin. The narrator only drafts; the mission is created with the same
 * rules and the same call as one written by hand.
 */
export function SoloStartStory({ partyId, initialIdea = '', onWriteMyself, onCreated, onClose, blockedReason }: SoloStartStoryProps) {
  const t = useT();
  const aiSettings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const hasKey = Boolean(aiSettings.data?.hasKey);
  const [step, setStep] = useState<Step>('idea');
  const [idea, setIdea] = useState(initialIdea);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examples = [t('A haunted lighthouse on the northern coast'), t('A missing caravan and a suspicious innkeeper'), t('Something ancient stirs beneath the old mill')];

  const propose = async () => {
    setBusy(true);
    setError(null);
    try {
      const answer = await proposeSoloMission(partyId, idea.trim());
      setDraft(toDraft(answer.mission));
      setStep('review');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('The narrator could not propose a mission.'));
    } finally {
      setBusy(false);
    }
  };

  const update = (changes: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...changes } : current));
  const total = draft ? draft.foreseen.filter((entry) => entry.title.trim()).length + draft.unknownWaypoints + 2 : 0;
  const complete = Boolean(!blockedReason && draft && draft.title.trim() && draft.objective.trim() && draft.openingTitle.trim() && draft.openingDescription.trim() && draft.threatDescription.trim() && total <= MAX_WAYPOINTS);

  const begin = async () => {
    if (!draft || !complete) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await fetchSoloState(partyId);
      const foreseen = draft.foreseen.map((entry) => ({ title: entry.title.trim(), description: entry.description.trim() })).filter((entry) => entry.title);
      await startSoloMission(partyId, fresh.campaignRevision, {
        title: draft.title.trim(),
        objective: draft.objective.trim(),
        waypointCount: foreseen.length + draft.unknownWaypoints + 2,
        unknownWaypointCount: draft.unknownWaypoints,
        foreseenWaypoints: foreseen,
        openingTitle: draft.openingTitle.trim(),
        openingDescription: draft.openingDescription.trim(),
        threatDescription: draft.threatDescription.trim(),
        threatRecurring: draft.threatRecurring,
        threatTriggerEffect: draft.threatEffect.trim(),
      });
      await onCreated();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not start the solo mission.'));
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={t('Start a new story')} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-gradient-to-r from-indigo-50 to-amber-50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900"><BookOpenText className="h-5 w-5 text-indigo-600" /> {t('Start a new story')}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-40" aria-label={t('Close')}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5 sm:p-6">
          {step === 'idea' && (
            <>
              <p className="text-sm text-stone-600">{t('Give the narrator an idea in a line or two. It proposes a mission that follows from the story so far, and you change anything before it begins.')}</p>
              <label className="block text-sm font-bold text-stone-700">{t('Your idea')}
                <textarea value={idea} onChange={(event) => setIdea(event.target.value)} rows={3} maxLength={600} disabled={!hasKey} className={field} placeholder={hasKey ? t('A haunted lighthouse on the northern coast') : t('Add your key first')} />
              </label>
              {hasKey && (
                <div className="flex flex-wrap gap-2">
                  {examples.map((example) => (
                    <button key={example} type="button" onClick={() => setIdea(example)} className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50">{example}</button>
                  ))}
                </div>
              )}
              {!hasKey && !aiSettings.isLoading && <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">{t('To let the narrator propose missions, add your OpenRouter key in Settings under AI Assistants. You can always write the mission yourself.')}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={onWriteMyself}>{t('Write it myself')}</Button>
                <Button type="button" icon={Sparkles} loading={busy} disabled={!hasKey} onClick={() => void propose()}>{idea.trim() ? t('Propose a mission') : t('Propose a follow-on mission')}</Button>
              </div>
            </>
          )}

          {step === 'review' && draft && (
            <>
              <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">{t('This is the narrator\'s proposal. Change anything you like, then begin.')}</p>
              {blockedReason && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{blockedReason}</p>}
              <label className="block text-sm font-bold text-stone-700">{t('Mission title')}
                <input value={draft.title} onChange={(event) => update({ title: event.target.value })} maxLength={200} className={field} />
              </label>
              <label className="block text-sm font-bold text-stone-700">{t('Objective')}
                <textarea value={draft.objective} onChange={(event) => update({ objective: event.target.value })} maxLength={2000} rows={3} className={field} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-stone-700">{t('Opening waypoint')}
                  <input value={draft.openingTitle} onChange={(event) => update({ openingTitle: event.target.value })} maxLength={200} className={field} />
                </label>
                <label className="block text-sm font-bold text-stone-700">{t('Unknown waypoints')}
                  <select value={draft.unknownWaypoints} onChange={(event) => update({ unknownWaypoints: Number(event.target.value) })} className={`${field} bg-white`}>
                    {[0, 1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-bold text-stone-700">{t('Opening description')}
                <textarea value={draft.openingDescription} onChange={(event) => update({ openingDescription: event.target.value })} maxLength={2000} rows={3} className={field} />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-bold text-stone-700">{t('Planned foreseen waypoints')}</legend>
                {draft.foreseen.map((entry, index) => (
                  <div key={index} className="flex gap-2">
                    <input value={entry.title} onChange={(event) => update({ foreseen: draft.foreseen.map((item, at) => (at === index ? { ...item, title: event.target.value } : item)) })} maxLength={200} aria-label={t('Waypoint title')} placeholder={t('Waypoint title')} className="w-1/3 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                    <input value={entry.description} onChange={(event) => update({ foreseen: draft.foreseen.map((item, at) => (at === index ? { ...item, description: event.target.value } : item)) })} maxLength={1000} aria-label={t('Description')} placeholder={t('Description')} className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                    <button type="button" onClick={() => update({ foreseen: draft.foreseen.filter((_, at) => at !== index) })} aria-label={t('Remove')} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {draft.foreseen.length < 8 && <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => update({ foreseen: [...draft.foreseen, { title: '', description: '' }] })}>{t('Add a place')}</Button>}
                {total > MAX_WAYPOINTS && <p className="text-xs text-red-700">{t('Unknown waypoints remain hidden until reached. Opening, planned, unknown, and objective waypoints may total at most 12.')}</p>}
              </fieldset>

              <div className="rounded-lg border border-stone-200 p-3">
                <label className="block text-sm font-bold text-stone-700">{t('Threat')}
                  <input value={draft.threatDescription} onChange={(event) => update({ threatDescription: event.target.value })} maxLength={2000} className={field} />
                </label>
                <label className="mt-3 block text-sm font-bold text-stone-700">{t('Threat trigger effect')}
                  <textarea value={draft.threatEffect} onChange={(event) => update({ threatEffect: event.target.value })} maxLength={2000} rows={2} className={field} />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-stone-700">
                  <input type="checkbox" checked={draft.threatRecurring} onChange={(event) => update({ threatRecurring: event.target.checked })} className="h-4 w-4" /> {t('Recurring threat (reset to 1 after its event is resolved)')}
                </label>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep('idea')} disabled={busy}>{t('Back')}</Button>
                  <Button type="button" variant="outline" icon={RefreshCw} loading={busy} onClick={() => void propose()}>{t('Propose another')}</Button>
                </div>
                <Button type="button" icon={Flag} loading={busy} disabled={!complete} onClick={() => void begin()}>{t('Begin the story')}</Button>
              </div>
            </>
          )}

          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        </div>
      </div>
    </div>
  );
}
