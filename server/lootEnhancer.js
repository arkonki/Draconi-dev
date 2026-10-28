import { pool } from './db.js';
import { HttpError } from './http.js';
import { loadCampaignAccess } from './campaignRoles.js';
import { callModel } from './aiSettings.js';
import { normalizeNarrationLanguage, plainLanguageInstruction } from './soloNarrationLanguage.js';

// "Enhance with AI" in the loot window: the GM sketches a custom item and their own model fills in a name, a
// description and Dragonbane stats. Nothing is saved here; the GM reviews the result in the form first.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The item fields the model may fill in, and the longest text each one keeps. */
export const ENHANCED_FIELDS = Object.freeze({
  name: 120,
  category: 60,
  cost: 40,
  effect: 1500,
  damage: 40,
  grip: 20,
  range: 20,
  durability: 10,
  armor_rating: 10,
  features: 200,
});

const COST_PATTERN = /^\d+\s*(gold|silver|copper)(\s*,?\s*\d+\s*(gold|silver|copper))*$/i;

const clip = (value, length) => {
  const text = String(value ?? '').replace(/[ \t]+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

export const ITEM_SYSTEM_PROMPT = [
  'You help a Game Master of the Dragonbane tabletop roleplaying game turn a rough idea into a finished loot item.',
  'Reply with one JSON object and nothing else, no commentary and no code fence. Its shape:',
  '{"name": "<evocative item name>", "category": "<one of the given categories>", "cost": "<price such as 3 gold, 8 silver or 20 copper>", "weight": <number, 0 for tiny things, 1 for a normal item>, "effect": "<what it looks like, its history in a sentence, and exactly what it does in play>", "damage": "<only for weapons, such as 2D6>", "grip": "<only for weapons: 1H or 2H>", "range": "<only for weapons: STR for melee or a number of meters>", "durability": "<only for weapons and shields, a number>", "armor_rating": "<only for armor and helmets, a number>", "features": "<only for weapons, comma separated such as Piercing, Long>"}',
  'Leave a field as an empty string when it does not apply. Keep what the GM already wrote unless they ask for a change, and build on it.',
  'Balance the item against the reference items when they are given: magic is rare and costly in Dragonbane, so a mundane find should stay mundane, and a magical one should have one clear effect with a limit or a price, such as costing willpower points.',
  'Use only fantasy suited to Dragonbane: grounded, a little dark, no technology.',
].join('\n');

/** The item as the GM has it so far, the references and the GM's wish, as the plain text the model reads. */
export function itemContext({ item = {}, instructions = '', categories = [], references = [] }) {
  const lines = ['THE ITEM SO FAR'];
  for (const field of Object.keys(ENHANCED_FIELDS)) {
    const value = clip(Array.isArray(item[field]) ? item[field].join(', ') : item[field], ENHANCED_FIELDS[field]);
    if (value && value !== '0') lines.push(`${field}: ${value}`);
  }
  if (Number(item.weight) > 0) lines.push(`weight: ${Number(item.weight)}`);
  if (lines.length === 1) lines.push('(nothing yet: invent something fitting)');
  if (categories.length) lines.push('', `CATEGORIES: ${categories.slice(0, 40).map((category) => clip(category, 60)).join(', ')}`);
  if (references.length) {
    lines.push('', 'REFERENCE ITEMS FROM THE RULES (for balance):');
    for (const reference of references.slice(0, 5)) {
      const stats = ['cost', 'damage', 'grip', 'range', 'durability', 'armor_rating', 'features']
        .map((field) => {
          const value = Array.isArray(reference[field]) ? reference[field].join(', ') : reference[field];
          return value ? `${field} ${clip(value, 60)}` : '';
        })
        .filter(Boolean)
        .join(', ');
      lines.push(`- ${clip(reference.name, 80)}${stats ? ` (${stats})` : ''}`);
    }
  }
  lines.push('', "THE GM'S WISH", clip(instructions, 600) || '(none: make it interesting but fair)');
  return lines.join('\n');
}

export function buildItemMessages({ context, language = 'en', glossary = null }) {
  const instruction = plainLanguageInstruction(language, glossary);
  const system = [
    ITEM_SYSTEM_PROMPT,
    instruction ? `${instruction} Write only "name" and "effect" in that language. The app reads the other values, so keep them in English game notation exactly as shown (such as "3 gold", "1H", "STR", "2D6", "Piercing"), and keep the JSON keys in English.` : '',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: context }];
}

/**
 * Turns the model's answer into item fields the loot form can take, each cut to a sensible length.
 * Returns null when there is no usable item (no JSON object or no name).
 */
export function parseEnhancedItem(text) {
  const source = String(text ?? '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let raw;
  try { raw = JSON.parse(source.slice(start, end + 1)); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const item = {};
  for (const [field, length] of Object.entries(ENHANCED_FIELDS)) {
    const value = Array.isArray(raw[field]) ? raw[field].join(', ') : raw[field];
    item[field] = typeof value === 'string' || typeof value === 'number' ? clip(value, length) : '';
  }
  if (!item.name) return null;
  item.category = item.category.toUpperCase() || 'LOOT';
  // The stash prices items by reading "<number> gold/silver/copper", so anything else is no price at all.
  if (!COST_PATTERN.test(item.cost)) item.cost = '';
  // Stored items keep features as a list, the way the rules' own items do.
  item.features = item.features.split(',').map((feature) => feature.trim()).filter(Boolean).slice(0, 8);
  const weight = Number(raw.weight);
  item.weight = Number.isFinite(weight) ? Math.min(100, Math.max(0, Math.round(weight * 10) / 10)) : 0;
  return item;
}

/** Fills in a custom loot item with the GM's own model. Only a GM of the campaign may ask. */
export async function enhanceItem(user, { partyId, item, instructions } = {}) {
  if (!UUID.test(String(partyId || ''))) throw new HttpError(400, 'partyId is required', 'INVALID_CAMPAIGN');
  const access = await loadCampaignAccess(pool, user, partyId);
  if (!access?.isGm) throw new HttpError(403, 'Permission denied', 'FORBIDDEN');
  const draft = item && typeof item === 'object' ? item : {};

  // Shared items only: one campaign's homebrew never shapes another's.
  const [{ rows: categoryRows }, { rows: references }, { rows: languageRows }] = await Promise.all([
    pool.query('SELECT DISTINCT category FROM game_items WHERE party_id IS NULL AND category IS NOT NULL ORDER BY category'),
    pool.query(
      `SELECT name, cost, damage, grip, range, durability, armor_rating, features FROM game_items
       WHERE party_id IS NULL AND upper(category) = upper($1)
       ORDER BY is_custom, random() LIMIT 5`,
      [String(draft.category || 'LOOT')],
    ),
    pool.query('SELECT narration_language, narration_glossary FROM solo_campaign_states WHERE campaign_id = $1', [partyId]),
  ]);

  const result = await callModel(user, {
    messages: buildItemMessages({
      context: itemContext({ item: draft, instructions, categories: categoryRows.map((row) => row.category), references }),
      language: normalizeNarrationLanguage(languageRows[0]?.narration_language),
      glossary: languageRows[0]?.narration_glossary ?? null,
    }),
    purpose: 'loot-item',
    partyId,
    temperature: 0.8,
    maxTokens: 700,
  });
  const enhanced = parseEnhancedItem(result.text);
  if (!enhanced) throw new HttpError(502, 'The AI did not come back with a usable item. Try again, or fill it in yourself.', 'ITEM_UNREADABLE');
  // An invented or translated category would hide the item's weapon or armor stats in the form.
  const knownCategories = new Set(categoryRows.map((row) => String(row.category).toUpperCase()));
  if (knownCategories.size > 0 && !knownCategories.has(enhanced.category)) {
    enhanced.category = String(draft.category || 'LOOT').toUpperCase();
  }
  return { item: enhanced, model: result.model, usage: result.usage };
}
