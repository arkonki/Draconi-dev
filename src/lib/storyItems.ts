// Reads the ```item blocks the Story Helper writes, so the GM can put them in the party stash. The stash keeps a name,
// a category and a description, so the stats and effect lines become the description. The name is one unit; a
// **Quantity:** line (or an old-style "Bandages (10)" name) says how many there are.
import { itemBundle } from '../../shared/encumbrance.js';

export interface StoryItem {
  name: string;
  category: string;
  description: string;
  quantity: number;
}

const ITEM_BLOCK = /```item[^\S\n]*\n([\s\S]*?)```/g;
const QUANTITY_LINE = /^quantity:\s*(\d+)\s*$/i;
const plain = (line: string) => line.replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/, '').trim();

export function parseStoryItems(markdown: string): StoryItem[] {
  const items: StoryItem[] = [];
  for (const match of String(markdown ?? '').matchAll(ITEM_BLOCK)) {
    let name = '';
    let category = '';
    let quantity = 1;
    const description: string[] = [];
    for (const raw of match[1].split('\n')) {
      const line = raw.trim();
      if (!line || /^_{3,}$|^-{3,}$/.test(line)) continue;
      if (!name && line.startsWith('#')) { name = line.replace(/^#+\s*/, '').trim(); continue; }
      // The category is the one line in single *italics*, right under the name.
      const italic = line.match(/^\*([^*].*?)\*$/);
      if (name && !category && italic) { category = italic[1].trim().toUpperCase(); continue; }
      const text = plain(line);
      const count = text.match(QUANTITY_LINE);
      if (count) { quantity = Number(count[1]); continue; }
      description.push(text);
    }
    if (!name) continue;
    const bundle = itemBundle(name);
    if (bundle.size > 1 && quantity === 1) quantity = bundle.size;
    items.push({
      name: bundle.name.slice(0, 120),
      category: (category || 'LOOT').slice(0, 60),
      description: description.join('\n').slice(0, 2000),
      quantity: Math.min(Math.max(quantity, 1), 999),
    });
  }
  return items;
}
