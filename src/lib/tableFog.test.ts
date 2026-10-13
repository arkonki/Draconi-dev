import { describe, expect, it } from 'vitest';
import { areaAt, areaFromDrag, isRevealed, parseFogAreas, pointInArea, type FogArea } from './tableFog';

const rect: FogArea = { id: 'r', shape: 'rect', x: 0.2, y: 0.2, w: 0.2, h: 0.2 };
const ellipse: FogArea = { id: 'e', shape: 'ellipse', x: 0.5, y: 0.5, w: 0.4, h: 0.2 };

describe('table fog', () => {
  it('knows what is inside a rectangle and an ellipse', () => {
    expect(pointInArea(rect, { x: 0.3, y: 0.3 })).toBe(true);
    expect(pointInArea(rect, { x: 0.5, y: 0.3 })).toBe(false);
    expect(pointInArea(ellipse, { x: 0.7, y: 0.6 })).toBe(true);
    // the corner of the ellipse's bounding box is outside the ellipse
    expect(pointInArea(ellipse, { x: 0.51, y: 0.51 })).toBe(false);
  });

  it('shows everything when the fog is off and only revealed areas when it is on', () => {
    expect(isRevealed(false, [], { x: 0.9, y: 0.9 })).toBe(true);
    expect(isRevealed(true, [], { x: 0.3, y: 0.3 })).toBe(false);
    expect(isRevealed(true, [rect], { x: 0.3, y: 0.3 })).toBe(true);
    expect(isRevealed(true, [rect], { x: 0.9, y: 0.9 })).toBe(false);
  });

  it('turns a drag in any direction into an area, and ignores stray clicks', () => {
    const area = areaFromDrag({ x: 0.6, y: 0.7 }, { x: 0.4, y: 0.5 }, 'rect', 'a');
    expect(area).toMatchObject({ id: 'a', shape: 'rect', x: 0.4, y: 0.5 });
    expect(area?.w).toBeCloseTo(0.2);
    expect(areaFromDrag({ x: 0.5, y: 0.5 }, { x: 0.5005, y: 0.5005 }, 'rect', 'a')).toBeNull();
    const clamped = areaFromDrag({ x: -1, y: 0.2 }, { x: 0.3, y: 2 }, 'ellipse', 'b');
    expect(clamped).toMatchObject({ x: 0, y: 0.2, w: 0.3 });
    expect(clamped?.h).toBeCloseTo(0.8);
  });

  it('picks the topmost area for erasing', () => {
    const overlapping: FogArea = { ...rect, id: 'top', x: 0.25, y: 0.25 };
    expect(areaAt([rect, overlapping], { x: 0.3, y: 0.3 })?.id).toBe('top');
    expect(areaAt([rect], { x: 0.9, y: 0.9 })).toBeNull();
  });

  it('drops malformed stored data instead of failing', () => {
    expect(parseFogAreas(null)).toEqual([]);
    expect(parseFogAreas('nope')).toEqual([]);
    const parsed = parseFogAreas([rect, { id: 1 }, { id: 'x', shape: 'star', x: 0, y: 0, w: 1, h: 1 }, { id: 'z', shape: 'rect', x: 0, y: 0, w: 0, h: 1 }, { id: 'ok', shape: 'rect', x: '0.5', y: 0.5, w: 0.9, h: 0.1 }]);
    expect(parsed.map((area) => area.id)).toEqual(['r', 'ok']);
    expect(parsed[1].w).toBeCloseTo(0.5);
  });
});
