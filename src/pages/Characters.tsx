import { useState } from 'react';
import { Plus, AlertCircle, LogIn, Trash2, AlertTriangle, Check, Users, Shield, X } from 'lucide-react';
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

  // State
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Data Fetching
  const { data: characters = [], isLoading, error } = useQuery<Character[], Error>({
    queryKey: ['characters', user?.id],
    queryFn: () => fetchCharacters(user?.id),
    enabled: !!user,
  });

  // Mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCharacters,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', user?.id] });
      setSelectedIds([]);
      setIsSelectionMode(false);
      setIsDeleteDialogOpen(false);
    },
    onError: (err) => {
      console.error('Failed to delete characters:', err);
      setIsDeleteDialogOpen(false);
    },
  });

  // Handlers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCardClick = (event: React.MouseEvent, characterId: string) => {
    // Enter selection logic if:
    // 1. We are explicitly in selection mode
    // 2. The user is holding Shift
    // 3. We aren't in selection mode, but the user clicked an item while others are already selected (optional intuitive flow)
    if (isSelectionMode || event.shiftKey || selectedIds.length > 0) {
      event.preventDefault();
      if (!isSelectionMode) setIsSelectionMode(true);
      toggleSelection(characterId);
    } else {
      navigate(`/character/${characterId}`);
    }
  };

  const handleCancelSelection = () => {
    setSelectedIds([]);
    setIsSelectionMode(false);
  };

  // Render Logic
  if (isLoading) return <div className="flex justify-center items-center h-96"><LoadingSpinner size="lg" /></div>;
  if (error) return <div className="p-8"><ErrorMessage message={error.message} /></div>;
  if (!user) return <div className="p-8"><EmptyState icon={AlertCircle} title="Authentication Required" description="Please sign in." /></div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 min-h-[calc(100vh-4rem)] relative pb-24">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">My Characters</h1>
          <p className="text-gray-500 mt-1">Manage your roster or create a new hero.</p>
        </div>

        {!isCreating && characters.length > 0 && (
          <div className="flex items-center gap-3 w-full md:w-auto">
            {!isSelectionMode ? (
              <>
                <Button variant="ghost" onClick={() => setIsSelectionMode(true)} className="text-gray-500 hover:text-gray-900">
                  Select...
                </Button>
                <div className="h-6 w-px bg-gray-300 mx-1 hidden md:block"></div>
                <Button variant="secondary" icon={LogIn} onClick={() => setIsJoining(true)}>Join Party</Button>
                <Button variant="primary" icon={Plus} onClick={() => setIsCreating(true)}>Create New</Button>
              </>
            ) : (
              <Button variant="ghost" onClick={handleCancelSelection}>Cancel Selection</Button>
            )}
          </div>
        )}
      </div>

      {/* --- CONTENT --- */}
      {isCreating ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <CharacterCreationWizard onComplete={() => {
            setIsCreating(false);
            queryClient.invalidateQueries({ queryKey: ['characters', user?.id] });
          }} />
        </div>
      ) : characters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {characters.map((character) => {
            const isSelected = selectedIds.includes(character.id!);
            return (
              <div
                key={character.id}
                className={`
                  group relative cursor-pointer rounded-xl transition-all duration-200
                  ${isSelected 
                    ? 'ring-4 ring-indigo-500 ring-offset-2 transform scale-[0.98]' 
                    : isSelectionMode 
                      ? 'hover:ring-4 hover:ring-gray-200 hover:ring-offset-2' 
                      : 'hover:-translate-y-1 hover:shadow-lg'
                  }
                `}
                onClick={(e) => handleCardClick(e, character.id!)}
              >
                {/* Selection Overlay / Checkbox */}
                {isSelectionMode && (
                  <div className={`absolute top-3 right-3 z-10 rounded-full p-1 transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400 group-hover:bg-gray-300'}`}>
                    <Check size={16} className={isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'} />
                  </div>
                )}
                
                <CharacterCard character={character} />
                
                {/* Click Overlay for Selection Mode (ensures distinct click area) */}
                {isSelectionMode && <div className="absolute inset-0 z-0 rounded-xl bg-white/0" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-12">
          <EmptyState
            icon={Shield}
            title="The Tavern is Empty"
            description="You haven't created any characters yet. Start your journey today!"
            action={
              <Button variant="primary" size="lg" icon={Plus} onClick={() => setIsCreating(true)}>
                Create Your First Character
              </Button>
            }
          />
        </div>
      )}

      {/* --- FLOATING ACTION BAR (Selection Mode) --- */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in slide-in-from-bottom-6 fade-in">
          <div className="bg-white border border-gray-200 shadow-2xl rounded-2xl p-3 flex items-center justify-between ring-1 ring-black/5">
            <div className="flex items-center gap-3 pl-2">
              <div className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {selectedIds.length}
              </div>
              <span className="text-sm font-medium text-gray-700">Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancelSelection}>Cancel</Button>
              <Button 
                variant="danger" 
                size="sm" 
                icon={Trash2} 
                onClick={() => setIsDeleteDialogOpen(true)}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --- DIALOGS --- */}
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
          if (selectedIds.length > 0) deleteMutation.mutate(selectedIds);
        }}
        title={`Delete ${selectedIds.length} Character${selectedIds.length > 1 ? 's' : ''}?`}
        description="These heroes will be lost to the void forever. This action cannot be undone."
        confirmText="Yes, Delete Forever"
        isDestructive
        isLoading={deleteMutation.isPending}
        icon={<AlertTriangle className="h-6 w-6 text-red-600" />}
      />
    </div>
  );
}
