// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOSSARIES, NARRATION_LANGUAGES, effectiveGlossary, isNarrationLanguage, languageInstruction, normalizeNarrationLanguage, parseGlossary, plainLanguageInstruction, sanitizeGlossaryInput } from './soloNarrationLanguage.js';

describe('narration language', () => {
  it('knows English and Estonian only', () => {
    expect(Object.keys(NARRATION_LANGUAGES)).toEqual(['en', 'et']);
    expect(isNarrationLanguage('et')).toBe(true);
    expect(isNarrationLanguage('fr')).toBe(false);
    expect(isNarrationLanguage(undefined)).toBe(false);
  });

  it('falls back to English for anything unknown', () => {
    expect(normalizeNarrationLanguage('et')).toBe('et');
    expect(normalizeNarrationLanguage('xx')).toBe('en');
    expect(normalizeNarrationLanguage(null)).toBe('en');
  });

  it('adds nothing for English, and a clear instruction for Estonian that keeps the machine fields in English', () => {
    expect(languageInstruction('en')).toBe('');
    expect(languageInstruction(undefined)).toBe('');
    const instruction = languageInstruction('et');
    expect(instruction).toContain('Estonian (eesti keel)');
    expect(instruction).toContain('skill, attribute, template, role and modifier value exactly as specified in English');
  });

  it('reads a glossary written one term per line', () => {
    expect(parseGlossary('Hit points = Elu\n# note\n\n  Dragon =  Lohe  \nno equals sign\n= nothing\nLeft =')).toEqual([['Hit points', 'Elu'], ['Dragon', 'Lohe']]);
    expect(parseGlossary(undefined)).toEqual([]);
  });

  it('uses the campaign\'s list when it has one and the built-in one otherwise', () => {
    expect(effectiveGlossary('et', null)).toEqual(parseGlossary(DEFAULT_GLOSSARIES.et));
    expect(effectiveGlossary('et', '   ')).toEqual(parseGlossary(DEFAULT_GLOSSARIES.et));
    expect(effectiveGlossary('et', 'Dragon = Lohe')).toEqual([['Dragon', 'Lohe']]);
    expect(effectiveGlossary('en', null)).toEqual([]);
    expect(DEFAULT_GLOSSARIES.et.split('\n').every((line) => line.includes(' = '))).toBe(true);
  });

  it('leaves the action rules out of the plain instruction and drops everything for English', () => {
    expect(plainLanguageInstruction('et')).not.toContain('ACTIONS');
    expect(plainLanguageInstruction('et')).toContain('TERMS:');
    expect(plainLanguageInstruction('en')).toBe('');
  });

  it('checks a glossary someone saved', () => {
    expect(sanitizeGlossaryInput('  Dragon = Lohe \r\n')).toBe('Dragon = Lohe');
    expect(sanitizeGlossaryInput('   ')).toBeNull();
    expect(sanitizeGlossaryInput(null)).toBeNull();
    expect(() => sanitizeGlossaryInput('x'.repeat(2001))).toThrow();
  });
});
