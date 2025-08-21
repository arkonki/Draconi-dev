import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Book, Search, Filter, Edit2, Trash2, Save, X, ChevronDown, ChevronRight, StickyNote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MarkdownRenderer } from '../components/shared/MarkdownRenderer';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { Button } from '../components/shared/Button'; // Import Button

interface Note {
  id: string;
  title: string;
  content: string;
  category?: string;
  user_id: string;
  character_id: string | null;
  party_id: string | null;
  created_at: string;
  updated_at?: string;
  character?: {
    name: string;
  };
  party?: {
    name: string;
  };
}

interface Character {
  id: string;
  name: string;
}

interface Party {
  id: string;
  name: string;
}

export function Notes() {
  const { user, isDM } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null); // Stores ID of note being edited

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<string>('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'character' | 'party' | 'personal'>('all');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null); // Specific error for the form

  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setSelectedCharacter('');
    setSelectedParty('');
    setFormError(null);
  }, []);

  const openCreateForm = () => {
    resetForm();
    setIsCreating(true);
    setIsEditing(null);
    setSelectedNote(null); // Clear selected note when creating a new one
  };

  const openEditForm = (note: Note) => {
    setSelectedNote(note); // Keep selected note for context if needed, or clear
    setIsEditing(note.id);
    setIsCreating(false); // Ensure not in "create" mode
    setTitle(note.title);
    setContent(note.content);
    setSelectedCharacter(note.character_id || '');
    setSelectedParty(note.party_id || '');
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setIsEditing(null);
    resetForm();
    // If a note was selected before editing, re-select it.
    // This might need adjustment based on desired UX.
    // For now, if we were editing, we clear the selection.
    if (isEditing) setSelectedNote(null);
  };

  const loadNotes = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const noteMap = new Map<string, Note>();

      const { data: userNotes, error: userNotesError } = await supabase
        .from('notes')
        .select(`*, character:characters(name), party:parties(name)`)
        .eq('user_id', user.id);
      if (userNotesError) throw userNotesError;
      (userNotes || []).forEach(note => noteMap.set(note.id, note));

      if (isDM()) {
        const { data: dmPartiesData, error: dmPartiesError } = await supabase
          .from('parties')
          .select('id')
          .eq('created_by', user.id);
        if (dmPartiesError) throw dmPartiesError;
        const partyIds = (dmPartiesData || []).map(p => p.id);

        if (partyIds.length > 0) {
          const { data: partyNotesData, error: partyNotesError } = await supabase
            .from('notes')
            .select(`*, character:characters(name), party:parties(name)`)
            .in('party_id', partyIds);
          if (partyNotesError) throw partyNotesError;
          (partyNotesData || []).forEach(note => noteMap.set(note.id, note));
        }
      }
      
      const combinedNotes = Array.from(noteMap.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotes(combinedNotes);

    } catch (err) {
      console.error("Error loading notes:", err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [user, isDM]);

  const loadCharacters = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error: charError } = await supabase
        .from('characters')
        .select('id, name')
        .eq('user_id', user.id);
      if (charError) throw charError;
      setCharacters(data || []);
    } catch (err) {
      console.error("Error loading characters:", err);
      setError(prev => prev || (err instanceof Error ? err.message : 'Failed to load characters'));
    }
  }, [user]);

  const loadParties = useCallback(async () => {
    if (!user || !isDM()) return;
    try {
      const { data, error: partyError } = await supabase
        .from('parties')
        .select('id, name')
        .eq('created_by', user.id);
      if (partyError) throw partyError;
      setParties(data || []);
    } catch (err) {
      console.error("Error loading parties:", err);
      setError(prev => prev || (err instanceof Error ? err.message : 'Failed to load parties'));
    }
  }, [user, isDM]);

  useEffect(() => {
    if (user) {
      loadNotes();
      loadCharacters();
      if (isDM()) {
        loadParties();
      }
    } else {
      setLoading(false);
      setNotes([]);
      setCharacters([]);
      setParties([]);
      setSelectedNote(null);
      closeForm();
    }
  }, [user, isDM, loadNotes, loadCharacters, loadParties]);


  async function handleSubmit() {
    if (!user) {
      setFormError("User not authenticated.");
      return;
    }
    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }

    setFormError(null); // Clear previous form errors

    const characterId = selectedCharacter || null;
    const partyId = selectedParty || null;

    if (characterId && partyId) {
      setFormError('A note can be linked to either a character OR a party, not both.');
      return;
    }

    const noteData = {
      title: title.trim(),
      content,
      user_id: user.id,
      character_id: characterId,
      party_id: partyId,
      updated_at: new Date().toISOString(),
    };

    try {
      let newSelectedNote: Note | null = null;
      if (isEditing) {
        const { data: updatedData, error: updateError } = await supabase
          .from('notes')
          .update(noteData)
          .eq('id', isEditing)
          .select(`*, character:characters(name), party:parties(name)`)
          .single();
        if (updateError) throw updateError;
        newSelectedNote = updatedData;
      } else {
        const { updated_at, ...insertData } = noteData; // created_at is default
        const { data: insertedData, error: insertError } = await supabase
          .from('notes')
          .insert([insertData])
          .select(`*, character:characters(name), party:parties(name)`)
          .single();
        if (insertError) throw insertError;
        newSelectedNote = insertedData;
      }
      
      closeForm();
      await loadNotes(); // Reload all notes
      if (newSelectedNote) {
        setSelectedNote(newSelectedNote); // Select the newly created/updated note
      }

    } catch (err) {
      console.error("Error saving note:", err);
      setFormError(err instanceof Error ? `Failed to save note: ${err.message}` : 'An unknown error occurred.');
    }
  }

  async function deleteNote(id: string) {
    if (!window.confirm("Are you sure you want to delete this note?")) {
      return;
    }
    try {
      setError(null);
      const { error: deleteError } = await supabase.from('notes').delete().eq('id', id);
      if (deleteError) throw deleteError;
      
      await loadNotes();
      if (selectedNote?.id === id) {
        setSelectedNote(null); // Clear selection if deleted note was selected
      }
      if (isEditing === id) { // If deleted note was being edited
        closeForm();
      }
    } catch (err) {
      console.error("Error deleting note:", err);
      setError(err instanceof Error ? `Failed to delete note: ${err.message}` : 'An unknown error occurred.');
    }
  }

  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'personal' && !note.character_id && !note.party_id) ||
      (filterType === 'character' && !!note.character_id) ||
      (filterType === 'party' && !!note.party_id);

    return matchesSearch && matchesFilter;
  });

  if (loading && notes.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
        <p className="text-lg text-gray-600 ml-3">Loading notes...</p>
      </div>
    );
  }
  
  const showForm = isCreating || isEditing;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Book className="w-6 h-6 text-blue-600" />
              Notes
            </h1>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={openCreateForm}
            >
              New Note
            </Button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'personal' | 'character' | 'party')}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              aria-label="Filter notes"
            >
              <option value="all">All Notes</option>
              <option value="personal">My Personal Notes</option>
              <option value="character">Character Notes</option>
              <option value="party">Party Notes</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <ChevronDown className="w-4 h-4 fill-current text-gray-500" />
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto">
          {error && !showForm && ( // Show general error in sidebar if not in form view
            <div className="p-4">
              <ErrorMessage message={error} onClose={() => setError(null)} />
            </div>
          )}
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  if (!isEditing || isEditing !== note.id) { // Don't change selection if editing current note
                     setSelectedNote(note);
                     setIsCreating(false); // Ensure create form is closed
                     setIsEditing(null); // Ensure edit form is closed for other notes
                  }
                }}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedNote?.id === note.id && !showForm ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                } ${isEditing === note.id ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''}`}
              >
                <h3 className="font-semibold text-sm truncate">{note.title}</h3>
                <p className="text-xs text-gray-500 truncate">
                  {note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '')}
                </p>
                <div className="text-xs text-gray-400 mt-1">
                  {note.character ? (
                    <span className="inline-block bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">Char: {note.character.name}</span>
                  ) : note.party ? (
                    <span className="inline-block bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs">Party: {note.party.name}</span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">Personal</span>
                  )}
                </div>
              </div>
            ))
          ) : !loading && (
            <div className="p-4 text-center text-gray-500">
              <StickyNote className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              {searchTerm || filterType !== 'all' ? 'No notes match.' : 'No notes yet.'}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        {showForm ? (
          // Create/Edit Form
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {isEditing ? 'Edit Note' : 'Create New Note'}
              </h2>
              <button
                onClick={closeForm}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4">
                <ErrorMessage message={formError} onClose={() => setFormError(null)} />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter note title"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="character" className="block text-sm font-medium text-gray-700 mb-1">
                    Link to Character (Optional)
                  </label>
                  <select
                    id="character"
                    value={selectedCharacter}
                    onChange={(e) => {
                      setSelectedCharacter(e.target.value);
                      if (e.target.value) setSelectedParty('');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    disabled={!!selectedParty}
                  >
                    <option value="">None</option>
                    {characters.map((char) => (
                      <option key={char.id} value={char.id}>
                        {char.name}
                      </option>
                    ))}
                  </select>
                </div>

                {isDM() && (
                  <div>
                    <label htmlFor="party" className="block text-sm font-medium text-gray-700 mb-1">
                      Link to Party (Optional, DM Only)
                    </label>
                    <select
                      id="party"
                      value={selectedParty}
                      onChange={(e) => {
                        setSelectedParty(e.target.value);
                        if (e.target.value) setSelectedCharacter('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      disabled={!!selectedCharacter}
                    >
                      <option value="">None</option>
                      {parties.map((party) => (
                        <option key={party.id} value={party.id}>
                          {party.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                  Content (Markdown supported)
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="Enter note content..."
                />
                <p className="text-xs text-gray-500 mt-1">Use Markdown for formatting.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={closeForm}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={Save}
                  onClick={handleSubmit}
                  disabled={!title.trim()}
                >
                  {isEditing ? 'Update Note' : 'Save Note'}
                </Button>
              </div>
            </div>
          </div>
        ) : selectedNote ? (
          // Selected Note View
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 max-w-4xl mx-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">{selectedNote.title}</h1>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedNote.character ? (
                    <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Character: {selectedNote.character.name}</span>
                  ) : selectedNote.party ? (
                    <span className="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded">Party: {selectedNote.party.name}</span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Personal</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Edit2}
                  onClick={() => openEditForm(selectedNote)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger_outline"
                  size="sm"
                  icon={Trash2}
                  onClick={() => deleteNote(selectedNote.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <div className="prose prose-sm max-w-none text-gray-700">
              <MarkdownRenderer content={selectedNote.content} />
            </div>
            <div className="text-xs text-gray-400 mt-6 pt-3 border-t border-gray-200">
              Created: {new Date(selectedNote.created_at).toLocaleDateString()}
              {selectedNote.updated_at && new Date(selectedNote.updated_at).getTime() !== new Date(selectedNote.created_at).getTime() && (
                <span> | Updated: {new Date(selectedNote.updated_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        ) : (
          // Placeholder when no note is selected and not creating/editing
          <div className="text-center py-20">
            <StickyNote className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-xl font-medium text-gray-500">Select a note to view its details</p>
            <p className="text-sm text-gray-400">Or, create a new note using the button in the sidebar.</p>
            {error && ( // Show general error here if no note selected and not in form
                <div className="mt-6 max-w-md mx-auto">
                    <ErrorMessage message={error} onClose={() => setError(null)} />
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
