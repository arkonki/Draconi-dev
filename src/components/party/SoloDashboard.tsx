import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Brain,
  Bed,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Dices,
  Flag,
  Gauge,
  Heart,
  HeartPulse,
  LockKeyhole,
  MapPin,
  PackageSearch,
  RefreshCw,
  Route,
  Search,
  Settings2,
  Shield,
  ShieldQuestion,
  Skull,
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
  scavengeSoloWaypoint,
  searchSoloWaypoint,
  SoloApiError,
  SoloRecordedRoll,
  SoloWaypoint,
  startSoloMission,
  resolveSoloDyingAction,
  resolveSoloInjuryAction,
  resolveSoloNarrativeDamage,
  takeSoloRest,
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

type SoloAction = 'fortune' | 'inspiration' | 'start-mission' | 'reveal-waypoint' | 'search' | 'scavenge' | 'rest' | 'dying' | 'damage' | 'injury' | 'advance-threat' | 'complete-mission';

const standardConditionKeys = new Set(['exhausted', 'sickly', 'dazed', 'angry', 'scared', 'disheartened']);

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

function injuryRecoveryLabel(shifts?: number | null) {
  if (shifts === null || shifts === undefined) return 'No natural recovery';
  if (shifts === 0) return 'Healed';
  const days = Math.floor(shifts / 4);
  const remainingShifts = shifts % 4;
  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (remainingShifts > 0) parts.push(`${remainingShifts} shift${remainingShifts === 1 ? '' : 's'}`);
  return `${parts.join(' ')} remaining`;
}

function rollResultLabel(roll: SoloRecordedRoll) {
  if (typeof roll.result.value === 'string' || typeof roll.result.value === 'number') {
    return String(roll.result.value);
  }
  if (typeof roll.result.phrase === 'string') return roll.result.phrase;
  const labelsFor = (value: unknown): string[] => Array.isArray(value)
    ? value.flatMap((entry) => {
      if (Array.isArray(entry)) return labelsFor(entry);
      if (entry && typeof entry === 'object' && 'label' in entry && typeof entry.label === 'string') {
        return [entry.label];
      }
      return [];
    })
    : [];
  const findings = labelsFor(roll.result.findings ?? roll.result.findingChoices);
  const check = roll.result.check;
  const outcome = check && typeof check === 'object' && 'outcome' in check && typeof check.outcome === 'string'
    ? titleCase(check.outcome)
    : null;
  if (outcome || findings.length > 0) return [outcome, findings.join(' + ')].filter(Boolean).join(' · ');
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
    search: 'Search the current waypoint',
    scavenge: 'Scavenge the current waypoint',
    rest: 'Rest and recover',
    dying: 'Resolve a dying action',
    damage: 'Resolve narrative damage',
    injury: 'Treat a severe injury',
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
  const [searchContext, setSearchContext] = useState('');
  const [knownSearchLocation, setKnownSearchLocation] = useState(false);
  const [scavengeContext, setScavengeContext] = useState('');
  const [scavengeStretch, setScavengeStretch] = useState(false);
  const [restType, setRestType] = useState<'round' | 'stretch' | 'shift'>('round');
  const [restUseHealing, setRestUseHealing] = useState(false);
  const [restCondition, setRestCondition] = useState('');
  const [restSafeLocation, setRestSafeLocation] = useState(false);
  const [restContext, setRestContext] = useState('');
  const [dyingAction, setDyingAction] = useState<'death_roll' | 'self_rally' | 'life_saving_healing' | 'recover_stabilized'>('death_roll');
  const [dyingContext, setDyingContext] = useState('');
  const [damageSeverity, setDamageSeverity] = useState<'unknown' | 'slight' | 'moderate' | 'severe'>('unknown');
  const [damageContext, setDamageContext] = useState('');
  const [selectedInjuryId, setSelectedInjuryId] = useState<string | null>(null);
  const [injuryAction, setInjuryAction] = useState<'medical_care' | 'mark_healed'>('medical_care');
  const [injuryContext, setInjuryContext] = useState('');
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
  const selectedInjury = state?.activeInjuries.find((injury) => injury.id === selectedInjuryId) || null;

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
        case 'search':
          if (!state.currentWaypoint) throw new Error('There is no active waypoint to search.');
          return searchSoloWaypoint(partyId, state.currentWaypoint.id, revision, {
            knownLocation: knownSearchLocation,
            context: searchContext.trim(),
          });
        case 'scavenge':
          if (!state.currentWaypoint) throw new Error('There is no active waypoint to scavenge.');
          return scavengeSoloWaypoint(partyId, state.currentWaypoint.id, revision, {
            spendStretch: scavengeStretch,
            context: scavengeContext.trim(),
          });
        case 'rest':
          return takeSoloRest(partyId, revision, {
            restType,
            useHealing: restType === 'stretch' && restUseHealing,
            conditionToClear: restType === 'stretch' ? restCondition || undefined : undefined,
            safeLocation: restType === 'shift' && restSafeLocation,
            context: restContext.trim(),
          });
        case 'dying':
          return resolveSoloDyingAction(partyId, revision, {
            action: dyingAction,
            context: dyingContext.trim(),
          });
        case 'damage':
          return resolveSoloNarrativeDamage(partyId, revision, {
            severity: damageSeverity,
            context: damageContext.trim(),
          });
        case 'injury':
          if (!selectedInjury) throw new Error('Choose an active severe injury.');
          return resolveSoloInjuryAction(partyId, selectedInjury.id, revision, {
            action: injuryAction,
            context: injuryContext.trim(),
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
    if (action === 'search') {
      setSearchContext('');
      setKnownSearchLocation(false);
    }
    if (action === 'scavenge') {
      setScavengeContext('');
      setScavengeStretch(false);
    }
    if (action === 'rest') {
      setRestType(state?.restState.available.round ? 'round' : state?.restState.available.stretch ? 'stretch' : 'shift');
      setRestUseHealing(false);
      setRestCondition('');
      setRestSafeLocation(false);
      setRestContext('');
    }
    if (action === 'dying') {
      setDyingAction(Number(state?.playerCharacter?.deathRolls.passed || 0) >= 3 ? 'recover_stabilized' : 'death_roll');
      setDyingContext('');
    }
    if (action === 'damage') {
      setDamageSeverity('unknown');
      setDamageContext('');
    }
    if (action === 'injury') setInjuryContext('');
    if (action === 'advance-threat') {
      setThreatReason('');
    }
    if (action === 'complete-mission') {
      setMissionOutcome(atFinalWaypoint ? 'success' : 'failure');
      setMissionSummary('');
    }
    setActiveAction(action);
  };

  const openInjuryAction = (injuryId: string, action: 'medical_care' | 'mark_healed') => {
    setSelectedInjuryId(injuryId);
    setInjuryAction(action);
    openAction('injury');
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
  const standardConditions = hero?.conditions.filter((condition) => standardConditionKeys.has(condition.key)) || [];
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
                    {state.currentWaypoint && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-violet-700">
                        <span className="rounded-full bg-white/70 px-2.5 py-1">Searches {state.currentWaypoint.exploration.searchCount}</span>
                        <span className="rounded-full bg-white/70 px-2.5 py-1">Scavenges {state.currentWaypoint.exploration.scavengeCount}</span>
                        <span className="rounded-full bg-white/70 px-2.5 py-1">Stretches {state.currentWaypoint.exploration.stretchesSpent}</span>
                      </div>
                    )}
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
                      {state.currentWaypoint && state.activeThreat?.status === 'active' && (
                        <>
                          <Button icon={Search} onClick={() => openAction('search')}>Search</Button>
                          <Button variant="outline" icon={PackageSearch} onClick={() => openAction('scavenge')}>Scavenge</Button>
                        </>
                      )}
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
                    <Button variant="outline" icon={Bed} disabled={Boolean(state.activeCombat) || !hero || hero.hp.current <= 0} onClick={() => openAction('rest')}>Rest</Button>
                    {hero && hero.hp.current > 0 && (
                      <Button variant="outline" icon={HeartPulse} disabled={Boolean(state.activeCombat)} onClick={() => openAction('damage')}>Narrative damage</Button>
                    )}
                    {hero && hero.hp.current === 0 && hero.lifeStatus !== 'dead' && (
                      <Button icon={Skull} onClick={() => openAction('dying')}>Dying action</Button>
                    )}
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

              {hero?.hp.current === 0 && (
                <div className={`mt-4 rounded-xl border p-3 ${hero.lifeStatus === 'dead' ? 'border-stone-700 bg-stone-900 text-white' : 'border-red-200 bg-red-50 text-red-950'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-bold"><Skull className="h-4 w-4" /> {hero.lifeStatus === 'dead' ? 'Dead' : hero.isRallied ? 'Dying · rallied' : 'Dying'}</span>
                    <span className="text-xs font-bold">CON {hero.attributes?.CON ?? '—'}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold">
                    <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">Successes {hero.deathRolls.passed}/3</span>
                    <span className="rounded bg-red-100 px-2 py-1 text-red-800">Failures {hero.deathRolls.failed}/3</span>
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
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Bed className="h-3.5 w-3.5" /> Rest this shift</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-1 ${state.restState.available.round ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>Round {state.restState.available.round ? 'available' : 'used'}</span>
                  <span className={`rounded-full px-2.5 py-1 ${state.restState.available.stretch ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>Stretch {state.restState.available.stretch ? 'available' : 'used'}</span>
                </div>
              </div>

              {state.activeInjuries.length > 0 && (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><HeartPulse className="h-3.5 w-3.5" /> Severe injuries</div>
                  <div className="mt-2 space-y-2">
                    {state.activeInjuries.map((injury) => (
                      <div key={injury.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
                        <div className="font-bold">{injury.name} · {injury.permanent ? 'permanent' : injuryRecoveryLabel(injury.remainingHealingShifts)}</div>
                        <div className="mt-0.5 text-amber-800">{injury.effect}</div>
                        <div className="mt-1 text-[11px] font-semibold text-amber-700">
                          {injury.permanent
                            ? 'Permanent injury'
                            : injury.medicalCareApplied
                              ? 'Medical care applied · recovery time halved'
                              : injury.lastTreatmentShift === state.restState.shiftCount
                                ? 'Medical care already attempted this shift'
                                : `${titleCase(injury.recoveryStatus)} · original recovery ${injury.healingDays || '—'} days`}
                        </div>
                        {canManage && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {!injury.permanent && !injury.medicalCareApplied && (
                              <Button
                                size="sm"
                                icon={HeartPulse}
                                disabled={Boolean(state.activeCombat) || injury.lastTreatmentShift === state.restState.shiftCount}
                                onClick={() => openInjuryAction(injury.id, 'medical_care')}
                              >
                                Medical care
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => openInjuryAction(injury.id, 'mark_healed')}>Mark healed</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

            {activeAction === 'search' && state.currentWaypoint && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  A thorough Search always consumes one stretch and advances <strong>{state.activeThreat?.description || 'the active threat'}</strong> by 1.
                </div>
                <p className="text-sm text-stone-600">The server rolls Spot Hidden and records every die. A Dragon produces two possible finds; choose the one that best fits the fiction.</p>
                <label htmlFor="solo-known-search-location" className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                  <input id="solo-known-search-location" type="checkbox" checked={knownSearchLocation} onChange={(event) => setKnownSearchLocation(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                  <span className="font-bold">Specific known hiding place<span className="mt-0.5 block text-xs font-normal text-stone-500">Skip Spot Hidden because the hero already knows exactly where to look.</span></span>
                </label>
                <label className="block text-sm font-bold text-stone-700">What is being searched? <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={searchContext} onChange={(event) => setSearchContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The carved desk and the loose stones behind it" />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">Find categories come from the clearly labelled generic Draconi exploration table, not an official adventure table. Interpret the abstract result in the current scene.</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={Search}>Search · spend 1 stretch</Button>
              </>
            )}

            {activeAction === 'scavenge' && state.currentWaypoint && (
              <>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                  {state.currentWaypoint.exploration.scavengeCount === 0
                    ? 'This is the first quick pass at this waypoint. It takes only a few minutes and does not advance the threat unless you choose a full stretch.'
                    : `This waypoint has already been scavenged ${state.currentWaypoint.exploration.scavengeCount} time(s). Another attempt automatically consumes one stretch and advances the threat by 1.`}
                </div>
                <label className="block text-sm font-bold text-stone-700">What is being scavenged? <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={scavengeContext} onChange={(event) => setScavengeContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Search the abandoned camp for anything useful" />
                </label>
                {state.currentWaypoint.exploration.scavengeCount === 0 && (
                  <label htmlFor="solo-scavenge-stretch" className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                    <input id="solo-scavenge-stretch" type="checkbox" checked={scavengeStretch} onChange={(event) => setScavengeStretch(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                    <span className="font-bold">Take a full stretch<span className="mt-0.5 block text-xs font-normal text-stone-500">Advances the active threat by 1. Choose this when the fiction makes the scavenging prolonged.</span></span>
                  </label>
                )}
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">The server records a d10 result from the generic Draconi exploration table. Findings are abstract prompts; no item is silently added to inventory.</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={PackageSearch}>
                  Scavenge{state.currentWaypoint.exploration.scavengeCount > 0 || scavengeStretch ? ' · spend 1 stretch' : ' · quick pass'}
                </Button>
              </>
            )}

            {activeAction === 'rest' && hero && (
              <>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">Rest type</legend>
                  <div className="mt-2 grid gap-2">
                    {([
                      { type: 'round' as const, title: 'Round rest · 10 seconds', detail: 'Recover D6 WP. Once per shift.', available: state.restState.available.round },
                      { type: 'stretch' as const, title: 'Stretch rest · 15 minutes', detail: 'Recover D6 HP and D6 WP, and clear one chosen standard condition. Once per shift.', available: state.restState.available.stretch },
                      { type: 'shift' as const, title: 'Shift rest · 6 hours', detail: 'Requires safety. Fully restore HP/WP, clear standard conditions, and advance temporary injury recovery by one shift.', available: true },
                    ]).map((option) => (
                      <label key={option.type} htmlFor={`solo-rest-${option.type}`} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${restType === option.type ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'} ${option.available ? '' : 'cursor-not-allowed opacity-50'}`}>
                        <input id={`solo-rest-${option.type}`} type="radio" name="solo-rest-type" value={option.type} checked={restType === option.type} disabled={!option.available} onChange={() => { setRestType(option.type); setRestUseHealing(false); setRestCondition(''); setRestSafeLocation(false); }} className="mt-1 h-4 w-4 border-stone-300 text-indigo-600" />
                        <span className="sr-only">Rest type option</span>
                        <span className="text-sm"><strong className="block text-stone-800">{option.title}</strong><span className="text-stone-500">{option.detail}{option.available ? '' : ' Already used this shift.'}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {restType === 'stretch' && (
                  <>
                    <label className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 text-sm text-stone-700">
                      <input type="checkbox" checked={restUseHealing} onChange={(event) => setRestUseHealing(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600" />
                      <span className="font-bold">Make a solo Healing test<span className="mt-0.5 block text-xs font-normal text-stone-500">On success, recover 2D6 HP instead of D6. A failed test keeps the normal D6 recovery.</span></span>
                    </label>
                    {standardConditions.length > 0 && (
                      <label className="block text-sm font-bold text-stone-700">Condition to clear
                        <select value={restCondition} onChange={(event) => setRestCondition(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                          <option value="">Choose an active condition…</option>
                          {standardConditions.map((condition) => <option key={condition.key} value={condition.key}>{titleCase(condition.name)}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}

                {restType === 'shift' && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <input type="checkbox" checked={restSafeLocation} onChange={(event) => setRestSafeLocation(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-indigo-600" />
                    <span className="font-bold">I confirm this is a safe location<span className="mt-0.5 block text-xs font-normal">The app will not infer safety from the scene.</span></span>
                  </label>
                )}

                {restType !== 'round' && state.activeMission && state.activeThreat?.status === 'active' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    This rest advances <strong>{state.activeThreat.description}</strong> from {state.activeThreat.counter}/6 by 1.
                  </div>
                )}
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">Only standard conditions are cleared. Poison, fear effects, and custom statuses remain active and must be resolved separately.</div>
                <label className="block text-sm font-bold text-stone-700">Narrative context <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={restContext} onChange={(event) => setRestContext(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="Where and how does the hero rest?" />
                </label>
                <Button
                  type="submit"
                  fullWidth
                  loading={actionMutation.isPending}
                  disabled={(restType === 'round' && !state.restState.available.round)
                    || (restType === 'stretch' && (!state.restState.available.stretch || (standardConditions.length > 0 && !restCondition)))
                    || (restType === 'shift' && !restSafeLocation)}
                  icon={Bed}
                >
                  Take {titleCase(restType)} Rest
                </Button>
              </>
            )}

            {activeAction === 'dying' && hero && (
              <>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                  <div className="font-bold">{hero.name} is at 0 HP</div>
                  <div className="mt-1">Death rolls: {hero.deathRolls.passed}/3 successes · {hero.deathRolls.failed}/3 failures{hero.isRallied ? ' · currently rallied' : ''}</div>
                </div>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-700">Choose the action</legend>
                  <div className="mt-2 grid gap-2">
                    {([
                      { action: 'death_roll' as const, title: `Death roll · CON ${hero.attributes?.CON ?? '—'}`, detail: 'Success adds one success; Dragon adds two. Failure adds one failure; Demon adds two.', disabled: hero.deathRolls.passed >= 3 },
                      { action: 'self_rally' as const, title: `Self-rally · Persuasion ${hero.skills?.Persuasion ?? '—'}`, detail: 'Solo exception: roll without a bane. Success lets the hero act at 0 HP.', disabled: hero.isRallied || hero.deathRolls.passed >= 3 },
                      { action: 'life_saving_healing' as const, title: `Save your life · Healing ${hero.skills?.Healing ?? '—'}`, detail: 'On success, recover D6 HP and roll a severe injury.', disabled: hero.deathRolls.passed >= 3 },
                      { action: 'recover_stabilized' as const, title: 'Recover after three successes', detail: 'Recover D6 HP and roll a severe injury. Available only for persisted legacy stabilized state.', disabled: hero.deathRolls.passed < 3 },
                    ]).map((option) => (
                      <label key={option.action} htmlFor={`solo-dying-${option.action}`} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${dyingAction === option.action ? 'border-red-400 bg-red-50' : 'border-stone-200'} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                        <input id={`solo-dying-${option.action}`} type="radio" name="solo-dying-action" checked={dyingAction === option.action} disabled={option.disabled} onChange={() => setDyingAction(option.action)} className="mt-1 h-4 w-4 border-stone-300 text-red-600" />
                        <span className="sr-only">Dying action option</span>
                        <span className="text-sm"><strong className="block text-stone-800">{option.title}</strong><span className="text-stone-500">{option.detail}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-bold text-stone-700">What happens in the fiction? <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={dyingContext} onChange={(event) => setDyingContext(event.target.value)} maxLength={2000} rows={2} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The hero grips the altar and refuses to fall…" />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">The server decides the mechanical result. Recovery automatically creates a persisted severe injury and its healing time.</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={ShieldQuestion}>Resolve {titleCase(dyingAction)}</Button>
              </>
            )}

            {activeAction === 'damage' && hero && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Apply this only after confirming that the fiction causes damage. Active combat damage belongs in the encounter action flow.
                </div>
                <label className="block text-sm font-bold text-stone-700">Severity
                  <select value={damageSeverity} onChange={(event) => setDamageSeverity(event.target.value as typeof damageSeverity)} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal">
                    <option value="unknown">Unknown · roll D6 severity</option>
                    <option value="slight">Slight · D6 damage</option>
                    <option value="moderate">Moderate · 2D6 damage</option>
                    <option value="severe">Severe · 2D10 damage</option>
                  </select>
                </label>
                <label className="block text-sm font-bold text-stone-700">Cause and context <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={damageContext} onChange={(event) => setDamageContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder="The collapsing ceiling catches the hero beneath falling stone." />
                </label>
                <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">The server records the severity die (when unknown), every damage die, HP before/after, and any transition to dying or death.</div>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={HeartPulse}>Roll and Apply Damage</Button>
              </>
            )}

            {activeAction === 'injury' && selectedInjury && hero && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="font-bold">{selectedInjury.name}</div>
                  <div className="mt-1">{selectedInjury.effect}</div>
                  <div className="mt-2 text-xs font-semibold">
                    {selectedInjury.permanent
                      ? 'Permanent injury'
                      : injuryRecoveryLabel(selectedInjury.remainingHealingShifts)}
                  </div>
                </div>
                {injuryAction === 'medical_care' ? (
                  <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                    Roll Healing {hero.skills?.Healing ?? '—'}. Success halves the remaining recovery time. A failed attempt can be tried again after completing the next shift rest.
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    This is a manual GM override. It immediately removes the injury from the active list, including permanent injuries, and records the correction in campaign history.
                  </div>
                )}
                <label className="block text-sm font-bold text-stone-700">
                  {injuryAction === 'medical_care' ? 'How is the injury treated?' : 'Why is this injury resolved?'} <span className="font-normal text-stone-400">(optional)</span>
                  <textarea value={injuryContext} onChange={(event) => setInjuryContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 font-normal" placeholder={injuryAction === 'medical_care' ? 'The hero cleans the wound and binds it carefully…' : 'The injury was already healed during downtime…'} />
                </label>
                <Button type="submit" fullWidth loading={actionMutation.isPending} icon={HeartPulse} variant={injuryAction === 'mark_healed' ? 'danger' : 'primary'}>
                  {injuryAction === 'medical_care' ? 'Roll Healing and Apply Care' : 'Confirm and Mark Healed'}
                </Button>
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
