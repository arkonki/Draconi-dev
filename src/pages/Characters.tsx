import { useState } from 'react';
import { Plus, AlertCircle, LogIn, Trash2, AlertTriangle, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Character } from '../types/character';
import { CharacterCard } from '../components/character/CharacterCard';
import { useAuth } from '../contexts/AuthContext';
import { CharacterCreationWizard } from '../components/character/CharacterCreationWizard';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { EmptyState } from '../components/shared/EmptyState';
import { Button } from '../components/shared/Button';
import { fetchCharacters, deleteCharacters } from '../lib/api/characters';
import { JoinPartyDialog } from '../components/party/JoinPartyDialog';
import { ConfirmationDialog } from '../components/shared/ConfirmationDialog';

export function Characters() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: characters = [], isLoading, error } = useQuery<Character[], Error>({
    queryKey: ['characters', user?.id],
    queryFn: () => fetchCharacters(user?.id),
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCharacters,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', user?.id] });
      setSelectedIds([]);
      setIsDeleteDialogOpen(false);
      // TODO: Add a success toast notification
    },
    onError: (err) => {
      console.error('Failed to delete characters:', err);
      setIsDeleteDialogOpen(false);
      // TODO: Add an error toast notification
    },
  });

  const handleCardClick = (event: React.MouseEvent, characterId: string) => {
    if (event.shiftKey) {
      event.preventDefault();
      setSelectedIds((prev) =>
        prev.includes(characterId)
          ? prev.filter((id) => id !== characterId)
          : [...prev, characterId]
      );
    } else {
      if (selectedIds.length > 0) {
        // If in selection mode, a normal click shouldn't navigate
        // to avoid accidental navigation when trying to shift-click.
        // You could also clear selection here if preferred.
        return;
      }
      navigate(`/character/${characterId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center items-center h-full">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorMessage message={error.message || 'Failed to load characters'} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8">
        <EmptyState
          icon={AlertCircle}
          title="Authentication Required"
          description="Please sign in to view your characters."
        />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Characters</h1>
          {characters.length > 0 && !isCreating && (
            <div className="relative group flex items-center">
              <Info className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors" />
              <div className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-xs -translate-x-1/2 transform rounded-lg bg-gray-900 px-3 py-2 text-center text-sm font-normal text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none">
                Hold <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Shift</kbd> and click cards to select multiple for deletion.
                <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-gray-900"></div>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => setIsDeleteDialogOpen(true)}
              loading={deleteMutation.isPending}
            >
              Delete ({selectedIds.length})
            </Button>
          )}
          <Button variant="secondary" icon={LogIn} onClick={() => setIsJoining(true)}>
            Join Party
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setIsCreating(true)}>
            Create Character
          </Button>
        </div>
      </div>

      {isCreating ? (
        <CharacterCreationWizard onComplete={() => {
          setIsCreating(false);
          queryClient.invalidateQueries({ queryKey: ['characters', user?.id] });
        }} />
      ) : characters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <div
              key={character.id}
              className="relative group cursor-pointer"
              onClick={(e) => handleCardClick(e, character.id!)}
            >
              <div
                className={`absolute inset-0 rounded-lg border-2 transition-all duration-200 pointer-events-none ${
                  selectedIds.includes(character.id!)
                    ? 'border-red-500 shadow-lg'
                    : 'border-transparent group-hover:border-blue-500'
                }`}
              />
              <CharacterCard character={character} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Plus}
          title="No Characters Yet"
          description="Create your first character to begin your adventure."
          action={
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setIsCreating(true)}
            >
              Create Your First Character
            </Button>
          }
        />
      )}

      <JoinPartyDialog
        isOpen={isJoining}
        onClose={() => setIsJoining(false)}
        onJoin={(partyId) => {
          setIsJoining(false);
          navigate(`/party/join/${partyId}`);
        }}
      />

      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => {
          if (selectedIds.length > 0) {
            deleteMutation.mutate(selectedIds);
          }
        }}
        title={`Delete ${selectedIds.length} ${selectedIds.length > 1 ? 'Characters' : 'Character'}?`}
        description="Are you sure you want to permanently delete the selected character(s)? All of their data will be lost. This action cannot be undone."
        confirmText={`Yes, Delete ${selectedIds.length}`}
        isLoading={deleteMutation.isPending}
        isDestructive
        icon={<AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />}
      />
    </div>
  );
}
