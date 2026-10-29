import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Character } from '../../types/character';
import { EquipmentSection } from './EquipmentSection';

vi.mock('../../lib/api/items', () => ({
  fetchItems: vi.fn().mockResolvedValue([
    { id: 'sword', name: 'Short Sword', category: 'MELEE WEAPONS', skill: 'Swords(STR)', damage: 'D10', grip: '1H', strength_requirement: '7', weight: 1, cost: '8 gold' },
    { id: 'unarmed', name: 'Unarmed', category: 'MELEE WEAPONS', skill: 'Brawling(STR)', damage: 'D6', always_available: true, weight: 0, cost: '' },
    { id: 'light', name: 'Blunt Object (Light)', category: 'MELEE WEAPONS', skill: 'Brawling(STR)', damage: 'D8', grip: '1H', always_available: true, weight: 1, cost: '' },
    { id: 'heavy', name: 'Blunt Object (Heavy)', category: 'MELEE WEAPONS', skill: 'Brawling(STR)', damage: '2D8', grip: '2H', strength_requirement: '16', always_available: true, weight: 1, cost: '' },
  ]),
}));
vi.mock('../dice/useDice', () => ({ useDice: () => ({ toggleDiceRoller: vi.fn() }) }));
vi.mock('../../stores/characterSheetStore', () => ({ useCharacterSheetStore: () => ({ updateCharacterData: vi.fn() }) }));
vi.mock('../../lib/api/chat', () => ({ sendMessage: vi.fn() }));

const character = {
  id: 'hero',
  name: 'Brawler',
  attributes: { STR: 12, CON: 10, AGL: 10, INT: 10, WIL: 10, CHA: 10 },
  skill_levels: { Swords: 12, Brawling: 10 },
  equipment: { inventory: [], money: {}, equipped: { weapons: [{ name: 'Short Sword' }], wornClothes: [], containers: [], animals: [] } },
} as unknown as Character;

const renderSheet = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <EquipmentSection character={character} />
  </QueryClientProvider>,
);

describe('EquipmentSection weapons', () => {
  it('always lists Unarmed with the weapons at hand and keeps blunt objects on the improvised tab', async () => {
    renderSheet();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Short Sword')).toBeVisible();
    expect(within(table).getByText('Unarmed')).toBeVisible();
    expect(within(table).queryByText('Blunt Object (Light)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Improvised weapons (2)' }));
    const improvised = screen.getByRole('table');
    expect(within(improvised).getByText('Blunt Object (Light)')).toBeVisible();
    expect(within(improvised).queryByText('Unarmed')).not.toBeInTheDocument();
    // STR 12 is not enough for a heavy blunt object.
    expect(within(improvised).getByText('Needs STR 16')).toBeVisible();
    expect(screen.getByText(/Attacks use BRAWLING/)).toBeVisible();
  });
});
