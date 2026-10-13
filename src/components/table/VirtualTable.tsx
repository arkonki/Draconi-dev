import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Maximize, Minimize, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { TableCanvas, type TableTool } from './TableCanvas';
import { TurnStrip } from './TurnStrip';
import { TableCharacterBar } from './TableCharacterBar';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { CharacterSheetDialog } from '../character/CharacterSheetDialog';
import { useCharacterSheetModal } from '../../hooks/useCharacterSheetModal';
import { useTableCharacters } from '../../hooks/useTableCharacters';
import { TableDrawer } from './TableDrawer';
import { useConfirm } from '../../hooks/useConfirm';
import { tableKeys, useVirtualTable } from '../../hooks/useVirtualTable';
import { useTablePings } from '../../hooks/useTablePings';
import { useTableTurn } from '../../hooks/useTableTurn';
import {
  addTableItems,
  deleteTableItem,
  moveTableItem,
  pingTable,
  setItemsVisibility,
  setTableScene,
  updateTableItem,
  uploadTableMap,
} from '../../lib/api/virtualTable';
import { fetchAllMonsters } from '../../lib/api/monsters';
import { clampTokenScale } from '../../lib/tableGeometry';
import { queryKeys } from '../../lib/queryKeys';
import type { Character } from '../../types/character';
import type { NewTableItem, TableItem } from '../../types/virtualTable';

// The combat page is large, and only a GM ever opens it, so it is loaded when first needed.
const PartyEncounterView = lazy(() => import('../party/PartyEncounterView').then((module) => ({ default: module.PartyEncounterView })));

interface VirtualTableProps {
  partyId: string;
  partyMembers: Character[];
  isGm: boolean;
  currentUserId?: string;
}

/** The shared map every player sees on their own screen, with the GM's drawer for scenes and tokens. */
export function VirtualTable({ partyId, partyMembers, isGm, currentUserId }: VirtualTableProps) {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [gmViewMapId, setGmViewMapId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ itemId: string; nonce: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tool, setTool] = useState<TableTool>('move');
  const [lookHere, setLookHere] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; nonce: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [combatOpen, setCombatOpen] = useState(false);
  const [sizePreview, setSizePreview] = useState<{ id: string; size: number } | null>(null);
  const [tokenScale, setTokenScale] = useState(() => {
    try { return clampTokenScale(Number(window.localStorage.getItem('table-token-scale') || 1)); } catch { return 1; }
  });
  const [metresPerSquare, setMetresPerSquare] = useState(() => {
    try { return Number(window.localStorage.getItem('table-ruler-metres') || 0) || 0; } catch { return 0; }
  });
  const lastNoticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (lastNoticeTimer.current) window.clearTimeout(lastNoticeTimer.current);
    lastNoticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  // Players always see the live scene. A GM may look at another one while preparing it.
  const table = useVirtualTable(partyId, isGm ? gmViewMapId : null);
  const { liveMapId, viewMapId } = table;

  const { pings } = useTablePings(partyId, (ping) => {
    // A GM "look here" ping brings the viewers on that scene to the spot.
    if (ping.map_id === (viewMapId ?? liveMapId)) setFocusPoint({ x: ping.x, y: ping.y, nonce: Date.now() });
  });

  const viewMap = useMemo(() => table.maps.find((map) => map.id === (viewMapId ?? liveMapId)) ?? null, [table.maps, viewMapId, liveMapId]);
  const liveMap = useMemo(() => table.maps.find((map) => map.id === liveMapId) ?? null, [table.maps, liveMapId]);
  const items = useMemo(() => {
    const onMap = viewMap ? table.items.filter((item) => item.map_id === viewMap.id) : [];
    // While the GM drags the size slider, show the new size at once without saving every step.
    return sizePreview ? onMap.map((item) => (item.id === sizePreview.id ? { ...item, size: sizePreview.size } : item)) : onMap;
  }, [table.items, viewMap, sizePreview]);

  const turn = useTableTurn(partyId, items, isGm);

  const memberIds = useMemo(() => partyMembers.map((member) => member.id).filter(Boolean) as string[], [partyMembers]);
  const quickCharacters = useTableCharacters(partyId, memberIds);
  // Inside the sheet modal a player can only switch between their own characters; the GM can open anyone's.
  const sheetMembers = useMemo(
    () => (isGm ? partyMembers : partyMembers.filter((member) => member.user_id === currentUserId)),
    [isGm, partyMembers, currentUserId],
  );
  const sheet = useCharacterSheetModal(currentUserId, sheetMembers);

  const myCharacterIds = useMemo(
    () => new Set(partyMembers.filter((member) => member.user_id === currentUserId && member.id).map((member) => member.id as string)),
    [partyMembers, currentUserId],
  );
  const portraits = useMemo(() => new Map(partyMembers.filter((member) => member.id).map((member) => [member.id as string, member.portrait_url ?? null])), [partyMembers]);

  const { data: monsters = [] } = useQuery({ queryKey: queryKeys.monsters, queryFn: fetchAllMonsters, enabled: isGm, staleTime: 5 * 60_000 });

  const handleTokenScale = (value: number) => {
    const next = clampTokenScale(value);
    setTokenScale(next);
    try { window.localStorage.setItem('table-token-scale', String(next)); } catch { /* a remembered setting is a convenience only */ }
  };

  const handleMetres = (value: number) => {
    setMetresPerSquare(value);
    try { window.localStorage.setItem('table-ruler-metres', String(value)); } catch { /* a remembered setting is a convenience only */ }
  };

  const refreshItems = () => queryClient.invalidateQueries({ queryKey: ['table-items'] });
  const onError = (error: Error) => showNotice(error.message);

  const goLiveMutation = useMutation({
    mutationFn: (mapId: string | null) => setTableScene(partyId, mapId),
    onSuccess: async (_unused, mapId) => {
      setGmViewMapId(null);
      await table.refreshAll();
      showNotice(mapId ? 'Players now see this scene.' : 'The table is empty for players.');
    },
    onError,
  });

  const addMutation = useMutation({
    mutationFn: (newItems: NewTableItem[]) => addTableItems(viewMapId!, newItems, false),
    onSuccess: async (created) => { await refreshItems(); showNotice(created.length ? `Added ${created.length}. They stay hidden until you tick them.` : 'Nothing new to add.'); },
    onError,
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ item, visible }: { item: TableItem; visible: boolean }) => updateTableItem(item.id, { visible }),
    onMutate: ({ item, visible }) => {
      // Reflect the tick straight away; the server confirms through the live update.
      queryClient.setQueryData<TableItem[]>(tableKeys.items(item.map_id), (current) => current?.map((entry) => (entry.id === item.id ? { ...entry, visible } : entry)));
    },
    onError: (error: Error) => { onError(error); void refreshItems(); },
    onSuccess: () => refreshItems(),
  });

  const lockMutation = useMutation({
    mutationFn: (item: TableItem) => updateTableItem(item.id, { locked: !item.locked }),
    onSuccess: () => refreshItems(),
    onError,
  });

  const resizeMutation = useMutation({
    mutationFn: ({ item, size }: { item: TableItem; size: number }) => updateTableItem(item.id, { size }),
    onMutate: ({ item, size }) => {
      queryClient.setQueryData<TableItem[]>(tableKeys.items(item.map_id), (current) => current?.map((entry) => (entry.id === item.id ? { ...entry, size } : entry)));
    },
    onSuccess: () => refreshItems(),
    onError: (error: Error) => { onError(error); void refreshItems(); },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => uploadTableMap(partyId, file, name),
    onSuccess: async (map) => {
      setUploadError(null);
      await table.refreshAll();
      setGmViewMapId(map.id);
      showNotice(`“${map.name}” is ready. Add tokens, then show it to players.`);
    },
    onError: (error: Error) => setUploadError(error.message),
  });

  const handlePing = useCallback((x: number, y: number) => {
    const mapId = viewMapId ?? liveMapId;
    if (!mapId) return;
    pingTable(mapId, x, y, isGm && lookHere).catch((error: Error) => showNotice(error.message));
  }, [isGm, liveMapId, lookHere, showNotice, viewMapId]);

  const allVisibleMutation = useMutation({
    mutationFn: (visible: boolean) => setItemsVisibility(viewMapId!, visible),
    onSuccess: () => refreshItems(),
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (item: TableItem) => deleteTableItem(item.id),
    onSuccess: () => refreshItems(),
    onError,
  });

  const handleMove = useCallback(async (itemId: string, x: number, y: number) => {
    // Show the new place at once; the server then tells everyone else.
    for (const entry of queryClient.getQueriesData<TableItem[]>({ queryKey: ['table-items'] })) {
      const [key, data] = entry;
      if (data?.some((item) => item.id === itemId)) {
        queryClient.setQueryData<TableItem[]>(key, data.map((item) => (item.id === itemId ? { ...item, x, y } : item)));
      }
    }
    try {
      await moveTableItem(itemId, x, y);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not move the token.');
      void queryClient.invalidateQueries({ queryKey: ['table-items'] });
    }
  }, [queryClient, showNotice]);

  const handleRemove = async (item: TableItem) => {
    const confirmed = await confirm({
      title: `Remove ${item.label}?`,
      description: 'The token is taken off this scene. Its place is forgotten, but you can add it again.',
      confirmText: 'Remove token',
    });
    if (confirmed) removeMutation.mutate(item);
  };

  const drawerBusy = addMutation.isPending || resizeMutation.isPending || visibilityMutation.isPending || allVisibleMutation.isPending || goLiveMutation.isPending || lockMutation.isPending;
  const previewing = isGm && viewMap && viewMap.id !== liveMapId;

  if (table.loading) return <div className="flex h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return (
    <div className={fullscreen ? 'fixed inset-0 z-40 flex flex-col bg-stone-950' : 'flex flex-col'}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-stone-900">{liveMap ? liveMap.name : 'The table'}</h3>
          <p className="text-xs text-stone-500">{isGm ? (liveMap ? 'Players see this scene.' : 'Players see an empty table until you show a scene.') : 'Drag your own token. Scroll or pinch to zoom, drag the map to move around.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={fullscreen ? Minimize : Maximize} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? 'Exit' : 'Fullscreen'}</Button>
          {isGm && <Button variant="outline" size="sm" icon={drawerOpen ? PanelRightClose : PanelRightOpen} onClick={() => setDrawerOpen((value) => !value)}>{drawerOpen ? 'Hide drawer' : 'Drawer'}</Button>}
        </div>
      </div>

      {previewing && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="flex items-center gap-2"><Eye size={16} /> You are setting up <strong>{viewMap.name}</strong>. Players are on {liveMap ? <strong>{liveMap.name}</strong> : 'an empty table'}.</span>
          <Button size="sm" variant="primary" onClick={() => goLiveMutation.mutate(viewMap.id)} loading={goLiveMutation.isPending}>Show to players</Button>
        </div>
      )}

      {table.error && <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{table.error.message}</div>}

      {turn.active && (
        <TurnStrip
          round={turn.round}
          entries={turn.entries}
          onSelect={isGm ? (entry) => { if (entry.itemId) { setSelectedItemId(entry.itemId); setFocusRequest({ itemId: entry.itemId, nonce: Date.now() }); } } : undefined}
        />
      )}

      <div className={`flex min-h-0 ${fullscreen ? 'flex-1' : 'h-[calc(100vh-17rem)] min-h-[460px]'}`}>
        <div className="relative min-w-0 flex-1">
          {viewMap ? (
            <TableCanvas
              map={viewMap}
              items={items}
              isGm={isGm}
              myCharacterIds={myCharacterIds}
              portraits={portraits}
              selectedItemId={selectedItemId}
              turnItemIds={turn.currentItemIds}
              focusRequest={focusRequest}
              focusPoint={focusPoint}
              pings={pings}
              tool={tool}
              onToolChange={setTool}
              lookHere={lookHere}
              onLookHereChange={setLookHere}
              onPing={handlePing}
              metresPerSquare={metresPerSquare}
              onMetresPerSquareChange={handleMetres}
              tokenScale={tokenScale}
              onTokenScaleChange={handleTokenScale}
              onSelect={setSelectedItemId}
              onMove={handleMove}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-stone-900 p-8 text-center text-white/70">
              <div>
                <p className="text-lg font-semibold text-white">{isGm ? 'Nothing is on the table yet' : 'Waiting for the GM'}</p>
                <p className="mt-2 text-sm">{isGm ? 'Open the Scenes tab of the drawer and show a map to your players.' : 'The map will appear here as soon as the GM shows it.'}</p>
              </div>
            </div>
          )}
          {notice && <div role="status" className="absolute left-1/2 top-3 z-[70] -translate-x-1/2 rounded-full bg-stone-900/90 px-4 py-2 text-sm text-white shadow-lg">{notice}</div>}
        </div>

        {isGm && drawerOpen && (
          <div className="w-[min(22rem,45vw)] flex-none">
            <TableDrawer
              maps={table.maps}
              liveMapId={liveMapId}
              viewMapId={viewMap?.id ?? null}
              items={items}
              partyMembers={partyMembers}
              monsters={monsters}
              selectedItemId={selectedItemId}
              busy={drawerBusy}
              onViewMap={(mapId) => { setGmViewMapId(mapId === liveMapId ? null : mapId); setSelectedItemId(null); }}
              onGoLive={(mapId) => goLiveMutation.mutate(mapId)}
              onToggleVisible={(item) => visibilityMutation.mutate({ item, visible: !item.visible })}
              onToggleLocked={(item) => lockMutation.mutate(item)}
              onSetAllVisible={(visible) => allVisibleMutation.mutate(visible)}
              onRemove={(item) => void handleRemove(item)}
              onFocus={(item) => { setSelectedItemId(item.id); setFocusRequest({ itemId: item.id, nonce: Date.now() }); }}
              onAdd={(newItems) => addMutation.mutate(newItems)}
              onResize={(item, size) => resizeMutation.mutate({ item, size })}
              onPreviewSize={(item, size) => setSizePreview(size === null ? null : { id: item.id, size })}
              onUpload={async (file, name) => {
                try { await uploadMutation.mutateAsync({ file, name }); return true; } catch { return false; }
              }}
              uploading={uploadMutation.isPending}
              uploadError={uploadError}
            />
          </div>
        )}
      </div>
      <TableCharacterBar
        characters={quickCharacters}
        isGm={isGm}
        currentUserId={currentUserId}
        onOpenSheet={sheet.open}
        onOpenCombat={isGm ? () => setCombatOpen(true) : undefined}
        combatActive={turn.active}
      />

      <CharacterSheetDialog {...sheet.dialogProps} />

      {isGm && combatOpen && (
        <AccessibleDialog
          isOpen
          onClose={() => setCombatOpen(false)}
          title="Combat"
          description={turn.active ? 'An encounter is running.' : 'No encounter is running.'}
          ariaLabel="Combat"
          size="sheet"
          fullScreenMobile
          animation="rise"
          panelClassName="sm:h-[92dvh] border border-stone-300"
          headerClassName="bg-stone-800 text-white border-stone-700"
          titleClassName="font-serif text-white"
          bodyClassName="bg-stone-50"
        >
          <Suspense fallback={<div className="flex h-64 items-center justify-center"><LoadingSpinner size="lg" /></div>}>
            <PartyEncounterView partyId={partyId} partyMembers={partyMembers} isDM />
          </Suspense>
        </AccessibleDialog>
      )}
      {confirmDialog}
    </div>
  );
}
