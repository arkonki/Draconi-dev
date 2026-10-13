import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listTokenIcons } from '../lib/api/virtualTable';
import { supabase } from '../lib/supabase';
import { buildIconIndex, findIcon, type TokenIconFile } from '../lib/tokenIcons';
import type { TableItem } from '../types/virtualTable';

/** Just id and name of every monster, light enough for every player to load, so a renamed token can still match its monster's icon. */
async function fetchMonsterNames(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.from('monsters').select('id, name');
  if (error) throw new Error(error.message || 'Could not load the monster names');
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/**
 * Finds the icon for a token. Characters keep their portrait; every other token takes an icon whose file name
 * matches its own name (or its monster's name in the bestiary).
 */
export function useTokenImages() {
  const queryClient = useQueryClient();
  const icons = useQuery<TokenIconFile[]>({ queryKey: ['token-icons'], queryFn: listTokenIcons, staleTime: 5 * 60_000 });
  const monsters = useQuery({ queryKey: ['monster-names'], queryFn: fetchMonsterNames, staleTime: 30 * 60_000 });

  const index = useMemo(() => buildIconIndex(icons.data ?? []), [icons.data]);
  const monsterNames = useMemo(() => new Map((monsters.data ?? []).map((monster) => [monster.id, monster.name])), [monsters.data]);

  /** The icon file for a token, or null. */
  const iconFor = useCallback((item: Pick<TableItem, 'kind' | 'label' | 'monster_id'>): TokenIconFile | null => {
    if (item.kind === 'character') return null;
    return findIcon(index, item.label, [item.monster_id ? monsterNames.get(item.monster_id) : null]);
  }, [index, monsterNames]);

  const refreshIcons = useCallback(() => queryClient.invalidateQueries({ queryKey: ['token-icons'] }), [queryClient]);

  return { icons: icons.data ?? [], iconsLoading: icons.isLoading, iconFor, refreshIcons };
}
