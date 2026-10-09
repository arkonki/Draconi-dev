import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../shared/Button';
import { ConfirmationDialog } from '../shared/ConfirmationDialog';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useAdminOverview } from '../../hooks/useAdminOverview';
import { formatBytes, formatDuration, formatMs } from '../../lib/adminFormat';
import {
  fetchPerformance,
  resetPerformanceCounters,
  type PerformanceStatus,
  type Severity,
} from '../../lib/api/adminOverview';

const REFRESH_MS = 15_000;

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <dl className="mt-3 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'bad' | 'good' }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-semibold ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-green-700' : 'text-gray-900'}`}>{value}</dd>
    </div>
  );
}

export function SystemHealth() {
  const { overview, error: overviewError, refresh: refreshOverview } = useAdminOverview();
  const [performance, setPerformance] = useState<PerformanceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snapshot] = await Promise.all([fetchPerformance(), refreshOverview()]);
      setPerformance(snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load system health.');
    } finally {
      setLoading(false);
    }
  }, [refreshOverview]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, load]);

  const reset = async () => {
    setResetting(true);
    try {
      await resetPerformanceCounters();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the counters.');
    } finally {
      setResetting(false);
      setConfirmingReset(false);
    }
  };

  if (!performance) {
    return error
      ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      : <div className="flex justify-center py-12"><LoadingSpinner text="Loading system health…" /></div>;
  }

  const { process: runtime, requests, database, realtime } = performance;
  const findings = (overview?.attention ?? []).filter((item) => item.section === 'system');
  const slowest = requests.routes.filter((route) => route.count >= 3).slice(0, 8);
  const pool = database.pool;
  const poolUse = Math.round(((pool.totalConnections - pool.idleConnections) / pool.configuredMaximum) * 100);
  const failureRate = requests.completed ? (requests.failed / requests.completed) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">System health</h3>
          <p className="text-sm text-gray-500">How the server has been doing since it last started ({formatDuration(runtime.uptimeSeconds)} ago).</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={auto} onChange={(event) => setAuto(event.target.checked)} />
            Refresh every {REFRESH_MS / 1000}s
          </label>
          <Button type="button" variant="outline" icon={RefreshCw} onClick={() => void load()} loading={loading}>Refresh</Button>
          <Button type="button" variant="ghost" icon={RotateCcw} onClick={() => setConfirmingReset(true)}>Reset counters</Button>
        </div>
      </div>

      {(error || overviewError) && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Could not refresh: {error || overviewError}. Showing the last known state.</div>}

      {findings.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="h-5 w-5 text-green-600" /> No problems detected.
        </p>
      ) : (
        <ul className="space-y-2">
          {findings.map((item) => (
            <li key={item.code} className={`rounded-xl border p-3 text-sm ${SEVERITY_CLASS[item.severity]}`}>
              <strong>{item.title}.</strong> {item.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Page loads and actions" hint="“95% finish within” means only 1 in 20 requests is slower than that.">
          <Metric label="Typical response" value={formatMs(requests.p50Ms)} />
          <Metric label="95% finish within" value={formatMs(requests.p95Ms)} tone={requests.p95Ms > requests.slowThresholdMs ? 'bad' : undefined} />
          <Metric label="99% finish within" value={formatMs(requests.p99Ms)} />
          <Metric label="Requests served" value={requests.completed.toLocaleString()} />
          <Metric label="Failed" value={`${requests.failed.toLocaleString()} (${failureRate.toFixed(1)}%)`} tone={failureRate > 5 ? 'bad' : undefined} />
          <Metric label={`Slower than ${requests.slowThresholdMs} ms`} value={requests.slow.toLocaleString()} />
        </Card>

        <Card title="Database" hint={`PostgreSQL ${database.postgres.serverVersion}`}>
          <Metric label="Connections in use" value={`${pool.totalConnections - pool.idleConnections} of ${pool.configuredMaximum} (${poolUse}%)`} tone={pool.waitingRequests > 0 ? 'bad' : undefined} />
          <Metric label="Requests waiting for a connection" value={pool.waitingRequests} tone={pool.waitingRequests > 0 ? 'bad' : 'good'} />
          <Metric label="Queries run" value={database.queries.count.toLocaleString()} />
          <Metric label="Query errors" value={database.queries.errors} tone={database.queries.errors > 0 ? 'bad' : undefined} />
          <Metric label="95% of queries finish within" value={formatMs(database.queries.p95Ms)} />
          <Metric label="Reads served from memory" value={`${database.postgres.cacheHitPercent}%`} tone={database.postgres.cacheHitPercent < 90 ? 'bad' : 'good'} />
          <Metric label="Deadlocks" value={database.postgres.deadlocks} tone={database.postgres.deadlocks > 0 ? 'bad' : 'good'} />
          {overview && <Metric label="Database size" value={formatBytes(overview.database.sizeBytes)} />}
        </Card>

        <Card title="Server" hint="The Node.js process that runs the site.">
          <Metric label="Running for" value={formatDuration(runtime.uptimeSeconds)} />
          <Metric label="Memory in use" value={formatBytes(runtime.residentMemoryBytes)} />
          <Metric label="Busiest-moment delay" value={formatMs(runtime.eventLoopDelay.p99Ms)} tone={runtime.eventLoopDelay.p99Ms > 250 ? 'bad' : undefined} />
          <Metric label="Requests in progress" value={requests.inFlight} />
        </Card>

        <Card title="Live updates" hint="The connections that push changes to players instantly.">
          <Metric label="Players connected" value={realtime.authenticatedConnections} />
          <Metric label="Watching a campaign" value={realtime.subscribedConnections} />
          <Metric label="Updates delivered" value={realtime.eventsDelivered.toLocaleString()} />
          <Metric label="Delivery latency (95%)" value={formatMs(realtime.deliveryLatency.p95Ms)} />
          <Metric label="Delivery errors" value={realtime.deliveryErrors} tone={realtime.deliveryErrors > 0 ? 'bad' : 'good'} />
          <Metric label="Listener restarts" value={realtime.listenerRestarts} />
        </Card>
      </div>

      <section aria-labelledby="slowest-heading">
        <h4 id="slowest-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Slowest requests</h4>
        {slowest.length === 0 ? (
          <p className="text-sm text-gray-500">Not enough traffic yet to rank requests.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Slowest requests since the last restart</caption>
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-2">Request</th>
                  <th scope="col" className="px-4 py-2 text-right">Times</th>
                  <th scope="col" className="px-4 py-2 text-right">95% within</th>
                  <th scope="col" className="px-4 py-2 text-right">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {slowest.map((route) => (
                  <tr key={`${route.method} ${route.route}`}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-800">{route.method} {route.route}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{route.count.toLocaleString()}</td>
                    <td className={`px-4 py-2 text-right font-medium ${route.p95Ms > requests.slowThresholdMs ? 'text-red-700' : 'text-gray-900'}`}>{formatMs(route.p95Ms)}</td>
                    <td className={`px-4 py-2 text-right ${route.failed > 0 ? 'font-medium text-red-700' : 'text-gray-500'}`}>{route.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500">These counters start again from zero whenever the server restarts, for example after a deployment.</p>

      <ConfirmationDialog
        isOpen={confirmingReset}
        onClose={() => { if (!resetting) setConfirmingReset(false); }}
        onConfirm={() => void reset()}
        title="Reset the counters?"
        description="This clears the request, database and live-update statistics so you can measure from now. It changes nothing else."
        confirmText="Reset counters"
        isLoading={resetting}
      />
    </div>
  );
}
