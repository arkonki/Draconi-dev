import { authenticatedApiFetch } from '../supabase';

export type Severity = 'critical' | 'warning' | 'info';
export type AdminSection = 'backups' | 'users' | 'maintenance' | 'system';

export interface AttentionItem {
  severity: Severity;
  code: string;
  title: string;
  detail: string;
  section: AdminSection;
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

export interface AdminOverview {
  generatedAt: string;
  status: 'healthy' | 'attention' | 'critical';
  app: { version: string; nodeVersion: string; startedAt: string | null; uptimeSeconds: number };
  database: { sizeBytes: number; serverVersion: string; migrations: { applied: number; latest: string | null } };
  storage: { files: number; bytes: number; disk: { totalBytes: number; freeBytes: number; freePercent: number } | null };
  backups: {
    warnDays: number;
    criticalDays: number;
    exists: boolean;
    level: 'ok' | 'warning' | 'critical';
    ageDays: number | null;
    message: string;
    newestAt: string | null;
    recoverySets: { count: number; bytes: number; newest: BackupFile | null };
    /** Automatic copies made just before a restore. Kept, but not counted as a current backup. */
    safetyCopies: { count: number; bytes: number; newest: BackupFile | null };
    deployDumps: { count: number; bytes: number; newest: BackupFile | null };
  };
  users: { total: number; active: number; admins: number; needsAttention: number };
  content: { characters: number; campaigns: number };
  housekeeping: {
    enabled: boolean;
    lastCompletedAt: string | null;
    lastError: string | null;
    pending: Record<string, number>;
  } | null;
  attention: AttentionItem[];
}

export interface RouteTiming {
  method: string;
  route: string;
  count: number;
  failed: number;
  slow: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface PerformanceStatus {
  generatedAt: string;
  process: {
    startedAt: string;
    uptimeSeconds: number;
    residentMemoryBytes: number;
    heapUsedBytes: number;
    eventLoopDelay: { p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number };
  };
  requests: {
    total: number; completed: number; failed: number; slow: number; inFlight: number; slowThresholdMs: number;
    p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; routes: RouteTiming[];
  };
  database: {
    pool: { configuredMaximum: number; totalConnections: number; idleConnections: number; waitingRequests: number };
    queries: { count: number; errors: number; slow: number; slowThresholdMs: number; p50Ms: number; p95Ms: number; p99Ms: number };
    postgres: {
      serverVersion: string; connections: number; activeConnections: number; cacheHitPercent: number;
      transactionsCommitted: number; transactionsRolledBack: number; deadlocks: number; temporaryFiles: number;
    };
  };
  realtime: {
    currentConnections: number; authenticatedConnections: number; subscribedConnections: number;
    eventsDelivered: number; deliveryErrors: number; listenerRestarts: number;
    deliveryLatency: { p50Ms: number; p95Ms: number; p99Ms: number };
  };
}

async function get<T>(path: string): Promise<T> {
  const response = await authenticatedApiFetch(path);
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || response.statusText || 'Request failed');
  return payload;
}

export const fetchAdminOverview = () => get<AdminOverview>('/admin/overview');
export const fetchPerformance = () => get<PerformanceStatus>('/admin/performance');

export async function resetPerformanceCounters() {
  const response = await authenticatedApiFetch('/admin/performance/reset', { method: 'POST' });
  if (!response.ok) throw new Error('Could not reset the counters.');
  return response.json() as Promise<{ resetAt: string }>;
}
