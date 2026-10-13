import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, KeyRound, Plug, Trash2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useConfirm } from '../../hooks/useConfirm';
import {
  createToken,
  disconnectApp,
  fetchConnections,
  revokeToken,
  type ConnectedApp,
  type CreatedToken,
  type PersonalToken,
} from '../../lib/api/connections';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The text is selectable, so it can still be copied by hand.
    }
  };
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <div className="flex items-stretch gap-2">
        <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800" />
        <Button type="button" variant="outline" icon={copied ? Check : Copy} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}

const accessLabel = (access: 'read' | 'write') => (access === 'write' ? 'Read and make changes' : 'Read only');

/** Connect an AI assistant (an MCP client) to your account, and see or cut off what is already connected. */
export function ConnectionSettings() {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const overview = useQuery({ queryKey: ['account-connections'], queryFn: fetchConnections, staleTime: 15_000 });
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'read' | 'write'>('read');
  const [days, setDays] = useState(90);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['account-connections'] });

  const createMutation = useMutation({
    mutationFn: () => createToken({ name, access, days }),
    onSuccess: async (result) => { setCreated(result); setName(''); setError(null); await refresh(); },
    onError: (failure: Error) => setError(failure.message),
  });
  const revokeMutation = useMutation({
    mutationFn: (token: PersonalToken) => revokeToken(token.id),
    onSuccess: async () => { setError(null); await refresh(); },
    onError: (failure: Error) => setError(failure.message),
  });
  const disconnectMutation = useMutation({
    mutationFn: (app: ConnectedApp) => disconnectApp(app.clientId),
    onSuccess: async () => { setError(null); await refresh(); },
    onError: (failure: Error) => setError(failure.message),
  });

  const handleRevoke = async (token: PersonalToken) => {
    const confirmed = await confirm({
      title: `Remove “${token.name}”?`,
      description: 'Anything using this token stops working straight away. This cannot be undone, but you can make a new token.',
      confirmText: 'Remove token',
    });
    if (confirmed) revokeMutation.mutate(token);
  };
  const handleDisconnect = async (app: ConnectedApp) => {
    const confirmed = await confirm({
      title: `Disconnect ${app.name}?`,
      description: 'It loses access to your account at once. You can connect it again later by signing in from the app.',
      confirmText: 'Disconnect',
    });
    if (confirmed) disconnectMutation.mutate(app);
  };

  if (overview.isLoading) return <div className="flex justify-center py-12"><LoadingSpinner text="Loading connections…" /></div>;
  if (overview.error || !overview.data) {
    return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{(overview.error as Error | null)?.message ?? 'Could not load your connections.'}</div>;
  }
  const data = overview.data;

  return (
    <div className="space-y-8">
      <section aria-labelledby="connect-heading" className="space-y-4">
        <div>
          <h3 id="connect-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Plug className="h-5 w-5 text-indigo-600" /> Connect an AI assistant</h3>
          <p className="mt-1 text-sm text-gray-600">
            Assistants such as ChatGPT or Claude can read your campaigns and, if you allow it, help run them. They act as you, so they only see and change what your own role in each campaign allows.
          </p>
        </div>
        <CopyField label="Server address" value={data.mcpUrl} />
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
          <li>In your assistant, add a custom connector or MCP server and paste the address above.</li>
          <li>It opens a Draconi page. Sign in with your Draconi email and password and choose <strong>Sign in and connect</strong>.</li>
          <li>The assistant appears under <strong>Connected apps</strong> below, where you can disconnect it at any time.</li>
        </ol>
        <p className="text-xs text-gray-500">If your assistant cannot do that sign-in, make an access token below and paste it where it asks for a bearer or API token.</p>
      </section>

      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {error}</p>}

      <section aria-labelledby="apps-heading" className="space-y-3">
        <h3 id="apps-heading" className="text-lg font-semibold text-gray-900">Connected apps</h3>
        {data.apps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">Nothing is connected yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.apps.map((app) => (
              <li key={app.clientId} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{app.name}</p>
                  <p className="text-xs text-gray-500">
                    {app.scopes.includes('draconi:write') ? 'Reads and makes changes' : 'Read only'} · connected {when(app.connectedAt) ?? 'recently'} · {app.lastUsedAt ? `last used ${when(app.lastUsedAt)}` : 'not used yet'}
                  </p>
                </div>
                <Button type="button" variant="outline" icon={Trash2} loading={disconnectMutation.isPending && disconnectMutation.variables?.clientId === app.clientId} onClick={() => void handleDisconnect(app)}>Disconnect</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tokens-heading" className="space-y-4">
        <div>
          <h3 id="tokens-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900"><KeyRound className="h-5 w-5 text-indigo-600" /> Access tokens</h3>
          <p className="mt-1 text-sm text-gray-600">A token is a password for one assistant. It expires on its own, and you can remove it whenever you like. You can have up to {data.maxTokens}.</p>
        </div>

        {created && (
          <div role="status" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> Copy “{created.name}” now. It is shown only once and cannot be looked up later.</p>
            <CopyField label="Your token" value={created.token} />
            <Button type="button" variant="secondary" onClick={() => setCreated(null)}>I have saved it</Button>
          </div>
        )}

        <form
          className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-[1fr,auto,auto,auto] sm:items-end"
          onSubmit={(event) => { event.preventDefault(); if (name.trim()) createMutation.mutate(); }}
        >
          <div>
            <label htmlFor="token-name" className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input id="token-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="e.g. Claude on my laptop" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="token-access" className="mb-1 block text-sm font-medium text-gray-700">Access</label>
            <select id="token-access" value={access} onChange={(event) => setAccess(event.target.value as 'read' | 'write')} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="read">Read only</option>
              <option value="write">Read and make changes</option>
            </select>
          </div>
          <div>
            <label htmlFor="token-days" className="mb-1 block text-sm font-medium text-gray-700">Expires after</label>
            <select id="token-days" value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              {data.tokenLifetimes.map((option) => <option key={option} value={option}>{option === 365 ? '1 year' : `${option} days`}</option>)}
            </select>
          </div>
          <Button type="submit" variant="primary" icon={KeyRound} loading={createMutation.isPending} disabled={!name.trim() || data.tokens.length >= data.maxTokens}>Create token</Button>
        </form>

        {data.tokens.length === 0 ? (
          <p className="text-sm text-gray-500">You have no active tokens.</p>
        ) : (
          <ul className="space-y-2">
            {data.tokens.map((token) => (
              <li key={token.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{token.name}</p>
                  <p className="text-xs text-gray-500">
                    {accessLabel(token.access)} · expires {when(token.expiresAt)} · {token.lastUsedAt ? `last used ${when(token.lastUsedAt)}` : 'never used'}
                  </p>
                </div>
                <Button type="button" variant="outline" icon={Trash2} loading={revokeMutation.isPending && revokeMutation.variables?.id === token.id} onClick={() => void handleRevoke(token)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {confirmDialog}
    </div>
  );
}
