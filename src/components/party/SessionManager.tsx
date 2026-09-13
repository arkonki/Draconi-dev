import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CalendarClock, Check, Pause, Play, Plus, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import {
  advanceCampaignTime,
  createCampaignTimeReminder,
  endCampaignSession,
  fetchCampaignTimeState,
  resolveCampaignTimeNotification,
  setCampaignTimeReminderActive,
  startCampaignSession,
  type CampaignTimeUnit,
} from '../../lib/api/campaignTime';

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
  partyName: string;
}

function unitLabel(unit: CampaignTimeUnit, amount: number) {
  return `${unit}${amount === 1 ? '' : 's'}`;
}

function clockLabel(elapsedSeconds: number) {
  const day = Math.floor(elapsedSeconds / 86400) + 1;
  const secondsToday = elapsedSeconds % 86400;
  const hour = Math.floor(secondsToday / 3600);
  const minute = Math.floor((secondsToday % 3600) / 60);
  const shift = ['Morning', 'Day', 'Evening', 'Night'][Math.floor(hour / 6)] || 'Night';
  return { day, shift, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

export function SessionManager({ isOpen, onClose, partyId, partyName }: SessionManagerProps) {
  const queryClient = useQueryClient();
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

  const stateQuery = useQuery({
    queryKey: ['campaign-time', partyId],
    queryFn: () => fetchCampaignTimeState(partyId),
    enabled: isOpen,
    refetchInterval: isOpen ? 15000 : false,
  });
  const state = stateQuery.data;
  const clock = useMemo(() => clockLabel(state?.gameTime.elapsedSeconds || 0), [state?.gameTime.elapsedSeconds]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/65 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-stone-50 rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden border border-stone-300 flex flex-col">
        <header className="p-4 border-b bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarClock className="w-6 h-6 text-amber-300" />
            <div>
              <h2 className="text-xl font-bold font-serif">Game Session & Time</h2>
              <p className="text-sm text-stone-300">{partyName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close session manager">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="overflow-y-auto p-4 md:p-6 space-y-5">
          {stateQuery.isLoading ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div> : null}
          {stateQuery.error ? <ErrorMessage message={stateQuery.error.message} /> : null}
          {mutation.error ? <ErrorMessage message={mutation.error.message} /> : null}

          {state ? (
            <>
              {state.pendingNotifications.length > 0 ? (
                <section className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-3" aria-live="assertive">
                  <div className="flex items-center gap-2 text-amber-900 font-bold">
                    <BellRing className="w-5 h-5" /> {state.pendingNotifications.length} roll{state.pendingNotifications.length === 1 ? '' : 's'} due
                  </div>
                  {state.pendingNotifications.map((notification) => (
                    <div key={notification.id} className="bg-white border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1">
                        <p className="font-bold text-stone-900">{notification.label} · {notification.diceExpression}</p>
                        <p className="text-xs text-stone-600">Due at {notification.dueUnit} {notification.dueCount}{notification.notes ? ` · ${notification.notes}` : ''}</p>
                      </div>
                      <Button size="sm" icon={Check} disabled={mutation.isPending}
                        onClick={() => run(() => resolveCampaignTimeNotification(partyId, notification.id, state.campaignRevision))}>
                        Mark handled
                      </Button>
                    </div>
                  ))}
                </section>
              ) : null}

              <section className="grid md:grid-cols-[1fr_1.2fr] gap-4">
                <div className="rounded-xl bg-white border border-stone-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Current game time</p>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-3xl font-black text-stone-900">Day {clock.day}</span>
                    <span className="text-lg font-semibold text-stone-600">{clock.shift} · {clock.time}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded bg-stone-100 p-2"><b className="block text-base">{state.gameTime.rounds}</b>Rounds</div>
                    <div className="rounded bg-stone-100 p-2"><b className="block text-base">{state.gameTime.stretches}</b>Stretches</div>
                    <div className="rounded bg-stone-100 p-2"><b className="block text-base">{state.gameTime.shifts}</b>Shifts</div>
                  </div>
                </div>

                <div className="rounded-xl bg-white border border-stone-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Advance time</p>
                  <div className="mt-3 flex gap-2">
                    <input type="number" min={1} max={1000} value={advanceAmount}
                      onChange={(event) => setAdvanceAmount(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))}
                      className="w-20 rounded-md border border-stone-300 px-3 py-2" aria-label="Amount to advance" />
                    {(['round', 'stretch', 'shift'] as CampaignTimeUnit[]).map((unit) => (
                      <Button key={unit} variant={unit === 'stretch' ? 'primary' : 'outline'} size="sm"
                        disabled={mutation.isPending}
                        onClick={() => run(() => advanceCampaignTime(partyId, state.campaignRevision, unit, advanceAmount))}>
                        + {unitLabel(unit, advanceAmount)}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-stone-500">1 round = 10 seconds · 1 stretch = 15 minutes · 1 shift = 6 hours. Timed equipment and the Time tab update together. Active combat advances the round clock automatically.</p>
                </div>
              </section>

              <section className="rounded-xl bg-white border border-stone-200 p-4">
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
              </section>

              <section className="rounded-xl bg-white border border-stone-200 p-4 space-y-4">
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
                  <div className="divide-y divide-stone-200 border-t border-stone-200">
                    {state.reminders.map((reminder) => (
                      <div key={reminder.id} className="py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold ${reminder.active ? 'text-stone-900' : 'text-stone-400 line-through'}`}>{reminder.label} · {reminder.diceExpression}</p>
                          <p className="text-xs text-stone-500">Every {reminder.intervalCount} {unitLabel(reminder.intervalUnit, reminder.intervalCount)} · next at {reminder.intervalUnit} {reminder.nextDueCount}</p>
                        </div>
                        <Button variant="outline" size="sm" icon={reminder.active ? Pause : Play} disabled={mutation.isPending}
                          onClick={() => run(() => setCampaignTimeReminderActive(partyId, reminder.id, state.campaignRevision, !reminder.active))}>
                          {reminder.active ? 'Pause' : 'Resume'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-500 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No scheduled rolls.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
