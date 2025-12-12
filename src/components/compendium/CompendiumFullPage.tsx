import React, { useState } from 'react';
import { ArrowLeft, Save, Shield, StickyNote, BookOpen, Tag, Image as ImageIcon } from 'lucide-react';
import { Button } from '../shared/Button';
import { CompendiumEntry } from '../../types/compendium';

import MDEditor, { commands, ICommand } from '@uiw/react-md-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
// Ensure this path matches where you saved the previous file
import { HomebrewRenderer } from './HomebrewRenderer'; 
// Ensure this path matches where you saved the modal
import { ImagePickerModal } from './ImagePickerModal'; 

// --- Templates ---
const monsterTemplate = "````monster\n### Monster Name\n*Size type (tag), alignment*\n___\n| Attribute | Value |\n| :--- | :--- |\n| **Movement** | 12 |\n| **HP** | 16 |\n| **WP** | 14 |\n| **Armor** | - |\n\n**Skills:** Awareness 14, Healing 10\n___\n**Abilities:** \n* **Ability Name:** Description here.\n\n**Weapons:** \n1. **Weapon Name:** Damage 2D8.\n````";
const noteTemplate = "````note\n#### Section Title\n\"Flavor text or read-aloud text goes here.\"\n\n**GM Note:** Hidden information or mechanics here.\n````";
const spellTemplate = "````spell\n### Spell Name\n*Rank 1, School*\n___\n* **Casting Time:** 1 Action\n* **Range:** 10 meters\n* **Duration:** Instantaneous\n\n**Effect:** \nThe description of the spell goes here.\n````";

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
    // If specific dimensions are provided, use HTML img tag for control
    // Otherwise use standard markdown
    let imageString = '';
    
    if (width || height) {
      const style = [
        width ? `width: ${width}` : '',
        height ? `height: ${height}` : ''
      ].filter(Boolean).join('; ');
      
      // We use a centered div wrapper for better layout in the compendium
      imageString = `\n<div align="center">\n  <img src="${url}" style="${style}" alt="Image" />\n</div>\n`;
    } else {
      imageString = `\n![Image](${url})\n`;
    }

    // Append to current cursor position would be ideal, but for now we append to end
    // or simply update state. 
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
    execute: () => {
      setShowImagePicker(true);
    },
  };

  const monsterCommand: ICommand = { 
    name: 'monsterBlock', 
    keyCommand: 'monsterBlock', 
    buttonProps: { 'aria-label': 'Insert Monster Block', title: 'Insert Monster Block' }, 
    icon: <Shield size={14} />, 
    execute: (state, api) => { api.replaceSelection(monsterTemplate); } 
  };

  const noteCommand: ICommand = { 
    name: 'noteBlock', 
    keyCommand: 'noteBlock', 
    buttonProps: { 'aria-label': 'Insert Note Block', title: 'Insert Note Block' }, 
    icon: <StickyNote size={14} />, 
    execute: (state, api) => { api.replaceSelection(noteTemplate); } 
  };

  const spellCommand: ICommand = { 
    name: 'spellBlock', 
    keyCommand: 'spellBlock', 
    buttonProps: { 'aria-label': 'Insert Spell Block', title: 'Insert Spell Block' }, 
    icon: <BookOpen size={14} />, 
    execute: (state, api) => { api.replaceSelection(spellTemplate); } 
  };

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
              placeholder: "Start writing your compendium entry here..."
            }}
            previewOptions={{
              // We reset default styles so our HomebrewRenderer controls the look entirely
              style: { 
                backgroundColor: 'transparent', 
                padding: 0,
                fontFamily: 'inherit'
              },
              // We wrap the raw markdown component output
              wrapper: ({ children }) => (
                <div className="h-full overflow-y-auto bg-white p-8">
                  {/* The HomebrewRenderer takes the full content string, 
                      so we actually ignore the children passed by MDEditor here 
                      and pass the state directly to ensure consistent formatting */}
                  <HomebrewRenderer content={editedEntry.content} />
                </div>
              ),
              // MDEditor expects a component map. Because we want full control via HomebrewRenderer,
              // we can trick it by rendering our renderer as the 'div' wrapper above, 
              // OR we can use the `renderPreview` prop which is cleaner. See below.
            }}
            // Using renderPreview allows us to completely replace the preview pane logic
            renderPreview={(markdownContent) => (
                <div className="h-full overflow-y-auto bg-white p-8 custom-scrollbar">
                    <HomebrewRenderer content={markdownContent} />
                </div>
            )}
            commands={[
              commands.bold, commands.italic, commands.strikethrough, commands.hr,
              commands.title, commands.divider,
              commands.quote, commands.code, commands.codeBlock, commands.table,
              commands.divider,
              customImageCommand, // Replaces default image command
              commands.link, 
              commands.divider,
              monsterCommand, noteCommand, spellCommand,
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
