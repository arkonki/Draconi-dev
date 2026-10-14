import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookmarkPlus, Check, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../shared/Button';
import { askSoloNarrator, fetchAiSettings, type NarratorTurn } from '../../lib/api/ai';
import { saveCharacterJournalEntry } from '../../lib/api/journal';

interface SoloNarratorProps {
  partyId: string;
  /** The solo hero, whose journal the narration can be saved to. */
  heroId: string | null;
  currentUserId?: string;
  /** Only the owner or a GM can use the narrator, as they are the ones who run the solo rules. */
  canUse: boolean;
}

interface Turn extends NarratorTurn {
  id: string;
  tokens?: number;
}

const STARTERS = ['Describe where I am.', 'What do I notice around me?', 'What could I try next?'];
const storageKey = (partyId: string) => `solo-narrator:${partyId}`;

function loadTurns(partyId: string): Turn[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey(partyId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((turn): turn is Turn => (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string' && typeof turn.id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Talk to the narrator: say what the hero does and get the scene described, with a few options. It writes prose only;
 * dice, hit points and every rule stay with the Adventure tab.
 */
export function SoloNarrator({ partyId, heroId, currentUserId, canUse }: SoloNarratorProps) {
  const settings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(partyId));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey(partyId), JSON.stringify(turns.slice(-30))); } catch { /* the conversation just is not remembered */ }
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns, partyId]);

  const hasKey = Boolean(settings.data?.hasKey);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    const history = turns.map(({ role, content }) => ({ role, content }));
    const userTurn: Turn = { id: crypto.randomUUID(), role: 'user', content: message };
    setTurns((current) => [...current, userTurn]);
    setInput('');
    try {
      const answer = await askSoloNarrator(partyId, message, history);
      setTurns((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: answer.text, tokens: answer.usage.promptTokens + answer.usage.completionTokens }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The narrator could not answer.');
      // Give the message back so it is not lost.
      setTurns((current) => current.filter((turn) => turn.id !== userTurn.id));
      setInput(message);
    } finally {
      setBusy(false);
    }
  };

  const saveToJournal = async (turn: Turn) => {
    if (!heroId || !currentUserId) return;
    try {
      await saveCharacterJournalEntry({ title: `Narration, ${new Date().toLocaleDateString()}`, content: turn.content }, heroId, currentUserId);
      setSavedIds((current) => new Set(current).add(turn.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save it to the journal.');
    }
  };

  if (!canUse) {
    return <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">The narrator can be used by the campaign owner or a GM.</p>;
  }

  return (
    <section aria-label="Solo narrator" className="flex min-h-[420px] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-4 py-3">
        <h3 className="font-bold text-stone-900">Narrator</h3>
        <p className="text-xs text-stone-500">Say what your hero does or asks. The narrator describes what happens next. It never rolls dice or changes anything: use the Adventure tab for checks, damage and rests.</p>
      </div>

      {!settings.isLoading && !hasKey && (
        <p className="m-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          Add your OpenRouter key under <Link to="/settings?section=connections" className="font-semibold underline">Settings, AI Assistants</Link> to use the narrator.
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {turns.length === 0 && hasKey && (
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
                <div className="mt-2 flex items-center gap-3 border-t border-stone-200 pt-1.5 text-xs text-stone-500">
                  {heroId && (
                    <button type="button" onClick={() => void saveToJournal(turn)} disabled={savedIds.has(turn.id)} className="inline-flex items-center gap-1 hover:text-indigo-700 disabled:text-emerald-700">
                      {savedIds.has(turn.id) ? <><Check size={12} /> Saved to the hero's journal</> : <><BookmarkPlus size={12} /> Save to the hero's journal</>}
                    </button>
                  )}
                  {turn.tokens ? <span>{turn.tokens.toLocaleString()} tokens</span> : null}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm italic text-stone-500">The narrator is thinking…</p>}
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
        <div className="flex flex-col gap-1">
          <Button type="submit" icon={Send} loading={busy} disabled={!input.trim() || !hasKey}>Send</Button>
          {turns.length > 0 && <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={() => { setTurns([]); setError(null); }}>Clear</Button>}
        </div>
      </form>
    </section>
  );
}
