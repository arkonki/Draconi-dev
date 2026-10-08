import { describe, expect, it } from 'vitest';
import type { GameItem } from './api/items';
import { shopCartTotal, shopPriceInCopper, shopPurchaseContents } from './shopCart';

const item = (name: string, cost = '1 silver', quantity?: number) => ({ id: name, name, cost, quantity } as unknown as GameItem);

describe('shop cart', () => {
  it('totals purchases across denominations, including free items', () => {
    expect(shopCartTotal([
      { item: item('Rope', '2 silver'), quantity: 3 },
      { item: item('Kit', '1 gold, 2 copper'), quantity: 2 },
      { item: item('Gift', 'Free'), quantity: 1 },
    ])).toBe(264);
    expect(shopPriceInCopper(item('Gift', '0'))).toBe(0);
  });
  it('does not turn unavailable or negative prices into free purchases', () => {
    for (const price of ['', 'N/A', 'varies', '-2 silver']) expect(shopPriceInCopper(item('Unknown', price))).toBeNull();
    expect(shopCartTotal([{ item: item('Rope'), quantity: 0 }])).toBeNull();
    expect(shopCartTotal([{ item: item('Rope'), quantity: 1.5 }])).toBeNull();
  });
  it('distinguishes bundle contents from shop purchase quantities and measurements', () => {
    expect(shopPurchaseContents(item('Arrows (20)'))).toEqual({ name: 'Arrows', quantity: 20 });
    expect(shopPurchaseContents(item('Rope (10 m)'))).toEqual({ name: 'Rope (10 m)', quantity: 1 });
    expect(shopPurchaseContents(item('Torches', '1 silver', 4))).toEqual({ name: 'Torches', quantity: 4 });
  });
});
