export type TableItemKind = 'character' | 'monster' | 'npc' | 'prop';

export interface TableItem {
  id: string;
  party_id: string;
  map_id: string;
  kind: TableItemKind;
  label: string;
  image_url: string | null;
  character_id: string | null;
  monster_id: string | null;
  /** Position as a fraction (0 to 1) of the map's width and height. */
  x: number;
  y: number;
  /** Diameter in grid squares, or a fraction of the map width when the map has no grid. */
  size: number;
  color: string;
  /** Revealed to players. Players are only ever sent items where this is true. */
  visible: boolean;
  locked: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TableState {
  id: string;
  party_id: string;
  /** The scene players are looking at. */
  map_id: string | null;
  revision: number;
}

export interface NewTableItem {
  kind: TableItemKind;
  character_id?: string;
  monster_id?: string;
  label?: string;
  color?: string;
  size?: number;
}
