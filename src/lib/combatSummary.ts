export interface SummaryLogEntry {
  type: string;
  ts?: number;
  round?: number;
  attacker?: string | null;
  target?: string;
  targetIsPlayer?: boolean;
  damage?: number;
  absorbed?: number;
  parried?: boolean;
  defeated?: boolean;
  dying?: boolean;
  instantDeath?: boolean;
}

export interface SummaryCombatant {
  display_name: string;
  is_player_character: boolean;
  monster_id: string | null;
  current_hp: number;
  max_hp: number;
}

export interface CombatSummary {
  rounds: number;
  /** Damage the players' side dealt to monsters, after armor. */
  damageToMonsters: number;
  /** Damage the monsters dealt to player characters, after armor. */
  damageToPlayers: number;
  armorAbsorbed: number;
  parries: number;
  defeated: string[];
  wentDown: string[];
  died: string[];
  /** Player characters still at 0 HP. */
  stillDown: string[];
  playerHp: Array<{ name: string; current: number; max: number }>;
}

const baseName = (name: string) => name.replace(/ \(Act \d+\)$/, '');

/** Turns the structured combat log and the final roster into the numbers shown when an encounter ends. */
export function buildCombatSummary(log: SummaryLogEntry[], combatants: SummaryCombatant[], rounds: number): CombatSummary {
  const summary: CombatSummary = {
    rounds,
    damageToMonsters: 0,
    damageToPlayers: 0,
    armorAbsorbed: 0,
    parries: 0,
    defeated: [],
    wentDown: [],
    died: [],
    stillDown: [],
    playerHp: [],
  };

  for (const entry of log) {
    if (entry.type !== 'attack_resolve') continue;
    const dealt = Math.max(0, entry.damage ?? 0);
    if (entry.targetIsPlayer) summary.damageToPlayers += dealt;
    else summary.damageToMonsters += dealt;
    summary.armorAbsorbed += entry.absorbed ?? 0;
    if (entry.parried) summary.parries += 1;
    if (entry.defeated && entry.target) summary.defeated.push(entry.target);
    if (entry.dying && entry.target && !summary.wentDown.includes(entry.target)) summary.wentDown.push(entry.target);
    if (entry.instantDeath && entry.target && !summary.died.includes(entry.target)) summary.died.push(entry.target);
  }

  const seenMonsters = new Set<string>();
  for (const combatant of combatants) {
    if (combatant.is_player_character) {
      summary.playerHp.push({ name: combatant.display_name, current: combatant.current_hp, max: combatant.max_hp });
      if (combatant.current_hp === 0) summary.stillDown.push(combatant.display_name);
    } else if (combatant.monster_id && combatant.current_hp === 0) {
      // Monsters with several actions are several combatants but one creature.
      const name = baseName(combatant.display_name);
      if (!seenMonsters.has(name) && !summary.defeated.includes(name)) summary.defeated.push(name);
      seenMonsters.add(name);
    }
  }
  return summary;
}
