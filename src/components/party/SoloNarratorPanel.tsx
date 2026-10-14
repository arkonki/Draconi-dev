import { useEffect, useState, type ReactNode } from 'react';
import { MessageSquareText, PanelLeftOpen, PanelRightOpen, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { useT } from '../../i18n/translate';
import { visibleNarration } from '../../lib/narratorText';
import type { NarratorConversation } from '../../lib/api/ai';
import { awaitingApprovals } from './narratorToolText';

const SIDE_KEY = 'solo-narrator-side';
type Side = 'left' | 'right';
const readSide = (): Side => {
  try { return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right'; } catch { return 'right'; }
};
/** From this width the page makes room for the panel instead of going underneath it. */
const PUSH_FROM_PX = 1280;
const PANEL_WIDTH = '30rem';

/**
 * The narrator's own panel. It stays mounted while closed, so a reply that is being written, a half-typed message and the
 * conversation all survive switching between the Solo tabs. On a wide screen the page moves over to make room, so
 * nothing, such as the hero's stats, is hidden behind it; on a narrower one it lies over the page, and can be moved to the
 * other side (remembered for next time) to uncover what is behind. On a phone it takes the whole screen.
 */
export function SoloNarratorDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const [side, setSide] = useState<Side>(readSide);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, onClose]);

  // Make room for the panel on a wide screen by padding the page on the panel's side.
  useEffect(() => {
    if (!open) return undefined;
    const property = side === 'left' ? 'paddingLeft' : 'paddingRight';
    const apply = () => { document.body.style[property] = window.innerWidth >= PUSH_FROM_PX ? PANEL_WIDTH : ''; };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      document.body.style[property] = '';
    };
  }, [open, side]);

  const flip = () => {
    const next: Side = side === 'right' ? 'left' : 'right';
    setSide(next);
    try { localStorage.setItem(SIDE_KEY, next); } catch { /* the choice just is not remembered */ }
  };
  const SideIcon = side === 'right' ? PanelLeftOpen : PanelRightOpen;
  const edge = side === 'right' ? 'right-0 border-l' : 'left-0 border-r';
  const hidden = side === 'right' ? 'invisible translate-x-full' : 'invisible -translate-x-full';

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={t('Solo narrator')}
      aria-hidden={!open}
      className={`fixed inset-y-0 ${edge} z-[70] flex w-full flex-col border-stone-200 bg-white shadow-2xl transition-transform duration-200 sm:w-[26rem] lg:w-[30rem] ${open ? 'translate-x-0' : hidden}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-gradient-to-r from-indigo-50 to-amber-50 px-4 py-3">
        <h2 className="flex items-center gap-2 font-bold text-stone-900"><MessageSquareText className="h-5 w-5 text-indigo-600" /> {t('Narrator')}</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={flip} className="hidden rounded-lg p-1.5 text-stone-500 hover:bg-white hover:text-stone-800 sm:block" title={t(side === 'right' ? 'Move the narrator to the left' : 'Move the narrator to the right')} aria-label={t(side === 'right' ? 'Move the narrator to the left' : 'Move the narrator to the right')}><SideIcon className="h-5 w-5" /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-white hover:text-stone-800" aria-label={t('Close the narrator')}><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  );
}

/** On the Story tab: the latest of the story, and the way in to the narrator. */
export function SoloNarratorLaunch({ conversation, canUse, onOpen }: { conversation: NarratorConversation | undefined; canUse: boolean; onOpen: () => void }) {
  const t = useT();
  if (!canUse) {
    return <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">{t('The narrator can be used by the campaign owner or a GM.')}</p>;
  }
  const turns = conversation?.turns ?? [];
  const last = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const excerpt = last ? visibleNarration(last.content).replace(/\s+/g, ' ').trim() : '';
  const waiting = awaitingApprovals(conversation);
  return (
    <section aria-label={t('Solo narrator')} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-bold text-stone-900"><MessageSquareText className="h-5 w-5 text-indigo-600" /> {t('Narrator')}</h3>
          <p className="mt-1 text-sm text-stone-600">{t('Tell the story with the narrator. It opens beside the page, so you can keep it open while you look at the sheet, the mission or the journal.')}</p>
        </div>
        <Button icon={MessageSquareText} className="shrink-0 whitespace-nowrap" onClick={onOpen}>{t(waiting > 0 ? 'Open the narrator ({count} waiting)' : 'Open the narrator', { count: waiting })}</Button>
      </div>
      {waiting > 0 && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">{t('The narrator is waiting for you to approve what it wants to do.')}</p>}
      {excerpt && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{t('The latest from the narrator')}</div>
          <p className="mt-1 line-clamp-4 whitespace-pre-wrap">{excerpt}</p>
        </div>
      )}
    </section>
  );
}
