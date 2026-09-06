import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse, Plus, X } from 'lucide-react';
import {
  fetchCharacterInjuries,
  resolveCharacterInjuryAction,
  rollCharacterSevereInjury,
} from '../../lib/api/injuries';
import type { SoloCharacterInjury } from '../../lib/api/solo';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface CharacterInjuriesPanelProps {
  campaignId: string;
  characterId: string;
  inActiveCombat: boolean;
  onStatus: (message: string) => void;
}

type InjuryDialog = {
  action: 'roll' | 'medical_care' | 'mark_healed';
  injury?: SoloCharacterInjury;
} | null;

function recoveryLabel(injury: SoloCharacterInjury) {
  if (injury.permanent) return 'Permanent';
  const shifts = injury.remainingHealingShifts;
  if (shifts === null || shifts === undefined) return 'No recovery time';
  if (shifts === 0) return 'Healed';
  const days = Math.floor(shifts / 4);
  const remainder = shifts % 4;
  return [
    days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '',
    remainder > 0 ? `${remainder} shift${remainder === 1 ? '' : 's'}` : '',
    'remaining',
  ].filter(Boolean).join(' ');
}

export function CharacterInjuriesPanel({
  campaignId,
  characterId,
  inActiveCombat,
  onStatus,
}: CharacterInjuriesPanelProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<InjuryDialog>(null);
  const [context, setContext] = useState('');

  const queryKey = ['character-injuries', campaignId, characterId];
  const injuriesQuery = useQuery({
    queryKey,
    queryFn: () => fetchCharacterInjuries(campaignId, characterId),
    staleTime: 0,
  });
  const state = injuriesQuery.data;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!state || !dialog) throw new Error('Severe-injury state is not ready.');
      if (dialog.action === 'roll') {
        return rollCharacterSevereInjury(
          campaignId,
          characterId,
          state.campaignRevision,
          context,
        );
      }
      if (!dialog.injury) throw new Error('Choose a severe injury.');
      return resolveCharacterInjuryAction(
        campaignId,
        characterId,
        dialog.injury.id,
        state.campaignRevision,
        dialog.action,
        context,
      );
    },
    onSuccess: async (result) => {
      setDialog(null);
      setContext('');
      onStatus(result.summary);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const openDialog = (next: NonNullable<InjuryDialog>) => {
    mutation.reset();
    setContext('');
    setDialog(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  if (injuriesQuery.isLoading) return <div className="flex justify-center py-4"><LoadingSpinner size="sm" /></div>;
  if (injuriesQuery.error) return <p className="text-sm text-red-700">{injuriesQuery.error.message}</p>;
  if (!state) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-stone-500">
          Recovery advances automatically after a shift rest.
        </div>
        {state.canManage && (
          <Button size="sm" icon={Plus} onClick={() => openDialog({ action: 'roll' })}>
            Roll injury
          </Button>
        )}
      </div>

      {state.activeInjuries.length === 0 ? (
        <div className="rounded border border-dashed border-stone-300 bg-stone-50 p-3 text-center text-sm text-stone-500">
          No active severe injuries.
        </div>
      ) : (
        <div className="space-y-2">
          {state.activeInjuries.map((injury) => {
            const attemptedThisShift = injury.lastTreatmentShift === state.shiftCount;
            return (
              <div key={injury.id} className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">{injury.name}</div>
                    <div className="text-xs font-semibold text-amber-700">{recoveryLabel(injury)}</div>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    {injury.recoveryStatus}
                  </span>
                </div>
                <div className="mt-1 text-xs text-amber-900">{injury.effect}</div>
                {injury.medicalCareApplied && (
                  <div className="mt-1 text-xs font-semibold text-emerald-700">Medical care applied · recovery time halved</div>
                )}
                {attemptedThisShift && !injury.medicalCareApplied && (
                  <div className="mt-1 text-xs font-semibold text-stone-600">Medical care already attempted this shift</div>
                )}
                {state.canManage && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!injury.permanent && !injury.medicalCareApplied && (
                      <Button
                        size="sm"
                        icon={HeartPulse}
                        disabled={attemptedThisShift || inActiveCombat}
                        onClick={() => openDialog({ action: 'medical_care', injury })}
                      >
                        Medical care
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openDialog({ action: 'mark_healed', injury })}>
                      Mark healed
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {state.injuryHistory.length > 0 && (
        <details className="rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-600">
          <summary className="cursor-pointer font-bold">Resolved injuries ({state.injuryHistory.length})</summary>
          <div className="mt-2 space-y-1.5">
            {state.injuryHistory.map((injury) => (
              <div key={injury.id}><strong>{injury.name}</strong>{injury.healedAt ? ` · healed ${new Date(injury.healedAt).toLocaleDateString()}` : ''}</div>
            ))}
          </div>
        </details>
      )}

      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="w-full max-w-md rounded border-4 border-[#1a472a] bg-[#fdfbf7] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#1a472a]">
                  {dialog.action === 'roll' ? 'Roll Severe Injury' : dialog.injury?.name}
                </h3>
                <p className="mt-1 text-xs text-stone-600">
                  {dialog.action === 'roll'
                    ? 'The server rolls D20, determines the injury, and rolls its healing time.'
                    : dialog.action === 'medical_care'
                      ? `Roll Healing ${state.character.skills?.Healing ?? '—'}. Success halves the remaining recovery time.`
                      : 'This confirmed override immediately marks the injury healed and keeps an audit event.'}
                </p>
              </div>
              <button type="button" onClick={() => setDialog(null)} disabled={mutation.isPending} aria-label="Close" className="p-1 text-stone-500 hover:text-stone-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            {dialog.action === 'mark_healed' && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                Use this only when the injury was healed outside the tracker or needs a GM correction. Permanent injuries can only be removed this way.
              </div>
            )}
            <label className="mt-4 block text-sm font-bold text-stone-700">
              Narrative context <span className="font-normal text-stone-400">(optional)</span>
              <textarea value={context} onChange={(event) => setContext(event.target.value)} maxLength={2000} rows={3} className="mt-1.5 w-full rounded border border-stone-300 bg-white px-3 py-2 font-normal" />
            </label>
            {mutation.error && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{mutation.error.message}</div>}
            <Button type="submit" fullWidth className="mt-4" loading={mutation.isPending} variant={dialog.action === 'mark_healed' ? 'danger' : 'primary'} icon={HeartPulse}>
              {dialog.action === 'roll' ? 'Roll and Record Injury' : dialog.action === 'medical_care' ? 'Roll Healing and Apply Care' : 'Confirm and Mark Healed'}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
