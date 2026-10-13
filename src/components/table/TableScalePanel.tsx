import { useEffect, useMemo, useState } from 'react';
import { Scaling, X } from 'lucide-react';
import { Button } from '../shared/Button';
import {
  SCALE_CELL_MAX,
  SCALE_CELL_MIN,
  cellFromMeasurement,
  effectiveCell,
  savedMetresPerSquare,
} from '../../lib/tableGeometry';
import type { PartyMap } from '../../types/atlas';

export interface ScaleDraft { cell: number; metres: number }

interface TableScalePanelProps {
  map: PartyMap;
  /** Length of the line drawn on the map, in the map image's pixels. */
  measuredPixels: number | null;
  saving: boolean;
  error: string | null;
  onPreview: (draft: ScaleDraft | null) => void;
  onSave: (draft: ScaleDraft, showGrid: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

const DEFAULT_METRES = 1.5;
const toNumber = (value: string) => Number(value.replace(',', '.'));
const round = (value: number) => Math.round(value * 100) / 100;

/** Sets how big one grid square is on this map, and what it stands for. Tokens and the ruler follow it. */
export function TableScalePanel({ map, measuredPixels, saving, error, onPreview, onSave, onReset, onClose }: TableScalePanelProps) {
  const startCell = effectiveCell(map);
  const startMetres = savedMetresPerSquare(map) || DEFAULT_METRES;
  const [cellText, setCellText] = useState(startCell ? String(round(startCell)) : '');
  const [metresText, setMetresText] = useState(String(startMetres));
  const [squaresText, setSquaresText] = useState('');
  const [showGrid, setShowGrid] = useState(map.grid_type === 'none');

  const cell = toNumber(cellText);
  const metres = toNumber(metresText);
  const cellValid = Number.isFinite(cell) && cell >= SCALE_CELL_MIN && cell <= SCALE_CELL_MAX;
  const metresValid = Number.isFinite(metres) && metres > 0 && metres <= 100_000;
  const valid = cellValid && metresValid;
  const fromLine = useMemo(() => (measuredPixels ? cellFromMeasurement(measuredPixels, toNumber(squaresText)) : null), [measuredPixels, squaresText]);

  // The tokens on the map resize as the numbers change, before anything is saved.
  useEffect(() => {
    onPreview(valid ? { cell, metres } : null);
    return () => onPreview(null);
  }, [cell, metres, valid]);

  return (
    <section aria-label="Map scale" className="w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/20 bg-stone-900/95 p-3 text-sm text-white shadow-2xl backdrop-blur" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 font-bold"><Scaling size={15} aria-hidden="true" /> Scale of {map.name}</h3>
          <p className="mt-0.5 text-xs text-white/60">Tokens are measured in squares, so they grow or shrink with the scale.</p>
        </div>
        <button type="button" aria-label="Close the scale panel" onClick={onClose} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={16} /></button>
      </div>

      <div className="mt-3 rounded-lg bg-white/5 p-2">
        <p className="text-xs text-white/70">Drag a line on the map across something you know the size of, such as 10 squares of the printed grid.</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs text-amber-200">{measuredPixels ? `${Math.round(measuredPixels)} px` : 'no line yet'}</span>
          <label className="flex items-center gap-1 text-xs">that is
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={squaresText}
              onChange={(event) => setSquaresText(event.target.value)}
              disabled={!measuredPixels}
              aria-label="Squares the line covers"
              className="w-16 rounded border border-white/25 bg-black/40 px-1 py-0.5 text-center text-white disabled:opacity-40"
            />
            squares
          </label>
          <Button size="sm" variant="secondary" disabled={!fromLine} onClick={() => fromLine && setCellText(String(round(fromLine)))}>Use</Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-white/80">Pixels per square
          <input type="number" min={SCALE_CELL_MIN} max={SCALE_CELL_MAX} step={1} value={cellText} onChange={(event) => setCellText(event.target.value)} aria-invalid={!cellValid} className={`mt-1 w-full rounded border bg-black/40 px-2 py-1 text-white ${cellValid ? 'border-white/25' : 'border-red-400'}`} />
        </label>
        <label className="text-xs text-white/80">Metres per square
          <input type="number" min={0.01} step={0.5} value={metresText} onChange={(event) => setMetresText(event.target.value)} aria-invalid={!metresValid} className={`mt-1 w-full rounded border bg-black/40 px-2 py-1 text-white ${metresValid ? 'border-white/25' : 'border-red-400'}`} />
        </label>
      </div>
      <input
        type="range"
        min={SCALE_CELL_MIN}
        max={Math.max(400, Math.ceil(cellValid ? cell * 2 : 400))}
        step={1}
        value={cellValid ? cell : SCALE_CELL_MIN}
        onChange={(event) => setCellText(event.target.value)}
        aria-label="Pixels per square slider"
        className="mt-2 h-1.5 w-full cursor-pointer accent-amber-300"
      />

      <label className="mt-3 flex items-center gap-2 text-xs text-white/80">
        <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
        Draw a square grid at this size
      </label>

      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" className="text-white/70 hover:text-white" onClick={onReset} disabled={saving || (map.scale_px_per_square == null && map.scale_metres_per_square == null)}>Forget scale</Button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!valid} onClick={() => valid && onSave({ cell, metres }, showGrid)}>Save scale</Button>
        </div>
      </div>
    </section>
  );
}
