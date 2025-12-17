import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { Download, Loader2 } from 'lucide-react';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// --- CONFIGURATION ---
const SHEET_IMAGE_URL = '/assets/dragonbane-sheet-bg.jpg';

// SET THIS TO TRUE TO SEE RED BOXES & GRID FOR ALIGNMENT
const DEBUG_MODE = true; 

// Coordinate Definitions (X, Y in mm)
// Tweak these values while DEBUG_MODE is true to align perfectly.
const SHEET_LAYOUT = {
  header: {
    name: { x: 105, y: 36, size: 20, align: 'center', maxWidth: 80 },
    kin: { x: 42, y: 19, size: 10 },
    age: { x: 80, y: 19, size: 10 },
    profession: { x: 42, y: 25, size: 10 },
    weakness: { x: 42, y: 31, size: 9, maxWidth: 60 },
    appearance: { x: 145, y: 19, size: 9, maxWidth: 55, lineHeight: 4 },
  },
  attributes: {
    y: 49.5, // Vertical center for all attribute circles
    str: 36.5,
    con: 61.5,
    agl: 86.5,
    int: 111.5,
    wil: 136.5,
    cha: 161.5,
    size: 14, // Font size
  },
  conditions: {
    y: 57, // Vertical center for checkboxes
    exhausted: 40.5,
    sickly: 65.5,
    dazed: 90.5,
    angry: 115.5,
    scared: 140.5,
    disheartened: 165.5,
  },
  derived: {
    y: 72,
    strBonus: 50,
    aglBonus: 110,
    movement: 170,
  },
  lists: {
    skillsStart: { x: 65, y: 92 }, // Start of left column checkboxes
    skillsLevelX: 82,              // X position for skill level number
    skillsLineHeight: 5.85,        // Distance between lines
    
    weaponSkillsStart: { x: 123, y: 92 }, // Start of right column
    weaponLevelX: 140,
    
    secondarySkillsStart: { x: 125, y: 161 },
    secondaryLineHeight: 5.9,

    inventoryStart: { x: 160, y: 92 },
    inventoryLineHeight: 5.9,
    
    weaponsStart: { x: 15, y: 247.5 },
    weaponsLineHeight: 8.2,
  },
  vitals: {
    hp_x: 185, hp_y: 228,
    wp_x: 185, wp_y: 209,
    money_y: 178,
    money_gold_x: 35,
    money_silver_y: 187,
    money_copper_y: 196,
  }
};

interface PdfExportButtonProps {
  character: Character;
  variant?: 'primary' | 'secondary' | 'icon';
}

export const PdfExportButton: React.FC<PdfExportButtonProps> = ({ character, variant = 'primary' }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // 1. Load Background Image
      const img = new Image();
      img.src = SHEET_IMAGE_URL;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const width = 210;
      const height = 297;
      doc.addImage(img, 'JPEG', 0, 0, width, height);

      // --- DEBUG GRID HELPER ---
      if (DEBUG_MODE) {
        doc.setDrawColor(255, 0, 0); // Red
        doc.setLineWidth(0.1);
        doc.setFontSize(8);
        // Vertical Lines every 10mm
        for (let i = 0; i < width; i += 10) {
          doc.line(i, 0, i, height);
          doc.text(i.toString(), i, 5);
        }
        // Horizontal Lines every 10mm
        for (let i = 0; i < height; i += 10) {
          doc.line(0, i, width, i);
          doc.text(i.toString(), 2, i);
        }
      }

      // 2. Set Default Font
      doc.setFont('times', 'bold');
      doc.setTextColor(40, 40, 40);

      // --- TEXT RENDERER HELPER ---
      // This helper draws the text AND a debug box if enabled
      const drawText = (
        val: string | number | undefined | null, 
        x: number, 
        y: number, 
        fontSize: number = 10, 
        align: 'left' | 'center' | 'right' = 'left',
        maxWidth?: number
      ) => {
        if (val === undefined || val === null) return;
        const str = String(val);
        doc.setFontSize(fontSize);
        
        if (DEBUG_MODE) {
           doc.setDrawColor(255, 0, 0);
           // Draw a small crosshair at the anchor point
           doc.line(x - 2, y, x + 2, y);
           doc.line(x, y - 2, x, y + 2);
        }

        if (maxWidth && str.length > 0) {
           // Handle text wrapping if maxWidth is provided
           // We use splitTextToSize to wrap, then loop to draw lines
           const lines = doc.splitTextToSize(str, maxWidth);
           const lineHeight = SHEET_LAYOUT.header.appearance.lineHeight || 4;
           lines.forEach((line: string, i: number) => {
              doc.text(line, x, y + (i * lineHeight), { align });
           });
           
           if(DEBUG_MODE) {
             // Draw box around expected text area
             const h = lines.length * 4;
             doc.rect(x, y - fontSize/3, maxWidth, h); 
           }

        } else {
           doc.text(str, x, y, { align });
        }
      };

      // --- FILLING THE SHEET ---

      // 1. Header Details
      const h = SHEET_LAYOUT.header;
      drawText(character.name, h.name.x, h.name.y, h.name.size, 'center' as 'center');
      drawText(character.kin, h.kin.x, h.kin.y, h.kin.size);
      drawText(character.age, h.age.x, h.age.y, h.age.size);
      drawText(character.profession, h.profession.x, h.profession.y, h.profession.size);
      drawText(character.weakness, h.weakness.x, h.weakness.y, h.weakness.size, 'left', h.weakness.maxWidth);
      drawText(character.appearance, h.appearance.x, h.appearance.y, h.appearance.size, 'left', h.appearance.maxWidth);

      // 2. Attributes
      const att = SHEET_LAYOUT.attributes;
      const attY = att.y;
      drawText(character.attributes?.STR, att.str, attY, att.size, 'center');
      drawText(character.attributes?.CON, att.con, attY, att.size, 'center');
      drawText(character.attributes?.AGL, att.agl, attY, att.size, 'center');
      drawText(character.attributes?.INT, att.int, attY, att.size, 'center');
      drawText(character.attributes?.WIL, att.wil, attY, att.size, 'center');
      drawText(character.attributes?.CHA, att.cha, attY, att.size, 'center');

      // 3. Conditions
      const cond = SHEET_LAYOUT.conditions;
      const condY = cond.y;
      if (character.conditions?.exhausted) drawText('X', cond.exhausted, condY, 14, 'center');
      if (character.conditions?.sickly) drawText('X', cond.sickly, condY, 14, 'center');
      if (character.conditions?.dazed) drawText('X', cond.dazed, condY, 14, 'center');
      if (character.conditions?.angry) drawText('X', cond.angry, condY, 14, 'center');
      if (character.conditions?.scared) drawText('X', cond.scared, condY, 14, 'center');
      if (character.conditions?.disheartened) drawText('X', cond.disheartened, condY, 14, 'center');

      // 4. Derived Ratings
      const der = SHEET_LAYOUT.derived;
      const strBonus = character.attributes?.STR && character.attributes.STR > 16 ? '+D6' : character.attributes?.STR && character.attributes.STR > 12 ? '+D4' : '-';
      const aglBonus = character.attributes?.AGL && character.attributes.AGL > 16 ? '+D6' : character.attributes?.AGL && character.attributes.AGL > 12 ? '+D4' : '-';
      
      drawText(strBonus, der.strBonus, der.y, 12, 'center');
      drawText(aglBonus, der.aglBonus, der.y, 12, 'center');
      drawText(calculateMovement(character.kin, character.attributes?.AGL), der.movement, der.y, 12, 'center');

      // 5. Skills Logic
      // Hardcoded mapping of "Sheet Slot" to "Skill Name"
      // This ensures we print on the correct line even if the character DB object has missing skills
      const coreSkillsList = [
        'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 
        'Bushcraft', 'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 
        'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 
        'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 
        'Spot Hidden', 'Swimming'
      ];
      
      const weaponSkillsList = [
         'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 
         'Knives', 'Slings', 'Spears', 'Staves', 'Swords'
      ];

      const lists = SHEET_LAYOUT.lists;
      const charSkills = character.skill_levels || {};

      // General Skills
      coreSkillsList.forEach((skillName, index) => {
        const yPos = lists.skillsStart.y + (index * lists.skillsLineHeight);
        // Find skill case-insensitive
        const key = Object.keys(charSkills).find(k => k.toLowerCase() === skillName.toLowerCase());
        
        if (key) {
           // Trained Check
           if (character.trained_skills?.includes(key)) {
             drawText('X', lists.skillsStart.x, yPos, 12, 'center');
           }
           // Level
           drawText(charSkills[key], lists.skillsLevelX, yPos, 11, 'center');
        }
      });

      // Weapon Skills
      weaponSkillsList.forEach((skillName, index) => {
        const yPos = lists.weaponSkillsStart.y + (index * lists.skillsLineHeight);
        const key = Object.keys(charSkills).find(k => k.toLowerCase() === skillName.toLowerCase());
        if (key) {
           if (character.trained_skills?.includes(key)) {
             drawText('X', lists.weaponSkillsStart.x, yPos, 12, 'center');
           }
           drawText(charSkills[key], lists.weaponLevelX, yPos, 11, 'center');
        }
      });

      // Secondary Skills (Magic schools, etc)
      const usedSkills = [...coreSkillsList, ...weaponSkillsList].map(s => s.toLowerCase());
      const secondarySkills = Object.entries(charSkills)
        .filter(([k]) => !usedSkills.includes(k.toLowerCase()))
        .slice(0, 5); // Max 5 lines on sheet

      secondarySkills.forEach(([name, level], index) => {
        const yPos = lists.secondarySkillsStart.y + (index * lists.secondaryLineHeight);
        drawText(name, lists.secondarySkillsStart.x, yPos, 9);
        drawText(level, lists.weaponLevelX, yPos, 11, 'center');
      });

      // 6. Abilities & Spells
      const abilities = (character.heroic_abilities || []).join(', ');
      // Spells mapping if needed...
      const spellText = abilities; // Placeholder, you can append spells here
      doc.setFontSize(9);
      // This is a large text area, split text
      const abilityLines = doc.splitTextToSize(spellText, 55);
      doc.text(abilityLines, 15, 90);

      // 7. Inventory
      const items = character.equipment?.inventory || [];
      // Combine stackable items into strings
      const inventoryLines = items.map(i => i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name);
      
      inventoryLines.slice(0, 10).forEach((line, index) => {
        const yPos = lists.inventoryStart.y + (index * lists.inventoryLineHeight);
        drawText(line, lists.inventoryStart.x, yPos, 9);
      });

      // 8. Money
      const v = SHEET_LAYOUT.vitals;
      drawText(character.equipment?.money?.gold || 0, v.money_gold_x, v.money_y, 11, 'center');
      drawText(character.equipment?.money?.silver || 0, v.money_gold_x, v.money_silver_y, 11, 'center');
      drawText(character.equipment?.money?.copper || 0, v.money_gold_x, v.money_copper_y, 11, 'center');

      // 9. Vitals (HP/WP)
      drawText(character.max_hp, v.hp_x, v.hp_y, 14, 'center');
      drawText(character.max_wp, v.wp_x, v.wp_y, 14, 'center');

      // 10. Armor & Helmet
      const armorName = character.equipment?.equipped?.armor 
        ? items.find(i => i.name === character.equipment!.equipped!.armor)?.name 
        : character.equipment?.equipped?.armor || "";
      
      // Get Rating (You might need to fetch this from your gameItems query or pass it in)
      // For now, placeholder or name
      drawText(armorName, 45, 215, 9);
      
      const helmetName = character.equipment?.equipped?.helmet || "";
      drawText(helmetName, 105, 215, 9);

      // 11. Weapons Table
      const weapons = character.equipment?.equipped?.weapons || [];
      weapons.slice(0, 4).forEach((w, index) => {
         const yPos = lists.weaponsStart.y + (index * lists.weaponsLineHeight);
         
         drawText(w.name, 15, yPos, 9);
         drawText(w.grip, 65, yPos, 9, 'center');
         drawText(w.range, 80, yPos, 9, 'center');
         drawText(w.damage, 95, yPos, 9, 'center');
         drawText(w.durability, 110, yPos, 9, 'center');
         
         // Features string
         const feats = Array.isArray(w.features) ? w.features.join(', ') : w.features;
         drawText(feats, 125, yPos, 8);
      });

      // --- SAVE ---
      doc.save(`${character.name.replace(/\s+/g, '_')}_Dragonbane.pdf`);

    } catch (err) {
      console.error('PDF Generation failed', err);
      alert('Failed to generate PDF. Is the background image in public/assets?');
    } finally {
      setIsGenerating(false);
    }
  };

  if (variant === 'icon') {
    return (
      <button 
        onClick={generatePDF} 
        disabled={isGenerating}
        title="Export PDF"
        className="p-1.5 text-stone-600 hover:text-[#1a472a] hover:bg-stone-200 rounded transition-all disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
      </button>
    );
  }

  return (
    <button 
      onClick={generatePDF} 
      disabled={isGenerating}
      className={`flex flex-col items-center justify-center w-14 h-12 md:w-16 md:h-14 bg-[#2c5e3f] hover:bg-[#3a7a52] active:bg-[#1a472a] rounded border border-[#4a8a62] text-[#e8d5b5] transition-colors shadow-sm touch-manipulation disabled:opacity-70`}
    >
      {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
      <span className="text-[9px] md:text-[10px] uppercase font-bold mt-1">PDF</span>
    </button>
  );
};