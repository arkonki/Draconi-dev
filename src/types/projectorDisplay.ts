export type DisplayCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

export interface PartyDisplaySession {
  id: string;
  party_id: string;
  display_map_id: string | null;
  display_image_url: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface PartyDisplaySlot {
  id?: string;
  session_id?: string;
  corner: DisplayCorner;
  character_id: string | null;
  rotation_deg: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerDisplayCharacter {
  id: string;
  name: string;
  portraitUrl: string | null;
  currentHp: number;
  maxHp: number;
  currentWp: number;
  maxWp: number;
  conditions: Record<string, boolean>;
}

export interface PlayerDisplayState {
  party: {
    id: string;
    name: string;
  };
  displayImageUrl: string | null;
  map: {
    imageUrl: string | null;
    gridType: 'none' | 'square' | 'hex';
    gridSize: number;
    gridOpacity: number;
    gridOffsetX: number;
    gridOffsetY: number;
    gridColor: string;
    gridRotation: number;
  } | null;
  encounter: {
    isActive: boolean;
    name: string | null;
    round: number | null;
  };
  rollHistory: Array<{
    id: string;
    purpose: string;
    expression: string;
    modifier: 'normal' | 'boon' | 'bane';
    mode: 'player' | 'server' | 'mixed';
    status: 'pending' | 'resolved';
    source: 'server' | 'manual' | null;
    dice: number[];
    keptValues: number[];
    total: number | null;
    outcome: 'dragon' | 'demon' | 'success' | 'failure' | null;
    pushedFromRequestId: string | null;
    pushCondition: string | null;
    createdAt: string;
  }>;
  slots: Array<{
    corner: DisplayCorner;
    rotationDeg: number;
    sortOrder: number;
    character: PlayerDisplayCharacter | null;
  }>;
}
