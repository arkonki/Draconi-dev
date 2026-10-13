import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCharacterSheetStore } from '../stores/characterSheetStore';
import type { Character } from '../types/character';

/**
 * Opens a character's full sheet in a modal and puts back whatever sheet was loaded before, the same way the
 * party overview does. `members` are the characters the viewer may switch between inside the modal.
 */
export function useCharacterSheetModal(currentUserId: string | undefined, members: Character[]) {
  const {
    character: viewedCharacter,
    isLoading,
    error,
    fetchCharacter,
    setCharacter,
  } = useCharacterSheetStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previousRef = useRef<Character | null>(null);
  const requestRef = useRef(0);
  const restoreRef = useRef(false);

  const restorePrevious = useCallback(() => {
    const previous = previousRef.current;
    previousRef.current = null;
    restoreRef.current = false;
    setCharacter(previous ?? null);
  }, [setCharacter]);

  const load = useCallback((characterId: string) => {
    if (!currentUserId) return;
    restoreRef.current = false;
    const requestId = ++requestRef.current;
    void fetchCharacter(characterId, currentUserId).finally(() => {
      if (requestRef.current !== requestId) return;
      if (restoreRef.current) restorePrevious();
    });
  }, [currentUserId, fetchCharacter, restorePrevious]);

  const open = useCallback((characterId: string) => {
    if (!currentUserId) return;
    if (!isOpen) previousRef.current = useCharacterSheetStore.getState().character;
    setSelectedId(characterId);
    setIsOpen(true);
    load(characterId);
  }, [currentUserId, isOpen, load]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedId(null);
    restoreRef.current = true;
    if (!useCharacterSheetStore.getState().isLoading) restorePrevious();
  }, [restorePrevious]);

  const select = useCallback((characterId: string) => {
    if (characterId === selectedId) return;
    setSelectedId(characterId);
    load(characterId);
  }, [load, selectedId]);

  const retry = useCallback(() => { if (selectedId) load(selectedId); }, [load, selectedId]);

  useEffect(() => () => {
    if (previousRef.current || restoreRef.current) restorePrevious();
  }, [restorePrevious]);

  const selected = useMemo(() => members.find((member) => member.id === selectedId) ?? null, [members, selectedId]);

  return {
    open,
    /** Props for CharacterSheetDialog. */
    dialogProps: {
      isOpen,
      onClose: close,
      title: selected?.name || 'Character',
      isLoading,
      isReady: Boolean(selectedId && viewedCharacter?.id === selectedId),
      error,
      onRetry: retry,
      members,
      selectedMemberId: selectedId,
      onSelectMember: select,
    },
  };
}
