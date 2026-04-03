import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, QrCode, Copy, Eye, Power, RefreshCw, RotateCw, XCircle } from 'lucide-react';
import { Button } from '../shared/Button';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import {
  DEFAULT_DISPLAY_SLOTS,
  buildPartyDisplayUrl,
  createPartyDisplaySession,
  fetchActivePartyDisplaySession,
  fetchPartyDisplaySlots,
  getStoredPartyDisplayToken,
  renewPartyDisplaySession,
  revokePartyDisplaySession,
  updatePartyDisplayLayout,
} from '../../lib/api/projectorDisplay';
import type { PartyDisplaySlot } from '../../types/projectorDisplay';
import type { Character } from '../../types/character';

interface ProjectorDisplayManagerProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
  partyName: string;
  partyMembers: Character[];
}

const ROTATION_PRESETS = [0, 90, 180, 270];

function formatCornerLabel(corner: PartyDisplaySlot['corner']) {
  return corner
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ProjectorDisplayManager({
  isOpen,
  onClose,
  partyId,
  partyName,
  partyMembers,
}: ProjectorDisplayManagerProps) {
  const queryClient = useQueryClient();
  const [editableSlots, setEditableSlots] = useState<PartyDisplaySlot[]>(DEFAULT_DISPLAY_SLOTS);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeSessionQuery = useQuery({
    queryKey: ['party-display-session', partyId],
    queryFn: () => fetchActivePartyDisplaySession(partyId),
    enabled: isOpen,
  });

  const activeSession = activeSessionQuery.data;

  const slotsQuery = useQuery({
    queryKey: ['party-display-slots', activeSession?.id],
    queryFn: () => fetchPartyDisplaySlots(activeSession!.id),
    enabled: isOpen && !!activeSession?.id,
  });

  useEffect(() => {
    if (slotsQuery.data && slotsQuery.data.length > 0) {
      setEditableSlots(slotsQuery.data);
    } else if (!activeSession) {
      setEditableSlots(DEFAULT_DISPLAY_SLOTS);
    }
  }, [slotsQuery.data, activeSession]);

  const storedToken = activeSession ? getStoredPartyDisplayToken(partyId, activeSession.id) : null;
  const displayUrl = storedToken ? buildPartyDisplayUrl(storedToken) : null;
  const qrUrl = displayUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(displayUrl)}`
    : null;

  const createSessionMutation = useMutation({
    mutationFn: () => createPartyDisplaySession(partyId),
    onSuccess: (result) => {
      setLocalError(null);
      setShowQr(false);
      queryClient.setQueryData(['party-display-session', partyId], result.session);
      queryClient.setQueryData(['party-display-slots', result.session.id], result.slots);
      setEditableSlots(result.slots);
    },
    onError: (error: Error) => {
      setLocalError(error.message);
    },
  });

  const renewSessionMutation = useMutation({
    mutationFn: () => renewPartyDisplaySession(activeSession!.id),
    onSuccess: (session) => {
      setLocalError(null);
      queryClient.setQueryData(['party-display-session', partyId], session);
    },
    onError: (error: Error) => {
      setLocalError(error.message);
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: () => revokePartyDisplaySession(activeSession!.id, partyId),
    onSuccess: () => {
      setLocalError(null);
      setShowQr(false);
      queryClient.setQueryData(['party-display-session', partyId], null);
      queryClient.removeQueries({ queryKey: ['party-display-slots', activeSession?.id] });
      setEditableSlots(DEFAULT_DISPLAY_SLOTS);
    },
    onError: (error: Error) => {
      setLocalError(error.message);
    },
  });

  const saveLayoutMutation = useMutation({
    mutationFn: () => updatePartyDisplayLayout(activeSession!.id, editableSlots),
    onSuccess: (slots) => {
      setLocalError(null);
      queryClient.setQueryData(['party-display-slots', activeSession?.id], slots);
      setEditableSlots(slots);
    },
    onError: (error: Error) => {
      setLocalError(error.message);
    },
  });

  const isBusy = createSessionMutation.isPending || renewSessionMutation.isPending || revokeSessionMutation.isPending || saveLayoutMutation.isPending;

  const reservedCharacterIds = useMemo(
    () => new Set(editableSlots.map((slot) => slot.character_id).filter(Boolean)),
    [editableSlots]
  );

  const handleCopyLink = async () => {
    if (!displayUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy projector link', error);
      setLocalError('Failed to copy projector link.');
    }
  };

  const handlePreview = () => {
    if (!displayUrl) {
      return;
    }

    window.open(displayUrl, '_blank', 'noopener,noreferrer');
  };

  const updateSlot = (corner: PartyDisplaySlot['corner'], updates: Partial<PartyDisplaySlot>) => {
    setEditableSlots((currentSlots) =>
      currentSlots.map((slot) =>
        slot.corner === corner
          ? {
              ...slot,
              ...updates,
            }
          : slot
      )
    );
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-stone-200 flex flex-col">
        <div className="p-4 border-b bg-stone-800 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-serif flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Projector Display
            </h2>
            <p className="text-sm text-stone-300">{partyName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close projector display manager">
            <XCircle size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-stone-50 space-y-5">
          <ErrorMessage message={localError || (activeSessionQuery.error as Error | undefined)?.message || (slotsQuery.error as Error | undefined)?.message || null} onClose={() => setLocalError(null)} />

          {(activeSessionQuery.isLoading || (activeSession && slotsQuery.isLoading)) && (
            <div className="flex items-center gap-3 text-stone-600">
              <LoadingSpinner />
              <span>Loading projector session...</span>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
            <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Display Link</h3>
                  <p className="text-sm text-stone-600">Create or rotate a read-only projector link for this party.</p>
                </div>
                {!activeSession ? (
                  <Button icon={Monitor} onClick={() => createSessionMutation.mutate()} loading={createSessionMutation.isPending}>
                    Start Projector Display
                  </Button>
                ) : (
                  <Button variant="secondary" icon={RotateCw} onClick={() => createSessionMutation.mutate()} loading={createSessionMutation.isPending}>
                    Rotate Link
                  </Button>
                )}
              </div>

              {activeSession ? (
                <>
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <span><strong>Status:</strong> Active</span>
                      <span><strong>Expires:</strong> {new Date(activeSession.expires_at).toLocaleString()}</span>
                      <span><strong>Last Seen:</strong> {activeSession.last_seen_at ? new Date(activeSession.last_seen_at).toLocaleString() : 'Not yet connected'}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 border-b bg-stone-50 text-xs font-bold uppercase tracking-wide text-stone-500">
                      Projector URL
                    </div>
                    <div className="px-3 py-3 text-sm text-stone-700 break-all">
                      {displayUrl || 'This session was created in another browser. Rotate the link here to generate a new projector URL.'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      icon={copied ? RefreshCw : Copy}
                      onClick={handleCopyLink}
                      disabled={!displayUrl}
                    >
                      {copied ? 'Copied' : 'Copy Link'}
                    </Button>
                    <Button variant="outline" icon={Eye} onClick={handlePreview} disabled={!displayUrl}>
                      Preview
                    </Button>
                    <Button variant="outline" icon={QrCode} onClick={() => setShowQr((current) => !current)} disabled={!displayUrl}>
                      {showQr ? 'Hide QR' : 'Show QR'}
                    </Button>
                    <Button variant="outline" icon={RefreshCw} onClick={() => renewSessionMutation.mutate()} loading={renewSessionMutation.isPending}>
                      Extend 12h
                    </Button>
                    <Button variant="danger_outline" icon={Power} onClick={() => revokeSessionMutation.mutate()} loading={revokeSessionMutation.isPending}>
                      Stop / Revoke
                    </Button>
                  </div>

                  {showQr && qrUrl && (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 flex flex-col items-center text-center">
                      <img src={qrUrl} alt="QR code for projector display link" className="w-56 h-56 rounded-lg border border-stone-200 bg-white p-2" />
                      <p className="mt-3 text-sm text-stone-600">Scan from the projector browser to open the player display.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No projector session is active yet. Start one to generate a display link and configure the player corners.
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Assign Seats</h3>
                <p className="text-sm text-stone-600">Choose who appears in each projector corner and set the rotation for that seat.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {editableSlots.map((slot) => {
                  const disabledCharacterIds = new Set(reservedCharacterIds);
                  if (slot.character_id) {
                    disabledCharacterIds.delete(slot.character_id);
                  }

                  return (
                    <div key={slot.corner} className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-stone-800">{formatCornerLabel(slot.corner)}</h4>
                        <span className="text-xs uppercase tracking-wide text-stone-400">Seat {slot.sort_order + 1}</span>
                      </div>

                      <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                        Character
                        <select
                          value={slot.character_id || ''}
                          onChange={(event) => updateSlot(slot.corner, { character_id: event.target.value || null })}
                          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                          disabled={!activeSession || isBusy}
                        >
                          <option value="">Unassigned</option>
                          {partyMembers.map((member) => (
                            <option key={member.id} value={member.id} disabled={disabledCharacterIds.has(member.id)}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                        Rotation
                        <input
                          type="number"
                          value={slot.rotation_deg}
                          onChange={(event) => updateSlot(slot.corner, { rotation_deg: Number(event.target.value) || 0 })}
                          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                          disabled={!activeSession || isBusy}
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        {ROTATION_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => updateSlot(slot.corner, { rotation_deg: preset })}
                            disabled={!activeSession || isBusy}
                            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                              slot.rotation_deg === preset
                                ? 'bg-stone-800 text-white border-stone-800'
                                : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
                            }`}
                          >
                            {preset}&deg;
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-stone-500">
                  The projector page only shows the active map, encounter banner, and these four player corners.
                </p>
                <Button onClick={() => saveLayoutMutation.mutate()} disabled={!activeSession} loading={saveLayoutMutation.isPending}>
                  Save Seats
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
