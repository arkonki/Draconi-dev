import { describe, expect, it } from 'vitest';
import { canMoveItem, centerOn, clamp01, dragToFraction, fitView, initials, tokenDiameter, zoomAround } from './tableGeometry';

describe('tokenDiameter', () => {
  it('follows the grid when there is one', () => {
    expect(tokenDiameter(1, { grid_type: 'square', grid_size: 70 }, 4000)).toBe(70);
    expect(tokenDiameter(2, { grid_type: 'square', grid_size: 70 }, 4000)).toBe(140);
    expect(tokenDiameter(1, { grid_type: 'hex', grid_size: 50 }, 4000)).toBeCloseTo(50 * Math.sqrt(3));
  });

  it('falls back to a share of the map width without a usable grid', () => {
    expect(tokenDiameter(1, { grid_type: 'none', grid_size: 70 }, 2000)).toBe(140);
    expect(tokenDiameter(1, { grid_type: 'square', grid_size: 3 }, 2000)).toBe(140);
  });
});

describe('fitView', () => {
  it('centres the whole image in the container', () => {
    const view = fitView({ width: 1000, height: 600 }, { width: 2000, height: 1000 }, 0);
    expect(view.scale).toBeCloseTo(0.5);
    expect(view.x).toBeCloseTo(0);
    expect(view.y).toBeCloseTo(50);
  });

  it('never blows a small image up past a sensible size', () => {
    expect(fitView({ width: 2000, height: 2000 }, { width: 100, height: 100 }).scale).toBeLessThanOrEqual(1.5);
  });

  it('copes with a container or image that has no size yet', () => {
    expect(fitView({ width: 0, height: 0 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('zoomAround', () => {
  it('keeps the point under the cursor fixed', () => {
    const before = { x: 40, y: 20, scale: 1 };
    const anchor = { x: 300, y: 200 };
    const after = zoomAround(before, 2, anchor);
    const mapPoint = { x: (anchor.x - before.x) / before.scale, y: (anchor.y - before.y) / before.scale };
    expect(mapPoint.x * after.scale + after.x).toBeCloseTo(anchor.x);
    expect(mapPoint.y * after.scale + after.y).toBeCloseTo(anchor.y);
  });

  it('stays within the zoom limits', () => {
    expect(zoomAround({ x: 0, y: 0, scale: 5.9 }, 3, { x: 0, y: 0 }).scale).toBe(6);
    expect(zoomAround({ x: 0, y: 0, scale: 0.06 }, 0.1, { x: 0, y: 0 }).scale).toBe(0.05);
  });
});

describe('centerOn', () => {
  it('puts a map point in the middle of the container', () => {
    const view = centerOn({ x: 0, y: 0, scale: 0.5 }, { x: 0.5, y: 0.5 }, { width: 800, height: 600 }, { width: 2000, height: 1000 });
    expect(view.x + 0.5 * 2000 * view.scale).toBeCloseTo(400);
    expect(view.y + 0.5 * 1000 * view.scale).toBeCloseTo(300);
  });
});

describe('dragToFraction', () => {
  it('turns screen pixels into map fractions at the current zoom', () => {
    expect(dragToFraction({ x: 0.5, y: 0.5 }, { x: 100, y: 50 }, 0.5, { width: 2000, height: 1000 })).toEqual({ x: 0.6, y: 0.6 });
  });

  it('keeps tokens on the map', () => {
    expect(dragToFraction({ x: 0.9, y: 0.1 }, { x: 5000, y: -5000 }, 1, { width: 1000, height: 1000 })).toEqual({ x: 1, y: 0 });
    expect(clamp01(-3)).toBe(0);
  });
});

describe('canMoveItem', () => {
  const mine = new Set(['c1']);
  it('lets the GM move anything', () => {
    expect(canMoveItem({ character_id: null, locked: true }, true, mine)).toBe(true);
  });
  it('lets a player move only their own unlocked token', () => {
    expect(canMoveItem({ character_id: 'c1', locked: false }, false, mine)).toBe(true);
    expect(canMoveItem({ character_id: 'c1', locked: true }, false, mine)).toBe(false);
    expect(canMoveItem({ character_id: 'c2', locked: false }, false, mine)).toBe(false);
    expect(canMoveItem({ character_id: null, locked: false }, false, mine)).toBe(false);
  });
});

describe('initials', () => {
  it('uses one or two letters', () => {
    expect(initials('Anna')).toBe('AN');
    expect(initials('Borin Stonefist')).toBe('BS');
    expect(initials('  ')).toBe('?');
  });
});
