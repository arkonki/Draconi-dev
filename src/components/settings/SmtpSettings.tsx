import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Mail, Send, Trash2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../contexts/useAuth';
import {
  fetchSmtpSettings, removeSmtpSettings, saveSmtpSettings, sendSmtpTestEmail,
  type SmtpAdminView, type SmtpDraft,
} from '../../lib/adminSmtp';

const inputClass = 'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100';

const SOURCE_TEXT: Record<SmtpAdminView['source'], string> = {
  database: 'Using the setup saved here.',
  environment: "Using the server's environment file (SMTP_* variables). Saving here overrides it.",
  none: 'Email is not set up. People cannot confirm accounts or reset passwords by email.',
};

interface FormState {
  host: string; port: string; secure: boolean; requireTls: boolean; user: string; from: string;
  /** What the administrator typed; empty means "leave the stored password alone". */
  password: string;
  clearPassword: boolean;
}

const fromView = (view: SmtpAdminView): FormState => ({
  host: view.settings.host, port: String(view.settings.port || 587), secure: view.settings.secure,
  requireTls: view.settings.requireTls, user: view.settings.user, from: view.settings.from,
  password: '', clearPassword: false,
});

const toDraft = (form: FormState): SmtpDraft => ({
  host: form.host.trim(), port: Number(form.port), secure: form.secure, requireTls: form.requireTls,
  user: form.user.trim(), from: form.from.trim(),
  ...(form.clearPassword ? { password: null } : form.password ? { password: form.password } : {}),
});

/** Administrators manage the outgoing email (SMTP) used for account confirmation and password reset. */
export function SmtpSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const settings = useQuery({ queryKey: ['smtp-settings'], queryFn: fetchSmtpSettings });
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setForm(fromView(settings.data));
  }, [settings.data]);

  const accepted = (view: SmtpAdminView, message: string) => {
    setError(null);
    setNotice(message);
    queryClient.setQueryData(['smtp-settings'], view);
    setForm(fromView(view));
  };
  const rejected = (failure: Error) => { setNotice(null); setError(failure.message); };

  const save = useMutation({
    mutationFn: (draft: SmtpDraft) => saveSmtpSettings(draft),
    onSuccess: (view) => accepted(view, 'Email settings saved. They apply right away.'),
    onError: rejected,
  });
  const remove = useMutation({
    mutationFn: removeSmtpSettings,
    onSuccess: (view) => accepted(view, "Removed the saved setup. The server's environment settings apply again."),
    onError: rejected,
  });
  const test = useMutation({
    mutationFn: (draft?: SmtpDraft) => sendSmtpTestEmail(draft),
    onSuccess: (result) => { setError(null); setNotice(`Test email sent to ${result.to}. Check that inbox (and spam).`); },
    onError: rejected,
  });

  if (settings.isLoading || !form) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  if (settings.isError) return <p className="text-sm text-red-700" role="alert">{(settings.error as Error).message}</p>;
  const view = settings.data!;
  const busy = save.isPending || remove.isPending || test.isPending;
  const update = (changes: Partial<FormState>) => setForm((current) => (current ? { ...current, ...changes } : current));
  const canSavePassword = view.passwordStorageAvailable || (!form.password && !form.clearPassword);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    save.mutate(toDraft(form));
  };

  const onPortChange = (port: string) => update({ port, secure: Number(port) === 465 });

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700"><Mail size={20} /></div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Email (SMTP)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Used to confirm new accounts and to send password-reset links. Links point at the server&apos;s PUBLIC_BASE_URL.
          </p>
        </div>
      </header>

      <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${view.enabled ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        {view.enabled ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <span>{SOURCE_TEXT[view.source]}</span>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {view.passwordUnreadable && (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          The saved password cannot be read (the server&apos;s encryption secret changed). Enter the password again and save.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label htmlFor="smtp-host" className="block text-sm font-medium text-gray-700">SMTP server</label>
            <input id="smtp-host" className={inputClass} value={form.host} onChange={(event) => update({ host: event.target.value })} placeholder="smtp.example.com" autoComplete="off" required disabled={busy} />
          </div>
          <div>
            <label htmlFor="smtp-port" className="block text-sm font-medium text-gray-700">Port</label>
            <input id="smtp-port" className={inputClass} type="number" min={1} max={65535} value={form.port} onChange={(event) => onPortChange(event.target.value)} required disabled={busy} />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Connection security</legend>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.secure} onChange={(event) => update({ secure: event.target.checked })} disabled={busy} />
            Encrypt from the start (TLS, usually port 465)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.requireTls} onChange={(event) => update({ requireTls: event.target.checked })} disabled={busy || form.secure} />
            Require STARTTLS (usually port 587). Turn off only for a local mail catcher.
          </label>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="smtp-user" className="block text-sm font-medium text-gray-700">Login name</label>
            <input id="smtp-user" className={inputClass} value={form.user} onChange={(event) => update({ user: event.target.value })} autoComplete="off" placeholder="Leave empty if the server needs no login" disabled={busy} />
          </div>
          <div>
            <label htmlFor="smtp-password" className="block text-sm font-medium text-gray-700">Password</label>
            <input
              id="smtp-password" className={inputClass} type="password" autoComplete="new-password" value={form.password}
              onChange={(event) => update({ password: event.target.value, clearPassword: false })}
              placeholder={view.passwordSet && !form.clearPassword ? '•••••••• (saved; type to replace)' : ''}
              disabled={busy || !form.user.trim() || form.clearPassword}
            />
            {view.passwordSet && (
              <label className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={form.clearPassword} onChange={(event) => update({ clearPassword: event.target.checked, password: '' })} disabled={busy} />
                Remove the saved password
              </label>
            )}
            {!view.passwordStorageAvailable && (
              <p className="mt-1 text-xs text-amber-800">
                The server has no encryption secret, so it cannot store a password. Set AI_KEY_ENCRYPTION_SECRET (32+ characters) in its environment, or keep the password in SMTP_PASSWORD.
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="smtp-from" className="block text-sm font-medium text-gray-700">Send from</label>
          <input id="smtp-from" className={inputClass} value={form.from} onChange={(event) => update({ from: event.target.value })} placeholder="Dragonbane <no-reply@example.com>" required disabled={busy} />
          <p className="mt-1 text-xs text-gray-500">Many providers only accept addresses on a domain you have verified with them.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={busy || !canSavePassword}>Save settings</Button>
          <Button type="button" variant="outline" icon={Send} loading={test.isPending} disabled={busy || !canSavePassword} onClick={() => { setNotice(null); test.mutate(toDraft(form)); }}>
            Send test email to {user?.email ?? 'me'}
          </Button>
          {view.source === 'database' && (
            <Button
              type="button" variant="outline" icon={Trash2} disabled={busy} className="ml-auto text-red-700"
              onClick={async () => {
                if (await confirm({ title: 'Remove saved email setup?', description: "The server's environment settings (if any) apply again. People cannot reset passwords by email if there are none.", confirmText: 'Remove' })) remove.mutate();
              }}
            >
              Remove saved setup
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500">The test uses the values in this form without saving them. The message goes to your own address.</p>
      </form>
      {confirmDialog}
    </div>
  );
}
