import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from './SessionManager';
import { fetchCampaignTimeState } from '../../lib/api/campaignTime';

vi.mock('../../hooks/useRealtimeChannel', () => ({ useRealtimeChannel: vi.fn() }));
vi.mock('../../lib/api/randomTables', () => ({ fetchRandomTables: vi.fn().mockResolvedValue([]) }));
vi.mock('../../lib/api/campaignTime', () => ({
  advanceCampaignTime: vi.fn(),
  createCampaignTimeReminder: vi.fn(),
  deleteCampaignTimeReminder: vi.fn(),
  endCampaignSession: vi.fn(),
  fetchCampaignTimeState: vi.fn(),
  resolveCampaignTimeNotification: vi.fn(),
  setCampaignTimeReminderActive: vi.fn(),
  startCampaignSession: vi.fn(),
}));

const mockedFetchState = vi.mocked(fetchCampaignTimeState);

function renderManager() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionManager isOpen onClose={vi.fn()} partyId="party-1" partyName="The Company" />
    </QueryClientProvider>,
  );
}

describe('Game Session & Time modal', () => {
  beforeEach(() => {
    mockedFetchState.mockResolvedValue({
      campaignRevision: 4,
      gameTime: {
        schemaVersion: 'game-time-v1',
        elapsedSeconds: 900,
        rounds: 90,
        stretches: 1,
        shifts: 0,
      },
      activeSession: null,
      tracker: { currentDay: 1, currentShift: 1 },
      reminders: [],
      pendingNotifications: [],
    });
  });

  it('keeps frequent time controls first and separates longer forms into panels', async () => {
    renderManager();

    expect(await screen.findByText('Current game time')).toBeInTheDocument();
    expect(screen.getByText('Rest tracking')).toBeInTheDocument();
    expect(screen.getByText('Light tracking')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Session title')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(screen.getByPlaceholderText('Session title')).toBeInTheDocument();
    expect(screen.queryByText('Rest tracking')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roll reminders' }));
    expect(screen.getByPlaceholderText('Roll name')).toBeInTheDocument();
    expect(screen.getByText('No scheduled rolls.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Session title')).not.toBeInTheDocument();
  });
});
