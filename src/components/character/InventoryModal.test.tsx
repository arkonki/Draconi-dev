import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../types/character';
import { InventoryModal } from './InventoryModal';

const mocks = vi.hoisted(() => ({
  updateCharacterData: vi.fn().mockResolvedValue(undefined),
  fetchItems: vi.fn(),
}));

const character = {
  id: 'character-1',
  user_id: 'user-1',
  name: 'Pack Tester',
  attributes: { STR: 12, CON: 10, AGL: 10, INT: 10, WIL: 10, CHA: 10 },
  equipment: {
    inventory: [{ id: 'rope-1', name: 'Rope', quantity: 1 }],
    money: { gold: 1, silver: 4, copper: 2 },
    equipped: {
      armor: undefined,
      helmet: undefined,
      weapons: [],
      wornClothes: [],
      animals: [],
      containers: [],
    },
  },
} as unknown as Character;

const gameItems = [
  {
    id: 'game-rope',
    name: 'Rope',
    category: 'TOOLS',
    description: 'A sturdy rope for climbing and securing equipment.',
    weight: 1,
    cost: '1 silver',
    is_custom: false,
  },
  {
    id: 'game-tent',
    name: 'Tent, Large',
    category: 'MEANS OF TRAVEL',
    description: 'Shelter for a travelling party.',
    weight: 2,
    cost: '2 silver',
    is_custom: false,
  },
];

vi.mock('../../stores/characterSheetStore', () => ({
  useCharacterSheetStore: () => ({
    character,
    updateCharacterData: mocks.updateCharacterData,
  }),
}));

vi.mock('../../lib/api/items', () => ({
  fetchItems: () => mocks.fetchItems(),
}));

function renderInventory(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryModal onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe('InventoryModal', () => {
  beforeEach(() => {
    character.equipment.inventory[0].quantity = 1;
    mocks.updateCharacterData.mockClear();
    mocks.fetchItems.mockReset();
    mocks.fetchItems.mockResolvedValue(gameItems);
  });

  it('shows the heavy movement rules in inventory and dismisses them before the dialog', async () => {
    character.equipment.inventory[0].quantity = 7;
    const onClose = vi.fn();
    renderInventory(onClose);
    await screen.findByRole('button', { name: 'Show details for Rope' });
    const heavy = screen.getByRole('button', { name: /Over-encumbered/ });

    fireEvent.mouseEnter(heavy);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Load 7 / 6');
    expect(tooltip).toHaveTextContent('make a STR roll whenever you want to move in a round of combat or walk for a shift of travel');
    expect(tooltip).toHaveTextContent('drop what you are carrying or stay where you are');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps dense item descriptions collapsed until requested', async () => {
    renderInventory();
    const showDetails = await screen.findByRole('button', { name: 'Show details for Rope' });

    expect(screen.queryByText('A sturdy rope for climbing and securing equipment.')).not.toBeInTheDocument();
    fireEvent.click(showDetails);
    expect(screen.getByText('A sturdy rope for climbing and securing equipment.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide details for Rope' }));
    expect(screen.queryByText('A sturdy rope for climbing and securing equipment.')).not.toBeInTheDocument();
  });

  it('returns from the internal Wallet panel without losing Shop context', async () => {
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });

    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Survival' }));
    expect(screen.getByRole('heading', { name: 'Survival' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open wallet' }));
    expect(screen.getByRole('region', { name: 'Wallet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to inventory' }));

    expect(screen.getByRole('tab', { name: 'Shop' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Survival' })).toBeInTheDocument();
  });

  it('records forage from an internal panel and returns to Gear', async () => {
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });

    fireEvent.click(screen.getByRole('button', { name: 'Forage' }));
    expect(screen.getByRole('region', { name: 'Forage and hunt' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add one ration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 Rations' }));

    await waitFor(() => expect(mocks.updateCharacterData).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: 'My Gear' })).toHaveAttribute('aria-selected', 'true');
  });
});
