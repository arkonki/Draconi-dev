import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomebrewRenderer } from './HomebrewRenderer';

const block = (kind: string, body: string[]) => ['```' + kind, ...body, '```'].join('\n');
const page = [
  block('monster', ['### Bog Wight', '*Undead*', '___', '| Ferocity | HP |', '|---|---|', '| 2 | 30 |']),
  block('npc', ['### Captain Rusk', '*Human Fighter*', '___', '**Weapons:** Broadsword (Swords 14, damage 2D6)']),
  block('spell', ['### Marsh Light', '*Rank 1 Elementalism*', '___', '* **Range:** 10 meters']),
  block('item', ['### Charm', '*LOOT*', '___', '**Effect:** Cold.']),
  block('note', ['#### GM Note', 'The wight rises at dusk.']),
  block('js', ['const answer = 42;']),
].join('\n\n');

describe('compendium and Story Helper blocks', () => {
  it('shows every kind of block as a card, none as raw code', () => {
    const { container } = render(<HomebrewRenderer content={page} />);
    for (const name of ['Bog Wight', 'Captain Rusk', 'Marsh Light', 'Charm']) {
      const heading = [...container.querySelectorAll('h3')].find((element) => element.textContent === name);
      expect(heading, name).toBeDefined();
      // A card is let out of the <pre> a fenced block is wrapped in, or it would be set in a typewriter font.
      expect(heading?.closest('pre'), name).toBeNull();
    }
    expect([...container.querySelectorAll('h4')].some((element) => element.textContent === 'GM Note')).toBe(true);
    expect(container.textContent).toContain('Monster');
    expect(container.textContent).toContain('NPC Profile');
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('draws a thin rule for "___" inside a card instead of the page divider', () => {
    const { container } = render(<HomebrewRenderer content={block('spell', ['### Marsh Light', '___', '**Effect:** Light.'])} />);
    expect(container.querySelector('hr')).toBeNull();
    expect(container.querySelector('svg.lucide-shield')).toBeNull();
  });

  it('keeps ordinary code as code', () => {
    const { container } = render(<HomebrewRenderer content={page} />);
    const code = container.querySelector('pre code');
    expect(code?.textContent).toContain('const answer = 42;');
    expect(container.querySelectorAll('pre')).toHaveLength(1);
  });
});
