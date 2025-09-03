import { visit } from 'unist-util-visit';
import { micromark } from 'micromark';
// --- 1. IMPORT THE GFM EXTENSION ---
import { gfm, gfmHtml } from 'micromark-extension-gfm';

// A helper function to process markdown with GFM support
function processMarkdown(content) {
  return micromark(content, {
    // --- 2. TELL MICROMARK TO USE THE GFM EXTENSION ---
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()]
  });
}

// Update all our functions to use the new, more powerful processor
function createMonsterBlock(content) {
  const monsterHtml = processMarkdown(content);
  return `<div class="monster-block">${monsterHtml}</div>`;
}
function createNote(content) {
  const noteHtml = processMarkdown(content);
  return `<div class="note-block">${noteHtml}</div>`;
}
function createSpell(content) {
    const spellHtml = processMarkdown(content);
    return `<div class="spell-block">${spellHtml}</div>`;
}

export default function remarkHomebrewery() {
  return (tree) => {
    visit(tree, 'code', (node) => {
      const lang = node.lang?.toLowerCase();
      let html;
      switch (lang) {
        case 'monster': html = createMonsterBlock(node.value); break;
        case 'note': html = createNote(node.value); break;
        case 'spell': html = createSpell(node.value); break;
      }
      if (html) {
        node.type = 'html';
        node.value = html;
      }
    });
  };
}
