import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Maximize, Minimize, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { TableCanvas } from './TableCanvas';
import { TableDrawer } from './TableDrawer';
import { useConfirm } from '../../hooks/useConfirm';
import { tableKeys, useVirtualTable } from '../../hooks/useVirtualTable';
import {
  addTableItems,
  deleteTableItem,
  moveTableItem,
  setItemsVisibility,
  setTableScene,
  updateTableItem,
} from '../../lib/api/virtualTable';
import { fetchAllMonsters } from '../../lib/api/monsters';
import { queryKeys } from '../../lib/queryKeys';
import type { Character } from '../../types/character';
import type { NewTableItem, TableItem } from '../../types/virtualTable';

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
  const lastNoticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (lastNoticeTimer.current) window.clearTimeout(lastNoticeTimer.current);
    lastNoticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  // Players always see the live scene. A GM may look at another one while preparing it.
  const table = useVirtualTable(partyId, isGm ? gmViewMapId : null);
  const { liveMapId, viewMapId } = table;

  const viewMap = useMemo(() => table.maps.find((map) => map.id === (viewMapId ?? liveMapId)) ?? null, [table.maps, viewMapId, liveMapId]);
  const liveMap = useMemo(() => table.maps.find((map) => map.id === liveMapId) ?? null, [table.maps, liveMapId]);
  const items = useMemo(() => (viewMap ? table.items.filter((item) => item.map_id === viewMap.id) : []), [table.items, viewMap]);

  const myCharacterIds = useMemo(
    () => new Set(partyMembers.filter((member) => member.user_id === currentUserId && member.id).map((member) => member.id as string)),
    [partyMembers, currentUserId],
  );
  const portraits = useMemo(() => new Map(partyMembers.filter((member) => member.id).map((member) => [member.id as string, member.portrait_url ?? null])), [partyMembers]);

  const { data: monsters = [] } = useQuery({ queryKey: queryKeys.monsters, queryFn: fetchAllMonsters, enabled: isGm, staleTime: 5 * 60_000 });

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

  const drawerBusy = addMutation.isPending || visibilityMutation.isPending || allVisibleMutation.isPending || goLiveMutation.isPending || lockMutation.isPending;
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
              focusRequest={focusRequest}
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
            />
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
