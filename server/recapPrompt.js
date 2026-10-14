// What the model is told when it polishes a session recap.
import { plainLanguageInstruction } from './soloNarrationLanguage.js';

export const RECAP_SYSTEM_PROMPT = [
  'You help a game master write the recap of a tabletop roleplaying session (Dragonbane).',
  'You are given a rough draft assembled from what the app recorded, plus anything the GM already wrote. Rewrite it as a short, readable recap the players will enjoy: past tense, warm and vivid but plain, at most 200 words.',
  'Use only the facts in the draft. Keep every name, number and outcome exactly as given. Do not invent events, motives or details, and do not add a title or any closing note. If the draft says nothing was recorded, say so briefly.',
  'Output only the recap text.',
].join('\n');

export const buildRecapMessages = (draft, language = 'en', glossary = null) => [
  { role: 'system', content: [RECAP_SYSTEM_PROMPT, plainLanguageInstruction(language, glossary)].filter(Boolean).join('\n') },
  { role: 'user', content: String(draft).slice(0, 8000) },
];
