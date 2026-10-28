import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAlertsSettings } from './AdminAlertsSettings';
import type { AlertsAdminView } from '../../lib/adminAlerts';

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), test: vi.fn() }));
vi.mock('../../lib/adminAlerts', () => ({ fetchAlertSettings: api.fetch, saveAlertSettings: api.save, sendTestAlert: api.test }));

const view = (overrides: Partial<AlertsAdminView> = {}): AlertsAdminView => ({
  enabled: true, mailEnabled: true, extraRecipients: [], recipients: ['admin@example.test'], digestMinutes: 10,
  events: [
    { id: 'deadlock', label: 'Database deadlock', description: 'Two requests blocked each other.', mode: 'immediate', enabled: true },
    { id: 'user_registered', label: 'New account', description: 'Someone registered.', mode: 'digest', enabled: true },
  ],
  ...overrides,
});

const renderSettings = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminAlertsSettings /></QueryClientProvider>,
);

describe('AdminAlertsSettings', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('lists the events with how they are sent and saves the choices and extra recipients', async () => {
    api.fetch.mockResolvedValue(view());
    api.save.mockResolvedValue(view({ extraRecipients: ['ops@example.test'] }));
    renderSettings();
    expect(await screen.findByText('Database deadlock')).toBeInTheDocument();
    expect(screen.getByText('at once')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText(/admin@example.test/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /New account/ }));
    fireEvent.change(screen.getByLabelText('Extra recipients'), { target: { value: 'ops@example.test, second@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }));

    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0]).toEqual({
      enabled: true,
      events: { deadlock: true, user_registered: false },
      extraRecipients: ['ops@example.test', 'second@example.test'],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Alert settings saved');
  });

  it('warns when email is not set up and disables the test button', async () => {
    api.fetch.mockResolvedValue(view({ mailEnabled: false }));
    renderSettings();
    expect(await screen.findByText(/Email is not set up, so no alerts can be sent/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send test alert/ })).toBeDisabled();
  });

  it('sends a test alert and shows who got it, or the failure', async () => {
    api.fetch.mockResolvedValue(view());
    api.test.mockRejectedValueOnce(new Error('The email server refused or could not be reached: 535'));
    api.test.mockResolvedValueOnce({ ok: true, recipients: ['admin@example.test'] });
    renderSettings();
    await screen.findByText('Database deadlock');
    fireEvent.click(screen.getByRole('button', { name: /Send test alert/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('535');
    fireEvent.click(screen.getByRole('button', { name: /Send test alert/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Test alert sent to admin@example.test');
  });

  it('turns the event list off when alerts are switched off', async () => {
    api.fetch.mockResolvedValue(view());
    renderSettings();
    await screen.findByText('Database deadlock');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send administrator alerts' }));
    expect(screen.getByRole('checkbox', { name: /Database deadlock/ })).toBeDisabled();
  });
});
