import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { fetchAiUsage, purposeName, type AiUsageUser } from '../../lib/api/adminAiUsage';

const number = (value: number) => value.toLocaleString();
const money = (value: number | null) => (value === null ? '—' : `$${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}`);
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const cachedShare = (user: { promptTokens: number; cachedTokens: number }) => (user.promptTokens > 0 ? Math.round((user.cachedTokens / user.promptTokens) * 100) : 0);

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-gray-900">{value}</dd>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function LimitNote({ user }: { user: AiUsageUser }) {
  const { monthlyCostCapUsd, monthlyTokenCap, reached } = user.limits;
  if (monthlyCostCapUsd === null && monthlyTokenCap === null) return <span className="text-gray-400">none</span>;
  const parts = [monthlyTokenCap !== null ? `${number(monthlyTokenCap)} tokens` : null, monthlyCostCapUsd !== null ? `$${monthlyCostCapUsd.toFixed(2)}` : null].filter(Boolean).join(' · ');
  return <span className={reached ? 'font-semibold text-red-700' : 'text-gray-700'}>{parts}{reached ? ' (reached)' : ''}</span>;
}

/** Who uses the built-in AI and how much, month by month. Keys are never shown. */
export function AdminAiUsage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const usage = useQuery({ queryKey: ['admin-ai-usage', month], queryFn: () => fetchAiUsage(month), staleTime: 30_000 });

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">AI usage</h3>
          <p className="text-sm text-gray-500">What the Story Helper, the Solo narrator and the recap polish used, per person. Everyone pays OpenRouter directly with their own key; the money shown is what OpenRouter reported.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Month" value={usage.data?.month ?? ''} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {(usage.data?.months ?? []).map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
          </select>
          <Button type="button" variant="outline" icon={RefreshCw} onClick={() => void usage.refetch()} loading={usage.isFetching && !usage.isLoading}>Refresh</Button>
        </div>
      </div>

      {usage.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{usage.error.message}</div>}

      {usage.isLoading || !usage.data ? (
        <div className="flex justify-center py-12"><LoadingSpinner text="Loading usage…" /></div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Requests" value={number(usage.data.totals.calls)} hint={`${usage.data.totals.people} ${usage.data.totals.people === 1 ? 'person' : 'people'}`} />
            <Tile label="Tokens sent" value={number(usage.data.totals.promptTokens)} hint={`${number(usage.data.totals.completionTokens)} received`} />
            <Tile label="Served from cache" value={`${cachedShare(usage.data.totals)}%`} hint={`${number(usage.data.totals.cachedTokens)} input tokens, billed at a discount`} />
            <Tile label="Cost reported" value={money(usage.data.totals.costUsd)} />
          </dl>

          {usage.data.users.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-500">
              <Cpu className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p>Nobody has used the built-in AI in {monthLabel(usage.data.month)}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-2">Person</th>
                    <th scope="col" className="px-4 py-2 text-right">Requests</th>
                    <th scope="col" className="px-4 py-2 text-right">Tokens</th>
                    <th scope="col" className="px-4 py-2 text-right">Cached</th>
                    <th scope="col" className="px-4 py-2 text-right">Cost</th>
                    <th scope="col" className="px-4 py-2">Used for</th>
                    <th scope="col" className="px-4 py-2">Their limit</th>
                    <th scope="col" className="px-4 py-2">Last used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {usage.data.users.map((user) => (
                    <tr key={user.userId}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{user.username}</div>
                        <div className="text-xs text-gray-500">{user.email}{user.hasKey ? '' : ' · no key saved'}</div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{number(user.calls)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{number(user.promptTokens + user.completionTokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{cachedShare(user)}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(user.costUsd)}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {Object.entries(user.byPurpose).length === 0 ? '—' : Object.entries(user.byPurpose).sort((a, b) => b[1].tokens - a[1].tokens).map(([purpose, value]) => `${purposeName(purpose)} ${number(value.calls)}`).join(' · ')}
                      </td>
                      <td className="px-4 py-2 text-xs"><LimitNote user={user} /></td>
                      <td className="px-4 py-2 text-xs text-gray-500">{user.lastUsedAt ? new Date(user.lastUsedAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
