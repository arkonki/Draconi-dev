import { memo } from 'react';
import { EyeOff, Lock, Skull } from 'lucide-react';
import { initials } from '../../lib/tableGeometry';
import { conditionBadge, hpColor, hpFraction, type TokenStatus } from '../../lib/tableStatus';
import type { TableItem } from '../../types/virtualTable';
import { PortraitImage } from '../shared/PortraitImage';

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
  /** Hit points and conditions to draw on the token, when the viewer may see them. */
  status: TokenStatus | null;
  /** The GM is looking at it but players are not. */
  hiddenFromPlayers: boolean;
  /** It is this token's turn in the running encounter. */
  isTurn: boolean;
  /** False while a tool such as the ruler or ping is active, so the token does not swallow the click. */
  interactive: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>, item: TableItem) => void;
}

export const TableToken = memo(function TableToken({
  item, centerX, centerY, diameter, scale, imageUrl, isMine, draggable, dragging, selected, status, hiddenFromPlayers, isTurn, interactive,
  onPointerDown, onPointerMove, onPointerUp,
}: TableTokenProps) {
  const labelScale = 1 / Math.max(scale, 0.05);
  return (
    <div
      data-token={item.id}
      data-draggable={draggable && interactive}
      role="img"
      aria-label={`${item.label}${hiddenFromPlayers ? ' (hidden from players)' : ''}`}
      className={`absolute select-none touch-none ${!interactive ? 'pointer-events-none' : ''} ${draggable ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
      style={{ left: centerX - diameter / 2, top: centerY - diameter / 2, width: diameter, height: diameter, zIndex: dragging ? 50 : selected ? 40 : 10 + item.sort_order }}
      onPointerDown={(event) => onPointerDown(event, item)}
      onPointerMove={(event) => onPointerMove(event, item)}
      onPointerUp={(event) => onPointerUp(event, item)}
      onPointerCancel={(event) => onPointerUp(event, item)}
    >
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[length:var(--token-border)] text-white shadow-lg ${hiddenFromPlayers ? 'opacity-55' : ''} ${dragging ? 'scale-105' : ''} ${status?.down ? 'grayscale' : ''}`}
        style={{
          ['--token-border' as string]: `${Math.max(2, diameter * 0.06)}px`,
          borderColor: isMine ? '#facc15' : selected ? '#ffffff' : item.color,
          borderStyle: hiddenFromPlayers ? 'dashed' : 'solid',
          backgroundColor: item.color,
          boxShadow: isTurn ? '0 0 0 4px #fbbf24, 0 0 24px 8px rgba(251,191,36,0.7)' : selected ? '0 0 0 3px rgba(255,255,255,0.55)' : undefined,
        }}
      >
        {imageUrl ? (
          <PortraitImage value={imageUrl} variant="thumbnail" draggable={false} decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="font-bold" style={{ fontSize: diameter * 0.38 }}>{initials(item.label)}</span>
        )}
      </div>

      {status && (
        <>
          <div
            className="pointer-events-none absolute overflow-hidden rounded-full bg-black/70"
            style={{ left: '10%', right: '10%', bottom: '4%', height: Math.max(3, diameter * 0.11) }}
            role="meter"
            aria-label={`${item.label} hit points`}
            aria-valuemin={0}
            aria-valuemax={status.maxHp}
            aria-valuenow={status.hp}
          >
            <div className="h-full" style={{ width: `${hpFraction(status) * 100}%`, backgroundColor: hpColor(hpFraction(status)) }} />
          </div>
          {status.down && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-red-500 drop-shadow">
              <Skull size={Math.max(12, diameter * 0.5)} />
            </div>
          )}
          {status.conditions.length > 0 && (
            <div
              className="pointer-events-none absolute bottom-full left-1/2 mb-0.5 flex gap-0.5"
              style={{ transform: `translateX(-50%) scale(${labelScale})`, transformOrigin: 'bottom center' }}
              aria-label={`Conditions: ${status.conditions.join(', ')}`}
            >
              {status.conditions.slice(0, 6).map((name) => (
                <span key={name} title={name} className="rounded bg-purple-700 px-1 text-[10px] font-extrabold leading-4 text-white shadow">{conditionBadge(name)}</span>
              ))}
            </div>
          )}
        </>
      )}

      {isTurn && (
        <div className="absolute -left-1 -top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-stone-900 shadow" style={{ transform: `scale(${labelScale})`, transformOrigin: 'top left' }}>
          Turn
        </div>
      )}

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
