import { useCallback, useEffect, useState } from 'react';
import { fetchAdminOverview, type AdminOverview } from '../lib/api/adminOverview';

const STALE_EVENT = 'draconi:admin-overview-stale';

/** Call after anything that changes what the overview reports (a backup, a user change) so every indicator refreshes. */
export function notifyAdminOverviewChanged() {
  window.dispatchEvent(new Event(STALE_EVENT));
}

/** Loads the administrator overview (backup status, attention items, key numbers) and keeps it fresh. */
export function useAdminOverview(autoRefreshMs = 0, enabled = true) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await fetchAdminOverview());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onStale = () => void refresh();
    window.addEventListener(STALE_EVENT, onStale);
    return () => window.removeEventListener(STALE_EVENT, onStale);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!autoRefreshMs || !enabled) return undefined;
    const timer = setInterval(() => void refresh(), autoRefreshMs);
    return () => clearInterval(timer);
  }, [autoRefreshMs, enabled, refresh]);

  return { overview, loading, error, refresh };
}
