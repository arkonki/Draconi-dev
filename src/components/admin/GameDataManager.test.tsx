import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDataManager } from './GameDataManager';
import { fetchGameDataUsage } from '../../lib/api/gameDataUsage';

const deleteEntry = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useGameData', () => ({
  useGameData: () => ({
    entries: [{ id: 'item-1', name: 'Broadsword', category: 'MELEE WEAPONS', cost: '50 silver', weight: 1 }],
    loading: false,
    error: null,
    handleSave: vi.fn(),
    handleDelete: deleteEntry,
    switchCategory: vi.fn(),
    reloadEntries: vi.fn(),
    activeCategory: 'items',
  }),
}));
vi.mock('../../lib/api/gameDataUsage', () => ({ fetchGameDataUsage: vi.fn() }));
vi.mock('../../lib/supabase', () => {
  // A chainable query builder that resolves to an empty result, whatever is called on it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(() => undefined, {
    get: (_target, property) => (property === 'then' ? (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) : chain),
    apply: () => chain,
  });
  return { supabase: { from: () => chain } };
});

const usage = vi.mocked(fetchGameDataUsage);

async function openDelete() {
  render(<GameDataManager />);
  fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
  return screen.findByRole('dialog');
}

describe('Game Data delete confirmation', () => {
  beforeEach(() => {
    deleteEntry.mockReset();
    deleteEntry.mockResolvedValue(undefined);
    usage.mockReset();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('warns when characters still use the entry and deletes only after confirming', async () => {
    usage.mockResolvedValue({
      category: 'items', id: 'item-1', name: 'Broadsword', total: 4,
      usage: [
        { key: 'characters', label: 'characters carrying or wearing it', count: 3, examples: ['Bumble', 'Splats'] },
        { key: 'stashes', label: 'party stashes', count: 1, examples: ['Mäepealse (stash)'] },
      ],
    });
    const dialog = await openDelete();
    expect(within(dialog).getByText(/Delete .?Broadsword/)).toBeInTheDocument();
    expect(await within(dialog).findByText('This entry is in use')).toBeInTheDocument();
    expect(within(dialog).getByText(/characters carrying or wearing it/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Bumble, Splats and 1 more/)).toBeInTheDocument();
    expect(deleteEntry).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete anyway' }));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith('items', 'item-1'));
    expect(usage).toHaveBeenCalledWith('items', 'item-1');
  });

  it('says plainly when nothing uses the entry', async () => {
    usage.mockResolvedValue({ category: 'items', id: 'item-1', name: 'Broadsword', total: 0, usage: [] });
    const dialog = await openDelete();
    expect(await within(dialog).findByText(/Nothing refers to this entry/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('keeps the confirm button disabled while usage is still being checked', async () => {
    usage.mockReturnValue(new Promise(() => undefined));
    const dialog = await openDelete();
    expect(within(dialog).getByText(/Checking where this is used/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('still allows deleting, with a warning, when the usage check fails', async () => {
    usage.mockRejectedValue(new Error('boom'));
    const dialog = await openDelete();
    expect(await within(dialog).findByText(/Could not check where this is used \(boom\)/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1));
  });

  it('cancelling deletes nothing, and the old browser popup is never used', async () => {
    usage.mockResolvedValue({ category: 'items', id: 'item-1', name: 'Broadsword', total: 0, usage: [] });
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
