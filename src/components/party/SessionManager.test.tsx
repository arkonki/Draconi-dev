import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from './SessionManager';
import { endCampaignSession, fetchCampaignTimeState } from '../../lib/api/campaignTime';
import { polishRecap } from '../../lib/api/ai';
import { saveSessionRecapNote } from '../../lib/api/partyNotes';

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

vi.mock('../../lib/api/ai', () => ({
  fetchAiSettings: vi.fn().mockResolvedValue({ hasKey: true }),
  polishRecap: vi.fn(),
}));
vi.mock('../../lib/api/partyNotes', () => ({ saveSessionRecapNote: vi.fn() }));
vi.mock('../../lib/api/sessionRecap', () => ({ draftSessionRecap: vi.fn() }));

const mockedFetchState = vi.mocked(fetchCampaignTimeState);
const mockedEndSession = vi.mocked(endCampaignSession);
const mockedPolish = vi.mocked(polishRecap);
const mockedSaveNote = vi.mocked(saveSessionRecapNote);

const stateWithSession = (activeSession: { id: string; title: string; status: 'active' } | null) => ({
  campaignRevision: 4,
  gameTime: { schemaVersion: 'game-time-v1' as const, elapsedSeconds: 900, rounds: 90, stretches: 1, shifts: 0 },
  activeSession,
  tracker: { currentDay: 1, currentShift: 1 },
  reminders: [],
  pendingNotifications: [],
});

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

  describe('the session summary', () => {
    const session = { id: 'session-1', title: 'The Misty Vale', status: 'active' as const };

    async function openSessionPanel() {
      renderManager();
      await screen.findByText('Current game time');
      fireEvent.click(screen.getByRole('button', { name: 'End session' }));
      return screen.findByPlaceholderText('Session summary (required)');
    }

    beforeEach(() => {
      mockedEndSession.mockReset();
      mockedPolish.mockReset();
      mockedSaveNote.mockReset();
      mockedFetchState.mockResolvedValue(stateWithSession(session));
    });

    it('saves the summary as a party note while the session is still running', async () => {
      mockedSaveNote.mockResolvedValue({ id: 'note-1', title: 'The Misty Vale - recap (1 Mar 2026)' });
      const summary = await openSessionPanel();
      fireEvent.change(summary, { target: { value: 'The party crossed the vale.' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save as party note' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Saved to the party notes as “The Misty Vale - recap (1 Mar 2026)”.');
      expect(mockedSaveNote).toHaveBeenCalledWith('party-1', 'The Misty Vale', 'The party crossed the vale.');
    });

    it('keeps what was written when polishing fails, and says the session can still be ended', async () => {
      mockedPolish.mockRejectedValue(new Error('The AI service did not answer in time.'));
      const summary = await openSessionPanel();
      fireEvent.change(summary, { target: { value: 'The party crossed the vale.' } });

      fireEvent.click(await screen.findByRole('button', { name: 'Polish with AI' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('The AI service did not answer in time. Your text is unchanged, and the session can be ended without polishing.');
      expect(summary).toHaveValue('The party crossed the vale.');
    });

    it('still offers the recap as a party note after the session has ended', async () => {
      mockedEndSession.mockImplementation(async () => {
        mockedFetchState.mockResolvedValue(stateWithSession(null));
        return {};
      });
      mockedSaveNote.mockResolvedValue({ id: 'note-1', title: 'The Misty Vale - recap' });
      const summary = await openSessionPanel();
      fireEvent.change(summary, { target: { value: '  The party crossed the vale.  ' } });

      fireEvent.click(screen.getAllByRole('button', { name: 'End session' }).at(-1)!);

      expect(await screen.findByText('“The Misty Vale” has ended. Its summary is saved with the session.')).toBeInTheDocument();
      expect(mockedEndSession).toHaveBeenCalledWith('party-1', 'session-1', 4, { summary: 'The party crossed the vale.', unresolvedThreads: [] });
      fireEvent.click(screen.getByRole('button', { name: 'Save as party note' }));
      await waitFor(() => expect(mockedSaveNote).toHaveBeenCalledWith('party-1', 'The Misty Vale', 'The party crossed the vale.'));
      expect(await screen.findByRole('button', { name: 'Saved as party note' })).toBeDisabled();
    });

    it('keeps the summary in the form when ending the session fails', async () => {
      mockedEndSession.mockRejectedValue(new Error('Could not end the session.'));
      const summary = await openSessionPanel();
      fireEvent.change(summary, { target: { value: 'The party crossed the vale.' } });

      fireEvent.click(screen.getAllByRole('button', { name: 'End session' }).at(-1)!);

      expect(await screen.findByText('Could not end the session.')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Session summary (required)')).toHaveValue('The party crossed the vale.');
    });
  });
});
