// Types, constants and pure helpers for the encounter view: how a monster's stats, gear and attacks are read
// and turned into what the view shows and rolls. Nothing here renders anything.

import type { EncounterCombatant } from '../../types/encounter';
import type { Character } from '../../types/character';
import { type MonsterAttackTableDie } from '../../lib/monsterAttackTable';


// --- TYPES ---
export interface MonsterStats {
  HP?: number;
  WP?: number;
  SIZE?: string;
  ARMOR?: number;
  FEROCITY?: number | string;
  MOVEMENT?: number;
  IS_NPC?: boolean;
  TYPE?: string;
  SKILLS?: string;
  SKILL_ENTRIES?: Array<{
    skill_id: string;
    name: string;
    level: number;
    attribute?: string | null;
  }>;
  HEROIC_ABILITIES?: string;
  HEROIC_ABILITY_ITEMS?: Array<{
    ability_id: string;
    name: string;
    description?: string;
    willpower_cost?: number | null;
  }>;
  DAMAGE_BONUS?: string;
  DAMAGE_BONUS_CONFIG?: {
    attribute: 'STR' | 'AGL' | 'INT' | 'CHA' | 'CON' | 'WIL';
    die: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
  } | null;
  GEAR?: string;
  GEAR_ITEMS?: MonsterGearItem[];
  [key: string]: unknown;
}
export interface MonsterAttack { name: string; effects: unknown[]; description: string; roll_values?: string; }
export interface MonsterData { id: string; name: string; category?: string; stats?: MonsterStats; attacks?: MonsterAttack[]; effectsSummary?: string; party_id?: string | null; }
export interface MonsterGearItem {
  item_id: string;
  name: string;
  category?: string;
  quantity: number;
  description?: string;
  damage?: string;
  armor_rating?: number | string;
  range?: string | number;
  grip?: string;
  durability?: number | string;
  features?: string | string[];
  effect?: string;
  skill?: string;
}
export type WeaponAttribute = 'STR' | 'AGL';
export interface PartyEncounterViewProps { partyId: string; partyMembers: Character[]; isDM: boolean; }
export interface EditableCombatantStats { current_hp: string; current_wp: string; initiative_roll?: string; }
export interface AttackDescriptionRendererProps {
  description: string;
  attackName: string;
  onDamageRollComplete?: (result: { total: number | null; formula: string }) => void;
}
export interface MonsterAttackResolutionContext {
  roll: number;
  tableDie: MonsterAttackTableDie;
  attackName: string;
  damage: number | null;
  damageFormula: string | null;
}
export interface CombatLogEntry {
  type: string;
  ts: number;
  who?: string;
  round?: number;
  name?: string;
  delta?: number;
  attack?: { name?: string; tableDie?: MonsterAttackTableDie };
  roll?: number;
  attacker?: string;
  target?: string;
  damage?: number;
  message?: string;
  raw?: number;
  armor?: number;
  absorbed?: number;
  parried?: boolean;
  ignoredArmor?: boolean;
  attackName?: string | null;
  hpBefore?: number;
  hpAfter?: number;
  defeated?: boolean;
  dying?: boolean;
  instantDeath?: boolean;
}
export interface InitiativeUpdate { id: string; initiative_roll: number; initiative_slots: number[]; }
export interface PersistedEncounterViewState {
  selectedEncounterId: string | null;
  viewMode: 'details' | 'create';
  selectedActorId: string | null;
  temporaryNotes: string;
  editedName: string;
  isEditingEncounter: boolean;
  swapSourceId: string | null;
}

export const ENCOUNTER_VIEW_STATE_STORAGE_PREFIX = 'partyEncounterViewState';
export const getEncounterViewStateStorageKey = (partyId: string) => `${ENCOUNTER_VIEW_STATE_STORAGE_PREFIX}:${partyId}`;

export const FEAR_ATTACK_QUICK_INFO =
  'When struck by a fear attack you must immediately make a roll against WIL. The roll can be pushed (optional rule) and does not count as an action.';

export const FEAR_EFFECT_ROWS = [
  {
    roll: '1',
    title: 'Enfeebled.',
    description:
      'The fear drains your energy and determination. You lose 2D6 WP (to a minimum of zero) and become Disheartened.',
  },
  {
    roll: '2',
    title: 'Shaken.',
    description: 'You suffer the Scared condition.',
  },
  {
    roll: '3',
    title: 'Panting.',
    description: 'The intense fear leaves you out of breath and makes you Exhausted.',
  },
  {
    roll: '4',
    title: 'Pale.',
    description:
      'Your face turns white as a sheet. You and all player characters within 10 meters and in sight of you become Scared.',
  },
  {
    roll: '5',
    title: 'Scream.',
    description:
      'You scream in horror, which causes all player characters who hear the sound to immediately suffer a fear attack as well. Each person only ever needs to make one WIL roll to resist the same fear attack.',
  },
  {
    roll: '6',
    title: 'Rage.',
    description:
      'Your fear turns to anger, and you are forced to attack its source on your next turn - in melee combat if possible. You also become Angry.',
  },
  {
    roll: '7',
    title: 'Paralyzed.',
    description:
      'You are petrified with terror and unable to move. You cannot perform any action or movement on your next turn. Make another WIL roll on each subsequent turn (not an action) to break the paralysis.',
  },
  {
    roll: '8',
    title: 'Wild Panic.',
    description:
      'In a fit of utter panic, you flee the scene as fast as you can. On your next turn you must dash away from the source of your fear. Make another WIL roll on each subsequent turn (not an action) to stop running and act normally again.',
  },
];

// --- HELPER: SYNC LOGIC ---
export const getSiblings = (target: EncounterCombatant, allCombatants: EncounterCombatant[]) => {
  if (!target.monster_id) return [target];
  const baseName = target.display_name.replace(/ \(Act \d+\)$/, '');
  return allCombatants.filter(c =>
    c.monster_id === target.monster_id &&
    c.display_name.replace(/ \(Act \d+\)$/, '') === baseName
  );
};

// --- UTILS ---
export const generateDeck = (totalNeeded: number, manualValues: number[]): number[] => {
  const deck: number[] = [];
  const decksCount = Math.ceil(Math.max(totalNeeded, 1) / 10);
  for (let d = 0; d < decksCount; d++) { for (let i = 1; i <= 10; i++) deck.push(i); }
  manualValues.forEach(val => { const index = deck.indexOf(val); if (index > -1) deck.splice(index, 1); });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
};

export const hasRollableMonsterAttacks = (monsterData?: MonsterData) =>
  Boolean(monsterData?.attacks?.some((attack) => (attack.roll_values ?? '').trim().length > 0));

export const matchesMonsterAttackRoll = (rollValues: string | undefined, roll: number) => {
  const normalized = (rollValues ?? '').trim();
  if (!normalized) {
    return false;
  }

  return normalized
    .split(',')
    .map((part) => part.trim())
    .some((part) => {
      if (!part) {
        return false;
      }

      if (part.includes('-')) {
        const [startRaw, endRaw] = part.split('-');
        const start = parseInt(startRaw, 10);
        const end = parseInt(endRaw, 10);
        if (Number.isNaN(start) || Number.isNaN(end)) {
          return false;
        }
        return roll >= Math.min(start, end) && roll <= Math.max(start, end);
      }

      return parseInt(part, 10) === roll;
    });
};

export const getDefaultMonsterAttack = (monsterData?: MonsterData): MonsterAttack | null => {
  const attacks = monsterData?.attacks ?? [];
  if (attacks.length === 0) {
    return null;
  }

  return attacks.find((attack) => !(attack.roll_values ?? '').trim()) ?? null;
};

export const weaponSkillAttributeMap: Record<string, WeaponAttribute> = {
  axes: 'STR',
  axe: 'STR',
  bows: 'AGL',
  bow: 'AGL',
  brawling: 'STR',
  crossbows: 'AGL',
  crossbow: 'AGL',
  hammers: 'STR',
  hammer: 'STR',
  knives: 'AGL',
  knife: 'AGL',
  slings: 'AGL',
  sling: 'AGL',
  spears: 'STR',
  spear: 'STR',
  staves: 'AGL',
  staff: 'AGL',
  swords: 'STR',
  sword: 'STR',
};

export const parseBaseWeaponSkillName = (skillNameWithAttr: string | null | undefined): string | null => {
  if (!skillNameWithAttr) {
    return null;
  }

  return skillNameWithAttr.split('(')[0].trim();
};

export const NPC_STRUCTURED_HIDDEN_KEYS = [
  'TYPE',
  'SKILLS',
  'SKILL_ENTRIES',
  'HEROIC_ABILITIES',
  'HEROIC_ABILITY_ITEMS',
  'DAMAGE_BONUS',
  'DAMAGE_BONUS_CONFIG',
  'GEAR',
  'GEAR_ITEMS',
];

export const getMonsterDamageBonusLabel = (stats?: MonsterStats) => {
  const config = stats?.DAMAGE_BONUS_CONFIG;
  if (config?.attribute && config?.die) {
    return `${config.attribute} +${config.die.toUpperCase()}`;
  }

  const legacyBonus = stats?.DAMAGE_BONUS?.trim();
  return legacyBonus ? legacyBonus : null;
};

export const getMonsterSkillDisplay = (stats?: MonsterStats) => {
  if (stats?.SKILL_ENTRIES?.length) {
    return stats.SKILL_ENTRIES.map((entry) => `${entry.name} ${entry.level}`);
  }

  const legacySkills = stats?.SKILLS?.trim();
  return legacySkills ? [legacySkills] : [];
};

export const getMonsterSkillEntries = (stats?: MonsterStats) => {
  if (stats?.SKILL_ENTRIES?.length) {
    return stats.SKILL_ENTRIES.map((entry) => ({
      skill_id: entry.skill_id,
      name: entry.name,
      level: typeof entry.level === 'number' ? entry.level : parseInt(String(entry.level), 10) || 1,
      attribute: entry.attribute ?? null,
    }));
  }

  return getMonsterSkillDisplay(stats).flatMap((entry, index) =>
    entry
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, lineIndex) => {
        const match = line.match(/^(.*?)(?:\s+(\d+))?$/);
        return {
          skill_id: `legacy-skill-${index}-${lineIndex}`,
          name: match?.[1]?.trim() || line,
          level: match?.[2] ? parseInt(match[2], 10) : 1,
          attribute: null,
        };
      })
  );
};

export const getMonsterHeroicAbilityDisplay = (stats?: MonsterStats) => {
  if (stats?.HEROIC_ABILITY_ITEMS?.length) {
    return stats.HEROIC_ABILITY_ITEMS.map((entry) =>
      entry.willpower_cost != null
        ? `${entry.name} (WP ${entry.willpower_cost})`
        : entry.name
    );
  }

  const legacyAbilities = stats?.HEROIC_ABILITIES?.trim();
  return legacyAbilities ? [legacyAbilities] : [];
};

export type MonsterHeroicAbilityEntry = { ability_id: string; name: string; description?: string; willpower_cost?: number | null };

export const getMonsterHeroicAbilityEntries = (stats?: MonsterStats): MonsterHeroicAbilityEntry[] => {
  if (stats?.HEROIC_ABILITY_ITEMS?.length) {
    return stats.HEROIC_ABILITY_ITEMS.map((entry) => ({
      ability_id: entry.ability_id,
      name: entry.name,
      description: entry.description,
      willpower_cost: entry.willpower_cost,
    }));
  }

  return getMonsterHeroicAbilityDisplay(stats).flatMap((entry, index) =>
    entry
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, lineIndex) => ({
        ability_id: `legacy-ability-${index}-${lineIndex}`,
        name: line,
      }))
  );
};

export const parseMonsterDamageBonus = (stats?: MonsterStats) => {
  const config = stats?.DAMAGE_BONUS_CONFIG;
  if (config?.attribute && config?.die) {
    return {
      attribute: config.attribute,
      die: config.die.toLowerCase(),
    };
  }

  const legacyBonus = stats?.DAMAGE_BONUS?.trim();
  if (!legacyBonus) {
    return null;
  }

  const match = legacyBonus.match(/^(STR|AGL|INT|CHA|CON|WIL)\s*\+\s*(D\d+)$/i);
  if (!match) {
    return null;
  }

  return {
    attribute: match[1].toUpperCase(),
    die: match[2].toLowerCase(),
  };
};

export const getGearWeaponAttribute = (gearItem: MonsterGearItem): WeaponAttribute | null => {
  const rawSkill = parseBaseWeaponSkillName(typeof gearItem.skill === 'string' ? gearItem.skill : null);
  const normalizedSkill = rawSkill?.toLowerCase();
  if (normalizedSkill) {
    if (normalizedSkill in weaponSkillAttributeMap) {
      return weaponSkillAttributeMap[normalizedSkill];
    }

    const matchedSkill = Object.entries(weaponSkillAttributeMap).find(([skillName]) =>
      normalizedSkill === skillName ||
      normalizedSkill.includes(skillName) ||
      skillName.includes(normalizedSkill)
    );
    if (matchedSkill) {
      return matchedSkill[1];
    }
  }

  const normalizedCategory = gearItem.category?.trim().toUpperCase();
  if (normalizedCategory?.includes('RANGED')) {
    return 'AGL';
  }
  if (normalizedCategory?.includes('MELEE')) {
    return 'STR';
  }

  return null;
};

export const getMonsterGearDamageFormula = (gearItem: MonsterGearItem, stats?: MonsterStats) => {
  const baseDamage = gearItem.damage?.trim();
  if (!baseDamage) {
    return null;
  }

  const features = gearItem.features;
  const featuresStr = Array.isArray(features) ? features.join(' ') : (features || '');
  const hasNoDamageBonus = featuresStr.toUpperCase().includes('NO DAMAGE BONUS');
  const parsedBonus = parseMonsterDamageBonus(stats);
  const weaponAttribute = getGearWeaponAttribute(gearItem);

  if (hasNoDamageBonus || !parsedBonus || !weaponAttribute || parsedBonus.attribute !== weaponAttribute) {
    return {
      formula: baseDamage.toLowerCase().replace(/\s/g, ''),
      display: baseDamage.toUpperCase(),
      appliedBonus: null,
    };
  }

  return {
    formula: `${baseDamage.toLowerCase().replace(/\s/g, '')}+${parsedBonus.die}`,
    display: `${baseDamage.toUpperCase()} + ${parsedBonus.die.toUpperCase()}`,
    appliedBonus: parsedBonus,
  };
};

export const isValidDiceType = (value: string): value is 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' => {
  return ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(value);
};

export const buildMonsterGearDamageRoll = (gearItem: MonsterGearItem, stats?: MonsterStats) => {
  const damageConfig = getMonsterGearDamageFormula(gearItem, stats);
  const baseDamage = gearItem.damage?.trim();

  if (!damageConfig || !baseDamage) {
    return null;
  }

  const dicePool: Array<'d4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20'> = [];
  const formulaParts: string[] = [];
  const baseMatch = baseDamage.match(/(\d+)?d(\d+)/i);

  if (baseMatch) {
    const numDice = baseMatch[1] ? parseInt(baseMatch[1], 10) : 1;
    const dieType = `d${baseMatch[2]}`.toLowerCase();
    if (isValidDiceType(dieType)) {
      for (let i = 0; i < numDice; i += 1) {
        dicePool.push(dieType);
      }
      formulaParts.push(`${numDice > 1 ? numDice : ''}${dieType.toUpperCase()}`);
    }
  }

  if (damageConfig.appliedBonus?.die && isValidDiceType(damageConfig.appliedBonus.die)) {
    dicePool.push(damageConfig.appliedBonus.die);
    formulaParts.push(`${damageConfig.appliedBonus.die.toUpperCase()} (${damageConfig.appliedBonus.attribute})`);
  }

  if (dicePool.length === 0) {
    return null;
  }

  return {
    ...damageConfig,
    dicePool,
    description: `Damage: ${gearItem.name} (${formulaParts.join(' + ')})`,
  };
};

export const getEffectiveMonsterWp = (
  combatantWp?: number | null,
  baseMonsterWp?: number | null,
  pendingWp?: number | null
) => {
  if (typeof pendingWp === 'number' && !Number.isNaN(pendingWp)) {
    return pendingWp;
  }

  if (typeof combatantWp === 'number' && !Number.isNaN(combatantWp)) {
    return combatantWp;
  }

  if (typeof baseMonsterWp === 'number' && !Number.isNaN(baseMonsterWp)) {
    return baseMonsterWp;
  }

  return 0;
};

export const formatGearFeatures = (features: string | string[] | undefined) => {
  if (!features) return '';
  return Array.isArray(features) ? features.join(', ') : features;
};

export const parseNumericValue = (value: number | string | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

export const getEquippedArmorValue = (gearItems?: MonsterGearItem[], stats?: MonsterStats) => {
  const armorFromGear = (gearItems || []).reduce((total, gearItem) => {
    const armor = parseNumericValue(gearItem.armor_rating);
    const quantity = Math.max(1, gearItem.quantity || 1);
    return total + (armor > 0 ? armor * quantity : 0);
  }, 0);

  if (armorFromGear > 0) {
    return armorFromGear;
  }

  return parseNumericValue(stats?.ARMOR);
};

export const createMonsterGearAttackDescription = (gearItem: MonsterGearItem, stats?: MonsterStats) => {
  const damageRoll = buildMonsterGearDamageRoll(gearItem, stats);
  const details = [
    damageRoll?.display ? `Damage: ${damageRoll.display}` : (gearItem.damage ? `Damage: ${gearItem.damage}` : null),
    gearItem.range ? `Range: ${gearItem.range}` : null,
    gearItem.grip ? `Grip: ${gearItem.grip}` : null,
    gearItem.durability ? `Durability: ${gearItem.durability}` : null,
    gearItem.skill ? `Skill: ${gearItem.skill}` : null,
    formatGearFeatures(gearItem.features) ? `Features: ${formatGearFeatures(gearItem.features)}` : null,
    gearItem.effect ? `Effect: ${gearItem.effect}` : null,
    gearItem.description ? gearItem.description : null,
  ].filter(Boolean);

  return details.join('\n');
};

