import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Edit2, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import { CompendiumEntry } from '../../types/compendium';
import {
  deleteCompendiumEntry,
  fetchCompendiumEntries,
  saveCompendiumEntry,
} from '../../lib/api/compendium';
import { Button } from '../shared/Button';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { HomebrewRenderer } from '../compendium/HomebrewRenderer';
import { CompendiumFullPage } from '../compendium/CompendiumFullPage';

const sortEntriesByCategoryAndTitle = (entries: CompendiumEntry[]): CompendiumEntry[] =>
  [...entries].sort((a, b) => {
    const categoryCompare = (a.category || '').localeCompare(b.category || '');
    if (categoryCompare !== 0) {
      return categoryCompare;
    }

    return a.title.localeCompare(b.title);
  });

export function CompendiumManager() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState<CompendiumEntry | null>(null);

  const {
    data: entries = [],
    isLoading,
    error,
  } = useQuery<CompendiumEntry[], Error>({
    queryKey: ['compendiumEntries'],
    queryFn: fetchCompendiumEntries,
  });

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

      setEditingEntry(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCompendiumEntry,
    onSuccess: (_, deletedEntryId) => {
      queryClient.setQueryData<CompendiumEntry[]>(['compendiumEntries'], (current = []) =>
        current.filter((entry) => entry.id !== deletedEntryId)
      );

      setEditingEntry((current) => (current?.id === deletedEntryId ? null : current));
    },
  });

  const filteredEntries = useMemo(() => {
    const sorted = sortEntriesByCategoryAndTitle(entries);
    if (!searchTerm.trim()) {
      return sorted;
    }

    const lower = searchTerm.toLowerCase();
    return sorted.filter((entry) =>
      entry.title.toLowerCase().includes(lower)
      || entry.category.toLowerCase().includes(lower)
      || entry.content.toLowerCase().includes(lower)
    );
  }, [entries, searchTerm]);

  const categories = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.category).filter(Boolean))).sort(),
    [entries]
  );

  const handleCreateEntry = () => {
    setEditingEntry({
      title: 'New Entry',
      content: '# New Entry\nWrite your content here...',
      category: 'General',
      created_by: user?.id,
    });
  };

  const handleDelete = async (entry: CompendiumEntry) => {
    if (!entry.id) {
      return;
    }

    const confirmed = window.confirm(`Delete "${entry.title}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync(entry.id);
  };

  if (!isAdmin()) {
    return <ErrorMessage message="Admin access is required to manage compendium entries." />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Compendium</h2>
            <p className="mt-1 text-sm text-gray-500">
              Create and edit entries using the same full-page editor used in the live compendium.
            </p>
          </div>

          <Button variant="primary" icon={Plus} onClick={handleCreateEntry}>
            New Entry
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Total Entries</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{entries.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Categories</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{categories.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Filtered Results</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{filteredEntries.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, category, or content..."
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {saveMutation.error && (
          <ErrorMessage message={saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save compendium entry.'} />
        )}

        {deleteMutation.error && (
          <ErrorMessage message={deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Failed to delete compendium entry.'} />
        )}

        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">
              {searchTerm ? 'No entries match your search.' : 'No compendium entries yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredEntries.map((entry) => (
              <article
                key={entry.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                      <Tag className="h-3.5 w-3.5" />
                      <span className="truncate">{entry.category}</span>
                    </div>
                    <h3 className="mt-1 truncate text-lg font-bold text-gray-900">{entry.title}</h3>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="icon_sm"
                      icon={Edit2}
                      onClick={() => setEditingEntry(entry)}
                      title={`Edit ${entry.title}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon_sm"
                      icon={Trash2}
                      onClick={() => void handleDelete(entry)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      title={`Delete ${entry.title}`}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingEntry(entry)}
                  className="block w-full text-left"
                >
                  <div className="relative h-44 overflow-hidden bg-stone-50/70 px-5 py-4">
                    <div className="pointer-events-none scale-[0.72] origin-top-left w-[138.9%]">
                      <HomebrewRenderer content={entry.content} />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/90 to-transparent" />
                  </div>
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {editingEntry && (
        <CompendiumFullPage
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={(entry) => saveMutation.mutateAsync(entry)}
        />
      )}
    </>
  );
}
