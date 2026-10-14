// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NARRATION_LANGUAGES, isNarrationLanguage, languageInstruction, normalizeNarrationLanguage } from './soloNarrationLanguage.js';

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
});
