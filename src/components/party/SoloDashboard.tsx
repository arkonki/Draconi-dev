import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Dices,
  Flag,
  Gauge,
  Heart,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Route,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Wand2,
  X,
} from 'lucide-react';
import {
  advanceSoloThreat,
  askSoloFortune,
  completeSoloMission,
  drawSoloInspiration,
  fetchSoloState,
  FortuneCategory,
  FortuneTilt,
  InspirationColumn,
  revealSoloWaypoint,
  SoloApiError,
  SoloRecordedRoll,
  SoloWaypoint,
  startSoloMission,
} from '../../lib/api/solo';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface SoloDashboardProps {
  partyId: string;
  partyName: string;
  canManage: boolean;
  onOpenSettings: () => void;
}

type SoloAction = 'fortune' | 'inspiration' | 'start-mission' | 'reveal-waypoint' | 'advance-threat' | 'complete-mission';

const fortuneCategories: Array<{ value: FortuneCategory; label: string }> = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'scale', label: 'Scale' },
  { value: 'power', label: 'Power' },
  { value: 'quality', label: 'Quality' },
  { value: 'reaction', label: 'Reaction' },
];

const inspirationColumns: Array<{ value: InspirationColumn; label: string }> = [
  { value: 'action', label: 'Action' },
  { value: 'attribute', label: 'Attribute' },
  { value: 'thing', label: 'Thing' },
];

function percentage(current: number, maximum: number) {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, (current / maximum) * 100));
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rollResultLabel(roll: SoloRecordedRoll) {
  if (typeof roll.result.value === 'string' || typeof roll.result.value === 'number') {
    return String(roll.result.value);
  }
  if (typeof roll.result.phrase === 'string') return roll.result.phrase;
  return null;
}

function waypointLabel(waypoint: SoloWaypoint) {
  if (waypoint.status === 'hidden') return 'Unknown waypoint';
  return waypoint.title || `Waypoint ${waypoint.position + 1}`;
}

function ActionModal({
  action,
  busy,
  error,
  onClose,
  children,
}: {
  action: SoloAction;
  busy: boolean;
  error?: Error | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titles: Record<SoloAction, string> = {
    fortune: 'Ask Fortune',
    inspiration: 'Draw Inspiration',
    'start-mission': 'Start a custom mission',
    'reveal-waypoint': 'Reveal the next waypoint',
    'advance-threat': 'Advance the threat',
    'complete-mission': 'Conclude the mission',
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={titles[action]} className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-gradient-to-r from-indigo-50 to-amber-50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
            <Sparkles className="h-5 w-5 text-indigo-600" /> {titles[action]}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-40" aria-label="Close action">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">
          {children}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error.message}
              {error instanceof SoloApiError && error.code === 'REVISION_CONFLICT' && (
                <span className="mt-1 block text-xs">The campaign changed elsewhere. State was refreshed; review and try again.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SoloDashboard({ partyId, partyName, canManage, onOpenSettings }: SoloDashboardProps) {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<SoloAction | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [fortuneQuestion, setFortuneQuestion] = useState('');
  const [fortuneCategory, setFortuneCategory] = useState<FortuneCategory>('yes_no');
  const [fortuneTilt, setFortuneTilt] = useState<FortuneTilt>('even');
  const [fortuneContext, setFortuneContext] = useState('');

  const [selectedColumns, setSelectedColumns] = useState<InspirationColumn[]>(['action', 'attribute', 'thing']);
  const [inspirationContext, setInspirationContext] = useState('');

  const [missionTitle, setMissionTitle] = useState('');
  const [missionObjective, setMissionObjective] = useState('');
  const [waypointCount, setWaypointCount] = useState(3);
  const [openingTitle, setOpeningTitle] = useState('Departure');
  const [openingDescription, setOpeningDescription] = useState('');
  const [threatDescription, setThreatDescription] = useState('');
  const [threatRecurring, setThreatRecurring] = useState(false);
  const [threatEffect, setThreatEffect] = useState('');

  const [revealTitle, setRevealTitle] = useState('');
  const [revealDescription, setRevealDescription] = useState('');
  const [threatAmount, setThreatAmount] = useState<1 | 2>(1);
  const [threatReason, setThreatReason] = useState('');
  const [missionOutcome, setMissionOutcome] = useState<'success' | 'failure' | 'abandoned'>('success');
  const [missionSummary, setMissionSummary] = useState('');

  const stateQuery = useQuery({
    queryKey: ['solo-state', partyId],
    queryFn: () => fetchSoloState(partyId),
    staleTime: 0,
  });
  const state = stateQuery.data;

  const realtimeBindings = useMemo(() => [{
    bindingId: 'solo-campaign-event',
    event: 'INSERT' as const,
    schema: 'public' as const,
    table: 'campaign_events',
    filter: `campaign_id=eq.${partyId}`,
  }], [partyId]);

  useRealtimeChannel({
    key: `solo-dashboard:${partyId}`,
    scope: `party:${partyId}`,
    bindings: realtimeBindings,
    enabled: Boolean(partyId),
    fallbackRefetchMs: 20_000,
    onEvent: () => {
      void queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
      void queryClient.invalidateQueries({ queryKey: ['party', partyId] });
    },
    onReconnect: async () => {
      await queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
    },
  });

  const orderedWaypoints = useMemo(
    () => [...(state?.waypoints || [])].sort((left, right) => left.position - right.position),
    [state?.waypoints],
  );
  const nextWaypoint = state?.activeMission
    ? orderedWaypoints.find((waypoint) => waypoint.position === state.activeMission!.currentWaypointIndex + 1) || null
    : null;
  const finalWaypointPosition = orderedWaypoints.length > 0
    ? Math.max(...orderedWaypoints.map((waypoint) => waypoint.position))
    : -1;
  const atFinalWaypoint = Boolean(
    state?.activeMission && state.activeMission.currentWaypointIndex === finalWaypointPosition,
  );

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!state || !activeAction) throw new Error('Solo state is not ready.');
      const revision = state.campaignRevision;
      switch (activeAction) {
        case 'fortune':
          return askSoloFortune(partyId, revision, {
            question: fortuneQuestion.trim(),
            category: fortuneCategory,
            tilt: fortuneTilt,
            context: fortuneContext.trim(),
          });
        case 'inspiration':
          return drawSoloInspiration(partyId, revision, {
            columns: selectedColumns,
            context: inspirationContext.trim(),
          });
        case 'start-mission':
          return startSoloMission(partyId, revision, {
            title: missionTitle.trim(),
            objective: missionObjective.trim(),
            waypointCount,
            openingTitle: openingTitle.trim(),
            openingDescription: openingDescription.trim(),
            threatDescription: threatDescription.trim(),
            threatRecurring,
            threatTriggerEffect: threatEffect.trim(),
          });
        case 'reveal-waypoint':
          if (!nextWaypoint) throw new Error('There is no next waypoint to reveal.');
          return revealSoloWaypoint(partyId, nextWaypoint.id, revision, {
            title: nextWaypoint.kind === 'unknown' ? revealTitle.trim() : undefined,
            description: nextWaypoint.kind === 'unknown' ? revealDescription.trim() : undefined,
          });
        case 'advance-threat':
          if (!state.activeThreat) throw new Error('There is no active threat.');
          return advanceSoloThreat(partyId, state.activeThreat.id, revision, {
            amount: threatAmount,
            reason: threatReason.trim(),
          });
        case 'complete-mission':
          if (!state.activeMission) throw new Error('There is no active mission.');
          return completeSoloMission(partyId, state.activeMission.id, revision, {
            outcome: missionOutcome,
            summary: missionSummary.trim(),
          });
      }
    },
    onSuccess: async (result) => {
      setActiveAction(null);
      setSuccessMessage(result.summary);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-status', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['party', partyId] }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof SoloApiError && error.code === 'REVISION_CONFLICT') {
        await queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] });
      }
    },
  });

  const openAction = (action: SoloAction) => {
    setSuccessMessage(null);
    actionMutation.reset();
    if (action === 'fortune') {
      setFortuneTilt('even');
    }
    if (action === 'reveal-waypoint') {
      setRevealTitle('');
      setRevealDescription('');
    }
    if (action === 'advance-threat') {
      setThreatReason('');
    }
    if (action === 'complete-mission') {
      setMissionOutcome(atFinalWaypoint ? 'success' : 'failure');
      setMissionSummary('');
    }
    setActiveAction(action);
  };

  const submitAction = (event: FormEvent) => {
    event.preventDefault();
    actionMutation.mutate();
  };

  if (stateQuery.isLoading) {
    return <div className="flex min-h-[500px] items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  if (stateQuery.error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h2 className="font-bold">Could not load the Solo Dashboard</h2>
          <p className="mt-1 text-sm">{stateQuery.error.message}</p>
          <Button className="mt-4" variant="outline" icon={RefreshCw} onClick={() => stateQuery.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!state?.solo.enabled) {
    return (
      <div className="flex min-h-[500px] items-center justify-center p-6">
        <div className="max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-stone-900">Prepare a solo adventure</h2>
          <p className="mt-2 text-stone-600">Choose the campaign's solo hero and additional heroic ability before beginning the adventure.</p>
          {canManage ? (
            <Button className="mt-5" icon={Settings2} onClick={onOpenSettings}>Configure Solo Mode</Button>
          ) : (
            <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">A campaign owner or GM must enable Solo Mode.</p>
          )}
        </div>
      </div>
    );
  }

  const hero = state.playerCharacter;
  const equippedItems = hero?.inventory.filter((item) => item.equipped) || [];
  const threatCounter = state.activeThreat?.counter || 0;

  return (
    <div className="bg-stone-50/70">
      <div className="border-b border-indigo-100 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">
              <Sparkles className="h-4 w-4" /> Solo Adventure
            </div>
            <h2 className="mt-2 text-2xl font-extrabold">{partyName}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-indigo-100">
              <span className="rounded-full bg-white/10 px-2.5 py-1">Dragonbane Solo v1.2</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">Revision {state.campaignRevision}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1">{state.activeSessionId ? 'Session active' : 'No active session'}</span>
            </div>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" icon={Settings2} onClick={onOpenSettings} className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              Solo settings
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {successMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {successMessage}
          </div>
        )}

        {!canManage && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You can follow the solo adventure here. Only the campaign owner or a GM can resolve authoritative Solo actions.
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.75fr)]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
                <h3 className="flex items-center gap-2 font-bold text-stone-900"><Route className="h-5 w-5 text-violet-600" /> Current mission</h3>
                {state.activeMission && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">{titleCase(state.activeMission.status)}</span>}
              </div>

              {!state.activeMission ? (
                <div className="px-5 py-10 text-center">
                  <Flag className="mx-auto h-10 w-10 text-stone-300" />
                  <h4 className="mt-3 font-bold text-stone-800">No active mission</h4>
                  <p className="mt-1 text-sm text-stone-500">Create a custom objective, route, and threat to begin the playable solo loop.</p>
                  {canManage && <Button className="mt-5" icon={Flag} onClick={() => openAction('start-mission')}>Start a mission</Button>}
                </div>
              ) : (
                <div className="space-y-5 p-5">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{state.activeMission.title}</div>
                    <p className="mt-1 text-lg font-semibold leading-relaxed text-stone-900">{state.activeMission.objective}</p>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-600"><MapPin className="h-4 w-4" /> Current waypoint</div>
                    <h4 className="mt-2 font-bold text-violet-950">{state.currentWaypoint?.title || 'Uncharted location'}</h4>
                    {state.currentWaypoint?.description && <p className="mt-1 text-sm leading-relaxed text-violet-900">{state.currentWaypoint.description}</p>}
                  </div>

                  <ol className="space-y-2">
                    {orderedWaypoints.map((waypoint) => {
                      const active = waypoint.status === 'active';
                      const resolved = waypoint.status === 'resolved';
                      return (
                        <li key={waypoint.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? 'border-violet-300 bg-violet-50' : 'border-stone-200 bg-white'}`}>
                          {waypoint.status === 'hidden'
                            ? <LockKeyhole className="h-4 w-4 shrink-0 text-stone-400" />
                            : resolved
                              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              : <CircleDot className={`h-4 w-4 shrink-0 ${active ? 'text-violet-600' : 'text-stone-400'}`} />}
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-sm font-semibold ${active ? 'text-violet-950' : 'text-stone-700'}`}>{waypointLabel(waypoint)}</div>
                            <div className="text-xs text-stone-500">{titleCase(waypoint.kind)} · {titleCase(waypoint.status)}</div>
                          </div>
                          <span className="text-xs font-bold text-stone-400">{waypoint.position + 1}</span>
                        </li>
                      );
                    })}
                  </ol>

                  {canManage && (
                    <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                      {nextWaypoint && (
                        <Button icon={ChevronRight} onClick={() => openAction('reveal-waypoint')}>Reveal next waypoint</Button>
                      )}
                      <Button variant="outline" icon={Flag} onClick={() => openAction('complete-mission')}>Conclude mission</Button>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-stone-900"><Dices className="h-5 w-5 text-indigo-600" /> Solo tools</h3>
                  <p className="mt-1 text-sm text-stone-500">Use an oracle only when the answer is genuinely uncertain.</p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button icon={Gauge} onClick={() => openAction('fortune')}>Ask Fortune</Button>
                    <Button variant="outline" icon={Wand2} onClick={() => openAction('inspiration')}>Inspire</Button>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 px-5 py-4">
                <h3 className="flex items-center gap-2 font-bold text-stone-900"><Dices className="h-5 w-5 text-amber-600" /> Recent authoritative rolls</h3>
              </div>
              {state.latestRolls.length === 0 ? (
                <p className="p-5 text-sm text-stone-500">No Solo rolls have been recorded yet.</p>
              ) : (
                <div className="divide-y divide-stone-100">
                  {state.latestRolls.map((roll) => {
                    const result = rollResultLabel(roll);
                    return (
                      <div key={roll.id} className="p-4 sm:px-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-stone-900">{roll.purpose}</div>
                            {result && <div className="mt-1 text-lg font-extrabold text-indigo-700">{result}</div>}
                          </div>
                          <time className="shrink-0 text-xs text-stone-400" dateTime={roll.createdAt}>{new Date(roll.createdAt).toLocaleString()}</time>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-600">
                          <span className="rounded bg-stone-100 px-2 py-1">{roll.expression}</span>
                          <span>Dice: {roll.dice.join(', ')}</span>
                          {roll.keptValues.length > 0 && <span className="text-indigo-700">Kept: {roll.keptValues.join(', ')}</span>}
                          {roll.tableVersion && <span className="text-stone-400">{roll.tableVersion}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-indigo-100 font-bold text-indigo-700">
                  {hero?.portraitUrl ? <img src={hero.portraitUrl} alt="" className="h-full w-full object-cover" /> : hero?.name?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-stone-900">{hero?.name || 'Solo hero'}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{hero?.tags.join(' · ') || 'Player character'}</p>
                </div>
              </div>

              {hero && (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs font-bold text-stone-600"><span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-red-500" /> HP</span><span>{hero.hp.current} / {hero.hp.max}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-red-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${percentage(hero.hp.current, hero.hp.max)}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs font-bold text-stone-600"><span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5 text-blue-500" /> WP</span><span>{hero.wp.current} / {hero.wp.max}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${percentage(hero.wp.current, hero.wp.max)}%` }} /></div>
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-stone-100 pt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Conditions</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hero?.conditions.length ? hero.conditions.map((condition) => (
                    <span key={condition.id} className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">{titleCase(condition.name)}</span>
                  )) : <span className="text-sm text-stone-400">None</span>}
                </div>
              </div>

              <div className="mt-4 border-t border-stone-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Sparkles className="h-3.5 w-3.5" /> Solo ability</div>
                <div className="mt-1.5 text-sm font-semibold text-stone-800">{state.soloHeroicAbility?.name || 'Not selected'}</div>
              </div>

              <div className="mt-4 border-t border-stone-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Shield className="h-3.5 w-3.5" /> Equipped</div>
                <div className="mt-2 space-y-1 text-sm text-stone-700">
                  {equippedItems.length > 0 ? equippedItems.map((item) => <div key={item.id}>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</div>) : <span className="text-stone-400">No equipped items</span>}
                </div>
              </div>
            </section>

            <section className={`rounded-2xl border p-5 shadow-sm ${state.activeThreat ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-stone-900"><AlertTriangle className={`h-5 w-5 ${state.activeThreat ? 'text-amber-600' : 'text-stone-400'}`} /> Threat</h3>
                  <p className="mt-1 text-sm text-stone-600">{state.activeThreat?.description || 'No active mission threat.'}</p>
                </div>
                {state.activeThreat && <span className="shrink-0 text-lg font-extrabold text-amber-800">{threatCounter}/6</span>}
              </div>
              {state.activeThreat && (
                <>
                  <div className="mt-4 grid grid-cols-6 gap-1.5" aria-label={`Threat counter ${threatCounter} of 6`}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className={`h-3 rounded-full ${index < threatCounter ? 'bg-amber-500' : 'bg-amber-100'}`} />
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-amber-800">{state.activeThreat.recurring ? 'Recurring: resets to 1 when triggered.' : 'One-time threat.'}</div>
                  {canManage && state.activeThreat.status === 'active' && (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setThreatAmount(1); openAction('advance-threat'); }}>Advance +1</Button>
                      <Button size="sm" variant="outline" onClick={() => { setThreatAmount(2); openAction('advance-threat'); }}>Dire +2</Button>
                    </div>
                  )}
                </>
              )}
            </section>

            {state.activeCombat && (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <h3 className="flex items-center gap-2 font-bold text-red-950"><Swords className="h-5 w-5 text-red-600" /> Combat active</h3>
                <p className="mt-1 text-sm text-red-800">{state.activeCombat.name}</p>
              </section>
            )}
          </aside>
        </div>
      </div>

      {activeAction && (
        <ActionModal action={activeAction} busy={actionMutation.isPending} error={actionMutation.error} onClose={() => setActiveAction(null)}>
          <form onSubmit={submitAction} className="space-y-4">
            {activeAction === 'fortune' && (
              <>
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ask only when the answer is genuinely uncertain. A certain or more interesting answer may be decided without rolling.</p>
                <label className="block text-sm font-bold text-stone-700">Question
                  <textarea value={fortuneQuestion} onChange={(event) => setFortuneQuestion(event.target.value)} required maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" placeholder="Is the old bridge still safe to cross?" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-stone-700">Category
                    <select value={fortuneCategory} onChange={(event) => setFortuneCategory(event.target.value as FortuneCategory)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      {fortuneCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-bold text-stone-700">Likelihood
                    <select value={fortuneTilt} onChange={(event) => setFortuneTilt(event.target.value as FortuneTilt)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                      <option value="unlikely">Unlikely · 2d6 keep low</option>
                      <option value="even">Even · 1d6</option>
                      <option value="likely">Likely · 2d6 keep high</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-bold text-stone-700">Context <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={fortuneContext} onChange={(event) => setFortuneContext(event.target.value)} maxLength={5000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Relevant facts from the current scene" />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!fortuneQuestion.trim()} icon={Dices}>Ask Fortune</Button>
              </>
            )}

            {activeAction === 'inspiration' && (
              <>
                <p className="text-sm text-stone-600">Choose one or more independent prompt columns. The generated phrase is inspiration, not an authoritative story fact until you apply it.</p>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">Columns</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {inspirationColumns.map((column) => (
                      <label key={column.value} className={`cursor-pointer rounded-lg border p-3 text-center text-sm font-semibold ${selectedColumns.includes(column.value) ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-stone-200 text-stone-600'}`}>
                        <input type="checkbox" className="sr-only" checked={selectedColumns.includes(column.value)} onChange={(event) => setSelectedColumns((current) => event.target.checked ? [...current, column.value] : current.filter((value) => value !== column.value))} />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-bold text-stone-700">Context <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={inspirationContext} onChange={(event) => setInspirationContext(event.target.value)} maxLength={5000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="What are you trying to discover or create?" />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">This currently uses the clearly labelled generic Draconi table. Official table data requires an authorized data pack.</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={selectedColumns.length === 0} icon={Wand2}>Draw Inspiration</Button>
              </>
            )}

            {activeAction === 'start-mission' && (
              <>
                <label className="block text-sm font-bold text-stone-700">Mission title
                  <input value={missionTitle} onChange={(event) => setMissionTitle(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The Vanished Lantern" />
                </label>
                <label className="block text-sm font-bold text-stone-700">Objective
                  <textarea value={missionObjective} onChange={(event) => setMissionObjective(event.target.value)} required maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Find the missing lantern before the ruins flood." />
                </label>
                <label className="block text-sm font-bold text-stone-700">Number of waypoints
                  <input type="number" min={2} max={12} value={waypointCount} onChange={(event) => setWaypointCount(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                  <span className="mt-1 block text-xs font-normal text-stone-500">The first and objective waypoints are known; intervening waypoints remain hidden.</span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-stone-700">Opening waypoint
                    <input value={openingTitle} onChange={(event) => setOpeningTitle(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" />
                  </label>
                  <label className="block text-sm font-bold text-stone-700">Threat
                    <input value={threatDescription} onChange={(event) => setThreatDescription(event.target.value)} required maxLength={2000} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The water keeps rising" />
                  </label>
                </div>
                <label className="block text-sm font-bold text-stone-700">Opening description
                  <textarea value={openingDescription} onChange={(event) => setOpeningDescription(event.target.value)} required maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Describe where the hero begins." />
                </label>
                <label className="block text-sm font-bold text-stone-700">Threat trigger effect <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={threatEffect} onChange={(event) => setThreatEffect(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="What happens when the counter reaches 6?" />
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                  <input type="checkbox" checked={threatRecurring} onChange={(event) => setThreatRecurring(event.target.checked)} className="h-4 w-4 rounded border-stone-300 text-indigo-600" /> Recurring threat (reset to 1 after triggering)
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!missionTitle.trim() || !missionObjective.trim() || !openingTitle.trim() || !openingDescription.trim() || !threatDescription.trim() || waypointCount < 2 || waypointCount > 12} icon={Flag}>Start Mission</Button>
              </>
            )}

            {activeAction === 'reveal-waypoint' && nextWaypoint && (
              <>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">Leaving <strong>{state.currentWaypoint?.title || 'the current waypoint'}</strong> for waypoint {nextWaypoint.position + 1}.</div>
                {nextWaypoint.kind === 'unknown' ? (
                  <>
                    <p className="text-sm text-stone-600">This waypoint was deliberately hidden. Describe it only now that the hero reaches it.</p>
                    <label className="block text-sm font-bold text-stone-700">Waypoint title
                      <input value={revealTitle} onChange={(event) => setRevealTitle(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The Flooded Gallery" />
                    </label>
                    <label className="block text-sm font-bold text-stone-700">What is revealed?
                      <textarea value={revealDescription} onChange={(event) => setRevealDescription(event.target.value)} required maxLength={2000} rows={4} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Describe only the facts now visible to the hero." />
                    </label>
                  </>
                ) : (
                  <div className="rounded-lg bg-violet-50 p-4 text-violet-900"><div className="font-bold">{nextWaypoint.title}</div><p className="mt-1 text-sm">{nextWaypoint.description}</p></div>
                )}
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={nextWaypoint.kind === 'unknown' && (!revealTitle.trim() || !revealDescription.trim())} icon={ChevronRight}>Resolve and Continue</Button>
              </>
            )}

            {activeAction === 'advance-threat' && state.activeThreat && (
              <>
                <div className="rounded-lg bg-amber-50 p-4 text-amber-950"><div className="font-bold">{state.activeThreat.description}</div><p className="mt-1 text-sm">Current {state.activeThreat.counter}/6 · advancing by {threatAmount}</p></div>
                <label className="block text-sm font-bold text-stone-700">Why does the threat advance?
                  <textarea value={threatReason} onChange={(event) => setThreatReason(event.target.value)} required maxLength={500} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The hero spent a stretch searching the chamber." />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!threatReason.trim()} icon={AlertTriangle}>Advance Threat +{threatAmount}</Button>
              </>
            )}

            {activeAction === 'complete-mission' && state.activeMission && (
              <>
                {!atFinalWaypoint && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Success becomes available at the final objective waypoint. You may record failure or abandonment now.</div>
                )}
                <label className="block text-sm font-bold text-stone-700">Outcome
                  <select value={missionOutcome} onChange={(event) => setMissionOutcome(event.target.value as typeof missionOutcome)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="success" disabled={!atFinalWaypoint}>Success</option>
                    <option value="failure">Failure</option>
                    <option value="abandoned">Abandoned</option>
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">Mission summary
                  <textarea value={missionSummary} onChange={(event) => setMissionSummary(event.target.value)} required maxLength={10000} rows={5} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Record what happened and what remains unresolved." />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} disabled={!missionSummary.trim() || (missionOutcome === 'success' && !atFinalWaypoint)} icon={Flag}>Conclude Mission</Button>
              </>
            )}
          </form>
        </ActionModal>
      )}
    </div>
  );
}
