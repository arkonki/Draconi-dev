// The languages a Solo story can be narrated in. Only the story text changes: the app's screens, the rules and the names
// the app matches on (skills, attributes, action types) stay as they are.

export const NARRATION_LANGUAGES = Object.freeze({
  en: { name: 'English', native: 'English' },
  et: { name: 'Estonian', native: 'eesti keel' },
});

export const DEFAULT_NARRATION_LANGUAGE = 'en';

export const isNarrationLanguage = (value) => Object.prototype.hasOwnProperty.call(NARRATION_LANGUAGES, value);
export const normalizeNarrationLanguage = (value) => (isNarrationLanguage(value) ? value : DEFAULT_NARRATION_LANGUAGE);

/** The sentence added to a prompt so the model writes in the campaign's language. Empty for English, the default. */
export function languageInstruction(language) {
  const code = normalizeNarrationLanguage(language);
  if (code === 'en') return '';
  const { name, native } = NARRATION_LANGUAGES[code];
  return [
    `LANGUAGE: Write everything the player reads in ${name} (${native}), in natural, idiomatic ${name}, including the options you offer and the labels of any actions.`,
    'Keep names of people, places and creatures as they are given. Inside the ACTIONS line, keep every field name, type, skill, attribute, template, role and modifier value exactly as specified in English; only the label, question, context, notes, description, situation, location and thread texts are written in the language.',
  ].join(' ');
}
