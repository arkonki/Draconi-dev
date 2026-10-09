import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompendiumManager } from './CompendiumManager';
import { deleteCompendiumEntry, fetchCompendiumEntries } from '../../lib/api/compendium';

vi.mock('../../contexts/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin-1' }, isAdmin: () => true }) }));
vi.mock('../../lib/api/compendium', () => ({
  fetchCompendiumEntries: vi.fn(),
  deleteCompendiumEntry: vi.fn(),
  saveCompendiumEntry: vi.fn(),
}));
vi.mock('../compendium/HomebrewRenderer', () => ({ HomebrewRenderer: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock('../compendium/CompendiumFullPage', () => ({ CompendiumFullPage: () => null }));

const entry = { id: 'e1', title: 'Fear Rules', category: 'Combat', content: 'body', is_public: true };

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CompendiumManager /></QueryClientProvider>);
}

describe('Compendium manager delete confirmation', () => {
  beforeEach(() => {
    vi.mocked(fetchCompendiumEntries).mockResolvedValue([entry] as never);
    vi.mocked(deleteCompendiumEntry).mockReset();
    vi.mocked(deleteCompendiumEntry).mockResolvedValue(undefined as never);
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('asks in an accessible dialog and deletes only after confirming', async () => {
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Delete .?Fear Rules/)).toBeInTheDocument();
    expect(deleteCompendiumEntry).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(deleteCompendiumEntry).toHaveBeenCalled());
    // React Query passes extra context after the variable, so only the first argument is the entry id.
    expect(vi.mocked(deleteCompendiumEntry).mock.calls[0][0]).toBe('e1');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('cancelling keeps the entry', async () => {
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteCompendiumEntry).not.toHaveBeenCalled();
  });
});
