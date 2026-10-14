// The languages a Solo story can be narrated in. Only the story text changes: the rules, the names the app matches on
// (skills, attributes, action types) and the dice stay as they are. A glossary keeps the game's own words consistent
// from one reply to the next.

export const NARRATION_LANGUAGES = Object.freeze({
  en: { name: 'English', native: 'English' },
  et: { name: 'Estonian', native: 'eesti keel' },
});

export const DEFAULT_NARRATION_LANGUAGE = 'en';
export const MAX_GLOSSARY_CHARS = 2000;
export const MAX_GLOSSARY_LINES = 60;

export const isNarrationLanguage = (value) => Object.prototype.hasOwnProperty.call(NARRATION_LANGUAGES, value);
export const normalizeNarrationLanguage = (value) => (isNarrationLanguage(value) ? value : DEFAULT_NARRATION_LANGUAGE);

// A first proposal for the Estonian game terms, to be corrected by someone who plays the game in Estonian. Each
// campaign can replace the whole list with its own from the Narrator tab.
const ESTONIAN_TERMS = `
Strength = Jõud
Constitution = Vastupidavus
Agility = Osavus
Intelligence = Arukus
Willpower = Tahtejõud
Charisma = Võlu
Hit points = Elupunktid
Willpower points = Tahtejõupunktid
Exhausted = Kurnatud
Sickly = Haiglane
Dazed = Uimane
Angry = Vihane
Scared = Hirmunud
Disheartened = Masendunud
Dragon (a roll of 1) = Draakon
Demon (a roll of 20) = Deemon
Boon = Eelis
Bane = Takistus
Pushing a roll = Veel üks katse
Heroic ability = Kangelasvõime
Death roll = Surmavise
Round rest = Vooru puhkus
Stretch rest = Lõigu puhkus
Shift rest = Vahetuse puhkus
Waypoint = Teekonnapunkt
Mission = Missioon
Threat = Oht
Treasure = Aare
Fortune = Saatus
Kin = Rahvas
Profession = Ametiala
`.trim();

export const DEFAULT_GLOSSARIES = Object.freeze({ en: '', et: ESTONIAN_TERMS });

/** "English = local" lines to pairs. Blank lines, comments (#) and lines without "=" are ignored. */
export function parseGlossary(text) {
  const pairs = [];
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const english = trimmed.slice(0, index).trim();
    const local = trimmed.slice(index + 1).trim();
    if (english && local) pairs.push([english.slice(0, 80), local.slice(0, 80)]);
    if (pairs.length >= MAX_GLOSSARY_LINES) break;
  }
  return pairs;
}

/** What a campaign actually uses: its own list when it has one, otherwise the built-in list for the language. */
export function effectiveGlossary(language, custom) {
  const text = custom !== null && custom !== undefined && String(custom).trim() ? String(custom) : DEFAULT_GLOSSARIES[normalizeNarrationLanguage(language)] ?? '';
  return parseGlossary(text);
}

function languageParts(language, custom) {
  const code = normalizeNarrationLanguage(language);
  if (code === 'en') return null;
  const { name, native } = NARRATION_LANGUAGES[code];
  const terms = effectiveGlossary(code, custom);
  return {
    write: `LANGUAGE: Write everything the player reads in ${name} (${native}), in natural, idiomatic ${name}, including the options you offer and the labels of any actions.`,
    names: 'Keep names of people, places and creatures as they are given.',
    actions: 'Inside the ACTIONS line, keep every field name, type, skill, attribute, template, role and modifier value exactly as specified in English; only the label, question, context, notes, description, situation, location and thread texts are written in the language.',
    terms: terms.length ? `TERMS: use exactly these translations for the game's own words: ${terms.map(([english, local]) => `${english} = ${local}`).join('; ')}.` : '',
  };
}

/** The sentences added to the narrator's prompt so the model writes in the campaign's language. Empty for English. */
export function languageInstruction(language, custom = null) {
  const parts = languageParts(language, custom);
  return parts ? [parts.write, parts.names, parts.actions, parts.terms].filter(Boolean).join(' ') : '';
}

/** The same without the rules about the ACTIONS line, for prompts that have none (summaries, recaps). */
export function plainLanguageInstruction(language, custom = null) {
  const parts = languageParts(language, custom);
  return parts ? [parts.write, parts.names, parts.terms].filter(Boolean).join(' ') : '';
}

/** Checks and tidies what a person saved as their glossary. An empty value means "use the built-in one". */
export function sanitizeGlossaryInput(text) {
  if (text === null || text === undefined) return null;
  const value = String(text).replace(/\r/g, '').trim();
  if (!value) return null;
  if (value.length > MAX_GLOSSARY_CHARS) throw new RangeError('too long');
  return value;
}
