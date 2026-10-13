import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react';
import type { PartyMap } from '../../types/atlas';
import type { TableItem } from '../../types/virtualTable';
import {
  canMoveItem,
  centerOn,
  dragToFraction,
  fitView,
  tokenDiameter,
  zoomAround,
  type TableView,
} from '../../lib/tableGeometry';
import { MapGrid } from './MapGrid';
import { TableToken } from './TableToken';

const SEND_INTERVAL_MS = 150;
/** Tokens never shrink below this on screen, so they stay visible when the whole map is in view. */
const MIN_TOKEN_SCREEN_PX = 28;

interface TableCanvasProps {
  map: PartyMap;
  items: TableItem[];
  isGm: boolean;
  myCharacterIds: ReadonlySet<string>;
  /** Portrait for each character token, by character id. */
  portraits: ReadonlyMap<string, string | null>;
  selectedItemId: string | null;
  /** Ask the canvas to centre on a token. Change `nonce` to repeat the request. */
  focusRequest: { itemId: string; nonce: number } | null;
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

export function TableCanvas({ map, items, isGm, myCharacterIds, portraits, selectedItemId, focusRequest, onSelect, onMove }: TableCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<TableView>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const pinchRef = useRef<{ distance: number; view: TableView; midpoint: { x: number; y: number } } | null>(null);
  const userMovedViewRef = useRef(false);

  const grid = useMemo(() => ({ grid_type: map.grid_type, grid_size: Number(map.grid_size) }), [map.grid_type, map.grid_size]);

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

  const mine = useMemo(() => items.find((item) => item.character_id && myCharacterIds.has(item.character_id)) ?? null, [items, myCharacterIds]);

  const focusOn = useCallback((itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || natural.width <= 0) return;
    userMovedViewRef.current = true;
    setView((current) => centerOn(current.scale < 0.2 ? { ...current, scale: 0.5 } : current, { x: item.x, y: item.y }, containerSize, natural));
  }, [containerSize, items, natural]);

  useEffect(() => {
    if (focusRequest) focusOn(focusRequest.itemId);
    // Only a new request should move the view, not every change of the token list.
  }, [focusRequest?.nonce]);

  const pointInContainer = (event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  // --- Panning and pinch zoom on the background ---
  const handleBackgroundDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-draggable="true"]')) return;
    onSelect(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, pointInContainer(event));
    if (pointersRef.current.size === 1) {
      const point = pointInContainer(event);
      panRef.current = { x: point.x, y: point.y, viewX: viewRef.current.x, viewY: viewRef.current.y };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, view: viewRef.current, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      panRef.current = null;
    }
  };

  const handleBackgroundMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = pointInContainer(event);
    pointersRef.current.set(event.pointerId, point);
    userMovedViewRef.current = true;
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAround(pinchRef.current.view, distance / pinchRef.current.distance, pinchRef.current.midpoint);
      setView({ ...zoomed, x: zoomed.x + (midpoint.x - pinchRef.current.midpoint.x), y: zoomed.y + (midpoint.y - pinchRef.current.midpoint.y) });
    } else if (panRef.current) {
      setView((current) => ({ ...current, x: panRef.current!.viewX + point.x - panRef.current!.x, y: panRef.current!.viewY + point.y - panRef.current!.y }));
    }
  };

  const handleBackgroundUp = (event: React.PointerEvent<HTMLDivElement>) => {
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-stone-900"
      onPointerDown={handleBackgroundDown}
      onPointerMove={handleBackgroundMove}
      onPointerUp={handleBackgroundUp}
      onPointerCancel={handleBackgroundUp}
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
                  diameter={Math.max(tokenDiameter(item.size, grid, natural.width), MIN_TOKEN_SCREEN_PX / view.scale)}
                  scale={view.scale}
                  imageUrl={item.image_url ?? (item.character_id ? portraits.get(item.character_id) ?? null : null)}
                  isMine={Boolean(item.character_id && myCharacterIds.has(item.character_id))}
                  draggable={draggable}
                  dragging={draggingId === item.id}
                  selected={selectedItemId === item.id}
                  hiddenFromPlayers={isGm && !item.visible}
                  onPointerDown={handleTokenDown}
                  onPointerMove={handleTokenMove}
                  onPointerUp={handleTokenUp}
                />
              );
            })}
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
          <button type="button" aria-label="Centre on my token" title="Centre on my token" onClick={() => focusOn(mine.id)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15"><Crosshair size={18} /></button>
        )}
      </div>
    </div>
  );
}
