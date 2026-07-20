export type GameDataImportCategory = 'items' | 'spells';

export interface ImportMagicSchool {
  id: string;
  name: string;
}

export interface ExistingImportEntry {
  name?: unknown;
  school_id?: unknown;
}

export interface GameDataImportRow {
  rowNumber: number;
  record: Record<string, unknown>;
  errors: string[];
}

export interface GameDataImportPreview {
  headers: string[];
  rows: GameDataImportRow[];
  fileErrors: string[];
}

type SheetCell = string | number | boolean | Date | null | undefined;

const MAX_FILE_BYTES = 5_000_000;
const MAX_IMPORT_ROWS = 1_000;

export const ITEM_IMPORT_COLUMNS = [
  'name', 'category', 'cost', 'weight', 'description', 'effect', 'requirement',
  'damage', 'armor_rating', 'range', 'grip', 'durability', 'features', 'skill',
  'strength_requirement', 'supply', 'quantity', 'equippable',
  'encumbrance_modifier', 'is_container', 'container_capacity', 'is_consumable',
] as const;

export const SPELL_IMPORT_COLUMNS = [
  'name', 'school', 'school_id', 'rank', 'description', 'casting_time', 'range',
  'duration', 'willpower_cost', 'dice', 'power_level', 'prerequisite',
  'requirement', 'casting_requirement',
] as const;

const COMMON_HEADER_ALIASES: Record<string, string> = {
  title: 'name',
  wp: 'willpower_cost',
  wp_cost: 'willpower_cost',
  willpower: 'willpower_cost',
  willpower_points: 'willpower_cost',
};

const ITEM_HEADER_ALIASES: Record<string, string> = {
  ...COMMON_HEADER_ALIASES,
  type: 'category',
  armor: 'armor_rating',
  armour: 'armor_rating',
  armour_rating: 'armor_rating',
  str_requirement: 'strength_requirement',
  str_req: 'strength_requirement',
  count: 'quantity',
  uses: 'quantity',
  container: 'is_container',
  consumable: 'is_consumable',
};

const SPELL_HEADER_ALIASES: Record<string, string> = {
  ...COMMON_HEADER_ALIASES,
  magic_school: 'school',
  school_name: 'school',
  casting_cost: 'willpower_cost',
  learning_prerequisite: 'prerequisite',
  casting_requirements: 'requirement',
  has_power_levels: 'power_level',
};

function normalizedHeader(value: SheetCell): string {
  const key = String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key;
}

function textValue(value: SheetCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function nullableText(value: SheetCell): string | null {
  const text = textValue(value);
  return text || null;
}

function numberValue(
  value: SheetCell,
  label: string,
  errors: string[],
  options: { integer?: boolean; minimum?: number; maximum?: number; defaultValue?: number | null } = {},
): number | null {
  const raw = textValue(value);
  if (!raw) return options.defaultValue ?? null;
  const normalized = typeof value === 'number' ? value : Number(raw.replace(',', '.'));
  if (!Number.isFinite(normalized)) {
    errors.push(`${label} must be a number.`);
    return options.defaultValue ?? null;
  }
  if (options.integer && !Number.isInteger(normalized)) errors.push(`${label} must be a whole number.`);
  if (options.minimum !== undefined && normalized < options.minimum) errors.push(`${label} must be at least ${options.minimum}.`);
  if (options.maximum !== undefined && normalized > options.maximum) errors.push(`${label} must be at most ${options.maximum}.`);
  return normalized;
}

function booleanValue(value: SheetCell, label: string, errors: string[], defaultValue = false): boolean {
  if (value === null || value === undefined || textValue(value) === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  const normalized = textValue(value).toLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off', 'none'].includes(normalized)) return false;
  errors.push(`${label} must be true/false, yes/no, or 1/0.`);
  return defaultValue;
}

function featureList(value: SheetCell, errors: string[]): string[] {
  const raw = textValue(value);
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
        errors.push('Features JSON must be an array of strings.');
        return [];
      }
      return parsed.map((item) => item.trim()).filter(Boolean);
    } catch {
      errors.push('Features contains invalid JSON.');
      return [];
    }
  }
  return raw.split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
}

function isValidSpellPrerequisite(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prerequisite = value as { type?: unknown; name?: unknown; value?: unknown; operator?: unknown; conditions?: unknown };
  if (prerequisite.type === 'anySchool') return true;
  if (['spell', 'school'].includes(String(prerequisite.type))) return typeof prerequisite.name === 'string';
  if (['skill', 'attribute'].includes(String(prerequisite.type))) {
    return typeof prerequisite.name === 'string' && typeof prerequisite.value === 'number';
  }
  if (prerequisite.type === 'logical') {
    return (prerequisite.operator === 'AND' || prerequisite.operator === 'OR')
      && Array.isArray(prerequisite.conditions)
      && prerequisite.conditions.length > 0
      && prerequisite.conditions.every(isValidSpellPrerequisite);
  }
  return false;
}

function prerequisiteValue(value: SheetCell, errors: string[]): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isValidSpellPrerequisite(parsed)) {
      errors.push('Prerequisite JSON does not match a supported prerequisite structure.');
      return null;
    }
    return JSON.stringify(parsed);
  } catch {
    errors.push('Prerequisite must contain valid JSON.');
    return null;
  }
}

function rowObject(headers: string[], row: SheetCell[]): Record<string, SheetCell> {
  return headers.reduce<Record<string, SheetCell>>((result, header, index) => {
    if (header) result[header] = row[index];
    return result;
  }, {});
}

function itemRecord(source: Record<string, SheetCell>, errors: string[]): Record<string, unknown> {
  const name = textValue(source.name);
  const category = textValue(source.category);
  if (!name) errors.push('Name is required.');
  if (!category) errors.push('Category is required.');

  return {
    name,
    category,
    cost: nullableText(source.cost),
    weight: numberValue(source.weight, 'Weight', errors, { minimum: 0 }),
    description: nullableText(source.description),
    effect: nullableText(source.effect),
    requirement: nullableText(source.requirement),
    damage: nullableText(source.damage),
    armor_rating: numberValue(source.armor_rating, 'Armor rating', errors, { minimum: 0 }),
    range: nullableText(source.range),
    grip: nullableText(source.grip),
    durability: numberValue(source.durability, 'Durability', errors, { minimum: 0 }),
    features: featureList(source.features, errors),
    skill: nullableText(source.skill),
    strength_requirement: numberValue(source.strength_requirement, 'Strength requirement', errors, { minimum: 0 }),
    supply: nullableText(source.supply),
    quantity: numberValue(source.quantity, 'Quantity', errors, { integer: true, minimum: 1, defaultValue: 1 }),
    equippable: booleanValue(source.equippable, 'Equippable', errors),
    encumbrance_modifier: numberValue(source.encumbrance_modifier, 'Encumbrance modifier', errors, { minimum: 0, defaultValue: 1 }),
    is_container: booleanValue(source.is_container, 'Is container', errors),
    container_capacity: numberValue(source.container_capacity, 'Container capacity', errors, { integer: true, minimum: 0 }),
    is_consumable: booleanValue(source.is_consumable, 'Is consumable', errors),
  };
}

function spellRecord(
  source: Record<string, SheetCell>,
  errors: string[],
  magicSchools: ImportMagicSchool[],
): Record<string, unknown> {
  const name = textValue(source.name);
  if (!name) errors.push('Name is required.');

  const schoolNameInput = textValue(source.school);
  const schoolIdInput = textValue(source.school_id);
  let school: ImportMagicSchool | undefined;
  if (schoolIdInput) school = magicSchools.find((entry) => entry.id === schoolIdInput);
  if (!school && schoolNameInput && schoolNameInput.toLowerCase() !== 'general') {
    school = magicSchools.find((entry) => entry.name.toLowerCase() === schoolNameInput.toLowerCase());
  }
  if (schoolIdInput && !school) errors.push(`Magic school ID "${schoolIdInput}" was not found.`);
  if (!schoolIdInput && schoolNameInput && schoolNameInput.toLowerCase() !== 'general' && !school) {
    errors.push(`Magic school "${schoolNameInput}" was not found.`);
  }
  if (school && schoolNameInput && schoolNameInput.toLowerCase() !== 'general'
      && school.name.toLowerCase() !== schoolNameInput.toLowerCase()) {
    errors.push('School and school_id refer to different magic schools.');
  }

  const powerLevel = booleanValue(source.power_level, 'Power level', errors);
  return {
    name,
    school: school?.name ?? null,
    school_id: school?.id ?? null,
    rank: numberValue(source.rank, 'Rank', errors, { integer: true, minimum: 0, maximum: 5, defaultValue: 0 }),
    description: nullableText(source.description),
    casting_time: nullableText(source.casting_time),
    range: nullableText(source.range),
    duration: nullableText(source.duration),
    willpower_cost: numberValue(source.willpower_cost, 'Willpower cost', errors, { integer: true, minimum: 0, defaultValue: 0 }),
    dice: nullableText(source.dice),
    power_level: powerLevel ? 'yes' : 'none',
    prerequisite: prerequisiteValue(source.prerequisite, errors),
    requirement: nullableText(source.requirement),
    casting_requirement: nullableText(source.casting_requirement),
  };
}

function importKey(category: GameDataImportCategory, entry: ExistingImportEntry): string {
  const name = textValue(entry.name as SheetCell).toLowerCase();
  return category === 'items' ? name : `${name}::${textValue(entry.school_id as SheetCell).toLowerCase()}`;
}

export function validateGameDataImport(
  category: GameDataImportCategory,
  sheetRows: SheetCell[][],
  magicSchools: ImportMagicSchool[] = [],
  existingEntries: ExistingImportEntry[] = [],
): GameDataImportPreview {
  const nonEmptyRows = sheetRows.filter((row) => row.some((cell) => textValue(cell) !== ''));
  if (nonEmptyRows.length === 0) return { headers: [], rows: [], fileErrors: ['The selected file is empty.'] };

  const aliases = category === 'items' ? ITEM_HEADER_ALIASES : SPELL_HEADER_ALIASES;
  const allowedColumns = new Set<string>(category === 'items' ? ITEM_IMPORT_COLUMNS : SPELL_IMPORT_COLUMNS);
  const headers = nonEmptyRows[0].map((cell) => {
    const normalized = normalizedHeader(cell);
    return aliases[normalized] ?? normalized;
  });
  const fileErrors: string[] = [];
  const populatedHeaders = headers.filter(Boolean);
  const duplicateHeaders = populatedHeaders.filter((header, index) => populatedHeaders.indexOf(header) !== index);
  const unknownHeaders = populatedHeaders.filter((header) => !allowedColumns.has(header));
  if (duplicateHeaders.length) fileErrors.push(`Duplicate columns: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  if (unknownHeaders.length) fileErrors.push(`Unknown columns: ${[...new Set(unknownHeaders)].join(', ')}.`);
  if (!headers.includes('name')) fileErrors.push('A name column is required.');
  if (category === 'items' && !headers.includes('category')) fileErrors.push('A category column is required for items.');

  const dataRows = nonEmptyRows.slice(1);
  if (dataRows.length === 0) fileErrors.push('The file contains headers but no data rows.');
  if (dataRows.length > MAX_IMPORT_ROWS) fileErrors.push(`Imports are limited to ${MAX_IMPORT_ROWS} rows at a time.`);

  const existingKeys = new Set(existingEntries.map((entry) => importKey(category, entry)).filter(Boolean));
  const seenRows = new Map<string, GameDataImportRow>();
  const rows = dataRows.slice(0, MAX_IMPORT_ROWS).map((row, index) => {
    const errors: string[] = [];
    const source = rowObject(headers, row);
    const record = category === 'items' ? itemRecord(source, errors) : spellRecord(source, errors, magicSchools);
    const result: GameDataImportRow = { rowNumber: index + 2, record, errors };
    const key = importKey(category, record);
    if (key && existingKeys.has(key)) {
      errors.push(category === 'items'
        ? 'An item with this name already exists.'
        : 'A spell with this name and school already exists.');
    }
    const firstSeen = seenRows.get(key);
    if (key && firstSeen) {
      errors.push(`Duplicates row ${firstSeen.rowNumber} in this file.`);
      if (!firstSeen.errors.some((error) => error.includes('Duplicates row'))) {
        firstSeen.errors.push(`Duplicates row ${result.rowNumber} in this file.`);
      }
    } else if (key) {
      seenRows.set(key, result);
    }
    return result;
  });

  return { headers, rows, fileErrors };
}

function delimiterFor(text: string): string {
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === '\n' || character === '\r')) {
      break;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

export function parseDelimitedText(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];
  const delimiter = delimiterFor(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('The CSV file contains an unterminated quoted value.');
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function readGameDataImportFile(file: File): Promise<SheetCell[][]> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Import files must be 5 MB or smaller.');
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'csv') return parseDelimitedText(await file.text());
  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    return await readSheet(file) as SheetCell[][];
  }
  throw new Error('Choose a .csv or .xlsx file. Legacy .xls files are not supported.');
}

function csvRow(values: unknown[]): string {
  return values.map((value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',');
}

export function gameDataImportTemplate(category: GameDataImportCategory): { filename: string; contents: string } {
  if (category === 'items') {
    const sample = [
      'Sample Rope', 'TOOLS', '1 silver', 1, 'A sturdy rope.', '', '', '', '', '', '', '',
      'UTILITY|CLIMBING', '', '', 'Common', 1, false, 1, false, '', false,
    ];
    return {
      filename: 'dragonbane-items-import-template.csv',
      contents: `${csvRow([...ITEM_IMPORT_COLUMNS])}\r\n${csvRow(sample)}\r\n`,
    };
  }
  const sample = [
    'Sample Light', 'General', '', 0, 'Creates a small magical light.', 'Action', '10 meters',
    'Stretch', 0, '', false, '{"type":"anySchool"}', '', '',
  ];
  return {
    filename: 'dragonbane-spells-import-template.csv',
    contents: `${csvRow([...SPELL_IMPORT_COLUMNS])}\r\n${csvRow(sample)}\r\n`,
  };
}

export function canImportGameData(preview: GameDataImportPreview | null): boolean {
  return Boolean(preview && preview.rows.length > 0 && preview.fileErrors.length === 0
    && preview.rows.every((row) => row.errors.length === 0));
}
