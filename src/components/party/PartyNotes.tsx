import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Plus, Edit2, Trash2, Save, X, Tag, Book, Search, Filter, ChevronDown, 
  StickyNote, AlertCircle, FileText,
  Bold, Italic, List, ListOrdered, Heading1, Link as LinkIcon, 
  Table as TableIcon, Eye, EyeOff, Quote, Code, Bell
} from 'lucide-react';
import { Button } from '../shared/Button';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { sendMessage } from '../../lib/api/chat';

// --- UPDATED TYPE DEFINITION ---
interface Note {
  id: string;
  user_id: string;
  party_id: string | null; // Handle nullable
  title: string;
  content: string;
  category: string | null; // Handle nullable
  created_at: string;
  updated_at: string;
}

interface PartyNotesProps {
  partyId: string;
  isDM: boolean;
  openNoteId?: string | null;
}

export function PartyNotes({ partyId, openNoteId }: PartyNotesProps) {
  const { user } = useAuth();
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [viewState, setViewState] = useState<'view' | 'create' | 'edit'>('view');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- EDITOR HELPERS ---
  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);
    const newText = before + prefix + selection + suffix + after;
    setContent(newText);
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selection.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleInsertTable = () => {
    const tableTemplate = `\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n`;
    insertMarkdown(tableTemplate);
  };

  // --- FORM HELPERS ---
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setCategory(selectedCategoryFilter !== 'all' ? selectedCategoryFilter : ''); 
    setFormError(null);
    setShowPreview(false);
  }, [selectedCategoryFilter]);

  const openCreateForm = () => {
    resetForm();
    setViewState('create');
    setSelectedNote(null);
  };

  const openEditForm = (note: Note) => {
    setSelectedNote(note);
    setViewState('edit');
    setTitle(note.title);
    setContent(note.content);
    // SAFE CATEGORY HANDLING: Default to empty string if null
    setCategory(note.category || 'General'); 
    setFormError(null);
    setShowPreview(false);
  };

  const closeForm = () => {
    setViewState('view');
    resetForm();
    if (viewState === 'create') setSelectedNote(null);
  };

  // --- DATA FETCHING ---
  const loadNotes = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('notes')
        .select('*')
        .eq('party_id', partyId) // NOTE: This filters out notes where party_id is NULL
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setNotes(data || []);
      
      // SAFE CATEGORY EXTRACTION
      const uniqueCats = Array.from(new Set(
        (data || [])
          .map(n => n.category || 'Uncategorized') // Handle null category
          .filter(Boolean)
      ));
      setCategories(uniqueCats.sort());
    } catch (err) {
      console.error("Error loading party notes:", err);
      setError(err instanceof Error ? err.message : 'Failed to load party notes');
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Deep Linking Effect
  useEffect(() => {
    if (openNoteId && notes.length > 0) {
      const targetNote = notes.find(n => n.id === openNoteId);
      if (targetNote) {
        setSelectedNote(targetNote);
        setViewState('view');
      }
    }
  }, [openNoteId, notes]);

  // --- ACTIONS ---
  const handleSave = async () => {
    if (!user) { setFormError("You must be logged in to save notes."); return; }
    if (!title.trim()) { setFormError("Title is required."); return; }
    // Allow empty category, default to General
    const finalCategory = category.trim() || 'General';

    setIsSaving(true);
    setFormError(null);

    const notePayload = {
      title: title.trim(),
      content: content || '',
      category: finalCategory,
      party_id: partyId,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    try {
      let resultNote: Note | null = null;
      if (viewState === 'edit' && selectedNote) {
        const { data, error } = await supabase.from('notes').update(notePayload).eq('id', selectedNote.id).select().single();
        if (error) throw error;
        resultNote = data;
      } else {
        const { data, error } = await supabase.from('notes').insert([notePayload]).select().single();
        if (error) throw error;
        resultNote = data;
      }
      await loadNotes();
      setViewState('view');
      if (resultNote) setSelectedNote(resultNote);
    } catch (err) {
      console.error("Save error:", err);
      setFormError(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      const { error } = await supabase.from('notes').delete().eq('id', noteId);
      if (error) throw error;
      setSelectedNote(null);
      setViewState('view');
      await loadNotes();
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "Failed to delete note.");
    }
  };

  const handleNotifyParty = async () => {
    if (!selectedNote || !user || !partyId) return;
    const btn = document.getElementById('notify-btn');
    if (btn) btn.innerText = "Sent!";
    
    try {
      const secretTag = `<<<NOTE:${selectedNote.id}:${selectedNote.title}>>>`;
      const message = `${secretTag} Shared a note: ${selectedNote.title}`;
      await sendMessage(partyId, user.id, message);
    } catch (err) {
      console.error("Failed to notify party", err);
      if (btn) btn.innerText = "Failed";
    } finally {
      setTimeout(() => { if (btn) btn.innerHTML = ''; }, 1500);
    }
  };

  // --- FILTERING ---
  const filteredNotes = notes.filter(note => {
    // SAFE NULL CHECKS
    const noteCat = note.category || 'Uncategorized';
    
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = note.title.toLowerCase().includes(searchLower) || 
                          note.content.toLowerCase().includes(searchLower) ||
                          noteCat.toLowerCase().includes(searchLower);
                          
    const matchesCategory = selectedCategoryFilter === 'all' || noteCat === selectedCategoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  // --- RENDER ---
  if (loading && notes.length === 0) return <div className="flex justify-center items-center h-96"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-140px)] bg-gray-50 border-t border-gray-200">
      
      {/* --- LEFT SIDEBAR --- */}
      <div className={`w-full md:w-1/3 lg:w-1/4 bg-white border-r border-gray-200 flex flex-col h-full ${selectedNote ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100 space-y-3 bg-white z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Book className="w-5 h-5 text-indigo-600" /> <span>Notes</span>
            </h2>
            <Button size="sm" onClick={openCreateForm} icon={Plus}>New</Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select value={selectedCategoryFilter} onChange={(e) => setSelectedCategoryFilter(e.target.value)} className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white cursor-pointer">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-50">
          {error && <div className="p-3 mb-2 bg-red-50 text-red-700 text-sm rounded-md flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5"/> {error}</div>}
          {filteredNotes.length === 0 ? (
            <div className="text-center py-12 px-4 text-gray-400">
               <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
               <p className="text-sm">{searchTerm ? 'No matches found.' : 'No notes created yet.'}</p>
            </div>
          ) : (
            filteredNotes.map(note => {
              // Determine category label safely
              const catLabel = note.category || 'Uncategorized';
              
              return (
                <div 
                  key={note.id}
                  onClick={() => { setSelectedNote(note); setViewState('view'); }}
                  className={`p-3 rounded-lg cursor-pointer border transition-all group relative ${selectedNote?.id === note.id ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500 z-10' : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                     <h3 className={`font-semibold text-sm truncate pr-2 ${selectedNote?.id === note.id ? 'text-indigo-700' : 'text-gray-800'}`}>{note.title}</h3>
                     <span className="text-[10px] text-gray-400 whitespace-nowrap">{new Date(note.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                     <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 truncate max-w-[150px] ${selectedNote?.id === note.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                       <Tag size={10} /> {catLabel}
                     </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* --- RIGHT SIDE --- */}
      <div className={`flex-1 bg-white overflow-y-auto p-6 md:p-8 h-full ${!selectedNote && viewState === 'view' ? 'hidden md:block' : ''}`}>
        
        {viewState === 'create' || viewState === 'edit' ? (
          // FORM VIEW
          <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                <h2 className="text-2xl font-bold text-gray-800">{viewState === 'edit' ? 'Edit Note' : 'Create New Note'}</h2>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} /></button>
             </div>

             {formError && <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3 border border-red-100"><AlertCircle size={20} /><p className="text-sm font-medium">{formError}</p></div>}

             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title</label>
                      <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. The Goblin King's Weakness" autoFocus />
                   </div>
                   <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
                      <input type="text" list="categories" value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Lore" />
                      <datalist id="categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
                   </div>
                </div>

                {/* EDITOR */}
                <div>
                   <div className="flex justify-between items-end mb-1.5">
                     <label className="block text-sm font-semibold text-gray-700">Content <span className="text-xs font-normal text-gray-400">(Markdown)</span></label>
                     <button type="button" onClick={() => setShowPreview(!showPreview)} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium">
                       {showPreview ? <><EyeOff size={14}/> Edit</> : <><Eye size={14}/> Preview</>}
                     </button>
                   </div>
                   <div className="border rounded-lg overflow-hidden border-gray-300 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                     {!showPreview && (
                       <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto">
                          <ToolbarButton icon={Bold} label="Bold" onClick={() => insertMarkdown('**', '**')} />
                          <ToolbarButton icon={Italic} label="Italic" onClick={() => insertMarkdown('*', '*')} />
                          <div className="w-px h-4 bg-gray-300 mx-1"></div>
                          <ToolbarButton icon={Heading1} label="Heading" onClick={() => insertMarkdown('# ', '')} />
                          <ToolbarButton icon={Quote} label="Quote" onClick={() => insertMarkdown('> ', '')} />
                          <ToolbarButton icon={Code} label="Code Block" onClick={() => insertMarkdown('```\n', '\n```')} />
                          <div className="w-px h-4 bg-gray-300 mx-1"></div>
                          <ToolbarButton icon={List} label="Bullet List" onClick={() => insertMarkdown('- ', '')} />
                          <ToolbarButton icon={ListOrdered} label="Numbered List" onClick={() => insertMarkdown('1. ', '')} />
                          <div className="w-px h-4 bg-gray-300 mx-1"></div>
                          <ToolbarButton icon={LinkIcon} label="Link" onClick={() => insertMarkdown('[', '](url)')} />
                          <ToolbarButton icon={TableIcon} label="Table" onClick={handleInsertTable} />
                       </div>
                     )}
                     {showPreview ? (
                       <div className="p-4 h-96 overflow-y-auto prose prose-sm max-w-none bg-gray-50/50">
                          <MarkdownRenderer content={content || '*No content*'} />
                       </div>
                     ) : (
                       <textarea 
                         ref={textareaRef}
                         value={content}
                         onChange={e => setContent(e.target.value)}
                         className="w-full p-4 h-96 font-mono text-sm outline-none resize-none bg-white" 
                         placeholder="# Section Header&#10;Write your notes here..."
                       />
                     )}
                   </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                   <Button variant="ghost" onClick={closeForm}>Cancel</Button>
                   <Button variant="primary" icon={Save} onClick={handleSave} isLoading={isSaving} disabled={!title}>Save Note</Button>
                </div>
             </div>
          </div>

        ) : selectedNote ? (
          // VIEW MODE
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
             <div className="flex flex-wrap justify-between items-start gap-4 mb-8 pb-6 border-b border-gray-100">
                <div>
                   <div className="md:hidden mb-2 text-indigo-600 font-medium text-sm cursor-pointer" onClick={() => setSelectedNote(null)}>← Back to List</div>
                   <h1 className="text-3xl font-bold text-gray-900 mb-3">{selectedNote.title}</h1>
                   <div className="flex flex-wrap gap-3 items-center text-sm">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
                        <Tag size={14} /> {selectedNote.category || 'Uncategorized'}
                      </span>
                      <span className="text-gray-400">Last updated: {new Date(selectedNote.updated_at).toLocaleDateString()}</span>
                   </div>
                </div>
                <div className="flex gap-2">
                   <Button id="notify-btn" variant="outline" size="sm" icon={Bell} onClick={handleNotifyParty} title="Share this note in Party Chat">Notify</Button>
                   <Button variant="secondary" size="sm" icon={Edit2} onClick={() => openEditForm(selectedNote)}>Edit</Button>
                   <Button variant="danger_outline" size="sm" icon={Trash2} onClick={() => handleDelete(selectedNote.id)}>Delete</Button>
                </div>
             </div>
             <div className="prose prose-indigo max-w-none text-gray-700">
               <MarkdownRenderer content={selectedNote.content || '*No content provided.*'} />
             </div>
          </div>
        ) : (
          // EMPTY SELECTION STATE
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
             <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6"><StickyNote className="w-10 h-10 text-gray-300" /></div>
             <h3 className="text-xl font-bold text-gray-600 mb-2">Select a Note</h3>
             <p className="max-w-xs text-center mb-8 text-gray-500">Choose a note from the sidebar or create a new one.</p>
             <Button variant="primary" onClick={openCreateForm} icon={Plus}>Create New Note</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded transition-all">
      <Icon size={16} />
    </button>
  );
}