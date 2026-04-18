import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Heart, Image as ImageIcon, Monitor, QrCode, Copy, Eye, Power, RefreshCw, RotateCcw, RotateCw, Shield, Skull, Trash2, Upload, XCircle, Zap } from 'lucide-react';
import { Button } from '../shared/Button';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import {
  DEFAULT_DISPLAY_SLOTS,
  buildPartyDisplayUrl,
  createPartyDisplaySession,
  deleteProjectorImage,
  fetchActivePartyDisplaySession,
  listProjectorImages,
  fetchPartyMaps,
  fetchPartyDisplaySlots,
  getStoredPartyDisplayToken,
  renewPartyDisplaySession,
  revokePartyDisplaySession,
  type ProjectorStoredImage,
  uploadProjectorImages,
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
type DisplaySourceMode = 'active_map' | 'specific_map' | 'custom_image';
const PREVIEW_SIDE_CLASSES: Record<PartyDisplaySlot['corner'], string> = {
  top_left: 'top-3 left-1/2 -translate-x-1/2',
  top_right: 'top-1/2 right-3 -translate-y-1/2',
  bottom_left: 'top-1/2 left-3 -translate-y-1/2',
  bottom_right: 'bottom-3 left-1/2 -translate-x-1/2',
};

function formatCornerLabel(corner: PartyDisplaySlot['corner']) {
  const labels: Record<PartyDisplaySlot['corner'], string> = {
    top_left: 'Top Side',
    top_right: 'Right Side',
    bottom_left: 'Left Side',
    bottom_right: 'Bottom Side',
  };

  return labels[corner];
}

function ProjectorSeatPreviewCard({ member, rotation }: { member: Character; rotation: number }) {
  const activeConditions = Object.entries(member.conditions || {}).filter(([, active]) => active);
  const isDying = member.current_hp === 0;

  return (
    <div
      className={`w-52 rounded-2xl border bg-black/75 text-white shadow-xl backdrop-blur-sm overflow-hidden ${
        isDying ? 'border-red-400/60 ring-2 ring-red-500/40' : 'border-white/15'
      }`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="flex items-center gap-2 p-2.5 border-b border-white/10">
        {member.portrait_url ? (
          <img src={member.portrait_url} alt={member.name} className="h-9 w-9 rounded-full object-cover border border-white/20 bg-black/40 shrink-0" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold shrink-0">
            {member.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-sm truncate">{member.name}</h4>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/55">Preview</p>
        </div>

        <div className={`min-w-[3.9rem] rounded-lg border px-2 py-1.5 ${isDying ? 'bg-red-500/20 border-red-300/30' : 'bg-red-500/10 border-red-400/20'}`}>
          <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.18em] text-red-200">
            <Heart className="h-3 w-3" />
            HP
          </div>
          <div className="mt-0.5 text-sm font-bold leading-none">{member.current_hp}/{member.max_hp}</div>
        </div>

        <div className="min-w-[3.9rem] rounded-lg bg-blue-500/10 border border-blue-400/20 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.18em] text-blue-200">
            <Zap className="h-3 w-3" />
            WP
          </div>
          <div className="mt-0.5 text-sm font-bold leading-none">{member.current_wp}/{member.max_wp}</div>
        </div>
      </div>

      <div className="p-2.5">
        <div className="min-h-[26px] flex flex-wrap gap-1">
          {isDying ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-300/30 bg-red-500/20 px-2 py-1 text-[9px] font-bold uppercase text-red-100">
              <Skull className="w-3 h-3" />
              Dying
            </span>
          ) : null}
          {activeConditions.length > 0 ? (
            activeConditions.slice(0, 3).map(([condition]) => (
              <span key={condition} className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[9px] font-bold uppercase text-white/80">
                {condition}
              </span>
            ))
          ) : !isDying ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase text-emerald-200">
              <Shield className="w-3 h-3" />
              Ready
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface SeatAssignmentModalProps {
  isOpen: boolean;
  partyName: string;
  partyMembers: Character[];
  editableSlots: PartyDisplaySlot[];
  partyMembersById: Map<string, Character>;
  reservedCharacterIds: Set<string>;
  activeSession: boolean;
  isBusy: boolean;
  savePending: boolean;
  onClose: () => void;
  onSave: () => void;
  updateSlot: (corner: PartyDisplaySlot['corner'], updates: Partial<PartyDisplaySlot>) => void;
}

function SeatAssignmentModal({
  isOpen,
  partyName,
  partyMembers,
  editableSlots,
  partyMembersById,
  reservedCharacterIds,
  activeSession,
  isBusy,
  savePending,
  onClose,
  onSave,
  updateSlot,
}: SeatAssignmentModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-stone-200 flex flex-col">
        <div className="p-4 border-b bg-stone-800 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold font-serif">Assign Projector Seats</h3>
            <p className="text-sm text-stone-300">Choose who appears on each side and how that seat is rotated.</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close seat assignment">
            <XCircle size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-stone-50 space-y-4">
          <div className="rounded-xl border border-stone-200 bg-stone-950 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wide text-white/80">Seat Preview</h4>
                <p className="text-xs text-white/50">Matches the side positions used on the live projector.</p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.25em] text-white/40">Preview Canvas</span>
            </div>

            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(245,158,11,0.12),_transparent_35%),linear-gradient(180deg,#111827,#020617)]">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-white/10 bg-black/40 px-5 py-2 text-center backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">{partyName}</p>
                  <p className="text-sm font-semibold text-white/90">Player Display Preview</p>
                </div>
              </div>

              {editableSlots.map((slot) => {
                const member = slot.character_id ? partyMembersById.get(slot.character_id) : null;

                return (
                  <div key={slot.corner} className={`absolute ${PREVIEW_SIDE_CLASSES[slot.corner]}`}>
                    {member ? (
                      <ProjectorSeatPreviewCard member={member} rotation={slot.rotation_deg} />
                    ) : (
                      <div className="rounded-full border border-dashed border-white/20 bg-black/35 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                        {formatCornerLabel(slot.corner)} hidden
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {editableSlots.map((slot) => {
              const disabledCharacterIds = new Set(reservedCharacterIds);
              if (slot.character_id) {
                disabledCharacterIds.delete(slot.character_id);
              }

              return (
                <div key={slot.corner} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
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
        </div>

        <div className="border-t border-stone-200 bg-white px-5 py-4 flex items-center justify-between gap-3">
          <p className="text-xs text-stone-500">Empty seats stay hidden on the projector.</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onSave} disabled={!activeSession} loading={savePending}>
              Save Seats
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProjectorImageLibraryModalProps {
  isOpen: boolean;
  isBusy: boolean;
  selectedImageUrl: string;
  images: ProjectorStoredImage[];
  isLoading: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onDelete: (image: ProjectorStoredImage) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onApplyUrl: (url: string) => void;
}

function ProjectorImageLibraryModal({
  isOpen,
  isBusy,
  selectedImageUrl,
  images,
  isLoading,
  onClose,
  onSelect,
  onDelete,
  onUpload,
  onApplyUrl,
}: ProjectorImageLibraryModalProps) {
  const [customUrl, setCustomUrl] = useState(selectedImageUrl);
  const [previewUrl, setPreviewUrl] = useState(selectedImageUrl);

  useEffect(() => {
    if (isOpen) {
      setCustomUrl(selectedImageUrl);
      setPreviewUrl(selectedImageUrl);
    }
  }, [isOpen, selectedImageUrl]);

  const previewImage = images.find((image) => image.publicUrl === previewUrl)
    || images.find((image) => image.publicUrl === selectedImageUrl)
    || images[0]
    || null;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-stone-200 flex flex-col">
        <div className="p-4 border-b bg-stone-800 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold font-serif flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Projector Image Library
            </h3>
            <p className="text-sm text-stone-300">Upload multiple images or pick one from storage for the projector.</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white" aria-label="Close projector image library">
            <XCircle size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-5 bg-stone-50 flex flex-col gap-5">
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wide text-stone-500">Upload</h4>
                <p className="text-sm text-stone-600">Files are stored in the party folder under `ProjectorDisplays`.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
                <Upload className="w-4 h-4" />
                Upload Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onUpload}
                  disabled={isBusy}
                />
              </label>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
              External Image URL
              <div className="mt-1 flex gap-2">
                <input
                  type="url"
                  value={customUrl}
                  onChange={(event) => setCustomUrl(event.target.value)}
                  placeholder="https://example.com/projector-image.jpg"
                  className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  disabled={isBusy}
                />
                <Button
                  variant="outline"
                  onClick={() => onApplyUrl(customUrl)}
                  disabled={!customUrl.trim() || isBusy}
                >
                  Use URL
                </Button>
              </div>
            </label>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 min-h-0 flex flex-col">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wide text-stone-500">Stored Images</h4>
              <p className="text-sm text-stone-600">Hover or touch a stored image to preview it. Select to use it on the projector.</p>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-500">
                <LoadingSpinner />
                <span>Loading uploaded images...</span>
              </div>
            ) : images.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr] min-h-0 flex-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 content-start overflow-y-auto pr-1 min-h-0 max-h-[50vh] lg:max-h-none">
                  {images.map((image) => {
                    const isSelected = selectedImageUrl === image.publicUrl;
                    const isPreviewed = (previewImage?.publicUrl || selectedImageUrl) === image.publicUrl;

                    return (
                      <div
                        key={image.path}
                        className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                          isSelected
                            ? 'border-stone-800 ring-2 ring-stone-300'
                            : isPreviewed
                              ? 'border-stone-400'
                              : 'border-stone-200 hover:border-stone-400'
                        }`}
                        onMouseEnter={() => setPreviewUrl(image.publicUrl)}
                        onFocus={() => setPreviewUrl(image.publicUrl)}
                        onTouchStart={() => setPreviewUrl(image.publicUrl)}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(image.publicUrl)}
                          disabled={isBusy}
                          className="w-full text-left"
                        >
                          <div className="aspect-[4/3] bg-stone-100 relative">
                            <img src={image.publicUrl} alt={image.name} className="w-full h-full object-cover" />
                            {isSelected ? (
                              <div className="absolute top-2 right-2 rounded-full bg-white/95 p-1 text-stone-800 shadow">
                                <Check className="w-4 h-4" />
                              </div>
                            ) : null}
                          </div>
                          <div className="px-2 py-2 bg-white">
                            <div className="text-xs font-medium text-stone-700 truncate">{image.name}</div>
                            <div className="text-[11px] text-stone-400">
                              {image.updatedAt ? new Date(image.updatedAt).toLocaleString() : 'Uploaded image'}
                            </div>
                          </div>
                        </button>
                        <div className="px-2 pb-2 bg-white">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => onDelete(image)}
                            disabled={isBusy}
                            className="w-full justify-center text-red-700 hover:text-red-800 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-3 lg:sticky lg:top-0 self-start">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-sm font-bold uppercase tracking-wide text-stone-500">Preview</h5>
                      <p className="text-xs text-stone-500">Updates on hover, focus, or touch.</p>
                    </div>
                    {previewImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewUrl(selectedImageUrl)}
                        className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-stone-600 hover:border-stone-400"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    ) : null}
                  </div>

                  {previewImage ? (
                    <>
                      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-stone-200 bg-white">
                        <img src={previewImage.publicUrl} alt={previewImage.name} className="w-full h-full object-contain bg-stone-100" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-stone-800 truncate">{previewImage.name}</div>
                        <div className="text-xs text-stone-500">
                          {previewImage.updatedAt ? new Date(previewImage.updatedAt).toLocaleString() : 'Uploaded image'}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-stone-300 bg-white px-3 py-8 text-sm text-stone-500 text-center">
                      No preview available yet.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-500">
                No uploaded projector images yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
  const [displaySourceMode, setDisplaySourceMode] = useState<DisplaySourceMode>('active_map');
  const [displayMapId, setDisplayMapId] = useState<string | null>(null);
  const [displayImageUrl, setDisplayImageUrl] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isImageLibraryOpen, setIsImageLibraryOpen] = useState(false);
  const [isSeatModalOpen, setIsSeatModalOpen] = useState(false);
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeSessionQuery = useQuery({
    queryKey: ['party-display-session', partyId],
    queryFn: () => fetchActivePartyDisplaySession(partyId),
    enabled: isOpen,
  });

  const activeSession = activeSessionQuery.data;

  const mapsQuery = useQuery({
    queryKey: ['party-projector-maps', partyId],
    queryFn: () => fetchPartyMaps(partyId),
    enabled: isOpen,
  });
  const projectorImagesQuery = useQuery({
    queryKey: ['party-projector-images', partyId],
    queryFn: () => listProjectorImages(partyId),
    enabled: isOpen,
  });

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

  useEffect(() => {
    setDisplayImageUrl(activeSession?.display_image_url || '');
    setDisplayMapId(activeSession?.display_map_id || null);

    if (activeSession?.display_image_url) {
      setDisplaySourceMode('custom_image');
    } else if (activeSession?.display_map_id) {
      setDisplaySourceMode('specific_map');
    } else {
      setDisplaySourceMode('active_map');
    }
  }, [activeSession?.display_image_url, activeSession?.display_map_id]);

  useEffect(() => {
    if (!isOpen) {
      setIsSourceExpanded(false);
      setIsSeatModalOpen(false);
      setShowQr(false);
    }
  }, [isOpen]);

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
      setDisplayMapId(result.session.display_map_id || null);
      setDisplayImageUrl(result.session.display_image_url || '');
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
      setDisplayMapId(null);
      setDisplayImageUrl('');
      setDisplaySourceMode('active_map');
    },
    onError: (error: Error) => {
      setLocalError(error.message);
    },
  });

  const saveLayoutMutation = useMutation({
    mutationFn: () => updatePartyDisplayLayout(
      activeSession!.id,
      editableSlots,
      displaySourceMode === 'custom_image' ? (displayImageUrl.trim() || null) : null,
      displaySourceMode === 'specific_map' ? displayMapId : null
    ),
    onSuccess: (result) => {
      setLocalError(null);
      queryClient.setQueryData(['party-display-session', partyId], result.session);
      queryClient.setQueryData(['party-display-slots', activeSession?.id], result.slots);
      setEditableSlots(result.slots);
      setDisplayMapId(result.session.display_map_id || null);
      setDisplayImageUrl(result.session.display_image_url || '');
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
  const partyMembersById = useMemo(
    () => new Map(partyMembers.map((member) => [member.id, member])),
    [partyMembers]
  );
  const assignedSeatCount = useMemo(
    () => editableSlots.filter((slot) => slot.character_id).length,
    [editableSlots]
  );
  const assignedSeatSummary = useMemo(
    () => editableSlots
      .map((slot) => {
        const member = slot.character_id ? partyMembersById.get(slot.character_id) : null;
        return member ? `${formatCornerLabel(slot.corner)}: ${member.name}` : null;
      })
      .filter(Boolean) as string[],
    [editableSlots, partyMembersById]
  );
  const selectedMap = useMemo(
    () => (mapsQuery.data || []).find((map) => map.id === displayMapId) || null,
    [mapsQuery.data, displayMapId]
  );
  const displaySourceSummary = useMemo(() => {
    if (displaySourceMode === 'custom_image') {
      return displayImageUrl ? 'Custom image selected' : 'No custom image selected';
    }
    if (displaySourceMode === 'specific_map') {
      return selectedMap ? `Map: ${selectedMap.name}` : 'No specific map selected';
    }
    return 'Using the current active map';
  }, [displaySourceMode, displayImageUrl, selectedMap]);

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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    try {
      setLocalError(null);
      const uploadedImages = await uploadProjectorImages(partyId, files);
      await queryClient.invalidateQueries({ queryKey: ['party-projector-images', partyId] });
      if (uploadedImages[0]) {
        setDisplayImageUrl(uploadedImages[0].publicUrl);
      }
      setDisplaySourceMode('custom_image');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to upload projector image.');
    } finally {
      event.target.value = '';
    }
  };

  const handleDeleteProjectorImage = async (image: ProjectorStoredImage) => {
    if (!window.confirm(`Delete "${image.name}" from the projector library?`)) {
      return;
    }

    try {
      setLocalError(null);
      await deleteProjectorImage(image.path);
      await queryClient.invalidateQueries({ queryKey: ['party-projector-images', partyId] });

      if (displayImageUrl === image.publicUrl) {
        setDisplayImageUrl('');
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to delete projector image.');
    }
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
          <ErrorMessage message={localError || (activeSessionQuery.error as Error | undefined)?.message || (slotsQuery.error as Error | undefined)?.message || (mapsQuery.error as Error | undefined)?.message || (projectorImagesQuery.error as Error | undefined)?.message || null} onClose={() => setLocalError(null)} />

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
                    New Link
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
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button variant="outline" icon={Eye} onClick={handlePreview} disabled={!displayUrl}>
                      Open
                    </Button>
                    <Button variant="outline" icon={QrCode} onClick={() => setShowQr((current) => !current)} disabled={!displayUrl}>
                      {showQr ? 'Hide QR' : 'QR'}
                    </Button>
                    <Button variant="outline" icon={RefreshCw} onClick={() => renewSessionMutation.mutate()} loading={renewSessionMutation.isPending}>
                      Extend
                    </Button>
                    <Button variant="danger_outline" icon={Power} onClick={() => revokeSessionMutation.mutate()} loading={revokeSessionMutation.isPending}>
                      Stop
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

            <div className="space-y-5">
              <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Display Source</h3>
                    <p className="text-sm text-stone-600">Choose whether the projector uses the active map, a specific map, or custom artwork.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={isSourceExpanded ? ChevronUp : ChevronDown}
                    iconPosition="right"
                    onClick={() => setIsSourceExpanded((current) => !current)}
                    disabled={!activeSession}
                  >
                    {isSourceExpanded ? 'Close' : 'Source'}
                  </Button>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Current Source</div>
                      <div className="mt-1 text-sm font-semibold text-stone-800">
                        {displaySourceMode === 'active_map' ? 'Active Map' : displaySourceMode === 'specific_map' ? 'Specific Map' : 'Custom Image'}
                      </div>
                      <p className="mt-1 text-sm text-stone-600">{displaySourceSummary}</p>
                    </div>
                    {displaySourceMode === 'custom_image' && displayImageUrl ? (
                      <img src={displayImageUrl} alt="Selected projector artwork" className="h-16 w-24 rounded-lg object-cover border border-stone-200 bg-white shrink-0" />
                    ) : null}
                  </div>

                  {isSourceExpanded ? (
                    <div className="space-y-4 border-t border-stone-200 pt-4">
                      <div className="grid gap-2">
                        <label className={`rounded-lg border px-3 py-3 text-sm ${displaySourceMode === 'active_map' ? 'border-stone-800 bg-stone-100 text-stone-900' : 'border-stone-200 bg-white text-stone-700'}`}>
                          <input
                            type="radio"
                            name="projector-source"
                            className="mr-2"
                            checked={displaySourceMode === 'active_map'}
                            onChange={() => setDisplaySourceMode('active_map')}
                            disabled={!activeSession || isBusy}
                          />
                          Active Map
                        </label>
                        <label className={`rounded-lg border px-3 py-3 text-sm ${displaySourceMode === 'specific_map' ? 'border-stone-800 bg-stone-100 text-stone-900' : 'border-stone-200 bg-white text-stone-700'}`}>
                          <input
                            type="radio"
                            name="projector-source"
                            className="mr-2"
                            checked={displaySourceMode === 'specific_map'}
                            onChange={() => setDisplaySourceMode('specific_map')}
                            disabled={!activeSession || isBusy}
                          />
                          Specific Map
                        </label>
                        <label className={`rounded-lg border px-3 py-3 text-sm ${displaySourceMode === 'custom_image' ? 'border-stone-800 bg-stone-100 text-stone-900' : 'border-stone-200 bg-white text-stone-700'}`}>
                          <input
                            type="radio"
                            name="projector-source"
                            className="mr-2"
                            checked={displaySourceMode === 'custom_image'}
                            onChange={() => setDisplaySourceMode('custom_image')}
                            disabled={!activeSession || isBusy}
                          />
                          Custom Image
                        </label>
                      </div>

                      {displaySourceMode === 'specific_map' ? (
                        <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                          Projector Map
                          <select
                            value={displayMapId || ''}
                            onChange={(event) => setDisplayMapId(event.target.value || null)}
                            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            disabled={!activeSession || isBusy || mapsQuery.isLoading}
                          >
                            <option value="">Choose a map</option>
                            {(mapsQuery.data || []).map((map) => (
                              <option key={map.id} value={map.id}>
                                {map.name}{map.is_active ? ' (Active)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {displaySourceMode === 'custom_image' ? (
                        <div className="rounded-xl border border-stone-200 bg-white p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Projector Image</div>
                            <p className="mt-1 text-sm text-stone-600">
                              {displayImageUrl ? 'Artwork selected for the projector.' : 'No custom image selected yet.'}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            icon={ImageIcon}
                            onClick={() => setIsImageLibraryOpen(true)}
                            disabled={!activeSession || isBusy}
                          >
                            Open Image Library
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Assign Seats</h3>
                    <p className="text-sm text-stone-600">Place characters on the projector sides and hide any unused seats.</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setIsSeatModalOpen(true)}
                    disabled={!activeSession}
                  >
                    Seats
                  </Button>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Seat Coverage</div>
                      <div className="mt-1 text-sm font-semibold text-stone-800">{assignedSeatCount} of {editableSlots.length} seats assigned</div>
                    </div>
                    <div className="text-xs text-stone-500">Unassigned seats stay hidden</div>
                  </div>

                  {assignedSeatSummary.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {assignedSeatSummary.map((summary) => (
                        <span key={summary} className="inline-flex items-center rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700">
                          {summary}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">No seats assigned yet.</p>
                  )}
                </div>
              </section>

              <section className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-stone-500">
                    Save after changing the source, uploaded image, selected map, or seat assignments.
                  </p>
                  <Button onClick={() => saveLayoutMutation.mutate()} disabled={!activeSession} loading={saveLayoutMutation.isPending}>
                    Save
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <SeatAssignmentModal
        isOpen={isSeatModalOpen}
        partyName={partyName}
        partyMembers={partyMembers}
        editableSlots={editableSlots}
        partyMembersById={partyMembersById}
        reservedCharacterIds={reservedCharacterIds}
        activeSession={!!activeSession}
        isBusy={isBusy}
        savePending={saveLayoutMutation.isPending}
        onClose={() => setIsSeatModalOpen(false)}
        onSave={() => saveLayoutMutation.mutate()}
        updateSlot={updateSlot}
      />

      <ProjectorImageLibraryModal
        isOpen={isImageLibraryOpen}
        isBusy={!activeSession || isBusy}
        selectedImageUrl={displayImageUrl}
        images={projectorImagesQuery.data || []}
        isLoading={projectorImagesQuery.isLoading}
        onClose={() => setIsImageLibraryOpen(false)}
        onSelect={(url) => {
          setDisplayImageUrl(url);
          setDisplaySourceMode('custom_image');
          setIsImageLibraryOpen(false);
        }}
        onDelete={handleDeleteProjectorImage}
        onUpload={handleImageUpload}
        onApplyUrl={(url) => {
          setDisplayImageUrl(url.trim());
          setDisplaySourceMode('custom_image');
          setIsImageLibraryOpen(false);
        }}
      />
    </div>
  );
}
