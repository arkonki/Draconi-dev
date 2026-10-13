import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionSettings } from './ConnectionSettings';
import type { ConnectionsOverview } from '../../lib/api/connections';

const api = vi.hoisted(() => ({
  fetchConnections: vi.fn(),
  createToken: vi.fn(),
  revokeToken: vi.fn(),
  disconnectApp: vi.fn(),
}));
vi.mock('../../lib/api/connections', () => api);

const overview = (overrides: Partial<ConnectionsOverview> = {}): ConnectionsOverview => ({
  mcpUrl: 'https://draconi.ee/mcp',
  authorizationServer: 'https://draconi.ee',
  scopes: [],
  maxTokens: 10,
  tokenLifetimes: [7, 30, 90, 365],
  apps: [],
  tokens: [],
  ...overrides,
});

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ConnectionSettings />
  </QueryClientProvider>,
);

describe('ConnectionSettings', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows the address to paste into an assistant', async () => {
    api.fetchConnections.mockResolvedValue(overview());
    renderPage();
    expect(await screen.findByDisplayValue('https://draconi.ee/mcp')).toBeInTheDocument();
    expect(screen.getByText('Nothing is connected yet.')).toBeInTheDocument();
    expect(screen.getByText('You have no active tokens.')).toBeInTheDocument();
  });

  it('lists connected apps and tokens with what each may do', async () => {
    api.fetchConnections.mockResolvedValue(overview({
      apps: [{ clientId: 'c1', name: 'ChatGPT', scopes: ['draconi:read', 'draconi:write'], connectedAt: '2026-10-01T10:00:00Z', lastUsedAt: null, expiresAt: '2026-10-31T10:00:00Z' }],
      tokens: [{ id: 'abcdef0123456789', name: 'Claude laptop', access: 'read', createdAt: '2026-10-01T10:00:00Z', lastUsedAt: null, expiresAt: '2026-11-01T10:00:00Z' }],
    }));
    renderPage();
    expect(await screen.findByText('ChatGPT')).toBeInTheDocument();
    expect(screen.getByText(/Reads and makes changes/)).toBeInTheDocument();
    expect(screen.getByText('Claude laptop')).toBeInTheDocument();
    expect(screen.getByText(/Read only · expires/)).toBeInTheDocument();
    expect(screen.getByText(/never used/)).toBeInTheDocument();
  });

  it('shows a new token once, with a warning', async () => {
    api.fetchConnections.mockResolvedValue(overview());
    api.createToken.mockResolvedValue({ token: 'drc_secret-value', id: 'abcdef0123456789', name: 'Desk', access: 'write', expiresAt: null });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Desk' } });
    fireEvent.change(screen.getByLabelText('Access'), { target: { value: 'write' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByDisplayValue('drc_secret-value')).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    expect(api.createToken).toHaveBeenCalledWith({ name: 'Desk', access: 'write', days: 90 });
    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }));
    await waitFor(() => expect(screen.queryByDisplayValue('drc_secret-value')).not.toBeInTheDocument());
  });

  it('asks before removing a token, then removes it', async () => {
    api.fetchConnections.mockResolvedValue(overview({
      tokens: [{ id: 'abcdef0123456789', name: 'Claude laptop', access: 'read', createdAt: null, lastUsedAt: null, expiresAt: null }],
    }));
    api.revokeToken.mockResolvedValue({ revoked: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(api.revokeToken).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove token' }));
    await waitFor(() => expect(api.revokeToken).toHaveBeenCalledWith('abcdef0123456789'));
  });

  it('will not offer another token once the limit is reached', async () => {
    const tokens = Array.from({ length: 10 }, (_, index) => ({ id: String(index).padStart(16, '0'), name: `T${index}`, access: 'read' as const, createdAt: null, lastUsedAt: null, expiresAt: null }));
    api.fetchConnections.mockResolvedValue(overview({ tokens }));
    renderPage();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'One more' } });
    expect(screen.getByRole('button', { name: 'Create token' })).toBeDisabled();
  });
});
