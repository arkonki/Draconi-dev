import React, { useState } from 'react';
import { 
  ArrowLeft, Save, Shield, StickyNote, BookOpen, Tag, 
  Image as ImageIcon, User, Package, Table 
} from 'lucide-react';
import { Button } from '../shared/Button';
import { CompendiumEntry } from '../../types/compendium';

import MDEditor, { commands, ICommand } from '@uiw/react-md-editor';
// Ensure this path matches where you saved the previous file
import { HomebrewRenderer } from './HomebrewRenderer'; 
// Ensure this path matches where you saved the modal
import { ImagePickerModal } from './ImagePickerModal'; 

// --- DRAGONBANE TEMPLATES ---

const monsterTemplate = `\`\`\`monster
### Monster Name
*Typical habitat or description*
___
| **Ferocity** | **Size** | **Movement** | **Armor** | **HP** |
| :---: | :---: | :---: | :---: | :---: |
| 1 | Normal | 12 | - | 24 |

**Skills:** Awareness 12, Evade 10
**Immunity:** Fire
___
#### Monster Attacks
| D6 | Attack |
| :---: | :--- |
| **1** | **Attack Name!** Description of the attack. 2D6 damage. |
| **2** | **Another Attack!** Description. |
\`\`\``;

const npcTemplate = `\`\`\`npc
### NPC Name
*Kin, Profession*
___
| **Movement** | **Damage Bonus** | **HP** | **WP** |
| :---: | :---: | :---: | :---: |
| 10 | STR +D4 | 12 | 10 |

**Armor:** Leather (1)
**Skills:** Awareness 10, Swords 12
**Abilities:** Veteran
**Gear:** Broadsword, D6 silver
\`\`\``;

const spellTemplate = `\`\`\`spell
### Spell Name
*Rank 1, Animism*
___
* **Prerequisite:** None
* **Requirement:** Word, Gesture
* **Casting Time:** Action
* **Range:** 10 meters
* **Duration:** Instant
___
**Effect:** 
The description of the spell goes here.
\`\`\``;

const itemTemplate = `\`\`\`item
### Item Name
*Type (e.g. Weapon, Tool)*
___
* **Supply:** Common
* **Cost:** 5 gold
* **Weight:** 1
___
**Effect:** 
Description of the item's mechanical effect or utility.
\`\`\``;

const noteTemplate = `\`\`\`note
#### Rules Note
"Flavor text or read-aloud text goes here."

**Mechanic:** Specific rules explanation here.
\`\`\``;

interface CompendiumFullPageProps {
  entry: CompendiumEntry;
  onClose: () => void;
  onSave: (entry: CompendiumEntry) => Promise<void>;
}

export function CompendiumFullPage({ entry, onClose, onSave }: CompendiumFullPageProps) {
  const [editedEntry, setEditedEntry] = useState(entry);
  const [loading, setLoading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);

  // --- Actions ---

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(editedEntry);
    } finally {
      setLoading(false);
    }
  };

  const handleImageInsert = (url: string, width?: string, height?: string) => {
    let imageString = '';
    
    if (width || height) {
      const style = [
        width ? `width: ${width}` : '',
        height ? `height: ${height}` : ''
      ].filter(Boolean).join('; ');
      
      imageString = `\n<div align="center">\n  <img src="${url}" style="${style}" alt="Image" />\n</div>\n`;
    } else {
      imageString = `\n![Image](${url})\n`;
    }

    setEditedEntry(prev => ({
        ...prev,
        content: prev.content + imageString
    }));
  };

  // --- Custom Commands ---

  const customImageCommand: ICommand = {
    name: 'customImage',
    keyCommand: 'image',
    buttonProps: { 'aria-label': 'Insert Image', title: 'Insert Image' },
    icon: <ImageIcon size={14} />,
    execute: () => { setShowImagePicker(true); },
  };

  const createBlockCommand = (name: string, title: string, icon: React.ReactNode, template: string): ICommand => ({
    name,
    keyCommand: name,
    buttonProps: { 'aria-label': title, title: title },
    icon,
    execute: (state, api) => { api.replaceSelection(template); }
  });

  const blockCommands = [
    createBlockCommand('monsterBlock', 'Insert Monster', <Shield size={14} />, monsterTemplate),
    createBlockCommand('npcBlock', 'Insert NPC', <User size={14} />, npcTemplate),
    createBlockCommand('spellBlock', 'Insert Spell', <BookOpen size={14} />, spellTemplate),
    createBlockCommand('itemBlock', 'Insert Item', <Package size={14} />, itemTemplate),
    createBlockCommand('noteBlock', 'Insert Note', <StickyNote size={14} />, noteTemplate),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-screen">
      
      {/* --- HEADER --- */}
      <div className="bg-white border-b border-gray-200 shadow-sm px-6 py-3 flex items-center justify-between shrink-0 h-16">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon_sm" onClick={onClose} title="Go Back">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Button>
          
          <div className="h-8 w-px bg-gray-200 mx-2" />
          
          <div className="flex flex-col flex-1 max-w-2xl">
            {/* Title Input */}
            <input 
              type="text" 
              value={editedEntry.title} 
              onChange={(e) => setEditedEntry({ ...editedEntry, title: e.target.value })} 
              className="text-lg font-bold text-gray-900 border-none p-0 focus:ring-0 placeholder-gray-300 bg-transparent w-full leading-tight"
              placeholder="Entry Title..."
              autoFocus={!entry.id}
            />
            
            {/* Category Input */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <Tag size={12} />
              <input 
                type="text" 
                value={editedEntry.category} 
                onChange={(e) => setEditedEntry({ ...editedEntry, category: e.target.value })} 
                className="border-none p-0 focus:ring-0 text-xs text-indigo-600 font-medium placeholder-indigo-300 bg-transparent w-48"
                placeholder="Uncategorized"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" icon={Save} onClick={handleSave} loading={loading}>
            Save Entry
          </Button>
        </div>
      </div>

      {/* --- EDITOR WORKSPACE --- */}
      <div className="flex-1 overflow-hidden p-4 relative" data-color-mode="light">
        <div className="h-full w-full max-w-7xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <MDEditor
            height="100%"
            value={editedEntry.content}
            onChange={(value) => { setEditedEntry({ ...editedEntry, content: value || '' }); }}
            preview="live"
            visibleDragbar={false}
            className="w-full h-full border-none"
            textareaProps={{
              placeholder: "Start writing your compendium entry here...\nUse the toolbar icons to insert Dragonbane stat blocks."
            }}
            previewOptions={{
              style: { backgroundColor: 'transparent', padding: 0, fontFamily: 'inherit' },
            }}
            // Render Preview using the Dragonbane-specific HomebrewRenderer
            renderPreview={(markdownContent) => (
                <div className="h-full overflow-y-auto bg-white p-8 custom-scrollbar">
                    <HomebrewRenderer content={markdownContent} />
                </div>
            )}
            commands={[
              commands.bold, commands.italic, commands.title, commands.divider,
              commands.quote, commands.table, commands.hr,
              commands.group([commands.code, commands.codeBlock], {
                name: 'code',
                groupName: 'code',
                buttonProps: { 'aria-label': 'Code' }
              }),
              commands.divider,
              customImageCommand, 
              commands.link, 
              commands.divider,
              ...blockCommands, // Inject Dragonbane Stat Blocks here
              commands.divider,
              commands.fullscreen
            ]}
          />
        </div>
      </div>

      {/* --- MODALS --- */}
      {showImagePicker && (
        <ImagePickerModal 
          onClose={() => setShowImagePicker(false)}
          onSelectImage={handleImageInsert}
        />
      )}
    </div>
  );
}