// Fog of war on the shared table. A covered map shows players only the areas the GM has revealed. Areas are
// rectangles or ellipses stored as fractions (0 to 1) of the map's width and height, so they do not depend on
// the picture's size. The fog is a cover over the picture, not a security boundary.

export type FogShape = 'rect' | 'ellipse';

export interface FogArea {
  id: string;
  shape: FogShape;
  /** Top-left corner and size, as fractions of the map. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FogPoint { x: number; y: number }

/** Smallest area worth keeping; anything smaller was a stray click. */
export const MIN_FOG_SIZE = 0.004;
export const MAX_FOG_AREAS = 300;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Reads the stored list defensively: anything that is not a well-formed area is dropped. */
export function parseFogAreas(value: unknown): FogArea[] {
  if (!Array.isArray(value)) return [];
  const areas: FogArea[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, shape, x, y, w, h } = entry as Record<string, unknown>;
    const numbers = [x, y, w, h].map(Number);
    if (typeof id !== 'string' || (shape !== 'rect' && shape !== 'ellipse') || numbers.some((n) => !Number.isFinite(n))) continue;
    const [nx, ny, nw, nh] = numbers;
    if (nw <= 0 || nh <= 0) continue;
    areas.push({ id, shape, x: clamp01(nx), y: clamp01(ny), w: Math.min(nw, 1 - clamp01(nx)), h: Math.min(nh, 1 - clamp01(ny)) });
  }
  return areas;
}

/** The area dragged out between two corners, or null when it is too small to mean anything. */
export function areaFromDrag(from: FogPoint, to: FogPoint, shape: FogShape, id: string): FogArea | null {
  const x1 = clamp01(Math.min(from.x, to.x));
  const y1 = clamp01(Math.min(from.y, to.y));
  const x2 = clamp01(Math.max(from.x, to.x));
  const y2 = clamp01(Math.max(from.y, to.y));
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < MIN_FOG_SIZE || h < MIN_FOG_SIZE) return null;
  return { id, shape, x: x1, y: y1, w, h };
}

export function pointInArea(area: FogArea, point: FogPoint): boolean {
  if (area.shape === 'rect') {
    return point.x >= area.x && point.x <= area.x + area.w && point.y >= area.y && point.y <= area.y + area.h;
  }
  const rx = area.w / 2;
  const ry = area.h / 2;
  const dx = (point.x - (area.x + rx)) / rx;
  const dy = (point.y - (area.y + ry)) / ry;
  return dx * dx + dy * dy <= 1;
}

/** The topmost (latest) area under a point, for erasing. */
export function areaAt(areas: readonly FogArea[], point: FogPoint): FogArea | null {
  for (let index = areas.length - 1; index >= 0; index -= 1) {
    if (pointInArea(areas[index], point)) return areas[index];
  }
  return null;
}

/** Whether a spot on the map can be seen by players. With no fog everything can. */
export function isRevealed(fogEnabled: boolean, areas: readonly FogArea[], point: FogPoint): boolean {
  if (!fogEnabled) return true;
  return areas.some((area) => pointInArea(area, point));
}
