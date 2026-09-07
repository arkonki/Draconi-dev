import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, Dices, Link2, RotateCcw } from 'lucide-react';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { fetchTrustedRollHistory, type TrustedRollRequest } from '../../lib/api/trustedRolls';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface TrustedRollFeedProps {
  partyId: string;
  encounterId?: string | null;
  compact?: boolean;
}

function outcomeClasses(outcome: string | null | undefined) {
  if (outcome === 'failure' || outcome === 'demon') return 'bg-red-100 text-red-800 border-red-200';
  if (outcome === 'success' || outcome === 'dragon') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-stone-100 text-stone-700 border-stone-200';
}

function RollCard({ request }: { request: TrustedRollRequest }) {
  const roll = request.result?.roll;
  const outcome = roll?.result?.outcome;
  const total = roll?.result?.total;

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-stone-900">{request.purpose}</h4>
            {request.pushCondition ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                <RotateCcw className="h-3 w-3" /> Pushed · {request.pushCondition}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {request.expression} · {request.modifier} · {request.mode} mode
            {request.targetValue != null ? ` · target ${request.targetValue}` : ''}
          </p>
        </div>
        {request.status === 'resolved' ? (
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${outcomeClasses(outcome)}`}>
            {outcome || 'resolved'}
          </span>
        ) : request.status === 'expired' ? (
          <span className="rounded-full border border-stone-300 bg-stone-100 px-2.5 py-1 text-[10px] font-bold uppercase text-stone-600">
            Expired
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-800">
            <Clock3 className="h-3 w-3" /> Waiting
          </span>
        )}
      </div>

      {roll ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-stone-900 px-3 py-1.5 font-mono font-bold text-white">
            {roll.dice.join(', ')}
          </span>
          <span className="font-semibold text-stone-700">Total {total ?? roll.keptValues[0] ?? '—'}</span>
          <span className="text-xs text-stone-500">{request.result?.source} result</span>
          {roll.previousRollId ? (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-700">
              <Link2 className="h-3.5 w-3.5" /> Linked to original roll
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone-600">
          {request.mode === 'player'
            ? 'Waiting for the assigned player’s physical dice.'
            : request.mode === 'server'
              ? 'Waiting for an authoritative server roll.'
              : 'Waiting for either the assigned player or a server roll.'}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
        <span>{new Date(request.result?.createdAt || request.createdAt).toLocaleString()}</span>
        <span className="uppercase tracking-wide">{request.visibility}</span>
      </div>
    </article>
  );
}

export function TrustedRollFeed({ partyId, encounterId, compact = false }: TrustedRollFeedProps) {
  const queryClient = useQueryClient();
  const queryKey = ['trusted-roll-history', partyId, encounterId || 'campaign'];
  const historyQuery = useQuery({
    queryKey,
    queryFn: () => fetchTrustedRollHistory(partyId, { encounterId, limit: compact ? 10 : 40 }),
    enabled: Boolean(partyId),
    staleTime: 0,
  });
  const bindings = useMemo(() => [{
    bindingId: 'trusted-roll-event',
    event: 'INSERT' as const,
    schema: 'public' as const,
    table: 'campaign_events',
    filter: `campaign_id=eq.${partyId}`,
  }], [partyId]);

  useRealtimeChannel({
    key: `trusted-roll-feed:${partyId}:${encounterId || 'campaign'}`,
    scope: `party:${partyId}`,
    bindings,
    enabled: Boolean(partyId),
    fallbackRefetchMs: 20_000,
    reportToSync: false,
    onEvent: (_bindingId, payload) => {
      const eventType = String(payload.new?.type || '');
      if (eventType.startsWith('roll.')) void queryClient.invalidateQueries({ queryKey });
    },
    onReconnect: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  if (historyQuery.isLoading) {
    return <div className="flex min-h-32 items-center justify-center"><LoadingSpinner /></div>;
  }
  if (historyQuery.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        {(historyQuery.error as Error).message}
      </div>
    );
  }

  const requests = historyQuery.data?.requests || [];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-stone-900">
            <Dices className="h-5 w-5 text-indigo-600" /> Trusted Roll History
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Pending requests, authoritative results, and pushed-roll links visible to you.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Live
        </span>
      </div>
      {requests.length ? (
        <div className={compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
          {requests.map((request) => <RollCard key={request.id} request={request} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
          No trusted rolls have been requested here yet.
        </div>
      )}
    </section>
  );
}
