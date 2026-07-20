import { describe, expect, it } from 'vitest';
import {
  canImportGameData,
  parseDelimitedText,
  validateGameDataImport,
} from './gameDataImport';

describe('game data import', () => {
  it('parses quoted CSV fields, escaped quotes, and embedded newlines', () => {
    expect(parseDelimitedText('name,description\r\n"Magic, Rope","Line one\nLine ""two"""\r\n')).toEqual([
      ['name', 'description'],
      ['Magic, Rope', 'Line one\nLine "two"'],
    ]);
  });

  it('detects semicolon-delimited CSV exported by regional Excel settings', () => {
    expect(parseDelimitedText('name;category;weight\nRope;TOOLS;1,5\n')).toEqual([
      ['name', 'category', 'weight'],
      ['Rope', 'TOOLS', '1,5'],
    ]);
  });

  it('normalizes item numbers, booleans, aliases, and feature lists', () => {
    const preview = validateGameDataImport('items', [
      ['Name', 'Type', 'Weight', 'Count', 'Equippable', 'Consumable', 'Features'],
      ['Field Kit', 'TOOLS', 1.5, 2, 'yes', 1, 'UTILITY|SURVIVAL'],
    ]);

    expect(canImportGameData(preview)).toBe(true);
    expect(preview.rows[0].record).toMatchObject({
      name: 'Field Kit',
      category: 'TOOLS',
      weight: 1.5,
      quantity: 2,
      equippable: true,
      is_consumable: true,
      features: ['UTILITY', 'SURVIVAL'],
    });
  });

  it('resolves spell school names and validates prerequisite JSON', () => {
    const schools = [{ id: 'school-1', name: 'Animism' }];
    const preview = validateGameDataImport('spells', [
      ['Name', 'Magic School', 'Rank', 'WP Cost', 'Prerequisite'],
      ['Healing Wind', 'animism', 1, 2, '{"type":"school","name":"Animism"}'],
    ], schools);

    expect(canImportGameData(preview)).toBe(true);
    expect(preview.rows[0].record).toMatchObject({
      name: 'Healing Wind',
      school: 'Animism',
      school_id: 'school-1',
      rank: 1,
      willpower_cost: 2,
      prerequisite: '{"type":"school","name":"Animism"}',
    });
  });

  it('blocks unknown schools, duplicate file rows, and existing entries', () => {
    const preview = validateGameDataImport('spells', [
      ['name', 'school', 'rank'],
      ['Known Spell', 'General', 0],
      ['Known Spell', 'General', 0],
      ['Lost Spell', 'Missing School', 6],
    ], [], [{ name: 'Known Spell', school_id: null }]);

    expect(canImportGameData(preview)).toBe(false);
    expect(preview.rows[0].errors.join(' ')).toContain('already exists');
    expect(preview.rows[0].errors.join(' ')).toContain('Duplicates row');
    expect(preview.rows[1].errors.join(' ')).toContain('Duplicates row');
    expect(preview.rows[2].errors.join(' ')).toContain('was not found');
    expect(preview.rows[2].errors.join(' ')).toContain('at most 5');
  });
});
