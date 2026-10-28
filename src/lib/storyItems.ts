// Reads the ```item blocks the Story Helper writes, so the GM can put them in the party stash. The stash keeps a name,
// a category and a description, so the stats and effect lines become the description.

export interface StoryItem {
  name: string;
  category: string;
  description: string;
}

const ITEM_BLOCK = /```item[^\S\n]*\n([\s\S]*?)```/g;
const plain = (line: string) => line.replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/, '').trim();

export function parseStoryItems(markdown: string): StoryItem[] {
  const items: StoryItem[] = [];
  for (const match of String(markdown ?? '').matchAll(ITEM_BLOCK)) {
    let name = '';
    let category = '';
    const description: string[] = [];
    for (const raw of match[1].split('\n')) {
      const line = raw.trim();
      if (!line || /^_{3,}$|^-{3,}$/.test(line)) continue;
      if (!name && line.startsWith('#')) { name = line.replace(/^#+\s*/, '').trim(); continue; }
      // The category is the one line in single *italics*, right under the name.
      const italic = line.match(/^\*([^*].*?)\*$/);
      if (name && !category && italic) { category = italic[1].trim().toUpperCase(); continue; }
      description.push(plain(line));
    }
    if (name) items.push({ name: name.slice(0, 120), category: (category || 'LOOT').slice(0, 60), description: description.join('\n').slice(0, 2000) });
  }
  return items;
}
