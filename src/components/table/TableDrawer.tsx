import { useMemo, useRef, useState } from 'react';
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN, TOKEN_SIZE_STEP } from '../../lib/tableGeometry';
import { Eye, EyeOff, FolderUp, ImageIcon, Lock, LockOpen, MapPin, Monitor, Plus, Search, Swords, Trash2, Upload, Users } from 'lucide-react';
import { Button } from '../shared/Button';
import { optimizedImageUrl } from '../../lib/images';
import type { PartyMap } from '../../types/atlas';
import type { MonsterData } from '../../types/bestiary';
import type { Character } from '../../types/character';
import type { NewTableItem, TableItem, TableItemKind } from '../../types/virtualTable';
import { normalizeIconName, type TokenIconFile } from '../../lib/tokenIcons';
import type { IconUploadResult } from '../../lib/api/virtualTable';

const KIND_LABEL: Record<TableItemKind, string> = { character: 'Characters', monster: 'Monsters', npc: 'NPCs', prop: 'Markers' };
const KIND_ORDER: TableItemKind[] = ['character', 'npc', 'monster', 'prop'];
const COLORS = ['#4f46e5', '#dc2626', '#059669', '#d97706', '#0891b2', '#9333ea', '#78716c', '#be185d'];

interface TableDrawerProps {
  maps: PartyMap[];
  liveMapId: string | null;
  viewMapId: string | null;
  items: TableItem[];
  partyMembers: Character[];
  monsters: MonsterData[];
  selectedItemId: string | null;
  busy: boolean;
  onViewMap: (mapId: string) => void;
  onGoLive: (mapId: string | null) => void;
  onToggleVisible: (item: TableItem) => void;
  onToggleLocked: (item: TableItem) => void;
  onSetAllVisible: (visible: boolean) => void;
  onRemove: (item: TableItem) => void;
  onFocus: (item: TableItem) => void;
  onAdd: (items: NewTableItem[]) => void;
  onResize: (item: TableItem, size: number) => void;
  /** Shows a new size on the map while the slider is still being dragged, without saving it. */
  onPreviewSize: (item: TableItem, size: number | null) => void;
  /** Resolves true when the map was saved, so the form can reset. */
  onUpload: (file: File, name: string) => Promise<boolean>;
  uploading: boolean;
  uploadError: string | null;
  /** Opens the picker for images already saved in the projector library. */
  onOpenLibrary: () => void;
  /** The encounter being prepared or run, and how many of its creatures are not on the map yet. */
  combat: { name: string; status: string; count: number; missing: number } | null;
  onAddCombatants: () => void;
  icons: TokenIconFile[];
  iconsLoading: boolean;
  onUploadIcons: (files: File[], onProgress: (done: number, total: number) => void) => Promise<IconUploadResult>;
  onDeleteIcon: (icon: TokenIconFile) => void;
  /** The icon a token takes from its name, if any. */
  iconFor: (item: TableItem) => TokenIconFile | null;
  onPickTokenImage: (item: TableItem) => void;
  onUploadTokenImage: (item: TableItem, file: File) => Promise<boolean>;
  onClearTokenImage: (item: TableItem) => void;
}

const SIZE_PRESETS = [0.5, 1, 2, 3, 4, 6];
const formatSize = (size: number) => (Number.isInteger(size) ? String(size) : size.toFixed(2).replace(/0+$/, ''));

export function TableDrawer({
  maps, liveMapId, viewMapId, items, partyMembers, monsters, selectedItemId, busy,
  onViewMap, onGoLive, onToggleVisible, onToggleLocked, onSetAllVisible, onRemove, onFocus, onAdd, onResize, onPreviewSize, onUpload, uploading, uploadError, onOpenLibrary, combat, onAddCombatants, icons, iconsLoading, onUploadIcons, onDeleteIcon, iconFor,
  onPickTokenImage, onUploadTokenImage, onClearTokenImage,
}: TableDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sizeCommitTimer = useRef<number | null>(null);
  // The slider saves when it is let go, and also shortly after the last change, so a touch screen that never
  // reports the release still saves.
  const commitSize = (item: TableItem, size: number) => {
    if (sizeCommitTimer.current) window.clearTimeout(sizeCommitTimer.current);
    sizeCommitTimer.current = null;
    onResize(item, size);
    onPreviewSize(item, null);
  };
  const previewSize = (item: TableItem, size: number) => {
    onPreviewSize(item, size);
    if (sizeCommitTimer.current) window.clearTimeout(sizeCommitTimer.current);
    sizeCommitTimer.current = window.setTimeout(() => commitSize(item, size), 500);
  };
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mapName, setMapName] = useState('');
  const [tab, setTab] = useState<'tokens' | 'scenes' | 'icons'>('tokens');
  const [iconQuery, setIconQuery] = useState('');
  const [showAllIcons, setShowAllIcons] = useState(false);
  const [iconProgress, setIconProgress] = useState<{ done: number; total: number } | null>(null);
  const [iconNotice, setIconNotice] = useState<string | null>(null);
  const iconFilesRef = useRef<HTMLInputElement>(null);
  const tokenFileRef = useRef<HTMLInputElement>(null);
  const tokenFileTarget = useRef<TableItem | null>(null);
  const [monsterQuery, setMonsterQuery] = useState('');
  const [markerLabel, setMarkerLabel] = useState('');
  const [markerColor, setMarkerColor] = useState(COLORS[3]);
  const [markerKind, setMarkerKind] = useState<'npc' | 'prop'>('prop');

  const placedCharacterIds = useMemo(() => new Set(items.map((item) => item.character_id).filter(Boolean)), [items]);
  const missingCharacters = partyMembers.filter((member) => member.id && !placedCharacterIds.has(member.id));
  const visibleCount = items.filter((item) => item.visible).length;

  const grouped = KIND_ORDER
    .map((kind) => ({ kind, entries: items.filter((item) => item.kind === kind) }))
    .filter((group) => group.entries.length > 0);

  const monsterMatches = useMemo(() => {
    const needle = monsterQuery.trim().toLowerCase();
    if (needle.length < 2) return [];
    return monsters.filter((monster) => monster.name.toLowerCase().includes(needle)).slice(0, 6);
  }, [monsterQuery, monsters]);

  return (
    <aside className="flex h-full w-full flex-col border-l border-stone-200 bg-white text-stone-800" aria-label="GM drawer">
      <div className="flex border-b border-stone-200" role="tablist">
        {([['tokens', 'Tokens', Users], ['scenes', 'Scenes', MapPin], ['icons', 'Icons', ImageIcon]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold ${tab === id ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-stone-500 hover:text-stone-800'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'scenes' && (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <p className="text-xs text-stone-500">Players see the scene marked Live. Look at another scene to set it up first, then show it when you are ready. Tokens keep their places on every scene.</p>
          <div className="rounded-lg border border-stone-200 p-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPendingFile(file);
                setMapName(file ? file.name.replace(/\.[^.]+$/, '') : '');
              }}
            />
            {!pendingFile ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" icon={ImageIcon} className="flex-1" onClick={onOpenLibrary}>Choose from library</Button>
                <Button size="sm" variant="outline" icon={Upload} className="flex-1" onClick={() => fileInputRef.current?.click()}>Upload</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="table-map-name" className="block text-xs text-stone-600">Name for {pendingFile.name} ({(pendingFile.size / 1024 / 1024).toFixed(1)} MB)</label>
                <input id="table-map-name" value={mapName} maxLength={80} onChange={(event) => setMapName(event.target.value)} className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={uploading} onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Cancel</Button>
                  <Button size="sm" variant="primary" loading={uploading} disabled={!mapName.trim()} onClick={() => { void onUpload(pendingFile, mapName).then((saved) => { if (saved) { setPendingFile(null); setMapName(''); if (fileInputRef.current) fileInputRef.current.value = ''; } }); }}>Upload</Button>
                </div>
              </div>
            )}
            {uploadError && <p role="alert" className="mt-2 text-xs text-red-700">{uploadError}</p>}
            <p className="mt-2 text-xs text-stone-500">Set a map's grid in the Atlas tab, so tokens and the ruler follow it.</p>
          </div>
          {maps.length === 0 && <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">No maps yet. Upload one above.</p>}
          {maps.map((map) => {
            const live = map.id === liveMapId;
            const viewing = map.id === viewMapId;
            return (
              <div key={map.id} className={`flex items-center gap-3 rounded-lg border p-2 ${viewing ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'}`}>
                {map.image_url ? <img src={optimizedImageUrl(map.image_url, 'thumbnail')} alt="" className="h-14 w-14 flex-none rounded object-cover" /> : <div className="h-14 w-14 flex-none rounded bg-stone-200" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{map.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {live && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-800">Live</span>}
                    {viewing && !live && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-800">Viewing</span>}
                  </div>
                </div>
                <div className="flex flex-none flex-col gap-1">
                  {!viewing && <Button size="sm" variant="outline" onClick={() => onViewMap(map.id)}>View</Button>}
                  {!live && <Button size="sm" variant="primary" icon={Monitor} onClick={() => onGoLive(map.id)} loading={busy}>Show</Button>}
                </div>
              </div>
            );
          })}
          {liveMapId && <Button size="sm" variant="ghost" onClick={() => onGoLive(null)} className="w-full">Clear the table for players</Button>}
        </div>
      )}

      {tab === 'tokens' && (
        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {!viewMapId ? (
            <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">Choose a scene first.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-stone-600"><strong>{visibleCount}</strong> of {items.length} shown to players</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" icon={Eye} onClick={() => onSetAllVisible(true)} disabled={busy || items.length === visibleCount}>All</Button>
                  <Button size="sm" variant="outline" icon={EyeOff} onClick={() => onSetAllVisible(false)} disabled={busy || visibleCount === 0}>None</Button>
                </div>
              </div>

              {items.length === 0 && <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">Nothing on this scene yet. Add the party or a monster below.</p>}

              {grouped.map((group) => (
                <section key={group.kind} aria-label={KIND_LABEL[group.kind]}>
                  <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">{KIND_LABEL[group.kind]}</h4>
                  <ul className="space-y-1">
                    {group.entries.map((item) => (
                      <li key={item.id} className={`rounded-lg border px-2 py-1.5 ${selectedItemId === item.id ? 'border-indigo-400 bg-indigo-50' : 'border-stone-200'}`}>
                        <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.visible}
                          disabled={busy}
                          onChange={() => onToggleVisible(item)}
                          aria-label={`${item.label} is shown to players`}
                          className="h-5 w-5 flex-none rounded border-stone-300 text-indigo-600"
                        />
                        <span className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: item.color }} />
                        <button type="button" onClick={() => onFocus(item)} className={`min-w-0 flex-1 truncate text-left text-sm ${item.visible ? 'font-medium text-stone-900' : 'text-stone-500'}`} title="Find on the map">{item.label}</button>
                        <select
                          aria-label={`Size of ${item.label}`}
                          title="Size in grid squares"
                          value={String(item.size)}
                          disabled={busy}
                          onChange={(event) => onResize(item, Number(event.target.value))}
                          className="w-14 flex-none rounded border border-stone-200 bg-white px-0.5 py-0.5 text-xs text-stone-600"
                        >
                          {[...new Set([...SIZE_PRESETS, item.size])].sort((a, b) => a - b).map((size) => <option key={size} value={String(size)}>{formatSize(size)}×</option>)}
                        </select>
                        <button type="button" aria-label={item.locked ? `Unlock ${item.label}` : `Lock ${item.label}`} title={item.locked ? 'Locked: players cannot move it' : 'Unlocked'} onClick={() => onToggleLocked(item)} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                          {item.locked ? <Lock size={15} /> : <LockOpen size={15} />}
                        </button>
                        <button type="button" aria-label={`Remove ${item.label}`} onClick={() => onRemove(item)} className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                        </div>
                        {selectedItemId === item.id && (
                          <div className="mt-1.5 flex items-center gap-2 pl-7 text-xs text-stone-600">
                            <label htmlFor={`size-${item.id}`} className="flex-none">Size</label>
                            <input
                              id={`size-${item.id}`}
                              type="range"
                              min={TOKEN_SIZE_MIN}
                              max={TOKEN_SIZE_MAX}
                              step={TOKEN_SIZE_STEP}
                              defaultValue={item.size}
                              key={`${item.id}-${item.size}`}
                              disabled={busy}
                              onChange={(event) => previewSize(item, Number(event.target.value))}
                              onPointerUp={(event) => commitSize(item, Number(event.currentTarget.value))}
                              onKeyUp={(event) => commitSize(item, Number(event.currentTarget.value))}
                              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-indigo-600"
                              aria-label={`Size of ${item.label} in grid squares`}
                            />
                            <span className="w-10 flex-none text-right font-mono">{formatSize(item.size)}×</span>
                          </div>
                        )}
                        {selectedItemId === item.id && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7 text-xs text-stone-600">
                            <span className="flex-none">Picture</span>
                            <span className="min-w-0 flex-1 truncate text-stone-500">
                              {item.image_url ? 'Custom image' : item.kind === 'character' ? 'Portrait' : iconFor(item) ? `Icon: ${iconFor(item)?.name}` : 'None'}
                            </span>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => onPickTokenImage(item)}>Choose</Button>
                            <Button size="sm" variant="outline" icon={Upload} disabled={busy} onClick={() => { tokenFileTarget.current = item; tokenFileRef.current?.click(); }}>Upload</Button>
                            {item.image_url && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onClearTokenImage(item)}>Clear</Button>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {combat && (
                <section className="space-y-2 border-t border-stone-200 pt-3" aria-label="Combat">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500"><Swords size={13} aria-hidden="true" /> Combat</h4>
                  <p className="text-sm text-stone-600"><strong>{combat.name}</strong> <span className="text-stone-400">({combat.status}, {combat.count} combatants)</span></p>
                  <Button size="sm" variant="primary" icon={Swords} className="w-full" disabled={busy || combat.missing === 0} onClick={onAddCombatants}>
                    {combat.missing === 0 ? 'Everyone in this fight is on the map' : `Add the combatants (${combat.missing})`}
                  </Button>
                </section>
              )}

              <section className="space-y-3 border-t border-stone-200 pt-3" aria-label="Add tokens">
                <h4 className="text-xs font-bold uppercase tracking-wide text-stone-500">Add to this scene</h4>
                <Button size="sm" variant="outline" icon={Users} disabled={busy || missingCharacters.length === 0} onClick={() => onAdd(missingCharacters.map((member) => ({ kind: 'character' as const, character_id: member.id })))} className="w-full">
                  {missingCharacters.length === 0 ? 'The whole party is here' : `Add the party (${missingCharacters.length})`}
                </Button>

                <div>
                  <label htmlFor="table-monster-search" className="mb-1 block text-xs text-stone-600">Monster</label>
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-stone-400" />
                    <input id="table-monster-search" value={monsterQuery} onChange={(event) => setMonsterQuery(event.target.value)} placeholder="Search the bestiary" className="w-full rounded-md border border-stone-300 py-1.5 pl-7 pr-2 text-sm" />
                  </div>
                  {monsterMatches.length > 0 && (
                    <ul className="mt-1 divide-y divide-stone-100 rounded-md border border-stone-200">
                      {monsterMatches.map((monster) => (
                        <li key={monster.id}>
                          <button type="button" disabled={busy} onClick={() => { onAdd([{ kind: 'monster', monster_id: monster.id }]); setMonsterQuery(''); }} className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-stone-50">
                            <span className="truncate">{monster.name}</span><Plus size={14} className="flex-none text-stone-400" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="table-marker-label" className="block text-xs text-stone-600">Marker or NPC</label>
                  <div className="flex gap-2">
                    <input id="table-marker-label" value={markerLabel} maxLength={80} onChange={(event) => setMarkerLabel(event.target.value)} placeholder="Name" className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
                    <select aria-label="Kind" value={markerKind} onChange={(event) => setMarkerKind(event.target.value as 'npc' | 'prop')} className="rounded-md border border-stone-300 px-1 text-sm">
                      <option value="prop">Marker</option>
                      <option value="npc">NPC</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1" role="radiogroup" aria-label="Colour">
                      {COLORS.map((color) => (
                        <button key={color} type="button" role="radio" aria-checked={markerColor === color} aria-label={color} onClick={() => setMarkerColor(color)} className={`h-6 w-6 rounded-full border-2 ${markerColor === color ? 'border-stone-900' : 'border-transparent'}`} style={{ backgroundColor: color }} />
                      ))}
                    </div>
                    <Button size="sm" variant="primary" icon={Plus} disabled={busy || !markerLabel.trim()} onClick={() => { onAdd([{ kind: markerKind, label: markerLabel.trim(), color: markerColor }]); setMarkerLabel(''); }}>Add</Button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      )}
      <input
        ref={tokenFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const target = tokenFileTarget.current;
          event.target.value = '';
          if (file && target) void onUploadTokenImage(target, file);
        }}
      />

      {tab === 'icons' && (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <p className="text-xs text-stone-500">
            Upload an icon pack here. A picture named after a monster, such as <strong>Goblin.png</strong>, shows on every token with that name (also "Goblin 2"), for you and your players. A picture you choose for one token always wins.
          </p>
          <input
            ref={iconFilesRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length === 0) return;
              setIconNotice(null);
              setIconProgress({ done: 0, total: files.length });
              void onUploadIcons(files, (done, total) => setIconProgress({ done, total })).then((result) => {
                setIconProgress(null);
                setIconNotice(`Uploaded ${result.uploaded} icon${result.uploaded === 1 ? '' : 's'}${result.failed.length ? `; ${result.failed.length} skipped (${result.failed.slice(0, 3).map((failure) => `${failure.name}: ${failure.reason}`).join(', ')}${result.failed.length > 3 ? ', …' : ''})` : ''}.`);
              });
            }}
          />
          <input
            type="file"
            multiple
            className="hidden"
            id="table-icon-folder"
            ref={(element) => { if (element) element.setAttribute('webkitdirectory', ''); }}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length === 0) return;
              setIconNotice(null);
              setIconProgress({ done: 0, total: files.length });
              void onUploadIcons(files, (done, total) => setIconProgress({ done, total })).then((result) => {
                setIconProgress(null);
                setIconNotice(`Uploaded ${result.uploaded} icon${result.uploaded === 1 ? '' : 's'}${result.failed.length ? `; ${result.failed.length} skipped (not images or failed)` : ''}.`);
              });
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={Upload} className="flex-1" disabled={iconProgress !== null} onClick={() => iconFilesRef.current?.click()}>Upload icons</Button>
            <Button size="sm" variant="outline" icon={FolderUp} className="flex-1" disabled={iconProgress !== null} onClick={() => document.getElementById('table-icon-folder')?.click()}>Upload a folder</Button>
          </div>
          {iconProgress && (
            <div role="status" aria-live="polite" className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${(iconProgress.done / Math.max(1, iconProgress.total)) * 100}%` }} /></div>
              <p className="text-xs text-stone-600">Uploading {iconProgress.done} of {iconProgress.total}…</p>
            </div>
          )}
          {iconNotice && <p role="status" className="rounded-md bg-green-50 p-2 text-xs text-green-900">{iconNotice}</p>}

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-stone-400" />
            <input value={iconQuery} onChange={(event) => { setIconQuery(event.target.value); setShowAllIcons(false); }} placeholder={`Search ${icons.length} icons`} aria-label="Search icons" className="w-full rounded-md border border-stone-300 py-1.5 pl-7 pr-2 text-sm" />
          </div>
          {iconsLoading && <p className="text-sm text-stone-500">Loading the icons…</p>}
          {!iconsLoading && icons.length === 0 && <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">No icons yet.</p>}
          {(() => {
            const needle = normalizeIconName(iconQuery);
            const matches = needle ? icons.filter((icon) => normalizeIconName(icon.name).includes(needle)) : icons;
            const shown = showAllIcons ? matches : matches.slice(0, 60);
            return (
              <>
                <ul className="grid grid-cols-3 gap-2">
                  {shown.map((icon) => (
                    <li key={icon.path} className="group relative rounded-lg border border-stone-200 p-1 text-center">
                      <img src={optimizedImageUrl(icon.url, 'thumbnail')} alt="" loading="lazy" decoding="async" className="mx-auto h-14 w-14 rounded-full object-cover" />
                      <p className="mt-1 truncate text-[11px] text-stone-600" title={icon.name}>{icon.name.replace(/\.[^.]+$/, '')}</p>
                      <button type="button" aria-label={`Remove the icon ${icon.name}`} onClick={() => onDeleteIcon(icon)} className="absolute right-0.5 top-0.5 rounded bg-white/90 p-1 text-stone-500 opacity-0 shadow hover:text-red-600 focus:opacity-100 group-hover:opacity-100"><Trash2 size={12} /></button>
                    </li>
                  ))}
                </ul>
                {matches.length > shown.length && <Button size="sm" variant="ghost" className="w-full" onClick={() => setShowAllIcons(true)}>Show all {matches.length}</Button>}
              </>
            );
          })()}
        </div>
      )}
    </aside>
  );
}
