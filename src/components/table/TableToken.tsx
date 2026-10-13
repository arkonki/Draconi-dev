import { memo } from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { optimizedImageUrl } from '../../lib/images';
import { initials } from '../../lib/tableGeometry';
import type { TableItem } from '../../types/virtualTable';

interface TableTokenProps {
  item: TableItem;
  /** Centre of the token, in the map image's pixels. */
  centerX: number;
  centerY: number;
  diameter: number;
  /** Current zoom, used to keep labels a readable size. */
  scale: number;
  imageUrl: string | null;
  isMine: boolean;
  draggable: boolean;
  dragging: boolean;
  selected: boolean;
  /** The GM is looking at it but players are not. */
  hiddenFromPlayers: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => void;
}

export const TableToken = memo(function TableToken({
  item, centerX, centerY, diameter, scale, imageUrl, isMine, draggable, dragging, selected, hiddenFromPlayers,
  onPointerDown, onPointerMove, onPointerUp,
}: TableTokenProps) {
  const labelScale = 1 / Math.max(scale, 0.05);
  return (
    <div
      data-token={item.id}
      data-draggable={draggable}
      role="img"
      aria-label={`${item.label}${hiddenFromPlayers ? ' (hidden from players)' : ''}`}
      className={`absolute select-none touch-none ${draggable ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
      style={{ left: centerX - diameter / 2, top: centerY - diameter / 2, width: diameter, height: diameter, zIndex: dragging ? 50 : selected ? 40 : 10 + item.sort_order }}
      onPointerDown={(event) => onPointerDown(event, item)}
      onPointerMove={(event) => onPointerMove(event, item)}
      onPointerUp={(event) => onPointerUp(event, item)}
      onPointerCancel={(event) => onPointerUp(event, item)}
    >
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[length:var(--token-border)] text-white shadow-lg ${hiddenFromPlayers ? 'opacity-55' : ''} ${dragging ? 'scale-105' : ''}`}
        style={{
          ['--token-border' as string]: `${Math.max(2, diameter * 0.06)}px`,
          borderColor: isMine ? '#facc15' : selected ? '#ffffff' : item.color,
          borderStyle: hiddenFromPlayers ? 'dashed' : 'solid',
          backgroundColor: item.color,
          boxShadow: selected ? '0 0 0 3px rgba(255,255,255,0.55)' : undefined,
        }}
      >
        {imageUrl ? (
          <img src={optimizedImageUrl(imageUrl, 'thumbnail')} alt="" draggable={false} decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="font-bold" style={{ fontSize: diameter * 0.38 }}>{initials(item.label)}</span>
        )}
      </div>

      {(hiddenFromPlayers || item.locked) && (
        <div className="absolute -right-1 -top-1 flex gap-0.5" style={{ transform: `scale(${labelScale})`, transformOrigin: 'top right' }}>
          {hiddenFromPlayers && <span className="rounded-full bg-stone-900 p-1 text-white" title="Hidden from players"><EyeOff size={12} /></span>}
          {item.locked && <span className="rounded-full bg-stone-900 p-1 text-white" title="Locked"><Lock size={12} /></span>}
        </div>
      )}

      <div
        className="pointer-events-none absolute left-1/2 top-full mt-1 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white"
        style={{ transform: `translateX(-50%) scale(${labelScale})`, transformOrigin: 'top center' }}
      >
        {item.label}
      </div>
    </div>
  );
});
