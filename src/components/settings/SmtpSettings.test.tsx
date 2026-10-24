import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmtpSettings } from './SmtpSettings';
import type { SmtpAdminView } from '../../lib/adminSmtp';

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), remove: vi.fn(), test: vi.fn() }));
vi.mock('../../lib/adminSmtp', () => ({
  fetchSmtpSettings: api.fetch, saveSmtpSettings: api.save, removeSmtpSettings: api.remove, sendSmtpTestEmail: api.test,
}));
vi.mock('../../contexts/useAuth', () => ({ useAuth: () => ({ user: { email: 'admin@example.test' } }) }));

const view = (overrides: Partial<SmtpAdminView> = {}): SmtpAdminView => ({
  source: 'none', enabled: false, passwordSet: false, passwordUnreadable: false, passwordStorageAvailable: true,
  settings: { host: '', port: 587, secure: false, requireTls: true, user: '', from: '' },
  ...overrides,
});

const renderSettings = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SmtpSettings />
  </QueryClientProvider>,
);

describe('SmtpSettings', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('warns when email is not set up, and saves what the administrator enters', async () => {
    api.fetch.mockResolvedValue(view());
    api.save.mockResolvedValue(view({ source: 'database', enabled: true, passwordSet: true, settings: { host: 'smtp.example.com', port: 587, secure: false, requireTls: true, user: 'mailer', from: 'no-reply@example.com' } }));
    renderSettings();
    expect(await screen.findByText(/Email is not set up/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('SMTP server'), { target: { value: ' smtp.example.com ' } });
    fireEvent.change(screen.getByLabelText('Login name'), { target: { value: 'mailer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText('Send from'), { target: { value: 'no-reply@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0]).toEqual({ host: 'smtp.example.com', port: 587, secure: false, requireTls: true, user: 'mailer', from: 'no-reply@example.com', password: 'secret-pass' });
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
    expect(screen.getByText('Using the setup saved here.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('keeps the stored password unless asked to change or remove it', async () => {
    api.fetch.mockResolvedValue(view({ source: 'database', enabled: true, passwordSet: true, settings: { host: 'smtp.example.com', port: 587, secure: false, requireTls: true, user: 'mailer', from: 'no-reply@example.com' } }));
    api.save.mockResolvedValue(view({ source: 'database', enabled: true, passwordSet: true, settings: { host: 'smtp.example.com', port: 587, secure: false, requireTls: true, user: 'mailer', from: 'no-reply@example.com' } }));
    renderSettings();
    await screen.findByDisplayValue('smtp.example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0]).not.toHaveProperty('password');

    fireEvent.click(screen.getByLabelText('Remove the saved password'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][0].password).toBeNull();
  });

  it('sends a test email with the form values and shows the server failure reason', async () => {
    api.fetch.mockResolvedValue(view({ source: 'environment', enabled: true, settings: { host: 'env.example.com', port: 587, secure: false, requireTls: true, user: '', from: 'env@example.com' } }));
    api.test.mockRejectedValueOnce(new Error('Invalid login: 535 Authentication failed'));
    api.test.mockResolvedValueOnce({ ok: true, to: 'admin@example.test', response: '250 ok' });
    renderSettings();
    await screen.findByDisplayValue('env.example.com');

    fireEvent.click(screen.getByRole('button', { name: /send test email to admin@example.test/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('535 Authentication failed');
    expect(api.test.mock.calls[0][0]).toMatchObject({ host: 'env.example.com' });

    fireEvent.click(screen.getByRole('button', { name: /send test email/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Test email sent to admin@example.test');
  });

  it('explains when the server cannot store a password', async () => {
    api.fetch.mockResolvedValue(view({ passwordStorageAvailable: false }));
    renderSettings();
    expect(await screen.findByText(/cannot store a password/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Login name'), { target: { value: 'mailer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });
});
