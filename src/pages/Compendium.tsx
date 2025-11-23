import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  Book, Search, Plus, Edit2, Bookmark, BookmarkPlus, ChevronRight, ChevronDown, FileText, Library 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CompendiumEntry } from '../types/compendium';
import { Button } from '../components/shared/Button';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { HomebrewRenderer } from '../components/compendium/HomebrewRenderer';
import { CompendiumFullPage } from '../components/compendium/CompendiumFullPage';
import { fetchCompendiumEntries } from '../lib/api/compendium';

interface BookmarkedEntry extends CompendiumEntry {
  preview: string;
}

export function Compendium() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null);
  const [fullPageEntry, setFullPageEntry] = useState<CompendiumEntry | null>(null);
  const [bookmarkedEntries, setBookmarkedEntries] = useState<BookmarkedEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Queries
  const { data: entries = [], isLoading, error: queryError } = useQuery<CompendiumEntry[], Error>({ 
    queryKey: ['compendiumEntries'], 
    queryFn: fetchCompendiumEntries 
  });

  // Effects
  useEffect(() => {
    const savedBookmarks = localStorage.getItem('compendium_bookmarks');
    if (savedBookmarks) {
      try {
        setBookmarkedEntries(JSON.parse(savedBookmarks));
      } catch (e) {
        console.error("Failed to parse bookmarks", e);
      }
    }
  }, []);

  // Actions
  const toggleBookmark = (entry: CompendiumEntry) => {
    // Create a plain text preview (strip heavy markdown) for the card
    const preview = entry.content.replace(/[#*`]/g, '').slice(0, 120) + '...';
    
    setBookmarkedEntries(prev => {
      const isBookmarked = prev.some(b => b.id === entry.id);
      const newBookmarks = isBookmarked 
        ? prev.filter(b => b.id !== entry.id) 
        : [...prev, { ...entry, preview }];
      
      localStorage.setItem('compendium_bookmarks', JSON.stringify(newBookmarks));
      return newBookmarks;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (entry: CompendiumEntry) => {
      const entryData = { title: entry.title, content: entry.content, category: entry.category };
      if (entry.id) {
        const { error } = await supabase.from('compendium').update(entryData).eq('id', entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compendium').insert([{ ...entryData, created_by: user?.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compendiumEntries'] });
      setFullPageEntry(null);
    },
    onError: (err) => console.error("Save error:", err)
  });

  // Filtering Logic
  const filteredEntries = useMemo(() => {
    if (!searchTerm) return entries;
    const lower = searchTerm.toLowerCase();
    return entries.filter(e => 
      e.title.toLowerCase().includes(lower) || 
      e.category?.toLowerCase().includes(lower)
    );
  }, [entries, searchTerm]);

  const categorizedDisplay = useMemo(() => {
    // Group by category
    const grouped = filteredEntries.reduce((acc, entry) => {
      const cat = entry.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(entry);
      return acc;
    }, {} as Record<string, CompendiumEntry[]>);

    // Sort categories alphabetical
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEntries]);

  // Render Helpers
  const handleNewEntry = () => {
    setFullPageEntry({ 
      id: undefined, 
      title: 'New Entry', 
      content: '# New Entry\nWrite your content here...', 
      category: 'General', 
      created_by: user?.id 
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-96"><LoadingSpinner size="lg" /></div>;
  if (queryError) return <div className="p-8"><ErrorMessage message={queryError.message} /></div>;

  const isBookmarked = (id?: string) => bookmarkedEntries.some(b => b.id === id);

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      
      {/* --- LEFT SIDEBAR: NAVIGATION --- */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col flex-shrink-0">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div 
              className="flex items-center gap-2 font-bold text-gray-800 cursor-pointer hover:text-indigo-600 transition-colors"
              onClick={() => setSelectedEntry(null)}
            >
              <Library className="w-5 h-5" />
              <span>Compendium</span>
            </div>
            {isAdmin() && (
              <Button variant="ghost" size="icon_sm" onClick={handleNewEntry} title="Create New Entry">
                <Plus className="w-5 h-5 text-indigo-600" />
              </Button>
            )}
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchTerm} 
              onChange={(e) => { setSearchTerm(e.target.value); if(e.target.value) { /* Optional: Auto expand all on search? */ } }} 
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {categorizedDisplay.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No entries found.</p>
          ) : (
            <div className="space-y-1">
              {categorizedDisplay.map(([category, categoryEntries]) => {
                // If searching, always expand. If not, use state.
                const isExpanded = searchTerm ? true : expandedCategories.has(category);
                
                return (
                  <div key={category} className="select-none">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={14} className="text-gray-400"/> : <ChevronRight size={14} className="text-gray-400"/>}
                        {category}
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{categoryEntries.length}</span>
                    </button>
                    
                    {isExpanded && (
                      <div className="mt-1 ml-2 space-y-0.5 border-l-2 border-gray-200 pl-2">
                        {categoryEntries.map(entry => (
                          <button
                            key={entry.id}
                            onClick={() => setSelectedEntry(entry)}
                            className={`
                              w-full text-left px-3 py-2 text-sm rounded-md transition-all flex items-center justify-between group
                              ${selectedEntry?.id === entry.id 
                                ? 'bg-white text-indigo-700 font-medium shadow-sm ring-1 ring-indigo-100' 
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                              }
                            `}
                          >
                            <span className="truncate">{entry.title}</span>
                            {isBookmarked(entry.id) && <Bookmark size={12} className="text-indigo-400 fill-indigo-400 shrink-0"/>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- RIGHT MAIN: CONTENT --- */}
      <div className="flex-1 overflow-y-auto bg-white relative">
        
        {selectedEntry ? (
          // VIEW: Selected Entry
          <div className="max-w-4xl mx-auto min-h-full flex flex-col">
            
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-8 py-4 flex justify-between items-center">
              <div>
                <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">{selectedEntry.category}</div>
                <h1 className="text-2xl font-extrabold text-gray-900">{selectedEntry.title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => toggleBookmark(selectedEntry)}
                  className={isBookmarked(selectedEntry.id) ? "text-indigo-600 bg-indigo-50" : "text-gray-400"}
                  title={isBookmarked(selectedEntry.id) ? "Remove Bookmark" : "Bookmark"}
                >
                  {isBookmarked(selectedEntry.id) ? <Bookmark className="fill-current w-5 h-5" /> : <BookmarkPlus className="w-5 h-5" />}
                </Button>
                {isAdmin() && (
                  <Button variant="secondary" size="sm" icon={Edit2} onClick={() => setFullPageEntry(selectedEntry)}>
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-8">
              <HomebrewRenderer content={selectedEntry.content} />
            </div>
            
            {/* Footer */}
            <div className="mt-auto p-8 border-t border-gray-50 text-center text-gray-400 text-xs">
               Entry Title: {selectedEntry.title}
            </div>
          </div>
        ) : (
          // VIEW: Dashboard / Bookmarks
          <div className="p-8 max-w-5xl mx-auto">
            <div className="text-center mb-10 pt-10">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Book size={40} />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Compendium</h1>
              <p className="text-gray-500">Select a topic from the sidebar or browse your bookmarks below.</p>
            </div>

            <div className="mb-6 flex items-center gap-2 pb-2 border-b border-gray-200">
              <Bookmark size={18} className="text-indigo-600" />
              <h2 className="font-bold text-gray-800">Quick Access</h2>
            </div>

            {bookmarkedEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bookmarkedEntries.map(bookmark => (
                  <div 
                    key={bookmark.id} 
                    onClick={() => setSelectedEntry(entries.find(e => e.id === bookmark.id) || bookmark)}
                    className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all group relative"
                  >
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="font-bold text-gray-800 group-hover:text-indigo-700">{bookmark.title}</h3>
                       <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{bookmark.category}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                      {bookmark.preview}
                    </p>
                    <div className="mt-3 flex items-center text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                       Read Entry <ChevronRight size={14} className="ml-1"/>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                 <p className="text-gray-400 text-sm">You haven't bookmarked any entries yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FULL PAGE EDITOR MODAL */}
      {fullPageEntry && (
        <CompendiumFullPage 
          entry={fullPageEntry} 
          onClose={() => setFullPageEntry(null)} 
          onSave={async (e) => { await saveMutation.mutateAsync(e); }} 
        />
      )}
    </div>
  );
}
