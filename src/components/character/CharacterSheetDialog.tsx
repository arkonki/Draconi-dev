import React from 'react';
import type { Character } from '../../types/character';
import type { SoloState } from '../../lib/api/solo';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { CharacterSheet } from './CharacterSheet';

interface CharacterSheetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  onRetry: () => void;
  members?: Character[];
  selectedMemberId?: string | null;
  onSelectMember?: (memberId: string) => void;
  soloState?: SoloState;
  layer?: 'base' | 'nested' | 'critical';
}

export function CharacterSheetDialog({
  isOpen,
  onClose,
  title,
  isLoading,
  isReady,
  error,
  onRetry,
  members = [],
  selectedMemberId,
  onSelectMember,
  soloState,
  layer = 'base',
}: CharacterSheetDialogProps) {
  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Character Sheet"
      description={title}
      ariaLabel={`${title} character sheet`}
      size="sheet"
      layer={layer}
      fullScreenMobile
      panelClassName="sm:h-[92dvh] border border-stone-300"
      headerClassName="bg-stone-800 text-white border-stone-700"
      titleClassName="font-serif text-white"
      bodyClassName="flex flex-col bg-[#f5f0e1]"
      bodyScrollable={false}
    >
      {members.length > 1 && onSelectMember && (
        <div className="shrink-0 border-b border-stone-300 bg-stone-100 px-3 py-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Party members">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectMember(member.id)}
                role="tab"
                id={`character-sheet-tab-${member.id}`}
                aria-selected={member.id === selectedMemberId}
                aria-controls={`character-sheet-panel-${member.id}`}
                tabIndex={member.id === selectedMemberId ? 0 : -1}
                className={`min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  member.id === selectedMemberId
                    ? 'border-stone-300 bg-white text-stone-900 shadow-sm'
                    : 'border-transparent bg-stone-200/70 text-stone-600 hover:bg-white hover:text-stone-900'
                }`}
              >
                {member.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        role={members.length > 1 ? 'tabpanel' : undefined}
        id={members.length > 1 ? `character-sheet-panel-${selectedMemberId ?? 'default'}` : undefined}
        aria-labelledby={members.length > 1 && selectedMemberId ? `character-sheet-tab-${selectedMemberId}` : undefined}
      >
        {error ? (
          <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
            <p className="font-semibold text-red-700">{error}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button variant="primary" onClick={onRetry}>Retry</Button>
            </div>
          </div>
        ) : isLoading || !isReady ? (
          <div className="flex min-h-full items-center justify-center gap-3 p-6 text-stone-600">
            <LoadingSpinner />
            <span className="font-medium">Loading character sheet...</span>
          </div>
        ) : (
          <CharacterSheet embedded soloState={soloState} />
        )}
      </div>
    </AccessibleDialog>
  );
}
