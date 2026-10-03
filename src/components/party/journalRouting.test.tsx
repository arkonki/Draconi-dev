import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyPartyRedirect } from './LegacyPartyRedirect';
import { NoteLinkButton } from '../shared/NoteLinkButton';
import { MessageContent } from './MessageContent';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { title: 'Shared entry' }, error: null }) }) }) }) } }));
afterEach(cleanup);

function Location() { const location = useLocation(); return <output aria-label="Destination">{location.pathname}{location.search}{location.hash}</output>; }
function mount(content: React.ReactNode, path = '/character/c') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{content}<Location /></MemoryRouter></QueryClientProvider>);
}

describe('journal navigation', () => {
  it('redirects old party links with their entry and hash intact', () => {
    mount(<Routes><Route path="/adventure-party/:id" element={<LegacyPartyRedirect />} /><Route path="/party/:id" element={<div>Party</div>} /></Routes>, '/adventure-party/p?noteId=n&tab=notes#entry');
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?noteId=n&tab=notes#entry');
  });
  it('opens a party entry from a character-sheet route', () => {
    mount(<NoteLinkButton partyId="p" noteId="n" title="Shared entry" />);
    fireEvent.click(screen.getByRole('button', { name: 'Shared entry' }));
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?noteId=n');
  });
  it('preserves unrelated party query parameters', () => {
    mount(<NoteLinkButton partyId="p" noteId="n" title="Shared entry" />, '/party/p?tab=chat&messageId=m');
    fireEvent.click(screen.getByRole('button', { name: 'Shared entry' }));
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?tab=chat&messageId=m&noteId=n');
  });
  it('opens a personal entry in its journal', () => {
    mount(<NoteLinkButton noteId="n" title="Private entry" />);
    fireEvent.click(screen.getByRole('button', { name: 'Private entry' }));
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/notes?noteId=n');
  });
  it.each(['current', 'legacy', 'markdown'])('recognizes %s links in chat/journal content', async kind => {
    const path = kind === 'legacy' ? '/adventure-party/p?noteId=n' : '/party/p?tab=notes&noteId=n';
    const url = `${window.location.origin}${path}`;
    mount(kind === 'markdown' ? <MarkdownRenderer content={`[Entry](${url})`} /> : <MessageContent content={`Read ${url}`} />);
    fireEvent.click(await screen.findByRole('button', { name: /Shared entry|Entry/ }));
    expect(screen.getByLabelText('Destination')).toHaveTextContent('/party/p?noteId=n');
  });
});
