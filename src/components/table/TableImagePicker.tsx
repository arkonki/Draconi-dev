import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ImageIcon, Search, X } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { optimizedImageUrl } from '../../lib/images';
import { listImageLibrary } from '../../lib/api/virtualTable';
import { matchesSearch } from '../../lib/tokenIcons';

interface TableImagePickerProps {
  isOpen: boolean;
  partyId: string;
  /** 'scene' makes a new scene from the image; 'token' picks a picture for one token. */
  mode?: 'scene' | 'token';
  /** What to search for when the picker opens, such as the name of the token being given a picture. */
  initialQuery?: string;
  /** Image addresses that are already scenes, so they can be marked. */
  usedImageUrls: ReadonlySet<string>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (imageUrl: string, name: string) => void;
}

const newestSaved = (images: Array<{ updatedAt: string | null }>) => {
  const times = images.map((image) => Date.parse(image.updatedAt ?? '')).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toLocaleDateString() : '';
};

/** Choose a map from the images already saved in the projector library. */
export function TableImagePicker({ isOpen, partyId, mode = 'scene', initialQuery = '', usedImageUrls, saving, error, onClose, onPick }: TableImagePickerProps) {
  const forToken = mode === 'token';
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const searchRef = useRef<HTMLInputElement>(null);

  const library = useQuery({
    queryKey: ['table-image-library', partyId, mode],
    queryFn: () => listImageLibrary(partyId, { includeIcons: forToken }),
    enabled: isOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isOpen) { setSelected(null); setName(''); setQuery(initialQuery); }
    // Only a fresh opening should reset the search, not a change of the suggested text.
  }, [isOpen]);

  const total = useMemo(() => (library.data ?? []).reduce((sum, group) => sum + group.images.length, 0), [library.data]);
  const searching = query.trim().length > 0;
  const groups = useMemo(
    () => (library.data ?? [])
      .map((group) => ({ ...group, images: searching ? group.images.filter((image) => matchesSearch(image.name, query)) : group.images }))
      .filter((group) => group.images.length > 0),
    [library.data, query, searching],
  );
  const matchCount = groups.reduce((sum, group) => sum + group.images.length, 0);

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      title={forToken ? 'Choose a token image' : 'Choose a map'}
      description={forToken ? 'Pick a picture for this token from your token icons or projector library.' : 'Pick an image from your projector library to use as a scene. Nothing is copied or uploaded again.'}
      size="xl"
      fullScreenMobile
      animation="rise"
      closeDisabled={saving}
      initialFocusRef={searchRef}
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {forToken ? <div className="flex-1" /> : <div className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor="picked-map-name" className="flex-none text-sm text-stone-600">Scene name</label>
            <input
              id="picked-map-name"
              value={name}
              maxLength={80}
              disabled={!selected}
              onChange={(event) => setName(event.target.value)}
              placeholder={selected ? 'Name this scene' : 'Pick an image first'}
              className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm disabled:bg-stone-100"
            />
          </div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" loading={saving} disabled={!selected || (!forToken && !name.trim())} onClick={() => selected && onPick(selected, forToken ? '' : name)}>{forToken ? 'Use this image' : 'Use as a scene'}</Button>
          </div>
        </div>
      )}
    >
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-stone-400" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={forToken ? 'Search icons by name, e.g. goblin' : 'Search images by name'}
            aria-label="Search images"
            className="w-full rounded-lg border border-stone-300 py-2 pl-9 pr-9 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {searching && (
            <button type="button" aria-label="Clear the search" onClick={() => { setQuery(''); searchRef.current?.focus(); }} className="absolute right-2 top-1.5 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X size={16} /></button>
          )}
        </div>
        {!library.isLoading && total > 0 && <p aria-live="polite" className="mt-1.5 text-xs text-stone-500">{searching ? `${matchCount} of ${total} images match` : `${total} images`}. {forToken ? 'Icons are found by their file name.' : 'Saved projector images have no readable names, so they only appear when you are not searching.'}</p>}
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        {library.isLoading && <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>}
        {library.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(library.error as Error).message}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!library.isLoading && !library.error && total > 0 && searching && matchCount === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">No image is named like “{query.trim()}”. Check the spelling, or clear the search to browse everything.</p>
        )}
        {!library.isLoading && !library.error && total === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">No saved images yet. Upload images from the Projector manager or use "Upload a map" in the drawer.</p>
        )}

        {groups.map((group) => (
          <section key={group.folderId} aria-label={group.label}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
              <ImageIcon size={15} aria-hidden="true" /> {group.label}
              <span className="font-normal text-stone-400">({group.images.length}{newestSaved(group.images) ? `, last added ${newestSaved(group.images)}` : ''})</span>
            </h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.images.map((image) => {
                const isSelected = selected === image.publicUrl;
                const used = usedImageUrls.has(image.publicUrl);
                return (
                  <li key={image.path}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => { setSelected(image.publicUrl); if (!forToken && !name.trim()) setName(`Map ${new Date(image.updatedAt ?? Date.now()).toLocaleDateString()}`); }}
                      className={`group relative block w-full overflow-hidden rounded-lg border-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-300' : 'border-stone-200 hover:border-stone-400'}`}
                    >
                      <img src={optimizedImageUrl(image.publicUrl, 'medium')} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full bg-stone-100 object-cover" />
                      {isSelected && <span className="absolute right-1.5 top-1.5 rounded-full bg-indigo-600 p-1 text-white"><Check size={14} /></span>}
                      {group.folderId === 'TokenIcons' && <span className="block truncate bg-white px-1.5 py-1 text-[11px] font-medium text-stone-700">{image.name.replace(/\.[^.]+$/, '')}</span>}
                      {used && !forToken && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Already a scene</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </AccessibleDialog>
  );
}
