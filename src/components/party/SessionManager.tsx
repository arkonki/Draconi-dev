import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bed, BellRing, CalendarClock, Check, Dices, Flame, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import {
  advanceCampaignTime,
  createCampaignTimeReminder,
  deleteCampaignTimeReminder,
  endCampaignSession,
  fetchCampaignTimeState,
  resolveCampaignTimeNotification,
  setCampaignTimeReminderActive,
  startCampaignSession,
  type CampaignTimeAdvanceUnit,
  type CampaignTimeUnit,
} from '../../lib/api/campaignTime';
import { fetchRandomTables } from '../../lib/api/randomTables';
import { formatCampaignClock } from '../../lib/game/campaignTimeFormat';
import { rollOnTable } from '../../lib/game/randomTableUtils';
import { rollDiceExpression } from '../../lib/game/diceExpression';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
  partyName: string;
}

function unitLabel(unit: CampaignTimeAdvanceUnit, amount: number) {
  return `${unit}${amount === 1 ? '' : 's'}`;
}

const LIGHT_SOURCES = [
  { id: 'torch', name: 'Torch', diceExpression: '1d6', detail: 'On 1, the torch goes out.' },
  { id: 'lantern', name: 'Lantern', diceExpression: '1d8', detail: 'On 1, refill and relight the lantern.' },
  { id: 'oil-lamp', name: 'Oil Lamp', diceExpression: '1d6', detail: 'On 1, refill and relight the lamp.' },
  { id: 'candle', name: 'Tallow Candle', diceExpression: '1d4', detail: 'On 1, the candle goes out.' },
] as const;

export function SessionManager({ isOpen, onClose, partyId, partyName }: SessionManagerProps) {
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<'time' | 'session' | 'reminders'>('time');
  const [sessionTitle, setSessionTitle] = useState(`${partyName} Session`);
  const [gmNotes, setGmNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [unresolvedThreads, setUnresolvedThreads] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState(1);
  const [reminderLabel, setReminderLabel] = useState('Encounter check');
  const [diceExpression, setDiceExpression] = useState('1d12');
  const [intervalCount, setIntervalCount] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<CampaignTimeUnit>('stretch');
  const [reminderNotes, setReminderNotes] = useState('');
  const [isRollTableOpen, setIsRollTableOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [tableRollResult, setTableRollResult] = useState<{ tableName: string; roll: number; result: string } | null>(null);
  const [lightSourceId, setLightSourceId] = useState<(typeof LIGHT_SOURCES)[number]['id']>('torch');
  const [notificationRoll, setNotificationRoll] = useState<{ notificationId: string; dice: number[]; total: number } | null>(null);

  const stateQuery = useQuery({
    queryKey: ['campaign-time', partyId],
    queryFn: () => fetchCampaignTimeState(partyId),
    enabled: isOpen,
    refetchInterval: isOpen ? 15000 : false,
  });
  const state = stateQuery.data;
  const clock = useMemo(() => formatCampaignClock(state?.gameTime.elapsedSeconds || 0), [state?.gameTime.elapsedSeconds]);
  const randomTablesQuery = useQuery({
    queryKey: ['randomTables', partyId],
    queryFn: () => fetchRandomTables(partyId),
    enabled: isOpen && isRollTableOpen,
  });
  const selectedTable = randomTablesQuery.data?.find((table) => table.id === selectedTableId)
    || randomTablesQuery.data?.[0];
  const selectedLightSource = LIGHT_SOURCES.find((source) => source.id === lightSourceId) || LIGHT_SOURCES[0];
  const selectedLightReminder = state?.reminders.find((reminder) => reminder.label === `Light: ${selectedLightSource.name}`);

  const timeTrackerBindings = useMemo(() => ([{
    bindingId: 'session-modal-time-tracker',
    event: '*' as const,
    schema: 'public' as const,
    table: 'time_trackers',
    filter: `party_id=eq.${partyId}`,
  }]), [partyId]);

  useRealtimeChannel({
    key: `session-modal-time-tracker:${partyId}`,
    scope: `party:${partyId}`,
    bindings: timeTrackerBindings,
    enabled: isOpen,
    fallbackRefetchMs: 15000,
    onEvent: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaign-time', partyId] });
    },
    onReconnect: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaign-time', partyId] });
    },
  });

  const closeRollTable = () => {
    setIsRollTableOpen(false);
    setSelectedTableId('');
    setTableRollResult(null);
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['campaign-time', partyId] });
    await queryClient.invalidateQueries({ queryKey: ['timeTracker', partyId] });
  };
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
    onError: refresh,
  });
  const run = (action: () => Promise<unknown>) => mutation.mutate(action);
  const handleClose = () => {
    setActivePanel('time');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-2 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-stone-300 bg-stone-50 shadow-2xl">
        <header className="flex items-center justify-between border-b bg-stone-900 px-4 py-3 text-white">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="font-serif text-lg font-bold leading-tight">Game Session & Time</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-300">
                <span>{partyName}</span>
                {state?.activeSession ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-200">Session active</span> : null}
              </div>
            </div>
          </div>
          <button type="button" onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close session manager">
            <X className="w-5 h-5" />
          </button>
        </header>

        <nav className="flex shrink-0 overflow-x-auto border-b border-stone-200 bg-white px-2" aria-label="Session manager sections">
          {([
            { id: 'time' as const, label: 'Time & rests', count: state?.pendingNotifications.length || 0 },
            { id: 'session' as const, label: state?.activeSession ? 'End session' : 'Start session', count: 0 },
            { id: 'reminders' as const, label: 'Roll reminders', count: state?.reminders.length || 0 },
          ]).map((panel) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActivePanel(panel.id)}
              aria-current={activePanel === panel.id ? 'page' : undefined}
              className={`relative flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm font-bold transition-colors ${activePanel === panel.id ? 'text-[#1a472a]' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {panel.label}
              {panel.count > 0 ? (
                <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] ${panel.id === 'time' ? 'bg-amber-500 text-white' : 'bg-stone-200 text-stone-700'}`}>
                  {panel.count}
                </span>
              ) : null}
              {activePanel === panel.id ? <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#1a472a]" /> : null}
            </button>
          ))}
        </nav>

        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
          {stateQuery.isLoading ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div> : null}
          {stateQuery.error ? <ErrorMessage message={stateQuery.error.message} /> : null}
          {mutation.error ? <ErrorMessage message={mutation.error.message} /> : null}

          {state ? (
            <>
              {activePanel === 'time' ? <div className="space-y-3">
              {state.pendingNotifications.length > 0 ? (
                <section className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3" aria-live="assertive">
                  <div className="flex items-center gap-2 text-amber-900 font-bold">
                    <BellRing className="w-5 h-5" /> {state.pendingNotifications.length} roll{state.pendingNotifications.length === 1 ? '' : 's'} due
                  </div>
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {state.pendingNotifications.map((notification) => (
                    <div key={notification.id} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex-1">
                          <p className="font-bold text-stone-900">{notification.label} · {notification.diceExpression}</p>
                          <p className="text-xs text-stone-600">Due at {notification.dueUnit} {notification.dueCount}{notification.notes ? ` · ${notification.notes}` : ''}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant="secondary" icon={Dices} disabled={mutation.isPending}
                            onClick={() => {
                              const result = rollDiceExpression(notification.diceExpression);
                              if (result) setNotificationRoll({ notificationId: notification.id, dice: result.dice, total: result.total });
                            }}>
                            Roll
                          </Button>
                          <Button size="sm" icon={Check} disabled={mutation.isPending}
                            onClick={() => {
                              setNotificationRoll((current) => current?.notificationId === notification.id ? null : current);
                              run(() => resolveCampaignTimeNotification(partyId, notification.id, state.campaignRevision));
                            }}>
                            Mark handled
                          </Button>
                        </div>
                      </div>
                      {notificationRoll?.notificationId === notification.id ? (
                        <div className={`rounded-lg border px-3 py-2 ${notificationRoll.total === 1 && notification.label.startsWith('Light:') ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`} aria-live="polite">
                          <p className="font-bold">Rolled {notificationRoll.dice.join(' + ')} = {notificationRoll.total}</p>
                          {notification.label.startsWith('Light:') ? (
                            <p className="mt-1 text-sm">{notificationRoll.total === 1 ? 'The flame goes out.' : 'The light stays lit.'}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="grid gap-3 md:grid-cols-[0.8fr_1.5fr]">
                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Current game time</p>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-2xl font-black text-stone-900">Day {clock.day}</span>
                    <span className="font-semibold text-stone-600">{clock.shift} · {clock.time}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Advance time</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input type="number" min={1} max={1000} value={advanceAmount}
                      onChange={(event) => setAdvanceAmount(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))}
                      className="w-20 rounded-md border border-stone-300 px-3 py-2" aria-label="Amount to advance" />
                    {(['round', 'stretch', 'shift', 'day'] as CampaignTimeAdvanceUnit[]).map((unit) => (
                      <Button key={unit} variant={unit === 'stretch' ? 'primary' : 'outline'} size="sm"
                        disabled={mutation.isPending}
                        onClick={() => run(() => advanceCampaignTime(partyId, state.campaignRevision, unit, advanceAmount))}>
                        + {unitLabel(unit, advanceAmount)}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-stone-500">Round 10 sec · Stretch 15 min · Shift 6 hours · Day 24 hours. Combat rounds advance automatically.</p>
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <h3 className="flex items-center gap-2 font-bold"><Bed className="h-4 w-4 text-emerald-600" /> Rest tracking</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={mutation.isPending}
                      onClick={() => run(() => advanceCampaignTime(partyId, state.campaignRevision, 'round', 1, 'The party took a round rest.'))}>
                      Round rest · 10 sec
                    </Button>
                    <Button size="sm" variant="outline" disabled={mutation.isPending}
                      onClick={() => run(() => advanceCampaignTime(partyId, state.campaignRevision, 'stretch', 1, 'The party took a stretch rest.'))}>
                      Stretch rest · 15 min
                    </Button>
                    <Button size="sm" variant="outline" disabled={mutation.isPending}
                      onClick={() => run(() => advanceCampaignTime(partyId, state.campaignRevision, 'shift', 1, 'The party took a shift rest.'))}>
                      Shift rest · 6 hours
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-stone-500">Apply HP, WP, and condition recovery from the character sheet.</p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-3">
                  <h3 className="flex items-center gap-2 font-bold"><Flame className="h-4 w-4 text-orange-500" /> Light tracking</h3>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <select value={lightSourceId} onChange={(event) => setLightSourceId(event.target.value as typeof lightSourceId)}
                      className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2">
                      {LIGHT_SOURCES.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.diceExpression.toUpperCase()}</option>)}
                    </select>
                    <Button size="sm" variant={selectedLightReminder?.active ? 'danger' : 'primary'} icon={Flame} disabled={mutation.isPending}
                      onClick={() => {
                        if (selectedLightReminder) {
                          run(() => setCampaignTimeReminderActive(partyId, selectedLightReminder.id, state.campaignRevision, !selectedLightReminder.active));
                          return;
                        }
                        run(() => createCampaignTimeReminder(partyId, state.campaignRevision, {
                          label: `Light: ${selectedLightSource.name}`,
                          diceExpression: selectedLightSource.diceExpression,
                          intervalCount: 1,
                          intervalUnit: 'stretch',
                          notes: `${selectedLightSource.detail} Maximum duration: one Shift.`,
                        }));
                      }}>
                      {selectedLightReminder?.active ? 'Extinguish' : selectedLightReminder ? 'Relight' : 'Light'}
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-stone-500">{selectedLightSource.detail} Maximum duration: one Shift.</p>
                </div>
              </section>

              <div className="flex justify-end">
                <Button size="sm" variant="secondary" icon={Dices} onClick={() => setIsRollTableOpen(true)}>
                  Roll on table
                </Button>
              </div>
              </div> : null}

              {activePanel === 'session' ? <section className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  {state.activeSession ? <Play className="w-5 h-5 text-emerald-600" /> : <Pause className="w-5 h-5 text-stone-500" />}
                  <h3 className="font-bold text-lg">{state.activeSession ? state.activeSession.title : 'No active session'}</h3>
                </div>
                {state.activeSession ? (
                  <div className="space-y-3">
                    <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3}
                      placeholder="Session summary (required)" className="w-full rounded-md border border-stone-300 p-3" />
                    <textarea value={unresolvedThreads} onChange={(event) => setUnresolvedThreads(event.target.value)} rows={2}
                      placeholder="Unresolved threads, one per line" className="w-full rounded-md border border-stone-300 p-3" />
                    <Button variant="danger" disabled={!summary.trim() || mutation.isPending}
                      onClick={() => run(() => endCampaignSession(partyId, state.activeSession!.id, state.campaignRevision, {
                        summary: summary.trim(), unresolvedThreads: unresolvedThreads.split('\n').map((line) => line.trim()).filter(Boolean),
                      }))}>
                      End session
                    </Button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    <input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)}
                      placeholder="Session title" className="rounded-md border border-stone-300 px-3 py-2" />
                    <input value={gmNotes} onChange={(event) => setGmNotes(event.target.value)}
                      placeholder="Private GM note (optional)" className="rounded-md border border-stone-300 px-3 py-2" />
                    <div className="md:col-span-2">
                      <Button icon={Play} disabled={!sessionTitle.trim() || mutation.isPending}
                        onClick={() => run(() => startCampaignSession(partyId, state.campaignRevision, { title: sessionTitle.trim(), gmNotes: gmNotes.trim() }))}>
                        Start session
                      </Button>
                    </div>
                  </div>
                )}
              </section> : null}

              {activePanel === 'reminders' ? <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2"><BellRing className="w-5 h-5" /> Roll reminders</h3>
                  <p className="text-sm text-stone-500">Schedule campaign-specific checks. Reminders begin counting from now.</p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <input value={reminderLabel} onChange={(event) => setReminderLabel(event.target.value)} placeholder="Roll name"
                    className="lg:col-span-2 rounded-md border border-stone-300 px-3 py-2" />
                  <input value={diceExpression} onChange={(event) => setDiceExpression(event.target.value)} placeholder="1d12"
                    className="rounded-md border border-stone-300 px-3 py-2" />
                  <input type="number" min={1} max={1000} value={intervalCount}
                    onChange={(event) => setIntervalCount(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))}
                    className="rounded-md border border-stone-300 px-3 py-2" aria-label="Reminder interval" />
                  <select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value as CampaignTimeUnit)}
                    className="rounded-md border border-stone-300 px-3 py-2">
                    <option value="round">Rounds</option><option value="stretch">Stretches</option><option value="shift">Shifts</option>
                  </select>
                  <input value={reminderNotes} onChange={(event) => setReminderNotes(event.target.value)} placeholder="When/why to roll (optional)"
                    className="sm:col-span-2 lg:col-span-4 rounded-md border border-stone-300 px-3 py-2" />
                  <Button icon={Plus} disabled={!reminderLabel.trim() || !diceExpression.trim() || mutation.isPending}
                    onClick={() => run(() => createCampaignTimeReminder(partyId, state.campaignRevision, {
                      label: reminderLabel.trim(), diceExpression: diceExpression.trim(), intervalCount,
                      intervalUnit, notes: reminderNotes.trim(),
                    }))}>Add</Button>
                </div>
                {state.reminders.length > 0 ? (
                  <div className="max-h-[38vh] divide-y divide-stone-200 overflow-y-auto border-t border-stone-200 pr-1">
                    {state.reminders.map((reminder) => (
                      <div key={reminder.id} className="py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold ${reminder.active ? 'text-stone-900' : 'text-stone-400 line-through'}`}>{reminder.label} · {reminder.diceExpression}</p>
                          <p className="text-xs text-stone-500">Every {reminder.intervalCount} {unitLabel(reminder.intervalUnit, reminder.intervalCount)} · next at {reminder.intervalUnit} {reminder.nextDueCount}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" icon={reminder.active ? Pause : Play} disabled={mutation.isPending}
                            onClick={() => run(() => setCampaignTimeReminderActive(partyId, reminder.id, state.campaignRevision, !reminder.active))}>
                            {reminder.active ? 'Pause' : 'Resume'}
                          </Button>
                          {!reminder.active ? (
                            <Button variant="danger" size="sm" icon={Trash2} disabled={mutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Remove the paused reminder “${reminder.label}”?`)) {
                                  run(() => deleteCampaignTimeReminder(partyId, reminder.id, state.campaignRevision));
                                }
                              }}>
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-500 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No scheduled rolls.</p>
                )}
              </section> : null}
            </>
          ) : null}
        </div>

        {isRollTableOpen ? (
          <div className="fixed inset-0 z-[100] bg-black/55 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="roll-table-title">
            <div className="w-full max-w-lg rounded-xl border border-stone-300 bg-stone-50 shadow-2xl overflow-hidden">
              <header className="flex items-center justify-between border-b border-stone-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Dices className="h-5 w-5 text-indigo-600" />
                  <h3 id="roll-table-title" className="text-lg font-bold font-serif text-stone-900">Roll Tables</h3>
                </div>
                <button type="button" onClick={closeRollTable} className="rounded-lg p-2 hover:bg-stone-100" aria-label="Close roll tables">
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="p-4 space-y-4">
                {randomTablesQuery.isLoading ? <div className="py-8 flex justify-center"><LoadingSpinner /></div> : null}
                {randomTablesQuery.error ? <ErrorMessage message={randomTablesQuery.error.message} /> : null}

                {!randomTablesQuery.isLoading && !randomTablesQuery.error && randomTablesQuery.data?.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                    No roll tables have been created for this campaign.
                  </p>
                ) : null}

                {selectedTable && !tableRollResult ? (
                  <>
                    <div>
                      <label htmlFor="session-roll-table" className="mb-1 block text-xs font-bold uppercase tracking-wider text-stone-500">Table</label>
                      <select
                        id="session-roll-table"
                        value={selectedTable.id}
                        onChange={(event) => setSelectedTableId(event.target.value)}
                        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2"
                      >
                        {randomTablesQuery.data?.map((table) => (
                          <option key={table.id} value={table.id}>{table.name} · {table.die_type.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-lg border border-stone-200 bg-white p-3">
                      <p className="font-bold text-stone-900">{selectedTable.name}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{selectedTable.category} · {selectedTable.die_type.toUpperCase()} · {selectedTable.rows.length} entries</p>
                      {selectedTable.description ? <p className="mt-2 text-sm text-stone-600">{selectedTable.description}</p> : null}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={closeRollTable}>Cancel</Button>
                      <Button icon={Dices} onClick={() => {
                        const rolled = rollOnTable(selectedTable);
                        setTableRollResult({ tableName: selectedTable.name, ...rolled });
                      }}>Roll {selectedTable.die_type.toUpperCase()}</Button>
                    </div>
                  </>
                ) : null}

                {tableRollResult ? (
                  <div className="space-y-4" aria-live="polite">
                    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-5 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">{tableRollResult.tableName}</p>
                      <p className="my-2 text-4xl font-black text-stone-900">{tableRollResult.roll}</p>
                      <p className="text-lg font-semibold text-stone-800">{tableRollResult.result}</p>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={closeRollTable}>Dismiss</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
