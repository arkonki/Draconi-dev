import { describe, expect, it } from 'vitest';
import { ET } from './et';
import { createTranslator, translate } from './translate';
import { translationKeysIn } from './extractKeys';

// The source of the Solo screens, read as text so the test can see every text they ask to translate.
const SOLO_SOURCES = import.meta.glob(['../components/party/SoloDashboard.tsx', '../components/party/SoloModeSettings.tsx', '../components/party/SoloNarrator.tsx', '../components/party/SoloEndStory.tsx', '../components/party/SoloStartStory.tsx', '../components/party/SoloStoryLibrary.tsx', '../components/party/SoloGear.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('Estonian translations of the Solo screens', () => {
  const used = new Map<string, string[]>();
  for (const [file, source] of Object.entries(SOLO_SOURCES)) for (const key of translationKeysIn(source, file)) used.set(key, [...(used.get(key) ?? []), file]);

  it('reads the seven Solo screens', () => {
    expect(Object.keys(SOLO_SOURCES)).toHaveLength(7);
    expect(used.size).toBeGreaterThan(400);
  });

  it('has an entry for every text the Solo screens ask to translate', () => {
    const missing = [...used.keys()].filter((key) => !(key in ET));
    expect(missing, `Add these to src/i18n/et.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('keeps every {placeholder} of the English text', () => {
    const wrong = Object.entries(ET).filter(([english, estonian]) => placeholders(english).join() !== placeholders(estonian).join());
    expect(wrong.map(([english]) => english)).toEqual([]);
  });

  it('has no empty translations', () => {
    expect(Object.entries(ET).filter(([, estonian]) => !estonian.trim()).map(([english]) => english)).toEqual([]);
  });
});

describe('translating', () => {
  it('returns the English text for English and for anything without a translation', () => {
    expect(translate('en', 'Solo tools')).toBe('Solo tools');
    expect(translate('et', 'This text has no translation')).toBe('This text has no translation');
  });

  it('translates to Estonian and fills in values', () => {
    expect(translate('et', 'Solo tools')).toBe('Soolomängu tööriistad');
    expect(translate('et', 'Day {day}', { day: 3 })).toBe('Päev 3');
    expect(createTranslator('en')('Day {day}', { day: 3 })).toBe('Day 3');
  });

  it('leaves a placeholder visible when its value is missing', () => {
    expect(translate('en', 'Day {day}', {})).toBe('Day {day}');
  });
});
