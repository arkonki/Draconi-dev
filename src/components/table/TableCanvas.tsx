import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, Crosshair, Hand, Maximize2, Minus, Plus, Radio, Ruler, Scaling, Target, X } from 'lucide-react';
import type { PartyMap } from '../../types/atlas';
import type { TableItem } from '../../types/virtualTable';
import type { LivePing } from '../../hooks/useTablePings';
import {
  TOKEN_SCALE_MAX,
  TOKEN_SCALE_MIN,
  canMoveItem,
  centerOn,
  dragToFraction,
  effectiveCell,
  fitView,
  measureWithCell,
  savedMetresPerSquare,
  screenToFraction,
  tokenDiameterForCell,
  zoomAround,
  type TableView,
} from '../../lib/tableGeometry';
import { MapGrid } from './MapGrid';
import { TableToken } from './TableToken';

const SEND_INTERVAL_MS = 150;
/** Tokens never shrink below this on screen, so they stay visible when the whole map is in view. */
const MIN_TOKEN_SCREEN_PX = 28;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;

export type TableTool = 'move' | 'ping' | 'ruler' | 'scale';

interface TableCanvasProps {
  map: PartyMap;
  items: TableItem[];
  isGm: boolean;
  myCharacterIds: ReadonlySet<string>;
  /** Portrait for each character token, by character id. */
  portraits: ReadonlyMap<string, string | null>;
  /** The icon picture for a token that has no picture of its own, found by name. */
  iconFor: (item: TableItem) => string | null;
  selectedItemId: string | null;
  /** Tokens whose turn it is in the running encounter. */
  turnItemIds: ReadonlySet<string>;
  /** Ask the canvas to centre on a token. Change `nonce` to repeat the request. */
  focusRequest: { itemId: string; nonce: number } | null;
  /** Ask the canvas to centre on a spot of the map (a GM "look here"). */
  focusPoint: { x: number; y: number; nonce: number } | null;
  pings: readonly LivePing[];
  tool: TableTool;
  onToolChange: (tool: TableTool) => void;
  /** GM only: pings also move everyone's view. */
  lookHere: boolean;
  onLookHereChange: (value: boolean) => void;
  onPing: (x: number, y: number) => void;
  metresPerSquare: number;
  onMetresPerSquareChange: (value: number) => void;
  /** Called with the length, in the map image's pixels, of the line being drawn while setting the scale. */
  onScaleMeasure?: (pixels: number | null) => void;
  /** This viewer's own multiplier for every token's size. */
  tokenScale: number;
  onTokenScaleChange: (value: number) => void;
  onSelect: (itemId: string | null) => void;
  /** Called while a token is dragged (throttled) and once more when it is dropped. */
  onMove: (itemId: string, x: number, y: number) => Promise<void> | void;
}

interface DragState {
  itemId: string;
  pointerId: number;
  startPointer: { x: number; y: number };
  startPosition: { x: number; y: number };
  lastSent: number;
  latest: { x: number; y: number };
}

interface Ruler { from: { x: number; y: number }; to: { x: number; y: number } }

export function TableCanvas({
  map, items, isGm, myCharacterIds, portraits, iconFor, selectedItemId, turnItemIds, focusRequest, focusPoint, pings, tool, onToolChange,
  lookHere, onLookHereChange, onPing, metresPerSquare, onMetresPerSquareChange, onScaleMeasure, tokenScale, onTokenScaleChange, onSelect, onMove,
}: TableCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const naturalRef = useRef(natural);
  naturalRef.current = natural;
  const [view, setView] = useState<TableView>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ruler, setRuler] = useState<Ruler | null>(null);
  const rulerDragRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const pinchRef = useRef<{ distance: number; view: TableView; midpoint: { x: number; y: number } } | null>(null);
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const userMovedViewRef = useRef(false);

  // One grid square in the map image's pixels: the saved scale if there is one, otherwise the map's own grid.
  const cell = useMemo(() => effectiveCell(map), [map]);
  const savedMetres = savedMetresPerSquare(map);
  const metres = savedMetres > 0 ? savedMetres : metresPerSquare;

  const fit = useCallback(() => {
    userMovedViewRef.current = false;
    setView(fitView(containerSize, natural));
  }, [containerSize, natural]);

  // Track the size of the container, and refit when it changes while the viewer has not moved the map.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const measure = () => setContainerSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (natural.width > 0 && !userMovedViewRef.current) setView(fitView(containerSize, natural));
  }, [containerSize, natural]);

  // A different map starts from a fresh fit.
  useEffect(() => {
    userMovedViewRef.current = false;
    setNatural({ width: 0, height: 0 });
    setOverrides({});
    setRuler(null);
  }, [map.id, map.image_url]);

  // Wheel zoom needs a non-passive listener so the page does not scroll as well.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      userMovedViewRef.current = true;
      setView((current) => zoomAround(current, Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setRuler(null); onToolChange('move'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToolChange]);

  const mine = useMemo(() => items.find((item) => item.character_id && myCharacterIds.has(item.character_id)) ?? null, [items, myCharacterIds]);

  const centreOnPoint = useCallback((point: { x: number; y: number }) => {
    if (natural.width <= 0) return;
    userMovedViewRef.current = true;
    setView((current) => centerOn(current.scale < 0.2 ? { ...current, scale: 0.5 } : current, point, containerSize, natural));
  }, [containerSize, natural]);

  useEffect(() => {
    if (!focusRequest) return;
    const item = items.find((entry) => entry.id === focusRequest.itemId);
    if (item) centreOnPoint({ x: item.x, y: item.y });
    // Only a new request should move the view, not every change of the token list.
  }, [focusRequest?.nonce]);

  useEffect(() => {
    if (focusPoint) centreOnPoint({ x: focusPoint.x, y: focusPoint.y });
  }, [focusPoint?.nonce]);

  const pointInContainer = (event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const fractionAt = (event: { clientX: number; clientY: number }) => screenToFraction(pointInContainer(event), viewRef.current, naturalRef.current);

  const pingAt = (event: { clientX: number; clientY: number }) => {
    const fraction = fractionAt(event);
    if (fraction) onPing(fraction.x, fraction.y);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  // --- Panning, pinch zoom, ping and ruler on the background ---
  const handleBackgroundDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === 'ping') {
      pingAt(event);
      return;
    }
    if (tool === 'ruler' || tool === 'scale') {
      const start = fractionAt(event);
      if (!start) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      rulerDragRef.current = event.pointerId;
      setRuler({ from: start, to: start });
      return;
    }
    if ((event.target as HTMLElement).closest('[data-draggable="true"]')) return;
    onSelect(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, pointInContainer(event));
    if (pointersRef.current.size === 1) {
      const point = pointInContainer(event);
      panRef.current = { x: point.x, y: point.y, viewX: viewRef.current.x, viewY: viewRef.current.y };
      pinchRef.current = null;
      // Holding a finger still on the map is a ping, so touch screens need no extra button.
      cancelLongPress();
      const origin = { clientX: event.clientX, clientY: event.clientY };
      longPressRef.current = { timer: window.setTimeout(() => { longPressRef.current = null; panRef.current = null; pingAt(origin); }, LONG_PRESS_MS), x: point.x, y: point.y };
    } else if (pointersRef.current.size === 2) {
      cancelLongPress();
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, view: viewRef.current, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      panRef.current = null;
    }
  };

  const handleBackgroundMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (rulerDragRef.current === event.pointerId) {
      const end = fractionAt(event);
      if (end) setRuler((current) => (current ? { ...current, to: end } : current));
      return;
    }
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = pointInContainer(event);
    pointersRef.current.set(event.pointerId, point);
    if (longPressRef.current && Math.hypot(point.x - longPressRef.current.x, point.y - longPressRef.current.y) > LONG_PRESS_SLOP_PX) cancelLongPress();
    if (!longPressRef.current || pinchRef.current) userMovedViewRef.current = true;
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAround(pinchRef.current.view, distance / pinchRef.current.distance, pinchRef.current.midpoint);
      setView({ ...zoomed, x: zoomed.x + (midpoint.x - pinchRef.current.midpoint.x), y: zoomed.y + (midpoint.y - pinchRef.current.midpoint.y) });
    } else if (panRef.current && !longPressRef.current) {
      setView((current) => ({ ...current, x: panRef.current!.viewX + point.x - panRef.current!.x, y: panRef.current!.viewY + point.y - panRef.current!.y }));
    }
  };

  const handleBackgroundUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (rulerDragRef.current === event.pointerId) {
      rulerDragRef.current = null;
      return;
    }
    cancelLongPress();
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
    else if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()];
      panRef.current = { x: remaining.x, y: remaining.y, viewX: viewRef.current.x, viewY: viewRef.current.y };
    }
  };

  // --- Dragging a token ---
  const handleTokenDown = (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => {
    onSelect(item.id);
    if (!canMoveItem(item, isGm, myCharacterIds)) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      itemId: item.id,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: { x: item.x, y: item.y },
      lastSent: 0,
      latest: { x: item.x, y: item.y },
    };
    setDraggingId(item.id);
  };

  const handleTokenMove = (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => {
    const drag = dragRef.current;
    if (!drag || drag.itemId !== item.id || drag.pointerId !== event.pointerId) return;
    const next = dragToFraction(
      drag.startPosition,
      { x: event.clientX - drag.startPointer.x, y: event.clientY - drag.startPointer.y },
      viewRef.current.scale,
      natural,
    );
    drag.latest = next;
    setOverrides((previous) => ({ ...previous, [item.id]: next }));
    const now = Date.now();
    if (now - drag.lastSent >= SEND_INTERVAL_MS) {
      drag.lastSent = now;
      void onMove(item.id, next.x, next.y);
    }
  };

  const handleTokenUp = async (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => {
    const drag = dragRef.current;
    if (!drag || drag.itemId !== item.id || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
    const moved = drag.latest.x !== drag.startPosition.x || drag.latest.y !== drag.startPosition.y;
    try {
      if (moved) await onMove(item.id, drag.latest.x, drag.latest.y);
    } finally {
      setOverrides((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
    }
  };

  const zoomBy = (factor: number) => {
    userMovedViewRef.current = true;
    setView((current) => zoomAround(current, factor, { x: containerSize.width / 2, y: containerSize.height / 2 }));
  };

  const measurement = ruler && natural.width > 0 ? measureWithCell(ruler.from, ruler.to, natural, cell, metres) : null;

  // While the scale is being set, tell the panel how long the drawn line is.
  useEffect(() => {
    if (tool !== 'scale') return;
    onScaleMeasure?.(measurement ? measurement.pixels : null);
  }, [tool, measurement?.pixels]); // the callback is deliberately not a dependency
  const interactive = tool === 'move';
  const hasGrid = cell !== null;
  const toolButton = (id: TableTool, label: string, Icon: typeof Hand) => (
    <button
      type="button"
      aria-pressed={tool === id}
      title={label}
      onClick={() => { onToolChange(id); if (id !== 'ruler') setRuler(null); }}
      className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm ${tool === id ? 'bg-white text-stone-900' : 'hover:bg-white/15'}`}
    >
      <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden bg-stone-900 ${tool === 'ping' ? 'cursor-crosshair' : tool === 'ruler' ? 'cursor-cell' : ''}`}
      onPointerDown={handleBackgroundDown}
      onPointerMove={handleBackgroundMove}
      onPointerUp={handleBackgroundUp}
      onPointerCancel={handleBackgroundUp}
      onDoubleClick={(event) => { if (tool === 'move' && !(event.target as HTMLElement).closest('[data-draggable="true"]')) pingAt(event); }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: natural.width || undefined, height: natural.height || undefined, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {map.image_url && (
          <img
            src={map.image_url}
            alt={map.name}
            draggable={false}
            decoding="async"
            className="block max-w-none select-none"
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        )}
        {natural.width > 0 && (
          <>
            <MapGrid
              gridType={map.grid_type}
              gridSize={Number(map.grid_size)}
              gridOpacity={Number(map.grid_opacity)}
              gridColor={map.grid_color}
              gridOffsetX={Number(map.grid_offset_x)}
              gridOffsetY={Number(map.grid_offset_y)}
              gridRotation={Number(map.grid_rotation)}
              width={natural.width}
              height={natural.height}
            />
            {items.map((item) => {
              const position = overrides[item.id] ?? { x: item.x, y: item.y };
              const draggable = canMoveItem(item, isGm, myCharacterIds);
              return (
                <TableToken
                  key={item.id}
                  item={item}
                  centerX={position.x * natural.width}
                  centerY={position.y * natural.height}
                  diameter={Math.max(tokenDiameterForCell(item.size, cell, natural.width) * tokenScale, MIN_TOKEN_SCREEN_PX / view.scale)}
                  scale={view.scale}
                  imageUrl={item.image_url ?? (item.character_id ? portraits.get(item.character_id) ?? null : iconFor(item))}
                  isMine={Boolean(item.character_id && myCharacterIds.has(item.character_id))}
                  draggable={draggable}
                  dragging={draggingId === item.id}
                  selected={selectedItemId === item.id}
                  hiddenFromPlayers={isGm && !item.visible}
                  isTurn={turnItemIds.has(item.id)}
                  interactive={interactive}
                  onPointerDown={handleTokenDown}
                  onPointerMove={handleTokenMove}
                  onPointerUp={handleTokenUp}
                />
              );
            })}

            {ruler && (
              <svg width={natural.width} height={natural.height} className="pointer-events-none absolute inset-0" style={{ zIndex: 55 }} aria-hidden="true">
                <line x1={ruler.from.x * natural.width} y1={ruler.from.y * natural.height} x2={ruler.to.x * natural.width} y2={ruler.to.y * natural.height} stroke="#fde047" strokeWidth={3 / view.scale} strokeDasharray={`${10 / view.scale} ${6 / view.scale}`} />
                <circle cx={ruler.from.x * natural.width} cy={ruler.from.y * natural.height} r={5 / view.scale} fill="#fde047" />
                <circle cx={ruler.to.x * natural.width} cy={ruler.to.y * natural.height} r={5 / view.scale} fill="#fde047" />
              </svg>
            )}

            {pings.filter((ping) => ping.map_id === map.id).map((ping) => (
              <div
                key={ping.id}
                className="pointer-events-none absolute"
                style={{ left: ping.x * natural.width, top: ping.y * natural.height, zIndex: 60, transform: `translate(-50%, -50%) scale(${1 / view.scale})` }}
              >
                <span className="absolute left-1/2 top-1/2 block h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-4" style={{ borderColor: ping.color }} />
                <span className="absolute left-1/2 top-1/2 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ backgroundColor: ping.color }} />
                {ping.label && <span className="absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">{ping.label}</span>}
              </div>
            ))}

            {ruler && measurement && (
              <div
                className="pointer-events-none absolute whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-sm font-bold text-amber-200 shadow"
                style={{
                  left: ((ruler.from.x + ruler.to.x) / 2) * natural.width,
                  top: ((ruler.from.y + ruler.to.y) / 2) * natural.height,
                  zIndex: 65,
                  transform: `translate(-50%, -130%) scale(${1 / view.scale})`,
                }}
              >
                {tool === 'scale'
                  ? `${Math.round(measurement.pixels)} px`
                  : measurement.squares !== null
                    ? `${measurement.squares.toFixed(1)} squares${measurement.metres !== null ? ` · ${measurement.metres.toFixed(1)} m` : ''}`
                    : 'Set a scale to measure'}
              </div>
            )}
          </>
        )}
      </div>

      {natural.width === 0 && map.image_url && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Loading the map…</div>
      )}

      <div className="absolute bottom-3 left-3 z-[60] flex flex-col gap-1 rounded-xl border border-white/15 bg-black/70 p-1 text-white shadow-lg backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.3)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"><Plus size={18} /></button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"><Minus size={18} /></button>
        <button type="button" aria-label="Fit the whole map" title="Fit the whole map" onClick={fit} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"><Maximize2 size={16} /></button>
        {mine && (
          <button type="button" aria-label="Centre on my token" title="Centre on my token" onClick={() => centreOnPoint({ x: mine.x, y: mine.y })} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"><Crosshair size={18} /></button>
        )}
      </div>

      <div className="absolute bottom-3 left-1/2 z-[60] flex max-w-[calc(100%-6rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-white/15 bg-black/75 p-1 text-white shadow-lg backdrop-blur" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
        {toolButton('move', 'Move', Hand)}
        {toolButton('ping', 'Ping', Target)}
        {toolButton('ruler', 'Ruler', Ruler)}
        {isGm && toolButton('scale', 'Scale', Scaling)}
        {isGm && (
          <button
            type="button"
            aria-pressed={lookHere}
            title="A GM ping also moves everyone's view to the spot"
            onClick={() => onLookHereChange(!lookHere)}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm ${lookHere ? 'bg-amber-300 text-stone-900' : 'hover:bg-white/15'}`}
          >
            <Radio size={16} /> <span className="hidden sm:inline">Look here</span>
          </button>
        )}
        <label className="flex items-center gap-1.5 px-2 text-xs text-white/80" title="Make every token bigger or smaller on your screen">
          <CircleDot size={14} />
          <span className="hidden sm:inline">Tokens</span>
          <input
            type="range"
            min={TOKEN_SCALE_MIN}
            max={TOKEN_SCALE_MAX}
            step={0.1}
            value={tokenScale}
            onChange={(event) => onTokenScaleChange(Number(event.target.value))}
            onDoubleClick={() => onTokenScaleChange(1)}
            aria-label="Token size on your screen"
            className="h-1.5 w-20 cursor-pointer accent-amber-300"
          />
          <span className="w-9 text-right font-mono">{Math.round(tokenScale * 100)}%</span>
        </label>
        {tool === 'ruler' && (
          <>
            {savedMetres === 0 && <label className="flex items-center gap-1 px-1 text-xs text-white/80">
              m/square
              <input
                type="number"
                min={0}
                step={0.5}
                value={metresPerSquare || ''}
                placeholder="–"
                onChange={(event) => onMetresPerSquareChange(Math.max(0, Number(event.target.value) || 0))}
                className="w-14 rounded border border-white/25 bg-black/40 px-1 py-0.5 text-center text-white"
                aria-label="Metres per grid square"
              />
            </label>}
            {ruler && <button type="button" aria-label="Clear the ruler" onClick={() => setRuler(null)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"><X size={16} /></button>}
            {!hasGrid && <span className="px-1 text-xs text-amber-200">This map has no scale yet</span>}
          </>
        )}
      </div>
    </div>
  );
}
