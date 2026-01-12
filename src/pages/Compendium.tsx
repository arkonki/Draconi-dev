import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  Book, Search, Plus, Edit2, Bookmark, BookmarkPlus, ChevronRight, ChevronDown, 
  Library, ArrowLeft, Share, ChevronLeft, Maximize2, Minimize2 // <--- Added Icons
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CompendiumEntry } from '../types/compendium';
import { Button } from '../components/shared/Button';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { HomebrewRenderer } from '../components/compendium/HomebrewRenderer';
import { CompendiumFullPage } from '../components/compendium/CompendiumFullPage';
import { fetchCompendiumEntries } from '../lib/api/compendium';
import { useParams, useSearchParams } from 'react-router-dom';
import { sendMessage } from '../lib/api/chat';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/shared/DropdownMenu';
import { useCharacterSheetStore } from '../stores/characterSheetStore';

interface BookmarkedEntry extends CompendiumEntry {
  preview: string;
}

interface PartySummary {
  id: string;
  name: string;
}

export function Compendium() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { id: urlPartyId } = useParams<{ id: string }>(); 
  const [searchParams] = useSearchParams();
  
  const { character } = useCharacterSheetStore();
  const effectivePartyId = urlPartyId || character?.party_id;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null);
  const [fullPageEntry, setFullPageEntry] = useState<CompendiumEntry | null>(null);
  const [bookmarkedEntries, setBookmarkedEntries] = useState<BookmarkedEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // 1. New State for Desktop Full Screen
  const [isFullScreen, setIsFullScreen] = useState(false);

  const { data: entries = [], isLoading, error: queryError } = useQuery<CompendiumEntry[], Error>({ 
    queryKey: ['compendiumEntries'], 
    queryFn: fetchCompendiumEntries 
  });

  const { data: myParties = [] } = useQuery<PartySummary[]>({
    queryKey: ['myPartiesShort', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('party_members').select('parties(id, name)').eq('user_id', user.id);
      if (error) { console.error('Error fetching parties', error); return []; }
      return data.map((item: any) => item.parties).filter(Boolean);
    },
    enabled: !!user
  });

  useEffect(() => {
    const savedBookmarks = localStorage.getItem('compendium_bookmarks');
    if (savedBookmarks) {
      try { setBookmarkedEntries(JSON.parse(savedBookmarks)); } catch (e) { console.error("Failed to parse bookmarks", e); }
    }
  }, []);

  const entryIdFromUrl = searchParams.get('entryId');
  useEffect(() => {
    if (entryIdFromUrl && entries.length > 0) {
      const targetEntry = entries.find(e => e.id === entryIdFromUrl);
      if (targetEntry) setSelectedEntry(targetEntry);
    }
  }, [entryIdFromUrl, entries]);

  // 2. Auto-exit full screen if entry is cleared
  useEffect(() => {
    if (!selectedEntry) setIsFullScreen(false);
  }, [selectedEntry]);

  const toggleBookmark = (entry: CompendiumEntry) => {
    const preview = entry.content.slice(0, 400); 
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

  const handleShareEntry = async (targetPartyId: string) => {
    if (!selectedEntry || !user) return;
    const btn = document.getElementById('share-btn-icon'); 
    if (btn) btn.classList.add('text-green-500');
    try {
      const tag = `<<<COMPENDIUM:${selectedEntry.id}:${selectedEntry.title}>>>`;
      const message = `${tag} 📖 **Shared Entry:** ${selectedEntry.title}`;
      await sendMessage(targetPartyId, user.id, message);
    } catch (err) { console.error("Failed to share entry", err); } 
    finally { setTimeout(() => { if (btn) btn.classList.remove('text-green-500'); }, 1500); }
  };

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compendiumEntries'] }); setFullPageEntry(null); },
    onError: (err) => console.error("Save error:", err)
  });

  const filteredEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title));
    if (!searchTerm) return sorted;
    const lower = searchTerm.toLowerCase();
    return sorted.filter(e => e.title.toLowerCase().includes(lower) || e.category?.toLowerCase().includes(lower));
  }, [entries, searchTerm]);

  const categorizedDisplay = useMemo(() => {
    const grouped = filteredEntries.reduce((acc, entry) => {
      const cat = entry.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(entry);
      return acc;
    }, {} as Record<string, CompendiumEntry[]>);
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEntries]);

  const currentEntryIndex = useMemo(() => {
    if (!selectedEntry) return -1;
    return filteredEntries.findIndex(e => e.id === selectedEntry.id);
  }, [filteredEntries, selectedEntry]);

  const handleNextEntry = () => { if (currentEntryIndex > -1 && currentEntryIndex < filteredEntries.length - 1) setSelectedEntry(filteredEntries[currentEntryIndex + 1]); };
  const handlePrevEntry = () => { if (currentEntryIndex > 0) setSelectedEntry(filteredEntries[currentEntryIndex - 1]); };
  const handleNewEntry = () => { setFullPageEntry({ id: undefined, title: 'New Entry', content: '# New Entry\nWrite your content here...', category: 'General', created_by: user?.id }); };

  if (isLoading) return <div className="flex items-center justify-center h-96"><LoadingSpinner size="lg" /></div>;
  if (queryError) return <div className="p-8"><ErrorMessage message={queryError.message} /></div>;

  const isBookmarked = (id?: string) => bookmarkedEntries.some(b => b.id === id);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-white md:rounded-xl shadow-sm border-t md:border border-gray-200 overflow-hidden relative -mx-4 md:mx-0">
      
      {/* --- SIDEBAR --- */}
      {/* Logic Update: Hide on desktop if isFullScreen is true */}
      <div className={`
        ${selectedEntry ? 'hidden' : 'flex'} 
        md:${isFullScreen ? 'hidden' : 'flex'} 
        w-full md:w-80 bg-gray-50 border-r border-gray-200 flex-col flex-shrink-0 h-full transition-all duration-300
      `}>
        <div className="p-3 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 font-bold text-gray-800 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setSelectedEntry(null)}>
              <Library className="w-5 h-5" /><span>Compendium</span>
            </div>
            {isAdmin() && (<Button variant="ghost" size="icon_sm" onClick={handleNewEntry} title="Create New Entry"><Plus className="w-5 h-5 text-indigo-600" /></Button>)}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"/>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="md:hidden mb-4 border-b border-gray-200 pb-2">
             <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Saved Bookmarks</div>
             {bookmarkedEntries.length === 0 ? <div className="px-3 py-1 text-sm text-gray-400 italic">No bookmarks yet.</div> : bookmarkedEntries.map(b => (
               <button key={b.id} onClick={() => setSelectedEntry(entries.find(e => e.id === b.id) || b)} className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded flex items-center gap-2">
                  <Bookmark size={12} className="fill-indigo-600" /><span className="truncate">{b.title}</span>
               </button>
             ))}
          </div>

          {categorizedDisplay.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">No entries found.</p> : (
            <div className="space-y-1 pb-10">
              {categorizedDisplay.map(([category, categoryEntries]) => {
                const isExpanded = searchTerm ? true : expandedCategories.has(category);
                return (
                  <div key={category} className="select-none">
                    <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
                        {category}
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{categoryEntries.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="mt-1 ml-2 space-y-0.5 border-l-2 border-gray-200 pl-2">
                        {categoryEntries.map(entry => (
                          <button key={entry.id} onClick={() => setSelectedEntry(entry)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all flex items-center justify-between group ${selectedEntry?.id === entry.id ? 'bg-white text-indigo-700 font-medium shadow-sm ring-1 ring-indigo-100' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
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

      {/* --- RIGHT MAIN --- */}
      <div className={`${!selectedEntry ? 'hidden md:flex' : 'flex'} flex-1 overflow-y-auto bg-white relative flex-col h-full w-full`}>
        {selectedEntry ? (
          <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col">
            
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-2 md:px-4 py-2 flex justify-between items-center shadow-sm md:shadow-none h-14">
              
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <button onClick={() => setSelectedEntry(null)} className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600"><ArrowLeft size={20} /></button>
                <button onClick={handlePrevEntry} disabled={currentEntryIndex <= 0} className="md:hidden p-1 rounded-full text-gray-400 disabled:opacity-20 hover:bg-gray-100 hover:text-indigo-600"><ChevronLeft size={20} /></button>
                <button onClick={handleNextEntry} disabled={currentEntryIndex === -1 || currentEntryIndex >= filteredEntries.length - 1} className="md:hidden p-1 rounded-full text-gray-400 disabled:opacity-20 hover:bg-gray-100 hover:text-indigo-600"><ChevronRight size={20} /></button>

                <div className="min-w-0 ml-1">
                  <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-0.5 truncate hidden sm:block">{selectedEntry.category}</div>
                  <h1 className="text-base md:text-2xl font-extrabold text-gray-900 truncate leading-tight">{selectedEntry.title}</h1>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {/* 3. Toggle Full Screen Button (Desktop Only) */}
                <Button 
                  variant="ghost" 
                  size="icon_sm" 
                  onClick={() => setIsFullScreen(!isFullScreen)} 
                  className="hidden md:flex text-gray-400 hover:text-indigo-600" 
                  title={isFullScreen ? "Exit Full Screen" : "Full Screen Reading"}
                >
                  {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </Button>

                <div className="w-px h-4 bg-gray-200 mx-1 hidden md:block" />

                {(() => {
                  if (effectivePartyId) return (<Button variant="ghost" size="icon_sm" onClick={() => handleShareEntry(effectivePartyId)} className="text-indigo-600 bg-indigo-50" title="Share to Chat"><Share id="share-btn-icon" className="w-4 h-4 transition-colors" /></Button>);
                  if (myParties.length > 1) return (<DropdownMenu><DropdownMenuTrigger><Button variant="ghost" size="icon_sm" className="text-indigo-600 bg-indigo-50 px-2"><Share id="share-btn-icon" className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">{myParties.map(p => (<DropdownMenuItem key={p.id} onSelect={() => handleShareEntry(p.id)}>Share to {p.name}</DropdownMenuItem>))}</DropdownMenuContent></DropdownMenu>);
                  if (myParties.length === 1) return (<Button variant="ghost" size="icon_sm" onClick={() => handleShareEntry(myParties[0].id)} className="text-indigo-600 bg-indigo-50"><Share id="share-btn-icon" className="w-4 h-4" /></Button>);
                  return null;
                })()}
                
                <Button variant="ghost" size="icon_sm" onClick={() => toggleBookmark(selectedEntry)} className={isBookmarked(selectedEntry.id) ? "text-indigo-600 bg-indigo-50" : "text-gray-400"}>{isBookmarked(selectedEntry.id) ? <Bookmark className="fill-current w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}</Button>
                {isAdmin() && (<Button variant="secondary" size="icon_sm" icon={Edit2} onClick={() => setFullPageEntry(selectedEntry)} />)}
              </div>
            </div>

            <div className="p-2 md:p-4 w-full max-w-full overflow-x-hidden">
              <HomebrewRenderer content={selectedEntry.content} />
            </div>
            
            <div className="mt-auto p-2 md:p-4 border-t border-gray-50 text-center text-gray-400 text-xs pb-4">Entry Title: {selectedEntry.title}</div>
          </div>
        ) : (
          <div className="p-2 md:p-4 max-w-5xl mx-auto w-full">
            <div className="text-center mb-6 md:mb-10 pt-4 md:pt-10">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"><Book size={32} className="md:w-10 md:h-10" /></div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Compendium</h1>
              <p className="text-sm md:text-base text-gray-500">Select a topic from the sidebar or browse your bookmarks below.</p>
            </div>

            <div className="mb-4 md:mb-6 flex items-center gap-2 pb-2 border-b border-gray-200">
              <Bookmark size={18} className="text-indigo-600" />
              <h2 className="font-bold text-gray-800">Quick Access</h2>
            </div>

            {bookmarkedEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
                {bookmarkedEntries.map(bookmark => (
                  <div key={bookmark.id} onClick={() => setSelectedEntry(entries.find(e => e.id === bookmark.id) || bookmark)} className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-2 relative z-10 bg-white">
                       <h3 className="font-bold text-gray-800 group-hover:text-indigo-700 truncate mr-2 text-sm md:text-base">{bookmark.title}</h3>
                       <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">{bookmark.category}</span>
                    </div>
                    <div className="relative h-20 md:h-24 overflow-hidden text-xs text-gray-500">
                      <div className="origin-top-left transform scale-90 w-[110%]"><HomebrewRenderer content={bookmark.preview} /></div>
                      <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
                    </div>
                    <div className="mt-2 flex items-center text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-3 right-4 z-20 bg-white pl-2">Read Entry <ChevronRight size={14} className="ml-1"/></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50"><p className="text-gray-400 text-sm">You haven't bookmarked any entries yet.</p></div>
            )}
          </div>
        )}
      </div>

      {fullPageEntry && <CompendiumFullPage entry={fullPageEntry} onClose={() => setFullPageEntry(null)} onSave={async (e) => { await saveMutation.mutateAsync(e); }} />}
    </div>
  );
}