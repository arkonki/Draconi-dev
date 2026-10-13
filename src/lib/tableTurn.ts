import { nextInitiativeActions } from './initiativeSlots';
import type { EncounterCombatant } from '../types/encounter';
import type { TableItem } from '../types/virtualTable';

export interface TurnEntry {
  key: string;
  /** What to show. Hidden monsters are shown to players as "Unknown". */
  label: string;
  initiative: number | null;
  isCurrent: boolean;
  isPlayerCharacter: boolean;
  /** The token on the table that belongs to this action, when there is one. */
  itemId: string | null;
  /** The whole entry is concealed from this viewer. */
  concealed: boolean;
}

export interface TableTurn {
  entries: TurnEntry[];
  /** Tokens that should be marked as the one whose turn it is. */
  currentItemIds: Set<string>;
}

const baseName = (name: string) => name.replace(/ \(Act \d+\)$/, '').trim().toLowerCase();

/** Finds the token for a combatant: a character by id, a monster by its kind and name. */
export function tokenFor(combatant: EncounterCombatant, items: TableItem[]): TableItem | null {
  if (combatant.character_id) return items.find((item) => item.character_id === combatant.character_id) ?? null;
  if (!combatant.monster_id) return null;
  const sameKind = items.filter((item) => item.monster_id === combatant.monster_id);
  const named = sameKind.find((item) => baseName(item.label) === baseName(combatant.display_name));
  if (named) return named;
  return sameKind.length === 1 ? sameKind[0] : null;
}

/**
 * The upcoming actions of the active encounter in initiative order, ready to show on the table. Players are
 * only told about monsters whose token has been revealed, so the strip never gives away what is still hidden.
 */
export function buildTableTurn(combatants: EncounterCombatant[], items: TableItem[], isGm: boolean, limit = 8): TableTurn {
  const actions = nextInitiativeActions(combatants);
  const entries: TurnEntry[] = actions.slice(0, limit).map((action, index) => {
    const combatant = action.combatant;
    const token = tokenFor(combatant, items);
    const isPlayerCharacter = combatant.is_player_character;
    const concealed = !isGm && !isPlayerCharacter && !(token?.visible);
    return {
      key: `${combatant.id}:${action.initiative ?? 'x'}:${index}`,
      label: concealed ? 'Unknown' : (isPlayerCharacter ? combatant.display_name : combatant.display_name.replace(/ \(Act \d+\)$/, '')),
      initiative: action.initiative,
      isCurrent: index === 0,
      isPlayerCharacter,
      itemId: concealed ? null : token?.id ?? null,
      concealed,
    };
  });
  const currentItemIds = new Set<string>();
  const current = entries[0];
  if (current?.itemId) currentItemIds.add(current.itemId);
  return { entries, currentItemIds };
}
