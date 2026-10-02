import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Weight } from 'lucide-react';

export function HeavyEncumbranceIndicator({ load, capacity }: { load: number; capacity: number }) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);

  const cancelHide = () => window.clearTimeout(hideTimer.current);
  const show = () => {
    cancelHide();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < 200 && rect.top > spaceBelow;
    setPosition({
      ...(showAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      maxHeight: Math.max(64, (showAbove ? rect.top : spaceBelow) - 20),
    });
  };
  const hideSoon = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 120);
  };

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) close();
    };
    // Dismiss the tooltip before an enclosing inventory/character dialog.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Over-encumbered: show movement rules"
        aria-describedby={position ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onClick={show}
        className="inline-flex min-h-7 items-center gap-1 rounded bg-red-100 px-1.5 text-[10px] font-bold font-sans text-red-700 shadow-sm hover:bg-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
      >
        <Weight size={12} aria-hidden="true" /> HEAVY <HelpCircle size={12} aria-hidden="true" />
      </button>
      {position && createPortal(
        <div
          ref={panelRef}
          id={tooltipId}
          role="tooltip"
          onMouseEnter={cancelHide}
          onMouseLeave={hideSoon}
          style={position}
          className="fixed z-[200] overflow-y-auto rounded-lg border border-red-200 bg-[#fdfbf7] p-3 text-sm leading-relaxed text-stone-700 shadow-xl"
        >
          <p className="mb-1 font-serif font-bold text-red-800">Over-encumbered</p>
          <p className="mb-2 text-xs font-bold text-stone-500">Load {Number(load.toFixed(2))} / {capacity}</p>
          <p>You can temporarily carry more than your normal encumbrance limit. In that case you must make a STR roll whenever you want to move in a round of combat or walk for a shift of travel. If the roll fails, you must either drop what you are carrying or stay where you are.</p>
        </div>,
        document.body,
      )}
    </>
  );
}
