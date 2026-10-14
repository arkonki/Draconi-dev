import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookCheck, Check, CheckCircle2, Circle, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { useT } from '../../i18n/translate';
import { completeSoloMission, fetchSoloState, takeSoloRest, type SoloActor, type SoloState } from '../../lib/api/solo';
import { endCampaignSession } from '../../lib/api/campaignTime';
import { draftSessionRecap } from '../../lib/api/sessionRecap';
import { fetchAiSettings, fetchNarratorConversation, polishRecap, resetNarrator } from '../../lib/api/ai';
import { saveCharacterJournalEntry } from '../../lib/api/journal';

interface SoloEndStoryProps {
  partyId: string;
  partyName: string;
  state: SoloState;
  hero: SoloActor | null;
  currentUserId?: string;
  /** Whether the mission may be concluded as a success right now (at its objective or at the end of its return). */
  canCompleteSuccessfully: boolean;
  /** The advancement, as the Solo page shows it. Null when there is none to do. */
  advancementPanel: ReactNode;
  /** Called after anything that changes the campaign, so the page shows the new state. */
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}

type Step = 'mission' | 'advancement' | 'wrapup' | 'done';
type TaskKey = 'journal' | 'session' | 'rest' | 'fresh';
type TaskStatus = 'waiting' | 'running' | 'done' | 'failed';

const clockLabel = (state: SoloState): string => {
  const elapsed = Number((state.gameTime as { elapsedSeconds?: number }).elapsedSeconds ?? 0);
  return `Day ${Math.floor(elapsed / 86_400) + 1}`;
};

/**
 * Ends a story properly, in order: conclude the mission, run the advancement it earned, then tidy up. Tidying up means
 * saving the story to the hero's journal, closing the game session, an optional rest, and a fresh start for the narrator.
 * The mission's leftover dangers and creatures are settled by the server when the mission ends.
 */
export function SoloEndStory({ partyId, partyName, state, hero, currentUserId, canCompleteSuccessfully, advancementPanel, onChanged, onClose }: SoloEndStoryProps) {
  const t = useT();
  // The mission is gone from the state once it is concluded, so remember what it was called.
  const missionTitle = useRef(state.activeMission?.title ?? '');
  const initialStep: Step = state.activeMission ? 'mission' : state.pendingAdvancement ? 'advancement' : 'wrapup';
  const [step, setStep] = useState<Step>(initialStep);
  const [outcome, setOutcome] = useState<'success' | 'failure' | 'abandoned'>(canCompleteSuccessfully ? 'success' : 'failure');
  const [missionSummary, setMissionSummary] = useState('');
  const [cleanup, setCleanup] = useState<{ settledDangers: number; retiredNpcs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saveJournal, setSaveJournal] = useState(true);
  const [endSession, setEndSession] = useState(Boolean(state.activeSessionId));
  const [sessionSummary, setSessionSummary] = useState('');
  const [takeRest, setTakeRest] = useState(false);
  const [safePlace, setSafePlace] = useState(false);
  const [freshStart, setFreshStart] = useState(true);
  const [tasks, setTasks] = useState<Partial<Record<TaskKey, TaskStatus>>>({});
  const [drafting, setDrafting] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const conversation = useQuery({ queryKey: ['solo-narrator', partyId], queryFn: () => fetchNarratorConversation(partyId) });
  const aiSettings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const storyText = conversation.data?.summary || [...(conversation.data?.turns ?? [])].filter((turn) => turn.role === 'assistant').slice(-3).map((turn) => turn.content).join('\n\n');
  const hasStory = Boolean(storyText.trim());
  const canRest = Boolean(hero && hero.hp.current > 0 && !state.activeCombat);

  // With nothing left to advance, go straight on.
  useEffect(() => {
    if (step === 'advancement' && !state.pendingAdvancement && !busy) setStep('wrapup');
  }, [step, state.pendingAdvancement, busy]);

  // A first draft of the session summary when the wrap-up opens, from what the app recorded.
  const drafted = useRef(false);
  useEffect(() => {
    if (step !== 'wrapup' || drafted.current || !state.activeSessionId) return;
    drafted.current = true;
    setDrafting(true);
    const session = { title: `${partyName} solo adventure`, startedAt: null };
    void draftSessionRecap(partyId, session, clockLabel(state))
      .then((draft) => setSessionSummary((current) => current || draft))
      .catch(() => undefined)
      .finally(() => setDrafting(false));
  }, [step, partyId, partyName, state]);

  const concludeMission = async () => {
    if (!state.activeMission) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeSoloMission(partyId, state.activeMission.id, state.campaignRevision, { outcome, summary: missionSummary.trim() });
      const settled = (result.state_excerpt as { cleanup?: { settledDangers: number; retiredNpcs: number } }).cleanup ?? null;
      setCleanup(settled);
      await onChanged();
      setStep(outcome === 'success' ? 'advancement' : 'wrapup');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not complete the solo mission.'));
    } finally {
      setBusy(false);
    }
  };

  const polish = async () => {
    setPolishing(true);
    setError(null);
    try {
      setSessionSummary((await polishRecap(partyId, sessionSummary)).text);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not polish the summary.'));
    } finally {
      setPolishing(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    const mark = (key: TaskKey, status: TaskStatus) => setTasks((current) => ({ ...current, [key]: status }));
    const planned: Array<{ key: TaskKey; enabled: boolean; run: () => Promise<void> }> = [
      {
        key: 'journal',
        enabled: saveJournal && hasStory && Boolean(hero && currentUserId),
        run: async () => {
          const title = `${t('Story')}: ${missionTitle.current || partyName}`;
          const content = [missionSummary.trim(), storyText.trim()].filter(Boolean).join('\n\n');
          await saveCharacterJournalEntry({ title, content }, hero!.id, currentUserId!);
        },
      },
      {
        key: 'session',
        enabled: endSession && Boolean(state.activeSessionId),
        run: async () => {
          const fresh = await fetchSoloState(partyId);
          if (!fresh.activeSessionId) return;
          await endCampaignSession(partyId, fresh.activeSessionId, fresh.campaignRevision, { summary: sessionSummary.trim(), unresolvedThreads: [] });
        },
      },
      {
        key: 'rest',
        enabled: takeRest && safePlace && canRest,
        run: async () => {
          const fresh = await fetchSoloState(partyId);
          await takeSoloRest(partyId, fresh.campaignRevision, { restType: 'shift', useHealing: false, safeLocation: true });
        },
      },
      { key: 'fresh', enabled: freshStart, run: async () => { await resetNarrator(partyId); } },
    ];
    let failed = false;
    for (const task of planned) {
      if (!task.enabled || tasks[task.key] === 'done') continue;
      mark(task.key, 'running');
      try {
        await task.run();
        mark(task.key, 'done');
      } catch (failure) {
        mark(task.key, 'failed');
        setError(failure instanceof Error ? failure.message : t('Something went wrong. Try again.'));
        failed = true;
        break;
      }
    }
    await onChanged();
    setBusy(false);
    if (!failed) setStep('done');
  };

  const needsSummary = endSession && !sessionSummary.trim();
  const taskLabel: Record<TaskKey, string> = {
    journal: t("Saved the story to the hero's journal"),
    session: t('Ended the game session'),
    rest: t('Took a shift rest'),
    fresh: t('Cleared the narrator for a fresh start'),
  };
  const icon = (status: TaskStatus | undefined) => (status === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : status === 'failed' ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Circle className="h-4 w-4 text-stone-300" />);

  const stepNames: Array<[Step, string]> = [['mission', t('Conclude')], ['advancement', t('Advance')], ['wrapup', t('Clean up')]];
  const stepIndex = (value: Step) => (value === 'done' ? 3 : stepNames.findIndex(([name]) => name === value));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={t('End the story')} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-gradient-to-r from-indigo-50 to-amber-50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900"><BookCheck className="h-5 w-5 text-indigo-600" /> {t('End the story')}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-40" aria-label={t('Close')}><X className="h-5 w-5" /></button>
        </div>

        <ol className="flex gap-2 border-b border-stone-100 px-5 py-3 text-xs font-bold uppercase tracking-wide" aria-label={t('Steps')}>
          {stepNames.map(([name, label], index) => (
            <li key={name} aria-current={step === name ? 'step' : undefined} className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${step === name ? 'bg-indigo-600 text-white' : stepIndex(step) > index ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'}`}>
              {stepIndex(step) > index ? <Check className="h-3 w-3" /> : <span>{index + 1}</span>} {label}
            </li>
          ))}
        </ol>

        <div className="space-y-4 overflow-y-auto p-5 sm:p-6">
          {step === 'mission' && state.activeMission && (
            <>
              <p className="text-sm text-stone-600">{t('Conclude the mission "{title}". Whatever it left behind, such as active dangers and its creatures, is settled automatically.', { title: state.activeMission.title })}</p>
              {!canCompleteSuccessfully && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('Success becomes available at the final objective waypoint. You may record failure or abandonment now.')}</div>}
              <label className="block text-sm font-bold text-stone-700">{t('Outcome')}
                <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                  <option value="success" disabled={!canCompleteSuccessfully}>{t('Success')}</option>
                  <option value="failure">{t('Failure')}</option>
                  <option value="abandoned">{t('Abandoned')}</option>
                </select>
              </label>
              <label className="block text-sm font-bold text-stone-700">{t('Mission summary')}
                <textarea value={missionSummary} onChange={(event) => setMissionSummary(event.target.value)} maxLength={10000} rows={4} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={t('Record what happened and what remains unresolved.')} />
              </label>
              <Button type="button" fullWidth loading={busy} disabled={!missionSummary.trim() || (outcome === 'success' && !canCompleteSuccessfully)} onClick={() => void concludeMission()}>{t('Conclude the mission')}</Button>
            </>
          )}

          {step === 'advancement' && (
            <>
              {cleanup && (cleanup.settledDangers > 0 || cleanup.retiredNpcs > 0) && (
                <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{t('Cleaned up: {dangers} dangers settled, {creatures} creatures retired.', { dangers: cleanup.settledDangers, creatures: cleanup.retiredNpcs })}</p>
              )}
              {advancementPanel}
              <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                <Button type="button" variant="ghost" onClick={() => setStep('wrapup')}>{t('Skip for now')}</Button>
              </div>
              <p className="text-xs text-stone-500">{t('Skipped advancement stays pending. A banner on the Story tab brings it back.')}</p>
            </>
          )}

          {step === 'wrapup' && (
            <>
              {state.pendingAdvancement && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('The advancement is still pending. It stays available on the Story tab.')}</p>}
              <p className="text-sm text-stone-600">{t('Choose what to tidy up. Everything is optional, and nothing is deleted from the game.')}</p>

              <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${hasStory ? 'border-stone-200' : 'border-stone-100 text-stone-400'}`}>
                <input id="end-story-journal" type="checkbox" className="mt-0.5 h-4 w-4" checked={saveJournal && hasStory} disabled={!hasStory || !hero} onChange={(event) => setSaveJournal(event.target.checked)} />
                <div><label htmlFor="end-story-journal" className="font-bold">{t("Save the story to the hero's journal")}</label><span className="block text-xs text-stone-500">{hasStory ? t('The story so far and the mission summary become a journal entry.') : t('There is no story to save yet.')}</span></div>
              </div>

              {state.activeSessionId && (
                <div className="rounded-lg border border-stone-200 p-3 text-sm">
                  <div className="flex items-start gap-3">
                    <input id="end-story-session" type="checkbox" className="mt-0.5 h-4 w-4" checked={endSession} onChange={(event) => setEndSession(event.target.checked)} />
                    <div><label htmlFor="end-story-session" className="font-bold">{t('End the game session')}</label><span className="block text-xs text-stone-500">{t('Closes the session with a summary and clears the open threads.')}</span></div>
                  </div>
                  {endSession && (
                    <div className="mt-3 space-y-2">
                      <textarea value={sessionSummary} onChange={(event) => setSessionSummary(event.target.value)} rows={6} maxLength={10000} aria-label={t('Session summary')} placeholder={drafting ? t('Drafting from this session…') : t('Session summary (required)')} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
                      {aiSettings.data?.hasKey && <Button type="button" size="sm" variant="secondary" icon={Sparkles} loading={polishing} disabled={!sessionSummary.trim()} onClick={() => void polish()}>{t('Polish with AI')}</Button>}
                    </div>
                  )}
                </div>
              )}

              <div className={`rounded-lg border p-3 text-sm ${canRest ? 'border-stone-200' : 'border-stone-100 text-stone-400'}`}>
                <div className="flex items-start gap-3">
                  <input id="end-story-rest" type="checkbox" className="mt-0.5 h-4 w-4" checked={takeRest && canRest} disabled={!canRest} onChange={(event) => setTakeRest(event.target.checked)} />
                  <div><label htmlFor="end-story-rest" className="font-bold">{t('Take a shift rest')}</label><span className="block text-xs text-stone-500">{t('Fully restores HP and WP and clears standard conditions. Needs a safe place.')}</span></div>
                </div>
                {takeRest && canRest && (
                  <label className="mt-2 flex items-start gap-3 pl-7 text-xs">
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={safePlace} onChange={(event) => setSafePlace(event.target.checked)} />
                    <span>{t('I confirm this is a safe location')}</span>
                  </label>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 text-sm">
                <input id="end-story-fresh" type="checkbox" className="mt-0.5 h-4 w-4" checked={freshStart} onChange={(event) => setFreshStart(event.target.checked)} />
                <div><label htmlFor="end-story-fresh" className="font-bold">{t('Start the narrator fresh')}</label><span className="block text-xs text-stone-500">{t('Forgets the conversation and the story so far, so the next story begins clean. Do this after saving it to the journal.')}</span></div>
              </div>

              {Object.keys(tasks).length > 0 && (
                <ul className="space-y-1.5 text-sm" aria-live="polite">
                  {(Object.keys(taskLabel) as TaskKey[]).filter((key) => tasks[key]).map((key) => (
                    <li key={key} className="flex items-center gap-2">{icon(tasks[key])} {taskLabel[key]}</li>
                  ))}
                </ul>
              )}

              <Button type="button" fullWidth loading={busy} disabled={needsSummary || (takeRest && !safePlace && canRest)} onClick={() => void finish()}>{t('Finish the story')}</Button>
            </>
          )}

          {step === 'done' && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h3 className="text-lg font-bold text-stone-900">{t('The story is finished')}</h3>
              <ul className="mx-auto max-w-sm space-y-1.5 text-left text-sm">
                {(Object.keys(taskLabel) as TaskKey[]).filter((key) => tasks[key] === 'done').map((key) => <li key={key} className="flex items-center gap-2">{icon('done')} {taskLabel[key]}</li>)}
              </ul>
              <p className="text-sm text-stone-600">{t('Start a new mission or simply begin the next story in the Story tab.')}</p>
              <Button type="button" fullWidth onClick={onClose}>{t('Done')}</Button>
            </div>
          )}

          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        </div>
      </div>
    </div>
  );
}
