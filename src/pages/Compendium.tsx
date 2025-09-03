import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Book, Search, Plus, Edit2, Bookmark, BookmarkPlus, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CompendiumEntry } from '../types/compendium';
import { Button } from '../components/shared/Button';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { HomebrewRenderer } from '../components/compendium/HomebrewRenderer';
import { CompendiumFullPage } from '../components/compendium/CompendiumFullPage';
import { fetchCompendiumEntries, fetchCompendiumTemplates } from '../lib/api/compendium';

interface BookmarkedEntry extends CompendiumEntry {
  preview: string;
}

export function Compendium() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null);
  const [fullPageEntry, setFullPageEntry] = useState<CompendiumEntry | null>(null);
  const [bookmarkedEntries, setBookmarkedEntries] = useState<BookmarkedEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: entries = [], isLoading: isLoadingEntries, error: errorEntries } = useQuery<CompendiumEntry[], Error>({ queryKey: ['compendiumEntries'], queryFn: fetchCompendiumEntries });
  const { isLoading: isLoadingTemplates, error: errorTemplates } = useQuery({ queryKey: ['compendiumTemplates'], queryFn: fetchCompendiumTemplates });

  const loading = isLoadingEntries || isLoadingTemplates;
  const error = errorEntries?.message || errorTemplates?.message || null;

  useEffect(() => {
    const savedBookmarks = localStorage.getItem('compendium_bookmarks');
    if (savedBookmarks) setBookmarkedEntries(JSON.parse(savedBookmarks));
  }, []);

  const toggleBookmark = (entry: CompendiumEntry) => {
    const preview = entry.content.slice(0, 100) + '...';
    setBookmarkedEntries(prev => {
      const isBookmarked = prev.some(b => b.id === entry.id);
      const newBookmarks = isBookmarked ? prev.filter(b => b.id !== entry.id) : [...prev, { ...entry, preview }];
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

  const categorizedEntries = useMemo(() => {
    if (searchTerm) return [];
    const grouped = entries.reduce((acc, entry) => {
      const category = entry.category ?? 'Uncategorized';
      if (!acc[category]) acc[category] = [];
      acc[category].push(entry);
      return acc;
    }, {} as Record<string, CompendiumEntry[]>);
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [entries, searchTerm]);

  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    return entries.filter(entry =>
      entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [entries, searchTerm]);

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
    onError: (err) => { console.error("Save error:", err); }
  });

  const handleSaveEntry = async (entry: CompendiumEntry) => { await saveMutation.mutateAsync(entry); };
  const handleNewEntry = () => { setFullPageEntry({ id: undefined, title: 'New Entry', content: 'Start writing!', category: 'Uncategorized', created_by: user?.id }); };
  const handleShowHome = () => { setSelectedEntry(null); setSearchTerm(''); };

  if (loading) return <LoadingSpinner size="lg" className="mx-auto mt-12" />;
  if (error) return <ErrorMessage message={error} className="m-8" />;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Compendium</h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleShowHome}>Home</Button>
              {isAdmin() && (<Button variant="primary" size="sm" icon={Plus} onClick={handleNewEntry}>New</Button>)}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search compendium..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
        {searchTerm === '' && (
          <div className="flex-1 overflow-y-auto">
            {categorizedEntries.map(([category, categoryEntries]) => (
              <div key={category}>
                <div onClick={() => toggleCategory(category)} className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    {expandedCategories.has(category) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span>{category}</span>
                  </div>
                  <span className="text-sm text-gray-500">{categoryEntries.length}</span>
                </div>
                {expandedCategories.has(category) && (
                  <div>
                    {categoryEntries.map(entry => (
                      <div key={entry.id} onClick={() => setSelectedEntry(entry)} className={`pl-8 pr-4 py-2 cursor-pointer text-sm ${selectedEntry?.id === entry.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                        {entry.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto relative">
        {searchTerm ? (
          <div className="absolute inset-0 bg-white bg-opacity-95 z-10 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold">Search Results</h1>
              <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')}>Clear Search</Button>
            </div>
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {searchResults.map(result => (
                  <div key={result.id} onClick={() => { setSelectedEntry(result); setSearchTerm(''); }} className="cursor-pointer hover:bg-gray-100 p-4 border rounded">
                    <h2 className="text-xl font-bold">{result.title}</h2>
                    <HomebrewRenderer content={result.content.slice(0, 200) + '...'} />
                  </div>
                ))}
              </div>
            ) : (<div className="text-center"><p className="text-gray-500">No results found for "{searchTerm}".</p></div>)}
          </div>
        ) : selectedEntry ? (
          <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold">{selectedEntry.title}</h1>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={bookmarkedEntries.some(b => b.id === selectedEntry.id) ? Bookmark : BookmarkPlus} onClick={() => toggleBookmark(selectedEntry)}>
                  {bookmarkedEntries.some(b => b.id === selectedEntry.id) ? 'Bookmarked' : 'Bookmark'}
                </Button>
                {isAdmin() && (<Button variant="secondary" size="sm" icon={Edit2} onClick={() => setFullPageEntry(selectedEntry)}>Edit</Button>)}
              </div>
            </div>
            <HomebrewRenderer content={selectedEntry.content} />
          </div>
        ) : (
          <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Bookmarked Entries</h1>
            {bookmarkedEntries.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {bookmarkedEntries.map(bookmark => (
                  <div key={bookmark.id} onClick={() => setSelectedEntry(bookmark)} className="cursor-pointer hover:bg-gray-100 p-4 border rounded">
                    <h2 className="text-xl font-bold">{bookmark.title}</h2>
                    <HomebrewRenderer content={bookmark.preview} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center pt-16">
                <Book className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">Welcome to the Compendium</h2>
                <p className="text-gray-500 max-w-md mx-auto">Use the sidebar to search and browse entries, or add new ones if you're an admin.</p>
              </div>
            )}
          </div>
        )}
      </div>
      {fullPageEntry && (<CompendiumFullPage entry={fullPageEntry} onClose={() => setFullPageEntry(null)} onSave={handleSaveEntry} />)}
    </div>
  );
}