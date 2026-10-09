import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManagement } from './UserManagement';
import {
  deleteAdminUser,
  fetchAdminUsers,
  fetchUserImpact,
  type AdminUser,
  type UserImpact,
} from '../../lib/api/adminUsers';

vi.mock('../../contexts/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('../../lib/api/adminUsers', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/adminUsers')>('../../lib/api/adminUsers');
  return {
    ...actual,
    fetchAdminUsers: vi.fn(),
    fetchUserImpact: vi.fn(),
    deleteAdminUser: vi.fn(),
    updateAdminUser: vi.fn(),
    resetUserPassword: vi.fn(),
    revokeUserSessions: vi.fn(),
  };
});

const base: Omit<AdminUser, 'id' | 'email' | 'username'> = {
  first_name: null, last_name: null, role: 'player', is_active: true, created_at: '2026-01-01T00:00:00Z',
  last_login_at: '2026-10-01T00:00:00Z', last_seen_at: null, has_password: true,
  character_count: 0, owned_campaigns: 0, campaign_count: 0, active_sessions: 1,
};
const users: AdminUser[] = [
  { ...base, id: 'admin-1', email: 'me@example.com', username: 'me', role: 'admin' },
  { ...base, id: 'u2', email: 'gm@example.com', username: 'gamemaster', role: 'dm', owned_campaigns: 1, campaign_count: 1 },
  { ...base, id: 'u3', email: 'newbie@example.com', username: 'newbie', last_login_at: null, active_sessions: 0 },
  { ...base, id: 'u4', email: 'gone@example.com', username: 'gone', is_active: false, active_sessions: 0 },
];
const gmImpact: UserImpact = {
  user: { id: 'u2', email: 'gm@example.com', username: 'gamemaster', role: 'dm', is_active: true },
  characters: 2, notes: 3, messages: 40, campaign_memberships: 1,
  owned_campaigns: [{ id: 'p1', name: 'Doom Run', other_members: 3 }],
  restricted_content: {}, keepable_content: {}, needs_transfer: true,
};

describe('administrator user management', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminUsers).mockResolvedValue(users);
    vi.mocked(fetchUserImpact).mockResolvedValue(gmImpact);
    vi.mocked(deleteAdminUser).mockResolvedValue({ deleted: { id: 'u2', email: 'gm@example.com', username: 'gamemaster' }, transferred: { campaigns: 1 } });
  });

  it('summarises accounts and flags the ones that need attention', async () => {
    render(<UserManagement />);
    await screen.findAllByText('gamemaster');
    expect(screen.getByText('Total users').previousSibling).toHaveTextContent('4');
    expect(screen.getByText('Active', { selector: 'div' }).previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Need attention').previousSibling).toHaveTextContent('1');
  });

  it('filters by search and status', async () => {
    render(<UserManagement />);
    await screen.findAllByText('gamemaster');
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'newbie' } });
    expect(screen.queryAllByText('gamemaster')).toHaveLength(0);
    expect(screen.getAllByText('newbie').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'inactive' } });
    expect(screen.queryAllByText('gamemaster')).toHaveLength(0);
    expect(screen.getAllByText('gone').length).toBeGreaterThan(0);
  });

  it('never lets administrators delete or deactivate their own account', async () => {
    render(<UserManagement />);
    await screen.findAllByText('gamemaster');
    for (const button of screen.getAllByRole('button', { name: 'Delete: me' })) expect(button).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: 'Deactivate: me' })) expect(button).toBeDisabled();
  });

  it('requires a successor and a typed confirmation before deleting a campaign owner', async () => {
    render(<UserManagement />);
    await screen.findAllByText('gamemaster');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete: gamemaster' })[0]);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Owns 1 campaign/);
    const confirmButton = within(dialog).getByRole('button', { name: /Delete permanently/ });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'gm@example.com' } });
    expect(confirmButton).toBeDisabled(); // still no successor

    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'u3' } });
    await waitFor(() => expect(confirmButton).toBeEnabled());

    fireEvent.click(confirmButton);
    await waitFor(() => expect(deleteAdminUser).toHaveBeenCalledWith('u2', { confirmEmail: 'gm@example.com', transferTo: 'u3' }));
    await screen.findByText(/Deleted gamemaster/);
  });

  it('offers only active people as successors and never the person being deleted', async () => {
    render(<UserManagement />);
    await screen.findAllByText('gamemaster');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete: gamemaster' })[0]);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/Owns 1 campaign/);
    const options = within(within(dialog).getByRole('combobox')).getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.join('|')).toContain('newbie');
    expect(options.join('|')).not.toContain('gamemaster —');
    expect(options.join('|')).not.toContain('gone —');
  });
});
