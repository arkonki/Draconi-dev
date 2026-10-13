import { describe, expect, it } from 'vitest';
import { buildIconIndex, findIcon, isImageFileName, matchesSearch, nameCandidates, normalizeIconName, sanitizeIconFileName, type TokenIconFile } from './tokenIcons';

const file = (name: string): TokenIconFile => ({ name, path: `TokenIcons/${name}`, url: `/icons/${name}` });

describe('normalizeIconName', () => {
  it('ignores case, extension and separators', () => {
    expect(normalizeIconName('Giant_Spider.PNG')).toBe('giant spider');
    expect(normalizeIconName('giant-spider.webp')).toBe('giant spider');
    expect(normalizeIconName('  Giant   Spider ')).toBe('giant spider');
  });

  it('ignores accents', () => {
    expect(normalizeIconName('Ghûl.png')).toBe('ghul');
  });
});

describe('nameCandidates', () => {
  it('tries the full name, then without the action suffix, the number and brackets', () => {
    expect(nameCandidates('Goblin 3 (Act 2)')).toEqual(['goblin 3 (act 2)', 'goblin 3', 'goblin']);
  });

  it('adds other names, such as the bestiary name, after the label', () => {
    expect(nameCandidates('Fang', ['Wolf'])).toEqual(['fang', 'wolf']);
  });

  it('copes with empty values', () => {
    expect(nameCandidates('', [null, undefined])).toEqual([]);
  });
});

describe('findIcon', () => {
  const index = buildIconIndex([file('Goblin.png'), file('Giant Spider.jpg'), file('wolf.webp')]);

  it('finds an icon with the same name as the token', () => {
    expect(findIcon(index, 'Goblin')?.name).toBe('Goblin.png');
    expect(findIcon(index, 'giant spider')?.name).toBe('Giant Spider.jpg');
  });

  it('finds it for numbered and multi-action creatures', () => {
    expect(findIcon(index, 'Goblin 2')?.name).toBe('Goblin.png');
    expect(findIcon(index, 'Goblin 2 (Act 1)')?.name).toBe('Goblin.png');
  });

  it('falls back to another name, so a renamed monster still gets its icon', () => {
    expect(findIcon(index, 'Fang', ['Wolf'])?.name).toBe('wolf.webp');
    expect(findIcon(index, 'Fang')).toBeNull();
  });

  it('prefers the exact name over a looser one', () => {
    const both = buildIconIndex([file('Goblin.png'), file('Goblin 2.png')]);
    expect(findIcon(both, 'Goblin 2')?.name).toBe('Goblin 2.png');
  });

  it('returns nothing from an empty library', () => {
    expect(findIcon(buildIconIndex([]), 'Goblin')).toBeNull();
  });
});

describe('matchesSearch', () => {
  it('matches part of a name, in any case', () => {
    expect(matchesSearch('Giant_Spider.png', 'spid')).toBe(true);
    expect(matchesSearch('Giant_Spider.png', 'GIANT')).toBe(true);
    expect(matchesSearch('Giant_Spider.png', 'wolf')).toBe(false);
  });

  it('needs every word, in any order', () => {
    expect(matchesSearch('Giant Spider.png', 'spider giant')).toBe(true);
    expect(matchesSearch('Giant Spider.png', 'giant wolf')).toBe(false);
  });

  it('ignores the extension and accents, and treats an empty search as everything', () => {
    expect(matchesSearch('Ghûl.png', 'ghul')).toBe(true);
    expect(matchesSearch('Goblin.png', 'png')).toBe(false);
    expect(matchesSearch('Goblin.png', '   ')).toBe(true);
  });
});

describe('file names', () => {
  it('recognises image files', () => {
    expect(isImageFileName('a.PNG')).toBe(true);
    expect(isImageFileName('notes.txt')).toBe(false);
  });

  it('keeps a stored name readable and safe', () => {
    expect(sanitizeIconFileName('pack/sub/Giant Spider?.png')).toBe('Giant Spider.png');
    expect(sanitizeIconFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeIconFileName('???')).toBe('icon.png');
  });
});
