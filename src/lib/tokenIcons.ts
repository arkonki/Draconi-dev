// Matching token names to icon files. An icon called "Goblin.png" is shown on every token called "Goblin",
// "goblin", "Goblin 3" or "Goblin (Act 2)", so a pack can be uploaded once and used everywhere.

export interface TokenIconFile {
  /** The file name as stored, e.g. "Giant Spider.png". */
  name: string;
  /** Path inside the images bucket. */
  path: string;
  url: string;
}

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

export const isImageFileName = (name: string) => IMAGE_EXTENSION.test(name);

/** Lower case, no extension, and separators (underscore, dash, dot) read as spaces. */
export function normalizeIconName(value: string): string {
  return value
    .replace(IMAGE_EXTENSION, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Makes a file name safe to store while keeping it readable, so the name can still be matched. */
export function sanitizeIconFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^\p{L}\p{N} ._()-]/gu, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'icon.png';
}

/** The names a token could go by, most specific first. */
export function nameCandidates(label: string, extra: Array<string | null | undefined> = []): string[] {
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    const normalized = normalizeIconName(value ?? '');
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };
  for (const value of [label, ...extra]) {
    if (!value) continue;
    add(value);
    const withoutAct = value.replace(/\s*\(act \d+\)\s*$/i, '');
    add(withoutAct);
    const withoutParentheses = withoutAct.replace(/\s*\([^)]*\)\s*/g, ' ');
    add(withoutParentheses);
    add(withoutParentheses.replace(/\s+#?\d+$/, ''));
  }
  return candidates;
}

/** True when every word typed appears in the file name, ignoring case, accents, separators and the extension. */
export function matchesSearch(fileName: string, query: string): boolean {
  const words = normalizeIconName(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const name = normalizeIconName(fileName);
  return words.every((word) => name.includes(word));
}

export type TokenIconIndex = ReadonlyMap<string, TokenIconFile>;

export function buildIconIndex(files: TokenIconFile[]): TokenIconIndex {
  const index = new Map<string, TokenIconFile>();
  for (const file of files) {
    const key = normalizeIconName(file.name);
    // If two files normalise to the same name, the first one listed (the newest upload) wins.
    if (key && !index.has(key)) index.set(key, file);
  }
  return index;
}

/** The icon for a token, or null. `extra` are other names to try, such as the monster's name in the bestiary. */
export function findIcon(index: TokenIconIndex, label: string, extra: Array<string | null | undefined> = []): TokenIconFile | null {
  if (index.size === 0) return null;
  for (const candidate of nameCandidates(label, extra)) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  return null;
}
