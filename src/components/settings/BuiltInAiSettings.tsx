import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useConfirm } from '../../hooks/useConfirm';
import { LEGACY_KEY_STORAGE, fetchAiSettings, removeAiKey, saveAiSettings } from '../../lib/api/ai';

const readLegacyKey = () => {
  try { return window.localStorage.getItem(LEGACY_KEY_STORAGE) || ''; } catch { return ''; }
};
const clearLegacyKey = () => {
  try { window.localStorage.removeItem(LEGACY_KEY_STORAGE); } catch { /* nothing to clear */ }
};

const number = (value: number) => value.toLocaleString();

function UsageBar({ label, used, cap, format }: { label: string; used: number; cap: number; format: (value: number) => string }) {
  const fraction = cap > 0 ? Math.min(1, used / cap) : 1;
  const color = fraction >= 1 ? 'bg-red-500' : fraction >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-600"><span>{label}</span><span>{format(used)} of {format(cap)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200" role="meter" aria-label={`${label} used this month`} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(used, cap)}>
        <div className={`h-full ${color}`} style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}

/** Your own OpenRouter key and model for every built-in AI feature: the Story Helper, the loot helper, recaps and the Solo narrator. */
export function BuiltInAiSettings() {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const settings = useQuery({ queryKey: ['ai-settings'], queryFn: fetchAiSettings, staleTime: 15_000 });
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [legacyKey, setLegacyKey] = useState(readLegacyKey);
  const [costCap, setCostCap] = useState<string | null>(null);
  const [tokenCap, setTokenCap] = useState<string | null>(null);

  const done = (message: string) => async () => {
    setError(null);
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
  };
  const fail = (failure: Error) => { setNotice(null); setError(failure.message); };

  const saveKey = useMutation({
    mutationFn: (value: string) => saveAiSettings({ apiKey: value }),
    onSuccess: done('Key saved. It is stored encrypted on the server and is not shown again.'),
    onError: fail,
  });
  const importKey = useMutation({
    mutationFn: (value: string) => saveAiSettings({ apiKey: value }),
    onSuccess: async () => { clearLegacyKey(); setLegacyKey(''); await done('Moved the key from this browser to the server.')(); },
    onError: fail,
  });
  const saveModel = useMutation({
    mutationFn: (value: string) => saveAiSettings({ model: value }),
    onSuccess: async () => { setModel(null); await done('Model saved.')(); },
    onError: fail,
  });
  const saveLimits = useMutation({
    mutationFn: (input: { monthlyCostCapUsd: number | null; monthlyTokenCap: number | null }) => saveAiSettings(input),
    onSuccess: async () => { setCostCap(null); setTokenCap(null); await done('Limits saved.')(); },
    onError: fail,
  });
  const removeKey = useMutation({ mutationFn: removeAiKey, onSuccess: done('Key removed.'), onError: fail });

  if (settings.isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="md" /></div>;
  if (settings.error || !settings.data) return <p role="alert" className="mb-8 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Could not load the AI settings.</p>;
  const data = settings.data;
  const shownModel = model ?? data.model;
  const usage = data.usageThisMonth;

  const handleRemove = async () => {
    const confirmed = await confirm({ title: 'Remove your API key?', description: 'The Story Helper, the loot helper, recap polishing and the Solo narrator stop working until you add a key again.', confirmText: 'Remove key' });
    if (confirmed) removeKey.mutate();
  };

  return (
    <section aria-labelledby="builtin-ai-heading" className="mb-10 space-y-4 border-b border-gray-200 pb-10">
      <div>
        <h3 id="builtin-ai-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Bot className="h-5 w-5 text-indigo-600" /> Built-in AI</h3>
        <p className="mt-1 text-sm text-gray-600">
          One key for every AI feature: the Story Helper, the loot helper, recap polishing and the Solo narrator. You pay OpenRouter directly for what you use.
          Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline hover:text-indigo-600">openrouter.ai/keys</a>.
          The key is stored encrypted on the server and only used for your own requests.
        </p>
      </div>

      {!data.storageAvailable && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          This server cannot store API keys yet. The administrator needs to set <code className="mx-1 rounded bg-amber-100 px-1">AI_KEY_ENCRYPTION_SECRET</code> in the server settings.
        </p>
      )}
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      {legacyKey && data.storageAvailable && !data.hasKey && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
          <span>An API key from the older Story Helper is saved in this browser. Move it to the server so it works on every device.</span>
          <Button type="button" size="sm" loading={importKey.isPending} onClick={() => importKey.mutate(legacyKey)}>Move it</Button>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor="ai-key" className="text-xs font-semibold uppercase tracking-wide text-gray-500">OpenRouter API key</label>
          {data.hasKey && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">Saved {data.keyHint}</span>}
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (apiKey.trim()) saveKey.mutate(apiKey.trim(), { onSuccess: () => setApiKey('') }); }}>
          <div className="relative min-w-0 flex-1">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={data.hasKey ? 'Paste a new key to replace it' : 'sk-or-…'} disabled={!data.storageAvailable}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100" />
          </div>
          <Button type="submit" loading={saveKey.isPending} disabled={!apiKey.trim() || !data.storageAvailable}>{data.hasKey ? 'Replace key' : 'Save key'}</Button>
          {data.hasKey && <Button type="button" variant="outline" icon={Trash2} loading={removeKey.isPending} onClick={() => void handleRemove()}>Remove</Button>}
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <label htmlFor="ai-model" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Model</label>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); saveModel.mutate(shownModel.trim()); }}>
          <input id="ai-model" list="ai-model-suggestions" value={shownModel} onChange={(event) => setModel(event.target.value)} spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-indigo-500" />
          <datalist id="ai-model-suggestions">{data.suggestedModels.map((id) => <option key={id} value={id} />)}</datalist>
          <Button type="submit" variant="outline" loading={saveModel.isPending} disabled={model === null || model.trim() === data.model}>Save model</Button>
          {shownModel !== data.defaultModel && <Button type="button" variant="ghost" onClick={() => setModel(data.defaultModel)}>Use the default</Button>}
        </form>
        <p className="mt-2 text-xs text-gray-500">Any model id from <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="underline hover:text-indigo-600">openrouter.ai/models</a> works. A small, fast model is plenty for narration and keeps the cost low.</p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Monthly limits <span className="font-normal normal-case text-gray-400">(optional, only for your own key)</span></h4>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const cost = (costCap ?? (data.limits.monthlyCostCapUsd ?? '')).toString().trim();
            const tokens = (tokenCap ?? (data.limits.monthlyTokenCap ?? '')).toString().trim();
            saveLimits.mutate({ monthlyCostCapUsd: cost === '' ? null : Number(cost), monthlyTokenCap: tokens === '' ? null : Number(tokens) });
          }}
        >
          <label className="block text-sm text-gray-700">Money (US dollars)
            <input type="number" min="0" step="0.5" inputMode="decimal" value={costCap ?? data.limits.monthlyCostCapUsd ?? ''} onChange={(event) => setCostCap(event.target.value)} placeholder="No limit" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm text-gray-700">Tokens
            <input type="number" min="0" step="1000" inputMode="numeric" value={tokenCap ?? data.limits.monthlyTokenCap ?? ''} onChange={(event) => setTokenCap(event.target.value)} placeholder="No limit" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <Button type="submit" variant="outline" loading={saveLimits.isPending} disabled={costCap === null && tokenCap === null}>Save limits</Button>
        </form>
        {(data.limits.monthlyCostCapUsd !== null || data.limits.monthlyTokenCap !== null) && (
          <div className="mt-3 space-y-2">
            {data.limits.monthlyTokenCap !== null && <UsageBar label="Tokens" used={usage.promptTokens + usage.completionTokens} cap={data.limits.monthlyTokenCap} format={number} />}
            {data.limits.monthlyCostCapUsd !== null && <UsageBar label="Money" used={usage.costUsd ?? 0} cap={data.limits.monthlyCostCapUsd} format={(value) => `$${value.toFixed(2)}`} />}
            {data.limits.reached && <p role="alert" className="text-sm font-semibold text-red-700">A limit has been reached. The AI features stay off until next month or until you raise it.</p>}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">The money limit counts only requests where OpenRouter reports a cost; the token limit counts everything. Your own OpenRouter account can also cap spending on the key itself, which is the stricter safeguard.</p>
      </div>

      <p className="text-sm text-gray-700">
        <strong>This month:</strong> {number(usage.calls)} request{usage.calls === 1 ? '' : 's'}, {number(usage.promptTokens)} tokens sent and {number(usage.completionTokens)} received
        {usage.cachedTokens > 0 && usage.promptTokens > 0 ? `, ${Math.round((usage.cachedTokens / usage.promptTokens) * 100)}% of what was sent came from the provider's cache at a discount` : ''}
        {usage.costUsd !== null ? `, about $${usage.costUsd.toFixed(4)} according to OpenRouter` : ''}.
      </p>
      {confirmDialog}
    </section>
  );
}
