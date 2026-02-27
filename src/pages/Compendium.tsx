import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  Book, Search, Plus, Edit2, Bookmark, BookmarkPlus, ChevronRight, ChevronDown,
  Library, ArrowLeft, Share, ChevronLeft, Maximize2, Minimize2, Trash2, Wand2
} from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import { CompendiumEntry, GrimoireSpell } from '../types/compendium';
import { Button } from '../components/shared/Button';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorMessage } from '../components/shared/ErrorMessage';
import { fetchCompendiumEntries, deleteCompendiumEntry, fetchGrimoireSpells, saveCompendiumEntry } from '../lib/api/compendium';
import { useParams, useSearchParams } from 'react-router-dom';
import { sendMessage } from '../lib/api/chat';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/shared/DropdownMenu';
import { useCharacterSheetStore } from '../stores/characterSheetStore';
import { Breadcrumbs } from '../components/shared/Breadcrumbs';
import { Home } from 'lucide-react';

interface BookmarkedEntry extends CompendiumEntry {
  preview: string;
}

interface PartySummary {
  id: string;
  name: string;
}

const CompendiumFullPage = lazy(() =>
  import('../components/compendium/CompendiumFullPage').then((module) => ({
    default: module.CompendiumFullPage,
  }))
);
const HomebrewRenderer = lazy(() =>
  import('../components/compendium/HomebrewRenderer').then((module) => ({
    default: module.HomebrewRenderer,
  }))
);

const getPreviewText = (content: string): string =>
  content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`#>*_|]/g, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sortEntriesByCategoryAndTitle = (entries: CompendiumEntry[]): CompendiumEntry[] =>
  [...entries].sort((a, b) => {
    const categoryCompare = (a.category || '').localeCompare(b.category || '');
    if (categoryCompare !== 0) {
      return categoryCompare;
    }

    return a.title.localeCompare(b.title);
  });

const getSpellSchoolName = (spell: GrimoireSpell): string => spell.magic_schools?.name || 'General Magic';

const getSpellRankLabel = (rank: number | null): string => {
  if (rank === 0) return 'Trick';
  if (rank === null || rank === undefined) return 'Rank -';
  return `Rank ${rank}`;
};

const formatPrerequisiteText = (prerequisite: string | null): string => {
  if (!prerequisite) return 'None';

  try {
    const parsed = JSON.parse(prerequisite);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return prerequisite;
  }
};

export function Compendium() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { id: urlPartyId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const { character } = useCharacterSheetStore();
  const effectivePartyId = urlPartyId || character?.party_id;

  const [activeLibrary, setActiveLibrary] = useState<'compendium' | 'grimoire'>('compendium');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null);
  const [selectedSpell, setSelectedSpell] = useState<GrimoireSpell | null>(null);
  const [fullPageEntry, setFullPageEntry] = useState<CompendiumEntry | null>(null);
  const [bookmarkedEntries, setBookmarkedEntries] = useState<BookmarkedEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());

  // 1. New State for Desktop Full Screen
  const [isFullScreen, setIsFullScreen] = useState(false);

  const { data: entries = [], isLoading, error: queryError } = useQuery<CompendiumEntry[], Error>({
    queryKey: ['compendiumEntries'],
    queryFn: fetchCompendiumEntries
  });

  const { data: grimoireSpells = [], isLoading: isLoadingSpells, error: spellsError } = useQuery<GrimoireSpell[], Error>({
    queryKey: ['grimoireSpells'],
    queryFn: fetchGrimoireSpells
  });

  const { data: myParties = [] } = useQuery<PartySummary[]>({
    queryKey: ['myPartiesShort', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('party_members').select('parties(id, name)').eq('user_id', user.id);
      if (error) { console.error('Error fetching parties', error); return []; }
      return data
        .map((item: { parties: PartySummary | null }) => item.parties)
        .filter((party): party is PartySummary => Boolean(party));
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

  useEffect(() => {
    if (activeLibrary === 'compendium') {
      setSelectedSpell(null);
      return;
    }

    setSelectedEntry(null);
    setIsFullScreen(false);
  }, [activeLibrary]);

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
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
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
    mutationFn: (entry: CompendiumEntry) => saveCompendiumEntry(entry, user?.id),
    onSuccess: (savedEntry) => {
      queryClient.setQueryData<CompendiumEntry[]>(['compendiumEntries'], (current = []) => {
        const existingIndex = current.findIndex((candidate) => candidate.id === savedEntry.id);

        if (existingIndex === -1) {
          return sortEntriesByCategoryAndTitle([...current, savedEntry]);
        }

        const updated = [...current];
        updated[existingIndex] = savedEntry;
        return sortEntriesByCategoryAndTitle(updated);
      });

      setSelectedEntry(savedEntry);
      setFullPageEntry(null);

      setBookmarkedEntries((previous) => {
        if (!savedEntry.id || !previous.some((bookmark) => bookmark.id === savedEntry.id)) {
          return previous;
        }

        const updatedBookmarks = previous.map((bookmark) =>
          bookmark.id === savedEntry.id
            ? { ...bookmark, ...savedEntry, preview: savedEntry.content.slice(0, 400) }
            : bookmark
        );
        localStorage.setItem('compendium_bookmarks', JSON.stringify(updatedBookmarks));
        return updatedBookmarks;
      });
    },
    onError: (err) => console.error("Save error:", err)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCompendiumEntry,
    onSuccess: (_, deletedEntryId) => {
      queryClient.setQueryData<CompendiumEntry[]>(['compendiumEntries'], (current = []) =>
        current.filter((entry) => entry.id !== deletedEntryId)
      );

      setBookmarkedEntries((previous) => {
        const updated = previous.filter((entry) => entry.id !== deletedEntryId);
        if (updated.length !== previous.length) {
          localStorage.setItem('compendium_bookmarks', JSON.stringify(updated));
        }
        return updated;
      });

      setSelectedEntry(null);
    },
    onError: (err) => console.error("Delete error:", err)
  });

  const handleDelete = async () => {
    if (!selectedEntry?.id) return;
    if (window.confirm("Are you sure you want to delete this entry? This action cannot be undone.")) {
      await deleteMutation.mutateAsync(selectedEntry.id);
    }
  };

  const filteredEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title));
    if (!searchTerm) return sorted;
    const lower = searchTerm.toLowerCase();
    return sorted.filter(e => e.title.toLowerCase().includes(lower) || e.category?.toLowerCase().includes(lower));
  }, [entries, searchTerm]);

  const filteredSpells = useMemo(() => {
    const sorted = [...grimoireSpells].sort((a, b) => {
      const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    });

    if (!searchTerm) return sorted;

    const lower = searchTerm.toLowerCase();
    return sorted.filter((spell) => {
      const school = getSpellSchoolName(spell).toLowerCase();
      return (
        spell.name.toLowerCase().includes(lower)
        || school.includes(lower)
        || (spell.description || '').toLowerCase().includes(lower)
        || getSpellRankLabel(spell.rank).toLowerCase().includes(lower)
      );
    });
  }, [grimoireSpells, searchTerm]);

  const categorizedDisplay = useMemo(() => {
    const grouped = filteredEntries.reduce((acc, entry) => {
      const cat = entry.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(entry);
      return acc;
    }, {} as Record<string, CompendiumEntry[]>);
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEntries]);

  const grimoireDisplay = useMemo(() => {
    const grouped = filteredSpells.reduce((acc, spell) => {
      const school = getSpellSchoolName(spell);
      if (!acc[school]) acc[school] = [];
      acc[school].push(spell);
      return acc;
    }, {} as Record<string, GrimoireSpell[]>);

    return Object.entries(grouped).sort(([schoolA], [schoolB]) => {
      if (schoolA === 'General Magic') return -1;
      if (schoolB === 'General Magic') return 1;
      return schoolA.localeCompare(schoolB);
    });
  }, [filteredSpells]);

  const currentEntryIndex = useMemo(() => {
    if (!selectedEntry) return -1;
    return filteredEntries.findIndex(e => e.id === selectedEntry.id);
  }, [filteredEntries, selectedEntry]);

  const currentSpellIndex = useMemo(() => {
    if (!selectedSpell) return -1;
    return filteredSpells.findIndex((spell) => spell.id === selectedSpell.id);
  }, [filteredSpells, selectedSpell]);

  const handleNextEntry = () => { if (currentEntryIndex > -1 && currentEntryIndex < filteredEntries.length - 1) setSelectedEntry(filteredEntries[currentEntryIndex + 1]); };
  const handlePrevEntry = () => { if (currentEntryIndex > 0) setSelectedEntry(filteredEntries[currentEntryIndex - 1]); };
  const handleNextSpell = () => { if (currentSpellIndex > -1 && currentSpellIndex < filteredSpells.length - 1) setSelectedSpell(filteredSpells[currentSpellIndex + 1]); };
  const handlePrevSpell = () => { if (currentSpellIndex > 0) setSelectedSpell(filteredSpells[currentSpellIndex - 1]); };
  const handleNewEntry = () => { setFullPageEntry({ id: undefined, title: 'New Entry', content: '# New Entry\nWrite your content here...', category: 'General', created_by: user?.id }); };
  const bookmarkedEntryIds = useMemo(() => new Set(bookmarkedEntries.map((entry) => entry.id)), [bookmarkedEntries]);
  const isBookmarked = (id?: string) => (id ? bookmarkedEntryIds.has(id) : false);

  const toggleSchool = (school: string) => {
    setExpandedSchools((prev) => {
      const next = new Set(prev);
      if (next.has(school)) next.delete(school);
      else next.add(school);
      return next;
    });
  };

  const isActiveLoading = activeLibrary === 'compendium' ? isLoading : isLoadingSpells;
  const activeError = activeLibrary === 'compendium' ? queryError : spellsError;

  if (isActiveLoading) return <div className="flex items-center justify-center h-96"><LoadingSpinner size="lg" /></div>;
  if (activeError) return <div className="p-8"><ErrorMessage message={activeError.message} /></div>;

  const isShowingEntry = activeLibrary === 'compendium' && !!selectedEntry;
  const isShowingSpell = activeLibrary === 'grimoire' && !!selectedSpell;
  const isSidebarVisible = !isShowingEntry && !isShowingSpell;

  const breadcrumbs = [
    { label: 'Home', path: '/', icon: Home },
    { label: activeLibrary === 'compendium' ? 'Compendium' : 'Grimoire', icon: activeLibrary === 'compendium' ? Book : Wand2 }
  ];

  return (
    <>
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-white md:rounded-xl shadow-sm border-t md:border border-gray-200 overflow-hidden relative -mx-4 md:mx-0">

        {/* --- SIDEBAR --- */}
        <div className={`${isSidebarVisible ? 'flex' : 'hidden'} ${activeLibrary === 'compendium' && isFullScreen ? 'md:hidden' : 'md:flex'} w-full md:w-80 bg-gray-50 border-r border-gray-200 flex-col flex-shrink-0 h-full transition-all duration-300`}>
          <div className="p-3 border-b border-gray-200 bg-white sticky top-0 z-10">
            <div className="grid grid-cols-2 gap-1 mb-3 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveLibrary('compendium')}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeLibrary === 'compendium' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Compendium
              </button>
              <button
                type="button"
                onClick={() => setActiveLibrary('grimoire')}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${activeLibrary === 'grimoire' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Grimoire
              </button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="flex items-center gap-2 font-bold text-gray-800 cursor-pointer hover:text-indigo-600 transition-colors"
                onClick={() => {
                  if (activeLibrary === 'compendium') setSelectedEntry(null);
                  else setSelectedSpell(null);
                }}
              >
                {activeLibrary === 'compendium' ? <Library className="w-5 h-5" /> : <Wand2 className="w-5 h-5" />}
                <span>{activeLibrary === 'compendium' ? 'Compendium' : 'Grimoire'}</span>
              </button>
              {activeLibrary === 'compendium' && isAdmin() && (
                <Button variant="ghost" size="icon_sm" onClick={handleNewEntry} title="Create New Entry">
                  <Plus className="w-5 h-5 text-indigo-600" />
                </Button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={activeLibrary === 'compendium' ? 'Search entries...' : 'Search spells...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {activeLibrary === 'compendium' ? (
              <>
                <div className="md:hidden mb-4 border-b border-gray-200 pb-2">
                  <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Saved Bookmarks</div>
                  {bookmarkedEntries.length === 0 ? <div className="px-3 py-1 text-sm text-gray-400 italic">No bookmarks yet.</div> : bookmarkedEntries.map((bookmark) => (
                    <button key={bookmark.id} onClick={() => setSelectedEntry(entries.find((entry) => entry.id === bookmark.id) || bookmark)} className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded flex items-center gap-2">
                      <Bookmark size={12} className="fill-indigo-600" /><span className="truncate">{bookmark.title}</span>
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
                              {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                              {category}
                            </div>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{categoryEntries.length}</span>
                          </button>
                          {isExpanded && (
                            <div className="mt-1 ml-2 space-y-0.5 border-l-2 border-gray-200 pl-2">
                              {categoryEntries.map((entry) => (
                                <button key={entry.id} onClick={() => setSelectedEntry(entry)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all flex items-center justify-between group ${selectedEntry?.id === entry.id ? 'bg-white text-indigo-700 font-medium shadow-sm ring-1 ring-indigo-100' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                                  <span className="truncate">{entry.title}</span>
                                  {isBookmarked(entry.id) && <Bookmark size={12} className="text-indigo-400 fill-indigo-400 shrink-0" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              grimoireDisplay.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">No spells found.</p> : (
                <div className="space-y-1 pb-10">
                  {grimoireDisplay.map(([school, spells]) => {
                    const isExpanded = searchTerm ? true : expandedSchools.has(school);
                    return (
                      <div key={school} className="select-none">
                        <button onClick={() => toggleSchool(school)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                            {school}
                          </div>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{spells.length}</span>
                        </button>
                        {isExpanded && (
                          <div className="mt-1 ml-2 space-y-0.5 border-l-2 border-gray-200 pl-2">
                            {spells.map((spell) => (
                              <button key={spell.id} onClick={() => setSelectedSpell(spell)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-all ${selectedSpell?.id === spell.id ? 'bg-white text-indigo-700 font-medium shadow-sm ring-1 ring-indigo-100' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">{spell.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-semibold shrink-0">
                                    {getSpellRankLabel(spell.rank)}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>

        {/* --- RIGHT MAIN --- */}
        <div className={`${isSidebarVisible ? 'hidden md:flex' : 'flex'} flex-1 overflow-y-auto bg-white relative flex-col h-full w-full`}>
          {isShowingEntry ? (
            <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col">
              <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-2 md:px-4 py-2 flex justify-between items-center shadow-sm md:shadow-none h-14">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <button onClick={() => setSelectedEntry(null)} className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600"><ArrowLeft size={20} /></button>
                  <button onClick={handlePrevEntry} disabled={currentEntryIndex <= 0} className="md:hidden p-1 rounded-full text-gray-400 disabled:opacity-20 hover:bg-gray-100 hover:text-indigo-600"><ChevronLeft size={20} /></button>
                  <button onClick={handleNextEntry} disabled={currentEntryIndex === -1 || currentEntryIndex >= filteredEntries.length - 1} className="md:hidden p-1 rounded-full text-gray-400 disabled:opacity-20 hover:bg-gray-100 hover:text-indigo-600"><ChevronRight size={20} /></button>

                  <div className="min-w-0 ml-1">
                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-0.5 truncate hidden sm:block">{selectedEntry!.category}</div>
                    <h1 className="text-base md:text-2xl font-extrabold text-gray-900 truncate leading-tight">{selectedEntry!.title}</h1>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
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
                    if (myParties.length > 1) return (<DropdownMenu><DropdownMenuTrigger><Button variant="ghost" size="icon_sm" className="text-indigo-600 bg-indigo-50 px-2"><Share id="share-btn-icon" className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">{myParties.map((party) => (<DropdownMenuItem key={party.id} onSelect={() => handleShareEntry(party.id)}>Share to {party.name}</DropdownMenuItem>))}</DropdownMenuContent></DropdownMenu>);
                    if (myParties.length === 1) return (<Button variant="ghost" size="icon_sm" onClick={() => handleShareEntry(myParties[0].id)} className="text-indigo-600 bg-indigo-50"><Share id="share-btn-icon" className="w-4 h-4" /></Button>);
                    return null;
                  })()}

                  <Button variant="ghost" size="icon_sm" onClick={() => toggleBookmark(selectedEntry!)} className={isBookmarked(selectedEntry!.id) ? "text-indigo-600 bg-indigo-50" : "text-gray-400"}>{isBookmarked(selectedEntry!.id) ? <Bookmark className="fill-current w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}</Button>
                  {isAdmin() && (
                    <>
                      <Button variant="secondary" size="icon_sm" icon={Edit2} onClick={() => setFullPageEntry(selectedEntry!)} className="text-gray-600" />
                      <Button variant="ghost" size="icon_sm" icon={Trash2} onClick={handleDelete} className="text-red-400 hover:text-red-600 hover:bg-red-50" title="Delete Entry" />
                    </>
                  )}
                </div>
              </div>

              <div className="p-2 md:p-4 w-full max-w-full overflow-x-hidden">
                <Suspense
                  fallback={
                    <div className="flex justify-center py-10">
                      <LoadingSpinner size="lg" />
                    </div>
                  }
                >
                  <HomebrewRenderer content={selectedEntry!.content} />
                </Suspense>
              </div>

              <div className="mt-auto p-2 md:p-4 border-t border-gray-50 text-center text-gray-400 text-xs pb-4">Entry Title: {selectedEntry!.title}</div>
            </div>
          ) : isShowingSpell ? (
            <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col">
              <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-2 md:px-4 py-2 flex justify-between items-center shadow-sm md:shadow-none h-14">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <button onClick={() => setSelectedSpell(null)} className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600"><ArrowLeft size={20} /></button>
                  <button onClick={handlePrevSpell} disabled={currentSpellIndex <= 0} className="md:hidden p-1 rounded-full text-gray-400 disabled:opacity-20 hover:bg-gray-100 hover:text-indigo-600"><ChevronLeft size={20} /></button>
                  <button onClick={handleNextSpell} disabled={currentSpellIndex === -1 || currentSpellIndex >= filteredSpells.length - 1} className="md:hidden p-1 rounded-full text-gray-400 disabled:opacity-20 hover:bg-gray-100 hover:text-indigo-600"><ChevronRight size={20} /></button>

                  <div className="min-w-0 ml-1">
                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-0.5 truncate hidden sm:block">{getSpellSchoolName(selectedSpell!)}</div>
                    <h1 className="text-base md:text-2xl font-extrabold text-gray-900 truncate leading-tight">{selectedSpell!.name}</h1>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-[10px] px-2 py-1 rounded bg-indigo-50 text-indigo-600 font-bold uppercase tracking-wide">
                    {getSpellRankLabel(selectedSpell!.rank)}
                  </span>
                  {selectedSpell!.power_level === 'yes' && (
                    <span className="text-[10px] px-2 py-1 rounded bg-amber-50 text-amber-700 font-bold uppercase tracking-wide">
                      Power Levels
                    </span>
                  )}
                </div>
              </div>

              <div className="m-4 md:m-6 p-5 md:p-7 w-auto space-y-6 rounded-2xl border border-amber-700/40 bg-[linear-gradient(180deg,#f8edd5_0%,#ecd8ac_100%)] shadow-[0_16px_36px_rgba(89,53,18,0.18)]">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-amber-700/40 bg-amber-50/70 p-3 shadow-inner">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Casting Time</p>
                    <p className="text-sm font-semibold font-serif text-amber-900 mt-1">{selectedSpell!.casting_time || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-amber-700/40 bg-amber-50/70 p-3 shadow-inner">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Range</p>
                    <p className="text-sm font-semibold font-serif text-amber-900 mt-1">{selectedSpell!.range || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-amber-700/40 bg-amber-50/70 p-3 shadow-inner">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Duration</p>
                    <p className="text-sm font-semibold font-serif text-amber-900 mt-1">{selectedSpell!.duration || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-amber-700/40 bg-amber-50/70 p-3 shadow-inner">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Willpower Cost</p>
                    <p className="text-sm font-semibold font-serif text-amber-900 mt-1">{selectedSpell!.willpower_cost ?? '-'}</p>
                  </div>
                  <div className="rounded-lg border border-amber-700/40 bg-amber-50/70 p-3 shadow-inner">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Dice</p>
                    <p className="text-sm font-semibold font-serif text-amber-900 mt-1">{selectedSpell!.dice || '-'}</p>
                  </div>
                </div>

                <section className="space-y-2">
                  <h2 className="text-sm font-bold font-serif text-amber-950 uppercase tracking-[0.16em]">Description</h2>
                  <div className="rounded-lg border border-amber-700/40 p-4 bg-amber-50/80">
                    <p className="text-sm font-serif text-amber-950 whitespace-pre-wrap leading-relaxed first-letter:text-2xl first-letter:font-bold first-letter:mr-1 first-letter:float-left">{selectedSpell!.description || 'No description provided.'}</p>
                  </div>
                </section>

                <section className="space-y-2">
                  <h2 className="text-sm font-bold font-serif text-amber-950 uppercase tracking-[0.16em]">Learning Prerequisite</h2>
                  <pre className="rounded-lg border border-amber-700/40 p-4 bg-amber-100/40 text-xs font-serif text-amber-950 whitespace-pre-wrap break-words">
                    {formatPrerequisiteText(selectedSpell!.prerequisite)}
                  </pre>
                </section>

                <section className="space-y-2">
                  <h2 className="text-sm font-bold font-serif text-amber-950 uppercase tracking-[0.16em]">Casting Requirement</h2>
                  <div className="rounded-lg border border-amber-700/40 p-4 bg-amber-50/80">
                    <p className="text-sm font-serif text-amber-950 whitespace-pre-wrap">{selectedSpell!.requirement || 'None'}</p>
                  </div>
                </section>
              </div>
            </div>
          ) : activeLibrary === 'compendium' ? (
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
                  {bookmarkedEntries.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      onClick={() => setSelectedEntry(entries.find((entry) => entry.id === bookmark.id) || bookmark)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedEntry(entries.find((entry) => entry.id === bookmark.id) || bookmark);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-2 relative z-10 bg-white">
                        <h3 className="font-bold text-gray-800 group-hover:text-indigo-700 truncate mr-2 text-sm md:text-base">{bookmark.title}</h3>
                        <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">{bookmark.category}</span>
                      </div>
                      <div className="relative h-20 md:h-24 overflow-hidden text-xs text-gray-500">
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {getPreviewText(bookmark.preview).slice(0, 260)}
                        </p>
                        <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
                      </div>
                      <div className="mt-2 flex items-center text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-3 right-4 z-20 bg-white pl-2">Read Entry <ChevronRight size={14} className="ml-1" /></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50"><p className="text-gray-400 text-sm">You haven't bookmarked any entries yet.</p></div>
              )}
            </div>
          ) : (
            <div className="p-2 md:p-4 max-w-5xl mx-auto w-full">
              <div className="text-center mb-6 md:mb-10 pt-4 md:pt-10">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4"><Wand2 size={32} className="md:w-10 md:h-10" /></div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Grimoire</h1>
                <p className="text-sm md:text-base text-gray-500">Browse every spell in the database, grouped by school.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-8">
                <div className="rounded-lg border border-gray-200 p-4 bg-white">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total Spells</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{grimoireSpells.length}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 bg-white">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Magic Schools</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{grimoireDisplay.length}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 bg-white">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Power-Level Spells</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{grimoireSpells.filter((spell) => spell.power_level === 'yes').length}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {fullPageEntry && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                <LoadingSpinner size="lg" />
              </div>
            }
          >
            <CompendiumFullPage
              entry={fullPageEntry}
              onClose={() => setFullPageEntry(null)}
              onSave={async (e) => {
                await saveMutation.mutateAsync(e);
              }}
            />
          </Suspense>
        )}
      </div>
    </>
  );
}
