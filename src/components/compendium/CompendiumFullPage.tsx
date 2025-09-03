import React, { useState } from 'react';
import { ArrowLeft, Save, Shield, StickyNote, BookOpen } from 'lucide-react';
import { Button } from '../shared/Button';
import { CompendiumEntry } from '../../types/compendium';

import MDEditor, { commands } from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkHomebrewery from '../../lib/remark-homebrewery';

const monsterTemplate = "````markdown\n```monster\n## Monster Name\n*Size type (tag), alignment*\n___\n- **Armor Class** 10\n- **Hit Points** 10 (3d6)\n- **Speed** 30 ft.\n___\n|STR|DEX|CON|INT|WIS|CHA|\n|:---:|:---:|:---:|:---:|:---:|:---:|\n|10 (+0)|10 (+0)|10 (+0)|10 (+0)|10 (+0)|10 (+0)|\n___\n- **Senses** passive Perception 10\n- **Languages** --\n- **Challenge** 1 (200 XP)\n___\n***Trait Name.*** Trait description.\n### Actions\n***Action Name.*** *Attack Style:* +0 to hit, reach 5 ft., one target. *Hit:* 1 (1d4) damage type.\n```\n````";
const noteTemplate = "````markdown\n```note\nYour content here. Use standard markdown for paragraphs, lists, etc.\n```\n````";
const spellTemplate = "````markdown\n```spell\n#### Spell Name\n*level School*\n___\n- **Casting Time:** 1 Action\n- **Range:** 60 feet\n- **Components:** V, S, M (a pinch of salt)\n- **Duration:** Instantaneous\n___\nSpell description goes here.\n\n***At Higher Levels.*** When you cast this spell...\n```\n````";

const monsterCommand = { name: 'monsterBlock', keyCommand: 'monsterBlock', buttonProps: { 'aria-label': 'Insert Monster Block' }, icon: <Shield size={12} />, execute: (state, api) => { api.replaceSelection(monsterTemplate); } };
const noteCommand = { name: 'noteBlock', keyCommand: 'noteBlock', buttonProps: { 'aria-label': 'Insert Note Block' }, icon: <StickyNote size={12} />, execute: (state, api) => { api.replaceSelection(noteTemplate); } };
const spellCommand = { name: 'spellBlock', keyCommand: 'spellBlock', buttonProps: { 'aria-label': 'Insert Spell Block' }, icon: <BookOpen size={12} />, execute: (state, api) => { api.replaceSelection(spellTemplate); } };

interface CompendiumFullPageProps {
  entry: CompendiumEntry;
  onClose: () => void;
  onSave: (entry: CompendiumEntry) => Promise<void>;
}

export function CompendiumFullPage({ entry, onClose, onSave }: CompendiumFullPageProps) {
  const [editedEntry, setEditedEntry] = useState(entry);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(editedEntry);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
      <div className="border-b p-4 flex items-center justify-between bg-white flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="secondary" icon={ArrowLeft} onClick={onClose}>Back</Button>
          <h2 className="text-xl font-bold">Editing: {editedEntry.title}</h2>
        </div>
        <Button variant="primary" icon={Save} onClick={handleSave} loading={loading}>Save</Button>
      </div>

      <div className="p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" value={editedEntry.title} onChange={(e) => setEditedEntry({ ...editedEntry, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input type="text" value={editedEntry.category} onChange={(e) => setEditedEntry({ ...editedEntry, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden" data-color-mode="light">
        <MDEditor
          height="100%"
          value={editedEntry.content}
          onChange={(value) => { setEditedEntry({ ...editedEntry, content: value || '' }); }}
          previewOptions={{
            style: { backgroundColor: 'transparent', padding: 0 },
            wrapper: ({ children }) => <div className="phb">{children}</div>,
            components: {
              markdown: (props) => (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkHomebrewery]} rehypePlugins={[rehypeRaw]} {...props} />
              ),
            },
          }}
          commands={[
            commands.bold, commands.italic, commands.strikethrough, commands.hr,
            commands.divider,
            commands.title, commands.quote, commands.code, commands.codeBlock,
            commands.divider,
            commands.link, commands.image,
            commands.divider,
            monsterCommand, noteCommand, spellCommand
          ]}
        />
      </div>
    </div>
  );
}