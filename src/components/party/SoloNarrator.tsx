import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, BookOpenText, Check, Dices, HelpCircle, Moon, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../shared/Button';
import { useConfirm } from '../../hooks/useConfirm';
import {
  fetchAiSettings,
  fetchNarratorConversation,
  resetNarrator,
  saveNarratorSummary,
  streamSoloNarrator,
  type NarratorAction,
  type NarratorMessage,
} from '../../lib/api/ai';
import { saveCharacterJournalEntry } from '../../lib/api/journal';
import { visibleNarration } from '../../lib/narratorText';

interface SoloNarratorProps {
  partyId: string;
  /** The solo hero, whose journal the narration can be saved to. */
  heroId: string | null;
  currentUserId?: string;
  /** Only the owner or a GM can use the narrator, as they are the ones who run the solo rules. */
  canUse: boolean;
  /** Opens the matching rules dialog on the Adventure tab, filled in. Nothing is rolled until the player confirms there. */
  onAction: (action: NarratorAction) => void;
}

const STARTERS = ['Describe where I am.', 'What do I notice around me?', 'What could I try next?'];

const ACTION_ICONS = { check: Dices, fortune: HelpCircle, rest: Moon } as const;

/**
 * Talk to the narrator: say what the hero does and get the scene described, with a few options and, when they fit,
 * buttons that open the right rules dialog. It remembers the story. It writes prose and proposes; dice, hit points and
 * every rule stay with the Adventure tab.
 */
export function SoloNarrator({ partyId, heroId, currentUserId, canUse, onAction }: SoloNarratorProps) {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const settings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const conversationKey = ['solo-narrator', partyId] as const;
  const conversation = useQuery({ queryKey: conversationKey, queryFn: () => fetchNarratorConversation(partyId), enabled: canUse });
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<{ said: string; raw: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const turns: NarratorMessage[] = conversation.data?.turns ?? [];
  const summary = conversation.data?.summary ?? '';
  const hasKey = Boolean(settings.data?.hasKey);
  const busy = pending !== null;

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [turns.length, pending?.raw]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput('');
    setPending({ said: message, raw: '' });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamSoloNarrator(partyId, message, { signal: controller.signal, onDelta: (piece) => setPending((current) => (current ? { ...current, raw: current.raw + piece } : current)) });
      await queryClient.invalidateQueries({ queryKey: conversationKey });
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'The narrator could not answer.');
        // Give the message back so it is not lost.
        setInput(message);
      }
    } finally {
      setPending(null);
    }
  };

  const saveToJournal = async (turn: NarratorMessage) => {
    if (!heroId || !currentUserId) return;
    try {
      await saveCharacterJournalEntry({ title: `Narration, ${new Date().toLocaleDateString()}`, content: turn.content }, heroId, currentUserId);
      setSavedIds((current) => new Set(current).add(turn.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save it to the journal.');
    }
  };

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

  const startOver = async () => {
    const confirmed = await confirm({ title: 'Start the story over?', description: 'The conversation and the story so far are forgotten. Your journal and the game itself are not touched.', confirmText: 'Start over' });
    if (confirmed) resetMutation.mutate();
  };

  if (!canUse) {
    return <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">The narrator can be used by the campaign owner or a GM.</p>;
  }

  const lastTurn = turns[turns.length - 1];
  const draft = summaryDraft ?? summary;

  return (
    <section aria-label="Solo narrator" className="flex min-h-[460px] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-bold text-stone-900">Narrator</h3>
          <p className="text-xs text-stone-500">Say what your hero does or asks. The narrator describes what happens next and remembers the story. It never rolls dice or changes anything: its buttons open the rules on the Adventure tab, where you decide.</p>
        </div>
        {(turns.length > 0 || summary) && <Button type="button" variant="ghost" size="sm" loading={resetMutation.isPending} onClick={() => void startOver()}>Start over</Button>}
      </div>

      {!settings.isLoading && !hasKey && (
        <p className="m-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          Add your OpenRouter key under <Link to="/settings?section=connections" className="font-semibold underline">Settings, AI Assistants</Link> to use the narrator.
        </p>
      )}

      <details className="border-b border-stone-200 px-4 py-2 text-sm" open={summaryDraft !== null}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-stone-700"><BookOpenText size={14} /> The story so far{summary ? '' : ' (nothing yet)'}</summary>
        <p className="mt-2 text-xs text-stone-500">The narrator folds older exchanges into this short summary and reads it every time. Correct it if it got something wrong.</p>
        <textarea value={draft} onChange={(event) => setSummaryDraft(event.target.value)} rows={5} maxLength={2000} aria-label="The story so far" className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="It fills in by itself as the story grows." />
        {summaryDraft !== null && summaryDraft !== summary && (
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" loading={summaryMutation.isPending} onClick={() => summaryMutation.mutate(summaryDraft)}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSummaryDraft(null)}>Cancel</Button>
          </div>
        )}
      </details>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {conversation.isLoading && <p className="text-sm text-stone-500">Loading the story…</p>}
        {turns.length === 0 && !pending && hasKey && !conversation.isLoading && (
          <div className="space-y-2 text-sm text-stone-500">
            <p>Try one of these, or write your own.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
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
                  {turn.id === lastTurn?.id && turn.actions.length > 0 && !busy && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turn.actions.map((action, index) => {
                        const Icon = ACTION_ICONS[action.type];
                        return (
                          <button key={`${action.type}-${index}`} type="button" onClick={() => onAction(action)} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 bg-white px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50">
                            <Icon size={12} /> {action.label}
                            {action.type === 'check' && action.modifier !== 'normal' ? <span className="rounded bg-indigo-100 px-1 uppercase">{action.modifier}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {heroId && (
                    <div className="mt-2 border-t border-stone-200 pt-1.5 text-xs text-stone-500">
                      <button type="button" onClick={() => void saveToJournal(turn)} disabled={savedIds.has(turn.id)} className="inline-flex items-center gap-1 hover:text-indigo-700 disabled:text-emerald-700">
                        {savedIds.has(turn.id) ? <><Check size={12} /> Saved to the hero&apos;s journal</> : <><BookmarkPlus size={12} /> Save to the hero&apos;s journal</>}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm text-white">{pending.said}</div></div>
            <div className="flex justify-start">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900">
                {visibleNarration(pending.raw) || <span className="italic text-stone-500">The narrator is thinking…</span>}
              </div>
            </div>
          </>
        )}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      <form className="flex items-end gap-2 border-t border-stone-200 p-3" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(input); } }}
          rows={2}
          maxLength={2000}
          disabled={!hasKey}
          aria-label="What does your hero do?"
          placeholder={hasKey ? 'I step onto the bridge…  (Ctrl or Cmd + Enter to send)' : 'Add your key first'}
          className="min-w-0 flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-stone-100"
        />
        <Button type="submit" icon={Send} loading={busy} disabled={!input.trim() || !hasKey}>Send</Button>
      </form>
      {confirmDialog}
    </section>
  );
}
