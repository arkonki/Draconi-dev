// Pure geometry for the shared table. Positions are fractions of the map (0 to 1); the canvas works in the
// map image's own pixels and a view transform of { x, y, scale } maps those pixels to the screen.

export interface TableView { x: number; y: number; scale: number }

export interface GridSettings {
  grid_type: 'none' | 'square' | 'hex';
  grid_size: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 6;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** How wide a token is, in the map image's pixels. */
export function tokenDiameter(size: number, grid: GridSettings, imageWidth: number): number {
  if (grid.grid_type === 'square' && grid.grid_size > 5) return size * grid.grid_size;
  if (grid.grid_type === 'hex' && grid.grid_size > 5) return size * grid.grid_size * Math.sqrt(3);
  return size * imageWidth * 0.07;
}

/** The scale that fits the whole image inside the container, with a little breathing room. */
export function fitView(container: { width: number; height: number }, image: { width: number; height: number }, padding = 24): TableView {
  if (image.width <= 0 || image.height <= 0 || container.width <= 0 || container.height <= 0) return { x: 0, y: 0, scale: 1 };
  const scale = Math.min(
    (container.width - padding * 2) / image.width,
    (container.height - padding * 2) / image.height,
    1.5,
  );
  const safe = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  return {
    scale: safe,
    x: (container.width - image.width * safe) / 2,
    y: (container.height - image.height * safe) / 2,
  };
}

/** Zooms by `factor` while keeping the point under the cursor (anchor, in container pixels) where it is. */
export function zoomAround(view: TableView, factor: number, anchor: { x: number; y: number }): TableView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}

/** Moves the view so the given point (a map fraction) sits in the middle of the container. */
export function centerOn(view: TableView, point: { x: number; y: number }, container: { width: number; height: number }, image: { width: number; height: number }): TableView {
  return {
    scale: view.scale,
    x: container.width / 2 - point.x * image.width * view.scale,
    y: container.height / 2 - point.y * image.height * view.scale,
  };
}

/** Turns a drag of the pointer, in screen pixels, into a new map fraction. */
export function dragToFraction(start: { x: number; y: number }, deltaScreen: { x: number; y: number }, scale: number, image: { width: number; height: number }) {
  if (image.width <= 0 || image.height <= 0 || scale <= 0) return start;
  return {
    x: clamp01(start.x + deltaScreen.x / scale / image.width),
    y: clamp01(start.y + deltaScreen.y / scale / image.height),
  };
}

/** Who may drag a token: the GM any, a player only their own character's token while the GM has not locked it. */
export function canMoveItem(item: { character_id: string | null; locked: boolean }, isGm: boolean, myCharacterIds: ReadonlySet<string>) {
  if (isGm) return true;
  return Boolean(item.character_id && myCharacterIds.has(item.character_id) && !item.locked);
}

export function initials(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** The width of one grid square in the map image's pixels, or null when the map has no usable grid. */
export function cellSize(grid: GridSettings): number | null {
  if (grid.grid_size <= 5) return null;
  if (grid.grid_type === 'square') return grid.grid_size;
  if (grid.grid_type === 'hex') return grid.grid_size * Math.sqrt(3);
  return null;
}

export interface Measurement {
  /** Straight-line length in the map image's pixels. */
  pixels: number;
  /** Length in grid squares, or null without a grid. */
  squares: number | null;
  /** Length in metres when the viewer has said how long a square is. */
  metres: number | null;
}

/** Measures between two map points (fractions) for the ruler. */
export function measureBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
  image: { width: number; height: number },
  grid: GridSettings,
  metresPerSquare = 0,
): Measurement {
  const pixels = Math.hypot((to.x - from.x) * image.width, (to.y - from.y) * image.height);
  const cell = cellSize(grid);
  const squares = cell ? pixels / cell : null;
  return { pixels, squares, metres: squares !== null && metresPerSquare > 0 ? squares * metresPerSquare : null };
}

/** The map fraction under a screen point, given the view. Null until the image size is known. */
export function screenToFraction(point: { x: number; y: number }, view: TableView, image: { width: number; height: number }) {
  if (image.width <= 0 || image.height <= 0 || view.scale <= 0) return null;
  return { x: clamp01((point.x - view.x) / view.scale / image.width), y: clamp01((point.y - view.y) / view.scale / image.height) };
}
