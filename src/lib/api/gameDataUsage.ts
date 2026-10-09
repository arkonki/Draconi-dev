import { authenticatedApiFetch } from '../supabase';

export interface GameDataUsageEntry {
  key: string;
  label: string;
  count: number;
  examples: string[];
}

export interface GameDataUsage {
  category: string;
  id: string;
  name: string;
  total: number;
  usage: GameDataUsageEntry[];
}

/** What still refers to a game data entry (characters, party stashes, encounters, ...). Administrators only. */
export async function fetchGameDataUsage(category: string, id: string): Promise<GameDataUsage> {
  const response = await authenticatedApiFetch(`/admin/game-data/${encodeURIComponent(category)}/${encodeURIComponent(id)}/usage`);
  const payload = await response.json().catch(() => ({})) as GameDataUsage & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || 'Could not check where this entry is used.');
  return payload;
}
