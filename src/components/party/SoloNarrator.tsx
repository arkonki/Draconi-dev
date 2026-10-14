import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookCheck, BookmarkPlus, BookOpenText, Check, ChevronRight, Dices, Flag, Ghost, HeartPulse, HelpCircle, Hourglass, MapPin, Moon, PackageSearch, Route, Search, Send, Skull, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../shared/Button';
import { useConfirm } from '../../hooks/useConfirm';
import {
  decideNarratorCall,
  fetchAiSettings,
  fetchNarratorConversation,
  NARRATION_LANGUAGE_OPTIONS,
  resumeSoloNarrator,
  setNarrationGlossary,
  setNarrationLanguage,
  setNarratorMode,
  type NarrationLanguage,
  resetNarrator,
  saveNarratorSummary,
  streamSoloNarrator,
  type NarratorAction,
  type NarratorMessage,
  type NarratorMode,
  type NarratorToolCall,
} from '../../lib/api/ai';
import { toolTitle } from './narratorToolText';
import { saveCharacterJournalEntry } from '../../lib/api/journal';
import { checkpointCampaignSession, startCampaignSession } from '../../lib/api/campaignTime';
import { visibleNarration } from '../../lib/narratorText';
import { useT } from '../../i18n/translate';

interface SoloNarratorProps {
  partyId: string;
  /** The solo hero, whose journal the narration can be saved to. */
  heroId: string | null;
  currentUserId?: string;
  /** Only the owner or a GM can use the narrator, as they are the ones who run the solo rules. */
  canUse: boolean;
  partyName: string;
  /** What a checkpoint needs from the campaign as it stands. */
  checkpoint: { revision: number; sessionId: string | null; sceneLocation: string; sceneDescription: string };
  /** Called after anything that changes the campaign record, so the rest of the page shows the new state. */
  onStateChanged: () => Promise<void> | void;
  /** Opens the end-of-story wizard: conclude, advance, clean up. */
  onEndStory: () => void;
  /** Opens the matching rules dialog on the Adventure tab, filled in. Nothing is rolled until the player confirms there. */
  onAction: (action: NarratorAction) => void;
  /** Fill the height of the panel it sits in (the narrator panel) instead of standing as a card on the page. */
  fill?: boolean;
}

const ACTION_ICONS = { check: Dices, fortune: HelpCircle, rest: Moon, search: Search, scavenge: PackageSearch, npc: Ghost, reveal: ChevronRight, scene: MapPin, push: Dices, consequence: AlertTriangle, inspiration: Wand2, damage: HeartPulse, threat: Hourglass, leave: Route, dying: Skull } as const;

/** A scene the narrator proposed, open for the player to edit before it is saved to the campaign. */
interface SceneDraft { location: string; description: string; situation: string; threads: string }

const usageLabel = (turn: NarratorMessage) => {
  if (!turn.tokens) return null;
  return `${turn.tokens.toLocaleString()} tokens${turn.cachedTokens ? ` (${turn.cachedTokens.toLocaleString()} cached)` : ''}${turn.costUsd ? ` · $${turn.costUsd < 0.01 ? turn.costUsd.toFixed(4) : turn.costUsd.toFixed(3)}` : ''}`;
};

/**
 * Talk to the narrator: say what the hero does and get the scene described, with a few options and, when they fit,
 * buttons that open the right rules dialog. It remembers the story. It writes prose and proposes; dice, hit points and
 * every rule stay with the Adventure tab.
 */
export function SoloNarrator({ partyId, partyName, heroId, currentUserId, canUse, checkpoint, onStateChanged, onAction, onEndStory, fill = false }: SoloNarratorProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const settings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const conversationKey = ['solo-narrator', partyId] as const;
  const conversation = useQuery({ queryKey: conversationKey, queryFn: () => fetchNarratorConversation(partyId), enabled: canUse });
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<{ said: string | null; raw: string } | null>(null);
  const [liveTools, setLiveTools] = useState<Array<Pick<NarratorToolCall, 'id' | 'name' | 'label' | 'status' | 'summary' | 'error'> & { args?: Record<string, unknown> }>>([]);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | null>(null);
  const [glossaryDraft, setGlossaryDraft] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const turns: NarratorMessage[] = conversation.data?.turns ?? [];
  const summary = conversation.data?.summary ?? '';
  const hasKey = Boolean(settings.data?.hasKey);
  const language: NarrationLanguage = conversation.data?.language ?? 'en';
  const mode: NarratorMode = conversation.data?.mode ?? 'ask';
  const busy = pending !== null;
  const starters = [t('Describe where I am.'), t('What do I notice around me?'), t('What could I try next?')];

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [turns.length, pending?.raw]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const streaming = async (run: (handlers: { signal: AbortSignal; onDelta: (piece: string) => void; onTool: (call: (typeof liveTools)[number]) => void }) => Promise<{ toolsUnavailable?: boolean }>, said: string | null, restore?: () => void) => {
    setError(null);
    setNotice(null);
    setLiveTools([]);
    setPending({ said, raw: '' });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const answer = await run({
        signal: controller.signal,
        onDelta: (piece) => setPending((current) => (current ? { ...current, raw: current.raw + piece } : current)),
        onTool: (call) => setLiveTools((current) => (current.some((entry) => entry.id === call.id) ? current.map((entry) => (entry.id === call.id ? call : entry)) : [...current, call])),
      });
      if (answer.toolsUnavailable) setNotice(t('The chosen model cannot use tools, so the narrator only made suggestions. Pick another model in Settings, AI Assistants, to let it act.'));
      await queryClient.invalidateQueries({ queryKey: conversationKey });
      // The exchange is now part of the campaign's event log, so the journal and logs tabs have something new.
      await onStateChanged();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : t('The narrator could not answer.'));
        restore?.();
        await queryClient.invalidateQueries({ queryKey: conversationKey });
      }
    } finally {
      setPending(null);
      setLiveTools([]);
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    // Give the message back if it did not go through, so it is not lost.
    await streaming((handlers) => streamSoloNarrator(partyId, message, handlers), message, () => setInput(message));
  };

  /** Carries a reply on once what it waited for has been decided. */
  const resume = async (turnId: string) => {
    if (busy) return;
    await streaming((handlers) => resumeSoloNarrator(partyId, turnId, handlers), null);
  };

  /** The player approves or declines one thing the narrator wants to do; when none is left waiting, the story goes on. */
  const decide = async (turn: NarratorMessage, call: NarratorToolCall, decision: 'approve' | 'decline') => {
    setDeciding(call.id);
    setError(null);
    try {
      const result = await decideNarratorCall(partyId, turn.id, call.id, decision);
      await queryClient.invalidateQueries({ queryKey: conversationKey });
      if (decision === 'approve') await onStateChanged();
      if (result.awaiting === 0) {
        setDeciding(null);
        await resume(turn.id);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not do that.'));
      await queryClient.invalidateQueries({ queryKey: conversationKey });
    } finally {
      setDeciding(null);
    }
  };

  const modeMutation = useMutation({
    mutationFn: (next: NarratorMode) => setNarratorMode(partyId, next),
    onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: conversationKey }); },
    onError: (failure: Error) => setError(failure.message),
  });

  const saveToJournal = async (turn: NarratorMessage) => {
    if (!heroId || !currentUserId) return;
    try {
      await saveCharacterJournalEntry({ title: `Narration, ${new Date().toLocaleDateString()}`, content: turn.content }, heroId, currentUserId);
      setSavedIds((current) => new Set(current).add(turn.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not save it to the journal.'));
    }
  };

  const languageMutation = useMutation({
    mutationFn: (next: NarrationLanguage) => setNarrationLanguage(partyId, next),
    onSuccess: async () => { setError(null); await Promise.all([queryClient.invalidateQueries({ queryKey: conversationKey }), onStateChanged()]); },
    onError: (failure: Error) => setError(failure.message),
  });
  const glossaryMutation = useMutation({
    mutationFn: (text: string | null) => setNarrationGlossary(partyId, text),
    onSuccess: async () => { setGlossaryDraft(null); setError(null); await Promise.all([queryClient.invalidateQueries({ queryKey: conversationKey }), onStateChanged()]); },
    onError: (failure: Error) => setError(failure.message),
  });
  const summaryMutation = useMutation({
    mutationFn: (text: string) => saveNarratorSummary(partyId, text),
    onSuccess: async () => { setSummaryDraft(null); await queryClient.invalidateQueries({ queryKey: conversationKey }); },
    onError: (failure: Error) => setError(failure.message),
  });
  const resetMutation = useMutation({
    mutationFn: () => resetNarrator(partyId),
    onSuccess: async () => { setSummaryDraft(null); setError(null); await queryClient.invalidateQueries({ queryKey: conversationKey }); },
    onError: (failure: Error) => setError(failure.message),
  });

  const checkpointMutation = useMutation({
    mutationFn: async (scene?: SceneDraft) => {
      const text = (summary || [...turns].reverse().find((turn) => turn.role === 'assistant')?.content || '').trim();
      if (!text) throw new Error(t('Play a little first: a checkpoint needs something to remember.'));
      let { sessionId, revision } = checkpoint;
      if (!sessionId) {
        const confirmed = await confirm({
          title: t('Start a session to save a checkpoint?'),
          description: t('Checkpoints belong to a game session, and none is running. This starts one for this campaign. You can end it later from the Session button.'),
          confirmText: t('Start a session and save'),
        });
        if (!confirmed) return false;
        const started = await startCampaignSession(partyId, revision, { title: `${partyName} solo adventure` });
        sessionId = started.state_excerpt.session.id;
        revision = started.campaign_revision;
      }
      const threads = scene ? scene.threads.split('\n').map((thread) => thread.trim()).filter(Boolean).slice(0, 50) : undefined;
      await checkpointCampaignSession(partyId, sessionId, revision, {
        summary: text.slice(0, 10_000),
        scene: scene
          ? { location: scene.location.trim() || checkpoint.sceneLocation || 'The current scene', description: scene.description.trim(), situation: scene.situation.trim() || undefined }
          : { location: checkpoint.sceneLocation || 'The current scene', description: checkpoint.sceneDescription },
        unresolvedThreads: threads,
      });
      return true;
    },
    onSuccess: async (saved) => {
      if (!saved) return;
      setError(null);
      setSceneDraft(null);
      setNotice(t('Saved. Anyone continuing this story, including an AI assistant, starts from it.'));
      await Promise.all([queryClient.invalidateQueries({ queryKey: conversationKey }), onStateChanged()]);
    },
    onError: (failure: Error) => { setNotice(null); setError(failure.message); },
  });

  const startOver = async () => {
    const confirmed = await confirm({ title: t('Start the story over?'), description: t('The conversation and the story so far are forgotten. Your journal and the game itself are not touched.'), confirmText: t('Start over') });
    if (confirmed) resetMutation.mutate();
  };

  if (!canUse) {
    return <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">{t('The narrator can be used by the campaign owner or a GM.')}</p>;
  }

  const lastTurn = turns[turns.length - 1];
  const draft = summaryDraft ?? summary;

  return (
    <section aria-label={t('Solo narrator')} className={fill ? 'flex h-full min-h-0 flex-col bg-white' : 'flex min-h-[460px] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm'}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          {!fill && <h3 className="font-bold text-stone-900">{t('Narrator')}</h3>}
          <p className="text-xs text-stone-500">{t(mode === 'suggest'
            ? 'Say what your hero does or asks. The narrator describes what happens next and remembers the story. It never rolls dice or changes anything: its buttons open the rules on the Adventure tab, where you decide.'
            : mode === 'trust'
              ? 'Say what your hero does or asks. The narrator describes what happens next, rolls dice and uses the game\'s tools by itself. Everything it did is listed under its reply.'
              : 'Say what your hero does or asks. The narrator describes what happens next and rolls dice for risky moments. Before it changes anything, such as damage, a rest or a threat, it asks you.')}</p>
          <label className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-stone-600" title={t('How much the narrator may do on its own. Ending a mission, ending the session, starting a mission and combat always stay with you.')}>
            {t('The narrator may')}
            <select value={mode} disabled={modeMutation.isPending || busy} onChange={(event) => modeMutation.mutate(event.target.value as NarratorMode)} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-normal">
              <option value="suggest">{t('Only suggest')}</option>
              <option value="ask">{t('Act after I approve')}</option>
              <option value="trust">{t('Act on its own')}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-600" title={t('The language the story is told in, for the narrator and for any AI assistant connected to this campaign')}>
            {t('Story language')}
            <select value={language} disabled={languageMutation.isPending || busy} onChange={(event) => languageMutation.mutate(event.target.value as NarrationLanguage)} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-normal">
              {NARRATION_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {(turns.length > 0 || summary) && <Button type="button" variant="outline" size="sm" icon={Flag} loading={checkpointMutation.isPending} onClick={() => { setNotice(null); checkpointMutation.mutate(undefined); }} title={t('Save the story so far, the scene and the open threads for anyone who continues it')}>{t('Save checkpoint')}</Button>}
          <Button type="button" variant="outline" size="sm" icon={BookCheck} onClick={onEndStory} title={t('Conclude the mission, run the advancement and clean up')}>{t('End the story')}</Button>
          {(turns.length > 0 || summary) && <Button type="button" variant="ghost" size="sm" loading={resetMutation.isPending} onClick={() => void startOver()}>{t('Start over')}</Button>}
        </div>
      </div>

      {!settings.isLoading && !hasKey && (
        <p className="m-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          {t('Add your OpenRouter key under')}<Link to="/settings?section=connections" className="font-semibold underline">{t('Settings, AI Assistants')}</Link> {t('to use the narrator.')}
        </p>
      )}

      <details className="border-b border-stone-200 px-4 py-2 text-sm" open={summaryDraft !== null}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-stone-700"><BookOpenText size={14} /> {t(summary ? 'The story so far' : 'The story so far (nothing yet)')}</summary>
        <p className="mt-2 text-xs text-stone-500">{t('The narrator folds older exchanges into this short summary and reads it every time. Correct it if it got something wrong.')}</p>
        <textarea value={draft} onChange={(event) => setSummaryDraft(event.target.value)} rows={5} maxLength={2000} aria-label={t('The story so far')} className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder={t('It fills in by itself as the story grows.')} />
        {summaryDraft !== null && summaryDraft !== summary && (
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" loading={summaryMutation.isPending} onClick={() => summaryMutation.mutate(summaryDraft)}>{t('Save')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSummaryDraft(null)}>{t('Cancel')}</Button>
          </div>
        )}
      </details>

      {language !== 'en' && conversation.data && (
        <details className="border-b border-stone-200 px-4 py-2 text-sm" open={glossaryDraft !== null}>
          <summary className="cursor-pointer font-semibold text-stone-700">{t(conversation.data.glossary.custom !== null ? "Game terms in the story's language (this campaign's own list)" : "Game terms in the story's language (built-in list)")}</summary>
          <p className="mt-2 text-xs text-stone-500">{t('The narrator uses exactly these words for the game\'s own terms, so they stay the same from reply to reply. The built-in list is only a first proposal. Correct it here, one "English = local" per line. This changes the story text only, not the buttons and dialogs.')}</p>
          <textarea value={glossaryDraft ?? conversation.data.glossary.custom ?? conversation.data.glossary.builtIn} onChange={(event) => setGlossaryDraft(event.target.value)} rows={8} maxLength={2000} aria-label={t('Game terms')} className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs" />
          <div className="mt-2 flex flex-wrap gap-2">
            {glossaryDraft !== null && <Button type="button" size="sm" loading={glossaryMutation.isPending} onClick={() => glossaryMutation.mutate(glossaryDraft)}>{t('Save terms')}</Button>}
            {glossaryDraft !== null && <Button type="button" size="sm" variant="ghost" onClick={() => setGlossaryDraft(null)}>{t('Cancel')}</Button>}
            {conversation.data.glossary.custom !== null && glossaryDraft === null && <Button type="button" size="sm" variant="ghost" loading={glossaryMutation.isPending} onClick={() => glossaryMutation.mutate(null)}>{t('Use the built-in list')}</Button>}
          </div>
        </details>
      )}

      {notice && <p role="status" className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">{notice}</p>}

      {conversation.data?.campaign && (conversation.data.campaign.checkpoint || conversation.data.campaign.openThreads.length > 0 || conversation.data.campaign.sessions.length > 0) && (
        <details className="border-b border-stone-200 px-4 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-stone-700">{t('Also read from the campaign (shared with AI assistants)')}</summary>
          <div className="mt-2 space-y-2 text-xs text-stone-600">
            {conversation.data.campaign.checkpoint && (
              <p><strong>{t(conversation.data.campaign.checkpoint.location ? 'Latest checkpoint, {place}:' : 'Latest checkpoint:', { place: conversation.data.campaign.checkpoint.location })}</strong> {conversation.data.campaign.checkpoint.summary}</p>
            )}
            {conversation.data.campaign.openThreads.length > 0 && <p><strong>{t('Open threads:')}</strong> {conversation.data.campaign.openThreads.join(' · ')}</p>}
            {conversation.data.campaign.sessions.map((session) => <p key={session.title + (session.endedAt ?? '')}><strong>{session.title}:</strong> {session.summary}</p>)}
          </div>
        </details>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {conversation.isLoading && <p className="text-sm text-stone-500">{t('Loading the story…')}</p>}
        {turns.length === 0 && !pending && hasKey && !conversation.isLoading && (
          <div className="space-y-2 text-sm text-stone-500">
            <p>{t('Try one of these, or write your own.')}</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <button key={starter} type="button" disabled={busy} onClick={() => void send(starter)} className="rounded-full border border-stone-300 px-3 py-1 text-stone-700 hover:bg-stone-50 disabled:opacity-50">{starter}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${turn.role === 'user' ? 'bg-indigo-600 text-white' : 'border border-stone-200 bg-stone-50 text-stone-900'}`}>
              {turn.content}
              {turn.role === 'assistant' && (
                <>
                  {(turn.toolCalls?.length ?? 0) > 0 && (
                    <ToolCallList calls={turn.toolCalls ?? []} deciding={deciding} busy={busy} onDecide={(call, decision) => void decide(turn, call, decision)} />
                  )}
                  {turn.canResume && turn.id === lastTurn?.id && !busy && (
                    <div className="mt-2"><Button type="button" size="sm" variant="outline" onClick={() => void resume(turn.id)}>{t('Continue the story')}</Button></div>
                  )}
                  {turn.id === lastTurn?.id && turn.actions.length > 0 && !busy && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turn.actions.map((action, index) => {
                        const Icon = ACTION_ICONS[action.type];
                        return (
                          <button
                            key={`${action.type}-${index}`}
                            type="button"
                            onClick={() => {
                              if (action.type === 'scene') {
                                setSceneDraft({ location: action.location, description: action.description, situation: action.situation, threads: action.threads.join('\n') });
                              } else {
                                onAction(action);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50">
                            <Icon size={12} /> {action.label}
                            {action.type === 'check' && action.modifier !== 'normal' ? <span className="rounded bg-indigo-100 px-1 uppercase">{action.modifier}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {heroId && (
                    <div className="mt-2 flex items-center justify-between gap-3 border-t border-stone-200 pt-1.5 text-xs text-stone-500">
                      <button type="button" onClick={() => void saveToJournal(turn)} disabled={savedIds.has(turn.id)} className="inline-flex items-center gap-1 hover:text-indigo-700 disabled:text-emerald-700">
                        {savedIds.has(turn.id) ? <><Check size={12} /> {t("Saved to the hero's journal")}</> : <><BookmarkPlus size={12} /> {t("Save to the hero's journal")}</>}
                      </button>
                      {usageLabel(turn) && <span title={t('What this reply used')}>{usageLabel(turn)}</span>}
                    </div>
                  )}
                  {!heroId && usageLabel(turn) && <div className="mt-2 border-t border-stone-200 pt-1.5 text-right text-xs text-stone-500">{usageLabel(turn)}</div>}
                </>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <>
            {pending.said && <div className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm text-white">{pending.said}</div></div>}
            <div className="flex justify-start">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900">
                {visibleNarration(pending.raw) || <span className="italic text-stone-500">{t('The narrator is thinking…')}</span>}
                {liveTools.length > 0 && <ToolCallList calls={liveTools.map((call) => ({ ...call, args: call.args ?? {}, tier: 'auto' as const }))} deciding={null} busy onDecide={() => undefined} />}
              </div>
            </div>
          </>
        )}
        <div ref={endRef} />
      </div>

      {sceneDraft && (
        <div className="mx-4 mb-3 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm">
          <h4 className="font-bold text-indigo-900">{t('Update the scene in the campaign')}</h4>
          <p className="text-xs text-indigo-800">{t("The narrator suggests this. Change anything you like, then save it as the campaign's scene and open threads. The narrator and any AI assistant continue from it.")}</p>
          <label className="block text-xs font-semibold text-stone-700">{t('Where the hero is')}
            <input value={sceneDraft.location} onChange={(event) => setSceneDraft({ ...sceneDraft, location: event.target.value })} maxLength={500} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">{t('The place')}
            <textarea value={sceneDraft.description} onChange={(event) => setSceneDraft({ ...sceneDraft, description: event.target.value })} rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">{t('What is going on')}
            <textarea value={sceneDraft.situation} onChange={(event) => setSceneDraft({ ...sceneDraft, situation: event.target.value })} rows={2} maxLength={1000} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold text-stone-700">{t('Open threads (one per line)')}
            <textarea value={sceneDraft.threads} onChange={(event) => setSceneDraft({ ...sceneDraft, threads: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-normal" />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={checkpointMutation.isPending} disabled={!sceneDraft.location.trim() && !sceneDraft.description.trim()} onClick={() => checkpointMutation.mutate(sceneDraft)}>{t('Save to the campaign')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSceneDraft(null)}>{t('Not now')}</Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      <form className="flex items-end gap-2 border-t border-stone-200 p-3" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(input); } }}
          rows={2}
          maxLength={2000}
          disabled={!hasKey}
          aria-label={t('What does your hero do?')}
          placeholder={hasKey ? t('I step onto the bridge…  (Ctrl or Cmd + Enter to send)') : t('Add your key first')}
          className="min-w-0 flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-stone-100"
        />
        <Button type="submit" icon={Send} loading={busy} disabled={!input.trim() || !hasKey}>{t('Send')}</Button>
      </form>
      {confirmDialog}
    </section>
  );
}

const STATUS_STYLE: Record<NarratorToolCall['status'], string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-950',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  failed: 'border-red-200 bg-red-50 text-red-900',
  declined: 'border-stone-200 bg-stone-100 text-stone-600',
  expired: 'border-stone-200 bg-stone-100 text-stone-500',
};

/** What the narrator did with the game's tools in a reply, and the actions still waiting for the player. */
function ToolCallList({ calls, deciding, busy, onDecide }: {
  calls: Array<Pick<NarratorToolCall, 'id' | 'name' | 'label' | 'status' | 'summary' | 'error' | 'args'> & Partial<Pick<NarratorToolCall, 'tier'>>>;
  deciding: string | null;
  busy: boolean;
  onDecide: (call: NarratorToolCall, decision: 'approve' | 'decline') => void;
}) {
  const t = useT();
  return (
    <ul className="mt-2 space-y-1.5" aria-label={t('What the narrator did')}>
      {calls.map((call) => {
        const title = toolTitle({ name: call.name, args: call.args ?? {}, label: call.label }, t);
        return (
          <li key={call.id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${STATUS_STYLE[call.status]}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold">{call.status === 'declined' ? t('Declined: {title}', { title }) : call.status === 'expired' ? t('No longer needed: {title}', { title }) : title}</span>
                {call.status === 'done' && call.summary && <div className="mt-0.5 break-words opacity-80">{call.summary}</div>}
                {call.status === 'failed' && <div className="mt-0.5 break-words">{call.error}</div>}
                {call.status === 'pending' && <div className="mt-0.5 opacity-80">{t('The narrator is waiting for your answer.')}</div>}
              </div>
              {call.status === 'pending' && !busy && (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" loading={deciding === call.id} disabled={deciding !== null} onClick={() => onDecide(call as NarratorToolCall, 'approve')}>{t('Approve')}</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={deciding !== null} onClick={() => onDecide(call as NarratorToolCall, 'decline')}>{t('Decline')}</Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
