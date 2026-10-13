import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ImageIcon } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { optimizedImageUrl } from '../../lib/images';
import { listImageLibrary } from '../../lib/api/virtualTable';

interface TableImagePickerProps {
  isOpen: boolean;
  partyId: string;
  /** 'scene' makes a new scene from the image; 'token' picks a picture for one token. */
  mode?: 'scene' | 'token';
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
export function TableImagePicker({ isOpen, partyId, mode = 'scene', usedImageUrls, saving, error, onClose, onPick }: TableImagePickerProps) {
  const forToken = mode === 'token';
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');

  const library = useQuery({
    queryKey: ['table-image-library', partyId, mode],
    queryFn: () => listImageLibrary(partyId, { includeIcons: forToken }),
    enabled: isOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isOpen) { setSelected(null); setName(''); }
  }, [isOpen]);

  const total = useMemo(() => (library.data ?? []).reduce((sum, group) => sum + group.images.length, 0), [library.data]);

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
      <div className="space-y-6 p-4 sm:p-6">
        {library.isLoading && <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>}
        {library.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(library.error as Error).message}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!library.isLoading && !library.error && total === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">No saved images yet. Upload images from the Projector manager or use "Upload a map" in the drawer.</p>
        )}

        {(library.data ?? []).filter((group) => group.images.length > 0).map((group) => (
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
