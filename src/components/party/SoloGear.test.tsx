import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SoloGear } from './SoloGear';
import type { SoloActor } from '../../lib/api/solo';

const hero = (overrides: Partial<SoloActor> = {}): SoloActor => ({
  id: 'h1', name: 'Mara', hp: { current: 8, max: 10 }, wp: { current: 6, max: 8 }, conditions: [], isRallied: false,
  deathRolls: { passed: 0, failed: 0 }, lifeStatus: 'active', inventory: [], tags: [], ...overrides,
});

describe('solo gear list', () => {
  it('shows the weapons and armor the hero has, with their numbers', () => {
    render(<SoloGear hero={hero({
      weapons: [{ id: 'w1', name: 'Battle axe', damage: '2D8', range: '2', grip: '2H', durability: 9, features: ['TOPPLING', 'SLASHING'] }],
      bodyArmor: { id: 'a1', name: 'Chainmail', armorRating: 5 },
      helmet: { id: 'a2', name: 'Open helmet', armorRating: 1 },
      shield: { id: 's1', name: 'Shield (Small)', damage: 'D8', grip: '1H', state: { broken: true } },
    })} />);
    expect(screen.getByText('Battle axe')).toBeInTheDocument();
    expect(screen.getByText('Damage 2D8 · Range 2 · Two hands · Durability 9 · toppling, slashing')).toBeInTheDocument();
    expect(screen.getByText('Chainmail')).toBeInTheDocument();
    expect(screen.getByText('Total armor 6')).toBeInTheDocument();
    expect(screen.getByText('Broken')).toBeInTheDocument();
  });

  it('says so when the hero is unarmed and unarmored', () => {
    render(<SoloGear hero={hero()} />);
    expect(screen.getByText('Unarmed')).toBeInTheDocument();
    expect(screen.getByText('No armor')).toBeInTheDocument();
  });

  it('lists other equipped items and what is lit', () => {
    render(<SoloGear hero={hero({ inventory: [{ id: 'i1', name: 'Rope', quantity: 2, equipped: true }], heldItems: [{ id: 't1', name: 'Torch', state: { isLit: true } }] })} />);
    expect(screen.getByText('Rope ×2')).toBeInTheDocument();
    expect(screen.getByText('Torch · Lit')).toBeInTheDocument();
  });
});
