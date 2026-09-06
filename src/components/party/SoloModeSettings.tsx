import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Gauge,
  Shield,
  Sparkles,
  Swords,
  UserRound,
  X,
} from 'lucide-react';
import {
  disableSoloMode,
  enableSoloMode,
  fetchSoloOptions,
  fetchSoloState,
  selectSoloHeroicAbility,
  SoloApiError,
} from '../../lib/api/solo';
import { Button } from '../shared/Button';
import { ConfirmationDialog } from '../shared/ConfirmationDialog';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface SoloModeSettingsProps {
  partyId: string;
  partyName: string;
  isOpen: boolean;
  onClose: () => void;
}

function activationLabel(value?: string | null) {
  if (value === 'passive') return 'Passive';
  if (value === 'contextual') return 'Contextual';
  return 'Manual';
}

export function SoloModeSettings({ partyId, partyName, isOpen, onClose }: SoloModeSettingsProps) {
  const queryClient = useQueryClient();
  const [characterId, setCharacterId] = useState('');
  const [abilityId, setAbilityId] = useState('');
  const [oracleTilt, setOracleTilt] = useState<'even' | 'ask'>('ask');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDisableConfirmOpen, setIsDisableConfirmOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['solo-settings', partyId],
    queryFn: async () => {
      const [options, state] = await Promise.all([
        fetchSoloOptions(partyId),
        fetchSoloState(partyId),
      ]);
      return { options, state };
    },
    enabled: isOpen,
    staleTime: 0,
  });

  const options = settingsQuery.data?.options;
  const state = settingsQuery.data?.state;

  useEffect(() => {
    if (!options) return;
    const configuredCharacterId = options.solo.playerCharacterId
      || (options.characters.length === 1 ? options.characters[0].id : '');
    setCharacterId(configuredCharacterId);
    setAbilityId(
      options.solo.soloHeroicAbilityId
      || options.heroicAbilities.find((ability) => ability.selected)?.id
      || '',
    );
    setOracleTilt(options.solo.oracleSettings?.defaultTilt || 'ask');
  }, [options]);

  useEffect(() => {
    if (isOpen) setSuccessMessage(null);
  }, [isOpen]);

  const orderedAbilities = useMemo(() => {
    if (!options) return [];
    return [...options.heroicAbilities].sort((left, right) => {
      const leftSolo = left.ruleKey?.startsWith('solo.') ? 0 : 1;
      const rightSolo = right.ruleKey?.startsWith('solo.') ? 0 : 1;
      return leftSolo - rightSolo || left.name.localeCompare(right.name);
    });
  }, [options]);

  const selectedCharacter = options?.characters.find((character) => character.id === characterId);
  const selectedAbility = options?.heroicAbilities.find((ability) => ability.id === abilityId);
  const isEnabled = Boolean(options?.solo.enabled);
  const hasBlockingSoloActivity = Boolean(state?.activeMission || state?.activeCombat);

  const saveMutation = useMutation({
    onMutate: () => setSuccessMessage(null),
    mutationFn: async () => {
      if (!options) throw new Error('Solo settings are not loaded.');
      if (!characterId) throw new Error('Select the character who will be the solo hero.');
      if (!abilityId) throw new Error('Select the additional heroic ability for the solo hero.');

      let revision = options.campaignRevision;
      let summary = 'Solo-mode settings are already up to date.';
      const characterChanged = options.solo.playerCharacterId !== characterId;
      const settingsChanged = !options.solo.enabled
        || characterChanged
        || options.solo.mode !== 'custom'
        || options.solo.rulesetVersion !== 'db-solo-v1.2'
        || options.solo.oracleSettings?.defaultTilt !== oracleTilt;

      if (settingsChanged) {
        const enabled = await enableSoloMode(partyId, revision, {
          playerCharacterId: characterId,
          mode: 'custom',
          rulesetVersion: 'db-solo-v1.2',
          oracleDefaultTilt: oracleTilt,
        });
        revision = enabled.campaign_revision;
        summary = enabled.summary;
      }

      if (
        !options.solo.enabled
        || characterChanged
        || options.solo.soloHeroicAbilityId !== abilityId
      ) {
        const selected = await selectSoloHeroicAbility(partyId, revision, abilityId);
        summary = selected.summary;
      }
      return summary;
    },
    onSuccess: async (summary) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-status', partyId] }),
      ]);
      setSuccessMessage(summary);
    },
    onError: async (error) => {
      if (error instanceof SoloApiError && error.code === 'REVISION_CONFLICT') {
        await queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] });
      }
    },
  });

  const disableMutation = useMutation({
    onMutate: () => setSuccessMessage(null),
    mutationFn: async () => {
      if (!options) throw new Error('Solo settings are not loaded.');
      return disableSoloMode(partyId, options.campaignRevision);
    },
    onSuccess: async (result) => {
      setIsDisableConfirmOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-state', partyId] }),
        queryClient.invalidateQueries({ queryKey: ['solo-status', partyId] }),
      ]);
      setSuccessMessage(result.summary);
    },
    onError: async (error) => {
      setIsDisableConfirmOpen(false);
      if (error instanceof SoloApiError && error.code === 'REVISION_CONFLICT') {
        await queryClient.invalidateQueries({ queryKey: ['solo-settings', partyId] });
      }
    },
  });

  if (!isOpen) return null;

  const mutationError = saveMutation.error || disableMutation.error;
  const isMutating = saveMutation.isPending || disableMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-stone-200 bg-gradient-to-r from-indigo-50 to-amber-50 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
                <Sparkles className="h-5 w-5 text-indigo-600" /> Solo mode
              </h2>
              <p className="mt-1 text-sm text-stone-600">Campaign-specific solo configuration for {partyName}.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isMutating}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-white/70 hover:text-stone-700 disabled:opacity-40"
              aria-label="Close solo-mode settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-5 sm:p-6">
            {settingsQuery.isLoading ? (
              <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size="lg" /></div>
            ) : settingsQuery.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="font-bold">Could not load solo-mode settings</div>
                <p className="mt-1">{settingsQuery.error.message}</p>
                <Button className="mt-4" variant="outline" size="sm" onClick={() => settingsQuery.refetch()}>Try again</Button>
              </div>
            ) : options ? (
              <div className="space-y-6">
                <div className={`flex items-start gap-3 rounded-xl border p-4 ${isEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-stone-50'}`}>
                  {isEnabled
                    ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    : <Shield className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" />}
                  <div>
                    <div className={`font-bold ${isEnabled ? 'text-emerald-950' : 'text-stone-800'}`}>
                      Solo mode is {isEnabled ? 'enabled' : 'not enabled'}
                    </div>
                    <p className={`mt-1 text-sm ${isEnabled ? 'text-emerald-800' : 'text-stone-600'}`}>
                      {isEnabled
                        ? 'Solo rules, oracles and the selected heroic ability are active for this campaign.'
                        : 'Choose the solo hero and their additional ability, then save to enable solo play.'}
                    </p>
                  </div>
                </div>

                {options.prerequisites.issues.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <AlertTriangle className="h-4 w-4" /> Setup note
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                      {options.prerequisites.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  </div>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="flex items-center gap-2 text-sm font-bold text-stone-800">
                      <UserRound className="h-4 w-4 text-indigo-600" /> Solo hero
                    </span>
                    <select
                      value={characterId}
                      onChange={(event) => setCharacterId(event.target.value)}
                      disabled={isMutating || options.characters.length === 0 || hasBlockingSoloActivity}
                      className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-stone-100"
                    >
                      <option value="">Select character…</option>
                      {options.characters.map((character) => (
                        <option key={character.id} value={character.id}>
                          {character.name}{character.profession ? ` · ${character.profession}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedCharacter && (
                      <span className="mt-1 block text-xs text-stone-500">
                        {[selectedCharacter.kin, selectedCharacter.profession].filter(Boolean).join(' · ') || 'Campaign character'}
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="flex items-center gap-2 text-sm font-bold text-stone-800">
                      <Gauge className="h-4 w-4 text-indigo-600" /> Fortune default
                    </span>
                    <select
                      value={oracleTilt}
                      onChange={(event) => setOracleTilt(event.target.value as 'even' | 'ask')}
                      disabled={isMutating}
                      className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-stone-100"
                    >
                      <option value="ask">Ask each time</option>
                      <option value="even">Even by default</option>
                    </select>
                    <span className="mt-1 block text-xs text-stone-500">You can still choose likely or unlikely for individual questions.</span>
                  </label>
                </div>

                <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                      <BookOpen className="h-4 w-4" /> Ruleset
                    </div>
                    <div className="mt-1 font-semibold text-stone-900">Dragonbane Solo Adventure v1.2</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                      <Swords className="h-4 w-4" /> Adventure mode
                    </div>
                    <div className="mt-1 font-semibold text-stone-900">Custom solo adventure</div>
                    <div className="text-xs text-stone-500">Deepfall Breach requires an authorized data pack.</div>
                  </div>
                </div>

                <label className="block">
                  <span className="flex items-center gap-2 text-sm font-bold text-stone-800">
                    <Sparkles className="h-4 w-4 text-indigo-600" /> Additional heroic ability
                  </span>
                  <select
                    value={abilityId}
                    onChange={(event) => setAbilityId(event.target.value)}
                    disabled={isMutating || hasBlockingSoloActivity}
                    className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-stone-100"
                  >
                    <option value="">Select heroic ability…</option>
                    {orderedAbilities.map((ability) => (
                      <option key={ability.id} value={ability.id}>
                        {ability.ruleKey?.startsWith('solo.') ? 'Solo · ' : ''}{ability.name}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedAbility && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-indigo-950">{selectedAbility.name}</h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        {activationLabel(selectedAbility.activationType)}
                      </span>
                      {selectedAbility.willpowerCost !== null && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {selectedAbility.willpowerCost} WP
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-indigo-900">{selectedAbility.description}</p>
                    {selectedAbility.ruleKey === 'solo.army_of_one' && (
                      <p className="mt-3 rounded-lg bg-white/70 p-3 text-xs font-medium text-indigo-800">
                        In combat while alone, the hero receives two distinct initiative cards and two turns per round.
                      </p>
                    )}
                    {selectedAbility.ruleKey === 'solo.sole_survivor' && (
                      <p className="mt-3 rounded-lg bg-white/70 p-3 text-xs font-medium text-indigo-800">
                        After an eligible failed test, the hero may spend exactly 3 WP to push without taking a condition.
                      </p>
                    )}
                  </div>
                )}

                {state?.activeMission && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-violet-600">Active mission</div>
                    <div className="mt-1 font-bold text-violet-950">{state.activeMission.title}</div>
                    {state.currentWaypoint?.title && <div className="mt-1 text-sm text-violet-800">Current waypoint: {state.currentWaypoint.title}</div>}
                    {state.activeThreat && (
                      <div className="mt-2 text-sm text-violet-800">
                        Threat {state.activeThreat.counter}/6: {state.activeThreat.description}
                      </div>
                    )}
                  </div>
                )}

                {state?.activeCombat && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-rose-600">Active combat</div>
                    <div className="mt-1 font-bold text-rose-950">{state.activeCombat.name}</div>
                    <p className="mt-1 text-sm text-rose-800">End this encounter before changing the solo hero, heroic ability, or disabling solo mode.</p>
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{successMessage}</div>
                )}
                {mutationError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {mutationError.message}
                    {mutationError instanceof SoloApiError && mutationError.code === 'REVISION_CONFLICT' && (
                      <span className="mt-1 block text-xs">Settings were refreshed. Review them and save again.</span>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {!settingsQuery.isLoading && !settingsQuery.error && options && (
            <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {isEnabled && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isMutating || hasBlockingSoloActivity}
                    title={hasBlockingSoloActivity ? 'Complete the active solo mission or combat first.' : undefined}
                    onClick={() => setIsDisableConfirmOpen(true)}
                  >
                    Disable solo mode
                  </Button>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose} disabled={isMutating}>Close</Button>
                <Button
                  variant="primary"
                  loading={saveMutation.isPending}
                  disabled={isMutating || !options.prerequisites.hasCharacter || !characterId || !abilityId}
                  onClick={() => saveMutation.mutate()}
                >
                  {isEnabled ? 'Save solo settings' : 'Enable solo mode'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={isDisableConfirmOpen}
        onClose={() => setIsDisableConfirmOpen(false)}
        onConfirm={() => disableMutation.mutate()}
        title="Disable solo mode?"
        description="Solo oracles and special ability behavior will stop for this campaign. Draconi removes only an additional heroic ability it originally granted; abilities the character already owned are preserved."
        confirmText="Disable Solo Mode"
        isDestructive={true}
        isLoading={disableMutation.isPending}
        icon={<AlertTriangle className="h-6 w-6 text-red-500" />}
      />
    </>
  );
}
