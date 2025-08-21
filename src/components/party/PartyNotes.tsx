import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Save, X, Tag, Book, Search, Filter, ChevronDown, StickyNote } from 'lucide-react';
import { Button } from '../shared/Button';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

interface Note {
  id: string;
  user_id: string;
  party_id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
}

interface PartyNotesProps {
  partyId: string;
  isDM: boolean; // Retained for potential future use, though not directly used in RLS here
}

export function PartyNotes({ partyId, isDM }: PartyNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null); // Stores ID of note being edited

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setCategory(selectedCategoryFilter === 'all' ? '' : selectedCategoryFilter); // Pre-fill if filter active
    setFormError(null);
  }, [selectedCategoryFilter]);

  const openCreateForm = () => {
    resetForm();
    setIsCreating(true);
    setIsEditing(null);
    setSelectedNote(null);
  };

  const openEditForm = (note: Note) => {
    setSelectedNote(note);
    setIsEditing(note.id);
    setIsCreating(false);
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category);
    setFormError(null);
  };

  const closeForm = () => {
    setIsCreating(false);
    setIsEditing(null);
    resetForm();
    if (isEditing) setSelectedNote(null); // Clear selection if we were editing
  };

  const loadNotes = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('notes')
        .select('*')
        .eq('party_id', partyId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setNotes(data || []);

      const uniqueCategories = Array.from(new Set(data?.map(note => note.category).filter(Boolean) || []));
      setCategories(uniqueCategories);
    } catch (err) {
      console.error("Error loading party notes:", err);
      setError(err instanceof Error ? err.message : 'Failed to load party notes');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleSave = async () => {
    if (!user) {
      setFormError("User not authenticated.");
      return;
    }
    if (!title.trim()) {
      setFormError("Note title cannot be empty.");
      return;
    }
    if (!category.trim()) {
      setFormError("Note category cannot be empty.");
      return;
    }

    setFormError(null);

    const noteData = {
      title: title.trim(),
      content: content || '',
      category: category.trim(),
      party_id: partyId,
      user_id: user.id, // Ensure user_id is always set
      updated_at: new Date().toISOString(),
    };
    
    try {
      let newSelectedNote: Note | null = null;
      if (isEditing) {
        const { data: updatedData, error: updateError } = await supabase
          .from('notes')
          .update(noteData)
          .eq('id', isEditing)
          .select()
          .single();
        if (updateError) throw updateError;
        newSelectedNote = updatedData;
      } else {
        // For new notes, created_at is handled by default in DB or can be omitted if not needed in payload
        const { updated_at, ...insertData } = noteData; 
        const { data: insertedData, error: insertError } = await supabase
          .from('notes')
          .insert([insertData])
          .select()
          .single();
        if (insertError) throw insertError;
        newSelectedNote = insertedData;
      }
      
      closeForm();
      await loadNotes();
      if (newSelectedNote) {
        setSelectedNote(newSelectedNote);
      }

    } catch (err) {
      console.error("Error saving note:", err);
      let specificError = 'Failed to save note.';
      if (err instanceof Error) {
        if (err.message.includes('RLS')) specificError = "Permission denied. Could not save the note due to security policies.";
        else if ('code' in err && err.code === '23505') specificError = "A note with this title might already exist in this party.";
        else specificError = `Failed to save note: ${err.message}`;
      }
      setFormError(specificError);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) {
      return;
    }
    try {
      setError(null); // Clear general errors
      const { error: deleteError } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId);

      if (deleteError) throw deleteError;
      
      await loadNotes();
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
      }
      if (isEditing === noteId) {
        closeForm();
      }
    } catch (err) {
      console.error("Error deleting note:", err);
      setError(err instanceof Error ? `Failed to delete note: ${err.message}` : 'An unknown error occurred while deleting.');
    }
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          note.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'all' || note.category === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading && notes.length === 0 && !partyId) { // Check if partyId is missing
    return (
      <div className="p-4">
        <ErrorMessage message="Party ID is missing. Cannot load notes." />
      </div>
    );
  }
  
  if (loading && notes.length === 0) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-200px)]"> {/* Adjust height as needed */}
        <LoadingSpinner size="lg" />
        <p className="text-lg text-gray-600 ml-3">Loading party notes...</p>
      </div>
    );
  }

  const showForm = isCreating || isEditing;

  return (
    <div className="flex h-[calc(100vh-150px)] overflow-hidden bg-gray-50"> {/* Adjust height based on parent container */}
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Book className="w-5 h-5 text-indigo-600" />
              Party Notes
            </h2>
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
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              id="category-filter"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white text-sm"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <ChevronDown className="w-3 h-3 fill-current text-gray-500" />
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto">
          {error && !showForm && (
            <div className="p-3">
              <ErrorMessage message={error} onClose={() => setError(null)} />
            </div>
          )}
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  if (!isEditing || isEditing !== note.id) {
                     setSelectedNote(note);
                     setIsCreating(false);
                     setIsEditing(null);
                  }
                }}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedNote?.id === note.id && !showForm ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                } ${isEditing === note.id ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''}`}
              >
                <h3 className="font-semibold text-sm truncate">{note.title}</h3>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <Tag className="w-2.5 h-2.5" />
                  <span className="truncate">{note.category}</span>
                </div>
              </div>
            ))
          ) : !loading && (
            <div className="p-4 text-center text-gray-500">
              <StickyNote className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              {searchTerm || selectedCategoryFilter !== 'all' ? 'No notes match filters.' : 'No notes in this party yet.'}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        {showForm ? (
          // Create/Edit Form
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                {isEditing ? 'Edit Party Note' : 'Create New Party Note'}
              </h2>
              <button
                onClick={closeForm}
                className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
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

            <div className="space-y-5">
              <div>
                <label htmlFor="note-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="note-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="note-category" className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="note-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="e.g., Quests, Locations, NPCs"
                    list="category-suggestions"
                    required
                  />
                  {categories.length > 0 && (
                     <>
                      <datalist id="category-suggestions">
                        {categories.map(cat => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm"
                        aria-label="Select existing category"
                      >
                        <option value="" disabled>Select existing...</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                     </>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="note-content" className="block text-sm font-medium text-gray-700 mb-1">
                  Content (Markdown supported)
                </label>
                <textarea
                  id="note-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  placeholder="Enter your notes here..."
                />
              </div>
            </div>
            <div className="mt-6 pt-4 border-t flex justify-end gap-3">
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSave}
                disabled={loading || !title.trim() || !category.trim()}
              >
                {loading ? 'Saving...' : (isEditing ? 'Update Note' : 'Save Note')}
              </Button>
            </div>
          </div>
        ) : selectedNote ? (
          // Selected Note View
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 max-w-4xl mx-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">{selectedNote.title}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <Tag className="w-3 h-3" />
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{selectedNote.category}</span>
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
                  onClick={() => handleDelete(selectedNote.id)}
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
          // Placeholder when no note is selected
          <div className="text-center py-20">
            <StickyNote className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-xl font-medium text-gray-500">Select a party note to view its details</p>
            <p className="text-sm text-gray-400">Or, create a new note using the button in the sidebar.</p>
            {error && (
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
