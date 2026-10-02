import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const initialEquipment = structuredClone(character.equipment);

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
  { id: 'game-pack', name: 'Backpack', category: 'CONTAINERS', weight: 1, cost: '2 silver', is_container: false, encumbrance_modifier: 2, description: 'A worn pack.' },
  { id: 'game-horse', name: 'Horse', category: 'ANIMALS', weight: 0, cost: '10 gold', is_container: true, container_capacity: 20 },
  { id: 'game-bag', name: 'Saddle bag', category: 'CONTAINERS', weight: 1, cost: '2 silver', is_container: true, container_capacity: 4, encumbrance_modifier: 2 },
  { id: 'game-arrows', name: 'Arrows (20)', category: 'RANGED WEAPONS', weight: 1, cost: '1 silver', description: 'A bundle of arrows.' },
  { id: 'game-bow', name: 'Short bow', category: 'RANGED WEAPONS', weight: 1, encumbrance_modifier: 1 },
  { id: 'game-dagger', name: 'Dagger', category: 'MELEE WEAPONS', weight: 1, encumbrance_modifier: 1 },
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
    character.equipment = structuredClone(initialEquipment);
    character.attributes.STR = 12;
    mocks.updateCharacterData.mockClear();
    mocks.updateCharacterData.mockResolvedValue(undefined);
    mocks.fetchItems.mockReset();
    mocks.fetchItems.mockResolvedValue(gameItems);
  });

  it('shows STR 14 capacity as seven slots with an equipped bow and dagger', async () => {
    character.attributes.STR = 14;
    character.equipment.inventory[0].quantity = 7;
    character.equipment.equipped.weapons = [{ name: 'Short bow' }, { name: 'Dagger' }];
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    expect(screen.getByText('7 / 7 Load')).toBeVisible();
    const breakdown = screen.getByLabelText('Encumbrance breakdown');
    expect(breakdown).toHaveTextContent('7 carried slots / 7 capacity · STR 14 → 7 base');
    expect(breakdown).not.toHaveTextContent('Short bow');
    expect(breakdown).not.toHaveTextContent('Dagger');
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

  it('shows and unequips a worn backpack even when it is not flagged as separate storage', async () => {
    character.equipment.equipped.containers = [{ id: 'pack', name: 'Backpack', quantity: 1 }];
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    expect(screen.getByText('+2 carrying slots')).toBeVisible();
    expect(screen.getByLabelText('Encumbrance breakdown')).toHaveTextContent('6 base + 2 Backpack');
    fireEvent.click(screen.getAllByRole('button', { name: 'Unequip Backpack' })[0]);
    const equipment = mocks.updateCharacterData.mock.calls[0][0].equipment;
    expect(equipment.equipped.containers).toEqual([]);
    expect(equipment.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Backpack' })]));
  });

  it('shows carried backpack contents and keeps their load in the character total', async () => {
    character.equipment.equipped.containers = [{ id: 'pack', name: 'Backpack', quantity: 1 }];
    character.equipment.inventory[0].containerId = 'pack';
    character.equipment.inventory[0].quantity = 7;
    renderInventory();
    await screen.findByText('7 / 8 Load');
    expect(screen.queryByRole('button', { name: 'Show details for Rope' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Backpack storage' }));
    expect(screen.getByRole('button', { name: 'Show details for Rope' })).toBeVisible();
    expect(screen.getByText('These contents also count toward your total carried load.')).toBeVisible();
  });

  it('shows orphaned container items in Main Inventory instead of hiding them', async () => {
    character.equipment.inventory[0].containerId = 'missing';
    character.equipment.inventory[0].quantity = 7;
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    expect(screen.getByText('7 / 6 Load')).toBeVisible();
    expect(screen.getByText(/Some items reference missing containers/)).toBeVisible();
  });

  it('normalizes bundle purchases to explicit unit weights', async () => {
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    fireEvent.change(screen.getByPlaceholderText('Search everything in shop...'), { target: { value: 'Arrows' } });
    const name = screen.getByText('Arrows (20)');
    const card = name.closest('.bg-white');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button'));
    expect(mocks.updateCharacterData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    expect(screen.getByText('Adds 20 × Arrows')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
    await waitFor(() => expect(mocks.updateCharacterData).toHaveBeenCalledOnce());
    const equipment = mocks.updateCharacterData.mock.calls[0][0].equipment;
    expect(equipment.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Arrows', quantity: 20, weight: 0.05, weightBasis: 'unit', definitionId: 'game-arrows' })]));
  });

  it('reviews and adjusts multiple selections, then saves all gear and money in one purchase', async () => {
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    const search = screen.getByPlaceholderText('Search everything in shop...');
    fireEvent.change(search, { target: { value: 'Rope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Rope to cart' }));
    fireEvent.change(search, { target: { value: 'Arrows' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Arrows (20) to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Arrows (20) quantity' }));
    expect(screen.getByText('Adds 40 × Arrows')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Shopping cart' })).toHaveTextContent('Total3 silver');
    expect(mocks.updateCharacterData).not.toHaveBeenCalled();
    expect(character.equipment.inventory[0].quantity).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue shopping' }));
    expect(screen.getByPlaceholderText('Search everything in shop...')).toHaveValue('Arrows');
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    expect(screen.getByLabelText('Arrows (20) purchase quantity')).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
    await screen.findByText('Purchase complete. Spent 3 silver.');
    expect(mocks.updateCharacterData).toHaveBeenCalledOnce();
    const equipment = mocks.updateCharacterData.mock.calls[0][0].equipment;
    expect(equipment.money).toEqual({ gold: 1, silver: 1, copper: 2 });
    expect(equipment.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Rope', quantity: 2 }),
      expect.objectContaining({ name: 'Arrows', quantity: 40 }),
    ]));
    expect(character.equipment.inventory[0].quantity).toBe(1);
  });

  it('blocks unaffordable checkout and supports removing items and clearing the cart', async () => {
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    fireEvent.change(screen.getByPlaceholderText('Search everything in shop...'), { target: { value: 'Horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Horse to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
    expect(screen.getByText(/Not enough money/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Horse from cart' }));
    expect(screen.getByText(/Your cart is empty/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue shopping' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Horse to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear cart' }));
    expect(screen.getByText(/Your cart is empty/)).toBeVisible();
    expect(mocks.updateCharacterData).not.toHaveBeenCalled();
  });

  it('keeps the cart and existing inventory untouched after a failed purchase', async () => {
    mocks.updateCharacterData.mockRejectedValueOnce(new Error('Could not save purchase'));
    renderInventory();
    await screen.findByRole('button', { name: 'Show details for Rope' });
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    fireEvent.change(screen.getByPlaceholderText('Search everything in shop...'), { target: { value: 'Rope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Rope to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save purchase');
    expect(screen.getByLabelText('Rope purchase quantity')).toHaveValue(1);
    expect(character.equipment.inventory[0].quantity).toBe(1);
    expect(character.equipment.money).toEqual(initialEquipment.money);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
    await screen.findByText('Purchase complete. Spent 1 silver.');
    expect(mocks.updateCharacterData).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate checkout and closing while the purchase is saving', async () => {
    let complete!: () => void;
    mocks.updateCharacterData.mockReturnValueOnce(new Promise<void>(resolve => { complete = resolve; }));
    const onClose = vi.fn();
    renderInventory(onClose);
    await screen.findByRole('button', { name: 'Show details for Rope' });
    fireEvent.click(screen.getByRole('tab', { name: 'Shop' }));
    fireEvent.change(screen.getByPlaceholderText('Search everything in shop...'), { target: { value: 'Rope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Rope to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Purchasing…' }));
    expect(mocks.updateCharacterData).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Close inventory' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    complete();
    await screen.findByText('Purchase complete. Spent 1 silver.');
  });

  it('shows items left elsewhere separately without counting their load', async () => {
    character.equipment.inventory[0].temporarilyPlaced = true;
    renderInventory();
    await screen.findByText('0 / 6 Load');
    expect(screen.queryByRole('button', { name: 'Show details for Rope' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Items stored elsewhere' }));
    expect(screen.getByRole('button', { name: 'Show details for Rope' })).toBeVisible();
    expect(screen.getByText('Excluded from carried load')).toBeVisible();
  });

  it('releases saddlebag cargo when the mount is unequipped', async () => {
    character.equipment.equipped.animals = [{ id: 'horse', name: 'Horse', quantity: 1 }];
    character.equipment.equipped.containers = [{ id: 'bag', name: 'Saddle bag', quantity: 1, equippedOn: 'horse' }];
    character.equipment.inventory[0].containerId = 'bag';
    renderInventory();
    await screen.findByText('0 / 6 Load');
    fireEvent.click(screen.getAllByRole('button', { name: 'Unequip Horse' })[0]);
    const equipment = mocks.updateCharacterData.mock.calls[0][0].equipment;
    expect(equipment.equipped.animals).toEqual([]);
    expect(equipment.equipped.containers).toEqual([]);
    expect(equipment.inventory.find((item: { name: string }) => item.name === 'Rope').containerId).toBeUndefined();
    expect(equipment.inventory.find((item: { name: string }) => item.name === 'Saddle bag').equippedOn).toBeUndefined();
  });
});
