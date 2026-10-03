import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { PartyNotes } from './PartyNotes';
import { Notes } from '../../pages/Notes';

type Entry = { id: string; user_id: string; title: string; content: string; party_id: string | null; character_id: string | null; category: string; created_at: string; updated_at: string };
const mocks = vi.hoisted(() => ({
  user: { id: 'viewer' },
  entries: [] as Entry[],
  mutations: [] as { table: string; action: string; payload: Record<string, unknown> }[],
  parties: [] as { id: string; name: string; campaign_role: string }[],
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../contexts/useAuth', () => ({ useAuth: () => ({ user: mocks.user, isAdmin: () => false }) }));
vi.mock('../../hooks/useRealtimeChannel', () => ({ useRealtimeChannel: () => undefined }));
vi.mock('../../lib/api/parties', () => ({ fetchParties: async () => mocks.parties }));
vi.mock('../../lib/api/chat', () => ({ sendMessage: mocks.sendMessage }));
vi.mock('../shared/MarkdownRenderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <article>{content}</article> }));
vi.mock('../../lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    let action = 'select';
    let payload: Record<string, unknown> = {};
    const result = () => {
      if (table !== 'notes') return { data: [], error: null };
      const rows = mocks.entries.filter(row => filters.every(([key, value]) => row[key as keyof Entry] === value));
      if (action === 'update') rows.forEach(row => Object.assign(row, payload));
      if (action === 'insert') {
        const created = { ...payload, id: 'new-entry', created_at: '2026-10-01', updated_at: '2026-10-01' } as Entry;
        mocks.entries.push(created);
        return { data: [created], error: null };
      }
      return { data: rows.map(row => ({ ...row })), error: null };
    };
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      order: async () => result(),
      single: async () => { const response = result(); return { ...response, data: response.data[0] || null }; },
      update: (value: Record<string, unknown>) => { action = 'update'; payload = value; mocks.mutations.push({ table, action, payload }); return chain; },
      insert: (values: Record<string, unknown>[]) => { action = 'insert'; payload = values[0]; mocks.mutations.push({ table, action, payload }); return chain; },
      delete: () => { action = 'delete'; mocks.mutations.push({ table, action, payload }); return chain; },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
} }));

function Location() { const location = useLocation(); return <output aria-label="Destination">{location.pathname}{location.search}</output>; }
function Party({ gm = false, observer = false }: { gm?: boolean; observer?: boolean }) {
  const [params] = useSearchParams();
  return <PartyNotes partyId="p" isDM={gm} readOnly={observer} openNoteId={params.get('noteId')} />;
}
function mountParty(gm = false, observer = false, id = 'n') {
  render(<MemoryRouter initialEntries={[`/party/p?noteId=${id}`]}><Party gm={gm} observer={observer} /><Location /></MemoryRouter>);
}
function entry(id: string, author = 'author', party: string | null = 'p'): Entry {
  return { id, user_id: author, title: `Entry ${id}`, content: `Content ${id}`, party_id: party, character_id: null, category: 'Lore', created_at: '2026-10-01', updated_at: '2026-10-01' };
}

afterEach(cleanup);
beforeEach(() => {
  mocks.entries = [entry('n'), entry('own', 'viewer')];
  mocks.mutations = [];
  mocks.parties = [{ id: 'p', name: 'Campaign GM', campaign_role: 'gm' }, { id: 'observed', name: 'Observed campaign', campaign_role: 'observer' }];
  mocks.sendMessage.mockClear();
});

describe('party journal controls', () => {
  it('opens the requested entry and lets a GM edit without replacing the author', async () => {
    mountParty(true);
    await screen.findByText('Content n');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'GM revision' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
    await screen.findByRole('heading', { name: 'GM revision' });
    expect(mocks.mutations.find(mutation => mutation.table === 'notes')?.payload).not.toHaveProperty('user_id');
    expect(mocks.entries[0].user_id).toBe('author');
  });
  it('hides edit/delete for another player’s entry but allows sharing', async () => {
    mountParty();
    await screen.findByText('Content n');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
    await screen.findByRole('button', { name: 'Shared!' });
    expect(mocks.sendMessage).toHaveBeenCalledWith('p', 'viewer', '<<<NOTE:n:Entry n>>> Shared a note: Entry n');
  });
  it('allows a player to edit their own entry', async () => {
    mountParty(false, false, 'own');
    await screen.findByText('Content own');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });
  it('keeps observers read-only even on their own entry', async () => {
    mountParty(false, true, 'own');
    await screen.findByText('Content own');
    for (const name of ['New', 'Edit', 'Delete', 'Notify']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeEnabled();
  });
  it('reports deleted or unauthorized deep links instead of silently selecting nothing', async () => {
    mountParty(false, false, 'missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('deleted or you do not have access');
  });
  it('keeps selection in the URL and clears it when returning to the list', async () => {
    mountParty();
    await screen.findByText('Content n');
    fireEvent.click(screen.getByRole('button', { name: /Entry own.*Lore/ }));
    await screen.findByText('Content own');
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?noteId=own&tab=notes');
    fireEvent.click(screen.getByRole('button', { name: /Back to List/ }));
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?tab=notes');
    expect(screen.queryByText('Content own')).not.toBeInTheDocument();
  });
  it('copies a canonical party link usable in chat', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mountParty(true);
    await screen.findByText('Content n');
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/party/p?noteId=n`);
  });
});

describe('personal journal links and campaign roles', () => {
  it('opens a personal deep link and retains author ownership on save', async () => {
    mocks.entries = [entry('private', 'viewer', null)];
    render(<MemoryRouter initialEntries={['/notes?noteId=private']}><Notes /><Location /></MemoryRouter>);
    await screen.findByText('Content private');
    fireEvent.click(screen.getByTitle('Edit Note'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Personal revision' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));
    await screen.findByRole('heading', { name: 'Personal revision' });
    expect(mocks.mutations[0].payload).not.toHaveProperty('user_id');
  });
  it('uses campaign role rather than global DM status for party linking', async () => {
    render(<MemoryRouter><Notes /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'New' }));
    expect(screen.getByLabelText('Party Link (Opt)')).toHaveTextContent('Campaign GM');
    expect(screen.getByLabelText('Party Link (Opt)')).not.toHaveTextContent('Observed campaign');
    expect(screen.getByText(/visible to every campaign member/)).toBeInTheDocument();
  });
  it('redirects a party entry opened through a personal-journal URL to its campaign', async () => {
    render(<MemoryRouter initialEntries={['/notes?noteId=n']}><Notes /><Location /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?noteId=n'));
  });
  it('reports inaccessible personal entry links', async () => {
    render(<MemoryRouter initialEntries={['/notes?noteId=missing']}><Notes /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('deleted or you do not have access');
  });
  it('copies a personal deep link and selects another note without reopening the old one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mocks.entries = [entry('private', 'viewer', null), entry('other', 'viewer', null)];
    render(<MemoryRouter initialEntries={['/notes?noteId=private']}><Notes /><Location /></MemoryRouter>);
    await screen.findByText('Content private');
    fireEvent.click(screen.getByTitle('Copy link to note'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/notes?noteId=private`);
    fireEvent.click(screen.getByRole('button', { name: /Entry other/ }));
    await screen.findByText('Content other');
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/notes?noteId=other');
  });
});
