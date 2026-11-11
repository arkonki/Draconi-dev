import type { MonsterAttackEntry, MonsterData, MonsterGearItem, MonsterSize, MonsterSkillEntry, MonsterStats } from '../types/bestiary';
import { MONSTER_SIZES } from '../types/bestiary';

// Reads the ```monster and ```npc blocks the Story Helper writes, so the GM can keep them in the campaign's own
// bestiary and bring them into a fight. Anything the block does not say is left at a safe default for the GM to edit.

const BLOCK = /```(monster|npc)[^\S\n]*\n([\s\S]*?)```/g;
const plain = (text: string) => text.replace(/\*\*/g, '').trim();
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => plain(cell));
const isDivider = (line: string) => /^\|?\s*:?-{2,}/.test(line.trim());
// Models write ranges with whatever dash they like; the attack table reads a plain hyphen.
const rollRange = (value: string) => plain(value).replace(/\s*[\u2010-\u2015\u2212]\s*/g, '-').replace(/\s*-\s*/g, '-').replace(/^d\d+\s*[:=]?\s*/i, '');
/** The value under any of these headings, so "Armour" or "Hit Points" in place of "Armor" or "HP" still counts. */
const pick = (values: Map<string, string>, ...names: string[]) => names.map((name) => values.get(name)).find((value) => value !== undefined);
/** "STR +D4", however the model spaced or cased it; anything else is not a damage bonus. */
const damageBonus = (value: string | undefined) => {
  const match = String(value ?? '').match(/\b(STR|AGL)\s*\+?\s*(D\d+)\b/i);
  return match ? `${match[1].toUpperCase()} +${match[2].toUpperCase()}` : undefined;
};
const number = (value: string | undefined) => {
  const match = String(value ?? '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
};

// The weapon skill a weapon is used with, for when the block names the weapon but not its skill. The fight needs it
// to know whether the NPC's damage bonus (from STR or from AGL) applies.
const WEAPON_SKILL_HINTS: Array<[RegExp, string]> = [
  [/crossbow/i, 'Crossbows'],
  [/\bbow\b|longbow|short ?bow/i, 'Bows'],
  [/sling/i, 'Slings'],
  [/dagger|knife|knives|stiletto|dirk/i, 'Knives'],
  [/sword|sabre|saber|scimitar|rapier|falchion/i, 'Swords'],
  [/axe|hatchet/i, 'Axes'],
  [/spear|lance|trident|pike|halberd|javelin/i, 'Spears'],
  [/staff|stave|quarterstaff/i, 'Staves'],
  [/hammer|mace|club|flail|morning ?star|maul|cudgel/i, 'Hammers'],
  [/unarmed|fist|punch|kick|claw|bite|brawl/i, 'Brawling'],
];

/** Splits "A (x, y), B (z)" at the commas between entries, leaving the ones inside brackets alone. */
function splitOutsideBrackets(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if ((character === ',' || character === ';') && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** "Awareness 14, Hunting & Fishing 12" → named skills with their levels. Entries without a level are left out. */
export function parseSkillList(text: string | undefined): Array<{ name: string; level: number }> {
  return splitOutsideBrackets(String(text ?? ''))
    .map((entry) => plain(entry).match(/^(.+?)\s*[:(]?\s*(\d{1,2})\)?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ name: match[1].trim(), level: Math.min(Math.max(Number(match[2]), 1), 18) }))
    .filter((skill) => skill.name.length > 0 && skill.name.length <= 60);
}

export interface StoryWeapon {
  name: string;
  /** The weapon skill it is used with, named in the block or worked out from the weapon's name. */
  skill: string | null;
  level: number | null;
  damage: string | null;
  range: string | null;
}

/**
 * "Broadsword (Swords 14, damage 2D6), Short bow (skill 12, damage D10, range 30)" → one entry per weapon. Both ways
 * of writing the skill are read: by name with its level, or as a bare "skill 12".
 */
export function parseNpcWeapons(text: string | undefined): StoryWeapon[] {
  return splitOutsideBrackets(String(text ?? '')).map((entry) => {
    const text = plain(entry);
    const match = text.match(/^([^()]+?)\s*(?:\((.*)\))?$/);
    const name = (match?.[1] ?? text).trim();
    const details = match?.[2] ?? '';
    let skill: string | null = null;
    let level: number | null = null;
    let damage: string | null = null;
    let range: string | null = null;
    for (const detail of details.split(',').map((part) => part.trim()).filter(Boolean)) {
      const dice = detail.match(/(\d*\s*D\s*\d+(?:\s*\+\s*\d+)?)/i);
      const leveled = detail.match(/^(.+?)\s+(\d{1,2})$/);
      if (/^(damage|dmg)\b/i.test(detail) && dice) damage = dice[1].replace(/\s+/g, '').toUpperCase();
      else if (/^range\b/i.test(detail)) range = detail.replace(/^range\s*:?\s*/i, '').trim() || null;
      else if (leveled) {
        level = Math.min(Math.max(Number(leveled[2]), 1), 18);
        if (!/^skill$/i.test(leveled[1].trim())) skill = leveled[1].trim();
      } else if (dice && !damage) damage = dice[1].replace(/\s+/g, '').toUpperCase();
    }
    if (!skill) skill = WEAPON_SKILL_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
    return { name, skill, level, damage, range };
  }).filter((weapon) => weapon.name.length > 0 && weapon.name.length <= 80);
}

/**
 * The structured skills and gear of an NPC: what the fight shows as skill buttons and as weapons with a "Use" button.
 * A weapon's own skill is added to the skills when the block did not list it, so its attack can be rolled.
 */
function npcStructure(skillsText: string | undefined, weaponsText: string | undefined): { skills: MonsterSkillEntry[]; gear: MonsterGearItem[] } {
  const weapons = parseNpcWeapons(weaponsText);
  const named = parseSkillList(skillsText);
  for (const weapon of weapons) {
    if (weapon.skill && weapon.level && !named.some((skill) => skill.name.toLowerCase() === weapon.skill!.toLowerCase())) {
      named.push({ name: weapon.skill, level: weapon.level });
    }
  }
  return {
    skills: named.map((skill, index) => ({ skill_id: `story-skill-${index}`, name: skill.name, level: skill.level, attribute: null })),
    gear: weapons.map((weapon, index) => ({
      item_id: `story-weapon-${index}`,
      name: weapon.name,
      category: weapon.skill && ['bows', 'crossbows', 'slings'].includes(weapon.skill.toLowerCase()) ? 'RANGED WEAPONS' : 'MELEE WEAPONS',
      quantity: 1,
      ...(weapon.damage ? { damage: weapon.damage } : {}),
      ...(weapon.range ? { range: weapon.range } : {}),
      ...(weapon.skill ? { skill: weapon.skill } : {}),
    })),
  };
}

export interface GameDataForNpcs {
  items: Array<{ id: string; name: string; category?: string; description?: string; damage?: string; armor_rating?: number | string; range?: string | number; grip?: string; durability?: number | string; features?: string | string[]; effect?: string; skill?: string }>;
  skills: Array<{ id: string; name: string; attribute?: string | null }>;
}

/**
 * Ties an NPC read from a block to the game's own data: a weapon that is in the item list becomes that item (with
 * its grip, range, durability and features), and a skill the game has gets its real id and attribute. What has no
 * match stays as the block gave it, so nothing the GM asked for is lost.
 */
export function linkNpcToGameData(monster: MonsterData, { items, skills }: GameDataForNpcs): MonsterData {
  if (!monster.stats.IS_NPC) return monster;
  const key = (value: string) => value.trim().toLowerCase();
  const itemsByName = new Map(items.map((item) => [key(item.name), item]));
  const skillsByName = new Map(skills.map((skill) => [key(skill.name), skill]));
  const usedItemIds = new Set<string>();
  const gear = (monster.stats.GEAR_ITEMS ?? []).map((gearItem) => {
    const match = itemsByName.get(key(gearItem.name));
    if (!match || usedItemIds.has(match.id)) return gearItem;
    usedItemIds.add(match.id);
    return {
      ...gearItem,
      item_id: match.id,
      name: match.name,
      category: match.category ?? gearItem.category,
      description: match.description,
      damage: match.damage || gearItem.damage,
      armor_rating: match.armor_rating,
      range: match.range ?? gearItem.range,
      grip: match.grip,
      durability: match.durability,
      features: match.features,
      effect: match.effect,
      skill: match.skill || gearItem.skill,
    };
  });
  const usedSkillIds = new Set<string>();
  const skillEntries = (monster.stats.SKILL_ENTRIES ?? []).map((entry) => {
    const match = skillsByName.get(key(entry.name));
    if (!match || usedSkillIds.has(match.id)) return entry;
    usedSkillIds.add(match.id);
    return { ...entry, skill_id: match.id, name: match.name, attribute: match.attribute ?? entry.attribute ?? null };
  });
  return { ...monster, stats: { ...monster.stats, GEAR_ITEMS: gear, SKILL_ENTRIES: skillEntries } };
}

/** "**Movement:** 12 · **HP:** 11" → { movement: '12', hp: '11' } */
function labelled(lines: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of lines) {
    for (const part of line.split(/\s+[·|]\s+|\s{2,}(?=\*\*)/)) {
      const match = plain(part).match(/^([A-Za-z ]{2,24}):\s*(.+)$/);
      if (match) values.set(match[1].trim().toLowerCase(), match[2].trim());
    }
  }
  return values;
}

/** The first table in the lines as header → value pairs from its first data row. */
function firstTable(lines: string[]): Map<string, string> {
  const rows = lines.filter((line) => line.trim().startsWith('|') && !isDivider(line));
  const table = new Map<string, string>();
  if (rows.length < 2) return table;
  const header = cells(rows[0]);
  const values = cells(rows[1]);
  header.forEach((name, index) => table.set(name.toLowerCase(), values[index] ?? ''));
  return table;
}

function attackTable(lines: string[]): MonsterAttackEntry[] {
  const start = lines.findIndex((line) => /^#+\s*monster attacks/i.test(line.trim()));
  if (start === -1) return [];
  return lines.slice(start + 1)
    .filter((line) => line.trim().startsWith('|') && !isDivider(line))
    .map((line) => {
      const raw = line.trim().replace(/^\||\|$/g, '').split('|');
      const roll = rollRange(raw[0] ?? '');
      const body = (raw.slice(1).join('|') ?? '').trim();
      const match = body.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
      return { roll_values: roll, name: plain(match ? match[1] : body.split(':')[0]).replace(/:$/, ''), description: plain(match ? match[2] : body.split(':').slice(1).join(':')), effects: [] };
    })
    .filter((attack) => /^\d+(\s*-\s*\d+)?$/.test(attack.roll_values) && attack.name);
}

const sizeOf = (value: string | undefined): MonsterSize => MONSTER_SIZES.find((size) => size.toLowerCase() === String(value ?? '').trim().toLowerCase()) ?? 'Normal';

function monsterFrom(kind: 'monster' | 'npc', body: string): MonsterData | null {
  const lines = body.split('\n');
  const nameLine = lines.find((line) => line.trim().startsWith('#'));
  const name = nameLine?.replace(/^#+\s*/, '').trim();
  if (!name) return null;
  const subtitle = lines.map((line) => line.trim().match(/^\*([^*].*?)\*$/)?.[1]).find(Boolean)?.trim() ?? '';
  const table = firstTable(lines);
  const values = labelled(lines);
  const attackStart = lines.findIndex((line) => /^#+\s*monster attacks/i.test(line.trim()));
  const textLines = lines
    .slice(0, attackStart === -1 ? undefined : attackStart)
    .map((line) => line.trim())
    .filter((line) => line && line !== nameLine?.trim() && !/^_{3,}$/.test(line) && !line.startsWith('|') && line.replace(/^\*|\*$/g, '') !== subtitle);

  if (kind === 'npc') {
    const attributes = ['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'].filter((key) => table.has(key.toLowerCase())).map((key) => `${key} ${table.get(key.toLowerCase())}`);
    const descriptionKeys = ['appearance', 'personality', 'motivation'];
    const structure = npcStructure(values.get('skills'), values.get('weapons') ?? values.get('gear'));
    const stats: MonsterStats = {
      IS_NPC: true,
      TYPE: subtitle,
      FEROCITY: 1,
      SIZE: 'Normal',
      MOVEMENT: number(pick(values, 'movement', 'move')),
      ARMOR: number(pick(values, 'armor', 'armour', 'armor rating')),
      HP: Math.max(1, number(pick(values, 'hp', 'hit points'))),
      WP: number(pick(values, 'wp', 'willpower points', 'willpower')),
      DAMAGE_BONUS: damageBonus(values.get('damage bonus')),
      SKILLS: values.get('skills') ?? '',
      GEAR: values.get('weapons') ?? values.get('gear') ?? '',
      // The same skills and weapons in the form the fight can roll.
      ...(structure.skills.length ? { SKILL_ENTRIES: structure.skills } : {}),
      ...(structure.gear.length ? { GEAR_ITEMS: structure.gear } : {}),
    };
    return {
      name: name.slice(0, 120),
      category: 'NPC',
      description: descriptionKeys.filter((key) => values.has(key)).map((key) => `${key[0].toUpperCase()}${key.slice(1)}: ${values.get(key)}`).join('\n'),
      stats,
      attacks: [],
      effectsSummary: attributes.length ? `Attributes: ${attributes.join(', ')}` : '',
    };
  }

  const abilities = textLines.filter((line) => /^[-*•]\s+/.test(line)).map((line) => `- ${plain(line.replace(/^[-*•]\s+/, ''))}`);
  const stats: MonsterStats = {
    FEROCITY: Math.max(1, number(table.get('ferocity')) || 1),
    SIZE: sizeOf(table.get('size') ?? subtitle.split(/\s+/)[0]),
    MOVEMENT: number(pick(table, 'movement', 'move')),
    ARMOR: number(pick(table, 'armor', 'armour')),
    HP: Math.max(1, number(pick(table, 'hp', 'hit points'))),
    SKILLS: values.get('skills') ?? '',
  };
  return {
    name: name.slice(0, 120),
    category: subtitle.slice(0, 60) || 'Monster',
    stats,
    attacks: attackTable(lines),
    effectsSummary: abilities.join('\n'),
  };
}

export function parseStoryMonsters(markdown: string): MonsterData[] {
  const found: MonsterData[] = [];
  for (const match of String(markdown ?? '').matchAll(BLOCK)) {
    const monster = monsterFrom(match[1] as 'monster' | 'npc', match[2]);
    if (monster) found.push(monster);
  }
  return found;
}
