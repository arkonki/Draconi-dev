import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Code, Hand, Italic, Loader2, Send, Smile } from 'lucide-react';
import { insertAt, toggleWrap, type TextEdit } from '../../lib/chatFormatting';
import type { PokeOption } from '../../lib/pokeTarget';

const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  { label: 'Combat', emojis: ['⚔️', '🛡️', '🏹', '🗡️', '🪓', '💥', '🩸', '💀'] },
  { label: 'Magic', emojis: ['🪄', '✨', '🔥', '❄️', '⚡', '🔮', '📜', '🧪'] },
  { label: 'Folk & beasts', emojis: ['🧙‍♂️', '🧝', '🧌', '🐉', '🐺', '🦆', '🕷️', '👻'] },
  { label: 'Tavern & loot', emojis: ['🎲', '💰', '💎', '🗝️', '🍺', '🍖', '🏰', '🗺️'] },
  { label: 'Reactions', emojis: ['👍', '👎', '😂', '😱', '🤔', '🙏', '❤️', '👀'] },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcut = (key: string) => `${isMac ? '⌘' : 'Ctrl+'}${key}`;

/** Closes a popover on a click outside it or on Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose]);
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  maxLength: number;
  pokeOptions: PokeOption[];
  onPoke: (option: PokeOption) => void;
}

const toolButton = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500';

/**
 * The chat's message box: formatting buttons that wrap the selection (and keyboard shortcuts for them), an emoji
 * picker, a list of party members to poke, and a box that grows with the message. Enter sends; Shift+Enter starts a
 * new line.
 */
export function ChatComposer({ value, onChange, onSend, isSending, maxLength, pokeOptions, onPoke }: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const pokeRef = useRef<HTMLDivElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pokeOpen, setPokeOpen] = useState(false);
  const pendingSelection = useRef<[number, number] | null>(null);
  const closeEmoji = React.useCallback(() => setEmojiOpen(false), []);
  const closePoke = React.useCallback(() => setPokeOpen(false), []);
  useDismiss(emojiOpen, emojiRef, closeEmoji);
  useDismiss(pokeOpen, pokeRef, closePoke);

  // Grow with the text, up to about six lines, then scroll.
  useLayoutEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
    // Put the cursor where the last edit said, once React has written the new text.
    if (pendingSelection.current) {
      const [start, end] = pendingSelection.current;
      pendingSelection.current = null;
      box.focus();
      box.setSelectionRange(start, end);
    }
  }, [value]);

  const apply = (edit: (value: string, start: number, end: number) => TextEdit) => {
    const box = textareaRef.current;
    const start = box?.selectionStart ?? value.length;
    const end = box?.selectionEnd ?? value.length;
    const next = edit(value, start, end);
    if (next.value.length > maxLength) return;
    pendingSelection.current = [next.selectionStart, next.selectionEnd];
    onChange(next.value);
    if (next.value === value) box?.focus();
  };
  const wrap = (marker: string) => apply((text, start, end) => toggleWrap(text, start, end, marker));
  const insert = (text: string) => apply((current, start, end) => insertAt(current, start, end, text));

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (value.trim() && !isSending) onSend();
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const marker = { b: '**', i: '*', e: '`' }[event.key.toLowerCase()];
      if (marker) {
        event.preventDefault();
        wrap(marker);
      }
    }
  };

  const nearLimit = value.length > maxLength - 200;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1" role="toolbar" aria-label="Message formatting">
        <button type="button" className={toolButton} onClick={() => wrap('**')} title={`Bold (${shortcut('B')})`} aria-label="Bold"><Bold size={16} /></button>
        <button type="button" className={toolButton} onClick={() => wrap('*')} title={`Italic (${shortcut('I')})`} aria-label="Italic"><Italic size={16} /></button>
        <button type="button" className={toolButton} onClick={() => wrap('`')} title={`Code (${shortcut('E')})`} aria-label="Code"><Code size={16} /></button>
        <div className="mx-1 h-5 w-px bg-gray-200" />

        <div ref={emojiRef} className="relative">
          <button type="button" className={`${toolButton} ${emojiOpen ? 'bg-indigo-50 text-indigo-700' : ''}`} onClick={() => { setPokeOpen(false); setEmojiOpen((open) => !open); }} title="Emoji" aria-label="Emoji" aria-expanded={emojiOpen} aria-haspopup="dialog">
            <Smile size={16} />
          </button>
          {emojiOpen && (
            <div role="dialog" aria-label="Pick an emoji" className="absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
              {EMOJI_GROUPS.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{group.label}</div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {group.emojis.map((emoji) => (
                      <button key={emoji} type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-xl transition-colors hover:bg-indigo-50" onClick={() => { insert(emoji); setEmojiOpen(false); }} aria-label={`Insert ${emoji}`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div ref={pokeRef} className="relative">
          <button type="button" className={`${toolButton} ${pokeOpen ? 'bg-indigo-50 text-indigo-700' : ''}`} onClick={() => { setEmojiOpen(false); setPokeOpen((open) => !open); }} disabled={pokeOptions.length === 0} title={pokeOptions.length ? 'Poke someone' : 'Nobody else is in this party yet'} aria-label="Poke someone" aria-expanded={pokeOpen} aria-haspopup="menu">
            <Hand size={16} />
          </button>
          {pokeOpen && (
            <div role="menu" aria-label="Poke someone" className="absolute bottom-full left-0 z-50 mb-2 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Poke someone</div>
              <div className="max-h-64 overflow-y-auto py-1">
                {pokeOptions.map((option) => (
                  <button key={option.userId} type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-indigo-50" onClick={() => { setPokeOpen(false); onPoke(option); }}>
                    <Hand size={14} className="shrink-0 text-indigo-500" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-800">{option.label}</span>
                      {option.detail && <span className="block truncate text-[11px] text-gray-500">{option.detail}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />
        <span className={`hidden text-[10px] sm:block ${nearLimit ? 'font-semibold text-amber-600' : 'text-gray-400'}`}>
          {nearLimit ? `${value.length}/${maxLength}` : 'Enter to send · Shift+Enter for a new line'}
        </span>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); if (value.trim() && !isSending) onSend(); }} className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message..."
          aria-label="Message"
          maxLength={maxLength}
          disabled={isSending}
          className="min-h-[46px] flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 text-base leading-snug shadow-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
        />
        <button type="submit" disabled={!value.trim() || isSending} aria-label="Send" className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md transition-colors hover:bg-indigo-700 disabled:bg-indigo-300">
          {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="ml-0.5 h-5 w-5" />}
        </button>
      </form>
    </div>
  );
}
