import type { MonsterAttackEntry, MonsterData, MonsterSize, MonsterStats } from '../types/bestiary';
import { MONSTER_SIZES } from '../types/bestiary';

// Reads the ```monster and ```npc blocks the Story Helper writes, so the GM can keep them in the campaign's own
// bestiary and bring them into a fight. Anything the block does not say is left at a safe default for the GM to edit.

const BLOCK = /```(monster|npc)[^\S\n]*\n([\s\S]*?)```/g;
const plain = (text: string) => text.replace(/\*\*/g, '').trim();
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => plain(cell));
const isDivider = (line: string) => /^\|?\s*:?-{2,}/.test(line.trim());
const number = (value: string | undefined) => {
  const match = String(value ?? '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
};

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
      const roll = plain(raw[0] ?? '');
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
    const stats: MonsterStats = {
      IS_NPC: true,
      TYPE: subtitle,
      FEROCITY: 1,
      SIZE: 'Normal',
      MOVEMENT: number(values.get('movement')),
      ARMOR: number(values.get('armor')),
      HP: Math.max(1, number(values.get('hp'))),
      WP: number(values.get('wp')),
      SKILLS: values.get('skills') ?? '',
      GEAR: values.get('weapons') ?? values.get('gear') ?? '',
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
    MOVEMENT: number(table.get('movement')),
    ARMOR: number(table.get('armor')),
    HP: Math.max(1, number(table.get('hp'))),
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
