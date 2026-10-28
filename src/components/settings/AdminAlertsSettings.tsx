import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Send } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { fetchAlertSettings, saveAlertSettings, sendTestAlert, type AlertsAdminView } from '../../lib/adminAlerts';

interface FormState {
  enabled: boolean;
  events: Record<string, boolean>;
  extraRecipients: string;
}

const toForm = (view: AlertsAdminView): FormState => ({
  enabled: view.enabled,
  events: Object.fromEntries(view.events.map((event) => [event.id, event.enabled])),
  extraRecipients: view.extraRecipients.join('\n'),
});

/** Which events email the administrators, and to whom. Needs working SMTP above. */
export function AdminAlertsSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['admin-alerts'], queryFn: fetchAlertSettings });
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setForm(toForm(settings.data));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (state: FormState) => saveAlertSettings({
      enabled: state.enabled,
      events: state.events,
      extraRecipients: state.extraRecipients.split(/[\s,;]+/).filter(Boolean),
    }),
    onSuccess: (view) => {
      setError(null);
      setNotice('Alert settings saved.');
      queryClient.setQueryData(['admin-alerts'], view);
      setForm(toForm(view));
    },
    onError: (failure: Error) => { setNotice(null); setError(failure.message); },
  });
  const test = useMutation({
    mutationFn: sendTestAlert,
    onSuccess: (result) => { setError(null); setNotice(`Test alert sent to ${result.recipients.join(', ')}.`); },
    onError: (failure: Error) => { setNotice(null); setError(failure.message); },
  });

  if (settings.isLoading || !form) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  if (settings.isError) return <p role="alert" className="text-sm text-red-700">{(settings.error as Error).message}</p>;
  const view = settings.data!;
  const busy = save.isPending || test.isPending;

  return (
    <section className="mt-12 space-y-6 border-t border-gray-200 pt-8" aria-labelledby="admin-alerts-heading">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-700"><Bell size={20} /></div>
        <div>
          <h2 id="admin-alerts-heading" className="text-lg font-bold text-gray-900">Administrator alerts</h2>
          <p className="mt-1 text-sm text-gray-600">
            Emails the administrators when something needs attention. Urgent events are sent at once (a repeating problem gives one email, then a count);
            routine ones are collected into a summary every {view.digestMinutes} minutes.
          </p>
        </div>
      </header>

      {!view.mailEnabled && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Email is not set up, so no alerts can be sent. Configure SMTP above first.
        </p>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <form
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-6"
        onSubmit={(event) => { event.preventDefault(); setNotice(null); save.mutate(form); }}
      >
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} disabled={busy} />
          Send administrator alerts
        </label>

        <fieldset className="space-y-3" disabled={busy || !form.enabled}>
          <legend className="sr-only">Events</legend>
          {view.events.map((event) => (
            <label key={event.id} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox" className="mt-1" checked={form.events[event.id] ?? false}
                onChange={(changed) => setForm({ ...form, events: { ...form.events, [event.id]: changed.target.checked } })}
              />
              <span>
                <span className="font-medium text-gray-900">{event.label}</span>
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  {event.mode === 'immediate' ? 'at once' : 'summary'}
                </span>
                <span className="block text-gray-600">{event.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="alert-recipients" className="block text-sm font-medium text-gray-700">Extra recipients</label>
          <textarea
            id="alert-recipients" rows={3} value={form.extraRecipients} disabled={busy || !form.enabled}
            onChange={(event) => setForm({ ...form, extraRecipients: event.target.value })}
            placeholder="One address per line (optional)"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            Sent to all active administrators{view.recipients.length > 0 ? ` (${view.recipients.join(', ')})` : ''} and to these addresses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={busy}>Save alert settings</Button>
          <Button type="button" variant="outline" icon={Send} loading={test.isPending} disabled={busy || !view.mailEnabled} onClick={() => { setNotice(null); test.mutate(); }}>
            Send test alert
          </Button>
        </div>
      </form>
    </section>
  );
}
