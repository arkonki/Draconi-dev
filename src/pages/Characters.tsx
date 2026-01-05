import { useState } from 'react';
import { Plus, AlertCircle, LogIn, Trash2, AlertTriangle, Check, Shield, X, MoreHorizontal, ListChecks } from 'lucide-react';
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
import { VersionDisplay } from '../components/shared/VersionDisplay'; 

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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 min-h-[calc(100vh-4rem)] relative pb-28 md:pb-12">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">My Characters</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">Manage your roster or create a new hero.</p>
        </div>

        {!isCreating && characters.length > 0 && (
          <div className="w-full md:w-auto">
            {!isSelectionMode ? (
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                
                {/* Primary Action: Pushed to top on mobile, right on desktop */}
                <Button 
                  variant="primary" 
                  icon={Plus} 
                  onClick={() => setIsCreating(true)} 
                  className="w-full md:w-auto justify-center md:order-3 shadow-sm h-11 md:h-10"
                >
                  Create New
                </Button>

                {/* Divider (Desktop Only) */}
                <div className="hidden md:block h-6 w-px bg-gray-300 mx-1 md:order-2"></div>

                {/* Secondary Actions: Grid on mobile, Flex on desktop */}
                <div className="grid grid-cols-2 gap-3 md:flex md:gap-2 md:order-1">
                  <Button 
                    variant="outline" 
                    icon={ListChecks} 
                    onClick={() => setIsSelectionMode(true)} 
                    className="justify-center border-gray-300 text-gray-700 md:border-transparent md:text-gray-500 md:hover:text-gray-900 md:hover:bg-gray-100 h-11 md:h-10"
                  >
                    Select
                  </Button>
                  
                  <Button 
                    variant="secondary" 
                    icon={LogIn} 
                    onClick={() => setIsJoining(true)} 
                    className="justify-center h-11 md:h-10"
                  >
                    Join Party
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end w-full">
                <Button variant="ghost" onClick={handleCancelSelection} icon={X}>Cancel Selection</Button>
              </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {characters.map((character) => {
            const isSelected = selectedIds.includes(character.id!);
            return (
              <div
                key={character.id}
                className={`
                  group relative cursor-pointer rounded-xl transition-all duration-200 select-none
                  ${isSelected 
                    ? 'ring-2 ring-indigo-500 ring-offset-2 transform scale-[0.98]' 
                    : isSelectionMode 
                      ? 'ring-1 ring-gray-200 hover:ring-2 hover:ring-gray-300' 
                      : 'hover:-translate-y-1 hover:shadow-lg'
                  }
                `}
                onClick={(e) => handleCardClick(e, character.id!)}
              >
                {/* Selection Checkbox */}
                {(isSelectionMode || isSelected) && (
                  <div className={`
                    absolute top-3 right-3 z-20 rounded-full p-1 transition-all duration-200 shadow-sm
                    ${isSelected ? 'bg-indigo-600 text-white scale-100' : 'bg-white border border-gray-200 text-gray-300 scale-100'}
                  `}>
                    <Check size={14} strokeWidth={3} className={isSelected ? 'opacity-100' : 'opacity-0'} />
                  </div>
                )}
                
                <CharacterCard character={character} />
                
                {/* Click Overlay */}
                {isSelectionMode && <div className="absolute inset-0 z-10 rounded-xl bg-white/0" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-12 md:mt-20 px-4">
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
        <div className="fixed bottom-6 left-0 right-0 z-50 px-4 flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-white border border-gray-200 shadow-2xl rounded-2xl p-2 pl-4 pr-2 flex items-center justify-between ring-1 ring-black/5 w-full max-w-sm md:max-w-md backdrop-blur-xl bg-white/95">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[1.5rem] text-center">
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

      <VersionDisplay />
    </div>
  );
}