import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Book, Search, Filter, Edit2, Trash2, Save, X, ChevronDown,
  StickyNote, AlertCircle, User, Users, FileText, ArrowLeft,
  Bold, Italic, List, ListOrdered, Heading1, Link as LinkIcon,
  Table as TableIcon, Eye, EyeOff, Quote, Code, Maximize2, Minimize2 // <--- Added Icons
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';
import { MarkdownRenderer } from '../components/shared/MarkdownRenderer';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { Button } from '../components/shared/Button';

// --- TYPES ---
interface Note {
  id: string;
  title: string;
  content: string;
  user_id: string;
  character_id: string | null;
  party_id: string | null;
  created_at: string;
  updated_at?: string;
  character?: { name: string };
  party?: { name: string };
}

interface LinkTarget {
  id: string;
  name: string;
}

// --- MAIN COMPONENT ---
export function Notes() {
  const { user, isDM } = useAuth();

  // Data State
  const [notes, setNotes] = useState<Note[]>([]);
  const [characters, setCharacters] = useState<LinkTarget[]>([]);
  const [parties, setParties] = useState<LinkTarget[]>([]);

  // UI State
  const [viewState, setViewState] = useState<'view' | 'create' | 'edit'>('view');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Full Screen State
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Editor State
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter/Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'character' | 'party'>('all');

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<string>('');

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

  // --- GENERAL HELPERS ---
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setSelectedCharacter('');
    setSelectedParty('');
    setFormError(null);
    setShowPreview(false);
  }, []);

  const handleOpenCreate = () => {
    resetForm();
    setViewState('create');
    setSelectedNote(null);
    setIsFullScreen(false); // Reset focus mode on new action
  };

  const handleOpenEdit = (note: Note) => {
    setSelectedNote(note);
    setTitle(note.title);
    setContent(note.content);
    setSelectedCharacter(note.character_id || '');
    setSelectedParty(note.party_id || '');
    setViewState('edit');
    setFormError(null);
    setShowPreview(false);
  };

  const handleCloseForm = () => {
    setViewState('view');
    resetForm();
    if (viewState === 'create') setSelectedNote(null);
  };

  const handleBackToList = () => {
    setSelectedNote(null);
    setViewState('view');
    setIsFullScreen(false);
  };

  // 2. Auto-exit full screen if deselected
  useEffect(() => {
    if (!selectedNote && viewState === 'view') setIsFullScreen(false);
  }, [selectedNote, viewState]);

  // --- DATA LOADING ---
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: chars } = await supabase.from('characters').select('id, name').eq('user_id', user.id);
      setCharacters(chars || []);

      if (isDM()) {
        const { data: prts } = await supabase.from('parties').select('id, name').eq('created_by', user.id);
        setParties(prts || []);
      }

      const query = supabase.from('notes').select(`*, character:characters(name), party:parties(name)`).eq('user_id', user.id);

      const { data: notesData, error: notesError } = await query.order('created_at', { ascending: false });
      if (notesError) throw notesError;
      setNotes(notesData || []);

    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [user, isDM]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- ACTIONS ---
  const handleSubmit = async () => {
    if (!user) return;
    if (!title.trim()) { setFormError('Title is required.'); return; }

    if (selectedCharacter && selectedParty) {
      setFormError('Please link to either a Character OR a Party, not both.');
      return;
    }

    const payload = {
      title: title.trim(),
      content,
      user_id: user.id,
      character_id: selectedCharacter || null,
      party_id: selectedParty || null,
      updated_at: new Date().toISOString(),
    };

    try {
      let result: Note | null = null;

      if (viewState === 'edit' && selectedNote) {
        const { data, error } = await supabase
          .from('notes')
          .update(payload)
          .eq('id', selectedNote.id)
          .select(`*, character:characters(name), party:parties(name)`)
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('notes')
          .insert([payload])
          .select(`*, character:characters(name), party:parties(name)`)
          .single();
        if (error) throw error;
        result = data;
      }

      await loadData();
      handleCloseForm();
      if (result) setSelectedNote(result);

    } catch {
      setFormError('Failed to save note.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await supabase.from('notes').delete().eq('id', id);
      await loadData();
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setViewState('view');
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleCopyLink = () => {
    if (!selectedNote || !selectedNote.party_id) return;
    const url = `${window.location.origin}/adventure-party/${selectedNote.party_id}?noteId=${selectedNote.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // --- FILTERING ---
  const filteredNotes = notes.filter(note => {
    const matchesSearch = (note.title + note.content).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'personal' && !note.character_id && !note.party_id) ||
      (filterType === 'character' && !!note.character_id) ||
      (filterType === 'party' && !!note.party_id);
    return matchesSearch && matchesFilter;
  });

  // --- RENDER ---

  if (loading && notes.length === 0) return <div className="h-96 flex justify-center items-center"><LoadingSpinner /></div>;

  const isDetailView = selectedNote !== null || viewState === 'create';

  return (
    // Layout: Full height, removed margins on mobile
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-white md:border md:rounded-xl overflow-hidden shadow-sm relative -mx-4 md:mx-0">

      {/* LEFT SIDEBAR (List) */}
      {/* Logic: Hidden on mobile if detail view. Hidden on desktop if Full Screen. */}
      <div className={`
        ${isDetailView ? 'hidden' : 'flex'}
        md:${isFullScreen ? 'hidden' : 'flex'}
        w-full md:w-1/3 lg:w-1/4 border-r border-gray-200 flex-col bg-gray-50 h-full transition-all duration-300
      `}>

        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
              <Book className="w-5 h-5 text-blue-600" /> My Notes
            </h2>
            <Button size="sm" onClick={handleOpenCreate} icon={Plus}>New</Button>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                className="w-full pl-9 pr-8 py-1.5 text-sm border rounded-md appearance-none bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                value={filterType}
                onChange={e => setFilterType(e.target.value as 'all' | 'personal' | 'character' | 'party')}
              >
                <option value="all">All Notes</option>
                <option value="personal">Personal</option>
                <option value="character">Character Links</option>
                <option value="party">Party Links</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notes found.</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <button
                type="button"
                key={note.id}
                onClick={() => { setSelectedNote(note); setViewState('view'); }}
                className={`
                   p-3 rounded-lg cursor-pointer border transition-all group
                   ${selectedNote?.id === note.id
                    ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-100 z-10'
                    : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
                  }
                 `}
              >
                <h4 className={`font-semibold text-sm mb-1 ${selectedNote?.id === note.id ? 'text-blue-700' : 'text-gray-800'}`}>{note.title}</h4>
                <div className="flex items-center gap-2">
                  {note.character && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-medium border border-purple-100"><User size={10} /> {note.character.name}</span>}
                  {note.party && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-medium border border-green-100"><Users size={10} /> {note.party.name}</span>}
                  {!note.character && !note.party && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium border border-gray-200"><FileText size={10} /> Personal</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT MAIN CONTENT (Detail/Edit) */}
      <div className={`
        ${!isDetailView ? 'hidden md:flex' : 'flex'}
        flex-1 bg-white p-4 md:p-6 overflow-y-auto w-full h-full
      `}>

        {(viewState === 'create' || viewState === 'edit') ? (
          // FORM VIEW
          <div className="max-w-2xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 mb-6 pb-2 border-b">
              <button onClick={handleBackToList} className="md:hidden p-1 -ml-1 text-gray-500 hover:bg-gray-100 rounded-full">
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-xl font-bold flex-1">{viewState === 'edit' ? 'Edit Note' : 'New Note'}</h2>
              <button onClick={handleCloseForm} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>

            {formError && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded flex items-center gap-2"><AlertCircle size={16} />{formError}</div>}

            <div className="space-y-4">
              <div>
                <label htmlFor="note-title" className="block text-sm font-bold text-gray-700 mb-1">Title</label>
                <input id="note-title" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" value={title} onChange={e => setTitle(e.target.value)} placeholder="Note Title" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="note-character-link" className="block text-sm font-bold text-gray-700 mb-1">Character Link (Opt)</label>
                  <select
                    id="note-character-link"
                    className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    value={selectedCharacter}
                    onChange={e => { setSelectedCharacter(e.target.value); if (e.target.value) setSelectedParty(''); }}
                    disabled={!!selectedParty}
                  >
                    <option value="">None</option>
                    {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {isDM() && (
                  <div>
                    <label htmlFor="note-party-link" className="block text-sm font-bold text-gray-700 mb-1">Party Link (Opt)</label>
                    <select
                      id="note-party-link"
                      className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                      value={selectedParty}
                      onChange={e => { setSelectedParty(e.target.value); if (e.target.value) setSelectedCharacter(''); }}
                      disabled={!!selectedCharacter}
                    >
                      <option value="">None</option>
                      {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* MARKDOWN EDITOR */}
              <div>
                <div className="flex justify-between items-end mb-1">
                  <label htmlFor="note-content" className="block text-sm font-bold text-gray-700">Content <span className="text-xs font-normal text-gray-400">(Markdown)</span></label>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {showPreview ? <><EyeOff size={14} /> Edit</> : <><Eye size={14} /> Preview</>}
                  </button>
                </div>

                <div className="border rounded-lg overflow-hidden border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all flex flex-col h-[40vh] md:h-96">
                  {!showPreview && (
                    <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto shrink-0">
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
                    <div className="p-4 flex-1 overflow-y-auto prose prose-sm max-w-none bg-gray-50/50">
                      <MarkdownRenderer content={content || '*No content*'} />
                    </div>
                  ) : (
                    <textarea
                      id="note-content"
                      ref={textareaRef}
                      className="w-full p-3 flex-1 font-mono text-sm outline-none resize-none bg-white"
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      placeholder="Write your notes here..."
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 pb-8">
                <Button variant="ghost" onClick={handleCloseForm}>Cancel</Button>
                <Button variant="primary" icon={Save} onClick={handleSubmit}>Save Note</Button>
              </div>
            </div>
          </div>

        ) : selectedNote ? (
          // DETAIL VIEW
          <div className="max-w-3xl mx-auto w-full animate-in fade-in duration-200">
            <div className="flex justify-between items-start mb-6 border-b pb-4 sticky top-0 bg-white z-10 pt-2">
              <div className="flex items-start gap-3 overflow-hidden">
                <button onClick={handleBackToList} className="md:hidden p-1.5 mt-1 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full flex-shrink-0">
                  <ArrowLeft size={20} />
                </button>
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 truncate leading-tight">{selectedNote.title}</h1>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {selectedNote.character && <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium truncate max-w-[150px]">Character: {selectedNote.character.name}</span>}
                    {selectedNote.party && <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium truncate max-w-[150px]">Party: {selectedNote.party.name}</span>}
                    {!selectedNote.character && !selectedNote.party && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Personal Note</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 md:gap-2 flex-shrink-0 ml-2 items-center">

                {/* 3. Full Screen Toggle Button (Desktop Only) */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="hidden md:flex text-gray-400 hover:text-blue-600"
                  title={isFullScreen ? "Exit Full Screen" : "Focus Mode"}
                >
                  {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </Button>

                {selectedNote.party_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={LinkIcon}
                    onClick={handleCopyLink}
                    title={linkCopied ? "Copied!" : "Copy link to party note"}
                    className={linkCopied ? "text-green-600" : "text-gray-400 hover:text-blue-600"}
                  />
                )}

                <Button variant="secondary" size="sm" icon={Edit2} onClick={() => handleOpenEdit(selectedNote!)} title="Edit Note" />
                <Button variant="danger_outline" size="sm" icon={Trash2} onClick={() => handleDelete(selectedNote!.id)} title="Delete Note" />
              </div>
            </div>

            <div className="prose prose-blue max-w-none text-gray-700 min-h-[200px] pb-8">
              <MarkdownRenderer content={selectedNote.content} />
            </div>

            <div className="mt-8 pt-4 border-t text-xs text-gray-400 text-center pb-8">
              Created {new Date(selectedNote.created_at).toLocaleDateString()}
            </div>
          </div>

        ) : (
          // EMPTY STATE (Desktop Only)
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <StickyNote className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-600">Select a note to read</h3>
            <p className="text-sm mb-6">Or create a new one to get started.</p>
            <Button variant="primary" icon={Plus} onClick={handleOpenCreate}>Create Note</Button>
          </div>
        )}

      </div>
    </div>
  );
}

// Small helper component for the toolbar buttons
function ToolbarButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded transition-all"
    >
      <Icon size={16} />
    </button>
  );
}
