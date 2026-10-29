import { describe, expect, it } from 'vitest';
import type { GameItem } from './api/items';
import { isMastercrafted, makeMastercrafted } from './mastercrafted';

const broadsword = { name: 'Broadsword', cost: '12 gold', strength_requirement: '10', durability: '15', features: ['PIERCING', 'SLASHING'] } as Partial<GameItem>;

describe('mastercrafted weapons', () => {
  it('costs ten times as much, needs 3 less STR and has 3 more durability', () => {
    expect(makeMastercrafted(broadsword)).toMatchObject({
      name: 'Mastercrafted Broadsword', cost: '120 gold', strength_requirement: '7', durability: '18',
      features: ['PIERCING', 'SLASHING', 'MASTERCRAFTED'],
    });
  });

  it('drops a STR requirement of 3 or less and leaves values that are not numbers', () => {
    expect(makeMastercrafted({ name: 'Knife', cost: '5 silver', strength_requirement: '', durability: '6', features: '' })).toMatchObject({
      cost: '5 gold', strength_requirement: '', durability: '9', features: ['MASTERCRAFTED'],
    });
    expect(makeMastercrafted({ name: 'Club', cost: '1 silver', strength_requirement: '3', durability: '—' })).toMatchObject({ strength_requirement: '', durability: '—' });
  });

  it('only applies once', () => {
    const once = makeMastercrafted(broadsword);
    expect(isMastercrafted(once)).toBe(true);
    expect(makeMastercrafted(once)).toBe(once);
  });
});
