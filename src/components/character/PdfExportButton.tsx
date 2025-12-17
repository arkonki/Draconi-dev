import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { Download, Loader2 } from 'lucide-react';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// --- CONFIGURATION ---
const SHEET_IMAGE_URL = '/assets/dragonbane-sheet-bg.jpg';

// Toggle this to see the red grid again if needed
const DEBUG_MODE = false; 

// Coordinate Definitions (X, Y in mm) based on the grid screenshot
const SHEET_LAYOUT = {
  header: {
    // Name centered on the scroll
    name: { x: 105, y: 42, size: 20, align: 'center', maxWidth: 80 },
    
    // Top Left Info Block (aligned to baselines)
    kin: { x: 42, y: 21, size: 10 },
    age: { x: 80, y: 21, size: 10 },
    profession: { x: 42, y: 28, size: 10 },
    weakness: { x: 42, y: 36, size: 9, maxWidth: 60 },
    
    // Appearance (Top Right)
    appearance: { x: 135, y: 18, size: 9, maxWidth: 65, lineHeight: 4 },
  },
  attributes: {
    y: 52, // Vertical center for all attribute circles
    str: 36.5,
    con: 61.5,
    agl: 86.5,
    int: 111.5,
    wil: 136.5,
    cha: 161.5,
    size: 14,
  },
  conditions: {
    y: 60, // Vertical center for checkboxes
    exhausted: 40.5,
    sickly: 65.5,
    dazed: 90.5,
    angry: 115.5,
    scared: 140.5,
    disheartened: 165.5,
  },
  derived: {
    y: 75, // Centered in the green banners
    strBonus: 50,
    aglBonus: 110,
    movement: 170,
  },
  lists: {
    // Skills (Left Column)
    skillsStart: { x: 65, y: 115 }, 
    skillsLevelX: 84, // Centered in the level box
    skillsLineHeight: 5.5,        
    
    // Weapon Skills (Right Column)
    weaponSkillsStart: { x: 123, y: 115 }, 
    weaponLevelX: 143, // Centered in the level box
    
    // Secondary Skills (Below Weapon Skills)
    secondarySkillsStart: { x: 125, y: 182 }, // Moved down to clear label
    secondaryLineHeight: 6,

    // Inventory (Far Right Column)
    inventoryStart: { x: 160, y: 113 },
    inventoryLineHeight: 6,
    mementoY: 182, // Moved down to clear label
    
    // Weapons Table (Bottom)
    weaponsStart: { x: 15, y: 268 },
    weaponsLineHeight: 8,
  },
  abilities: {
    // Abilities & Spells (Far Left Column)
    x: 15,
    y: 116, // Moved down to clear header
    maxWidth: 55,
  },
  vitals: {
    // HP/WP shapes
    hp_x: 185, hp_y: 228,
    wp_x: 185, wp_y: 209,
    // Money
    money_y: 195, 
    money_gold_y: 193,
    money_silver_y: 202,
    money_copper_y: 211,
    money_x: 35,
  },
  armor: {
      name_x: 45, name_y: 242, // Moved down to sit on line
      rating_x: 27, rating_y: 240
  },
  helmet: {
      name_x: 105, name_y: 242, // Moved down to sit on line
      rating_x: 88, rating_y: 240
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

      const img = new Image();
      img.src = SHEET_IMAGE_URL;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const width = 210;
      const height = 297;
      doc.addImage(img, 'JPEG', 0, 0, width, height);

      if (DEBUG_MODE) {
        doc.setDrawColor(255, 0, 0);
        doc.setLineWidth(0.1);
        doc.setFontSize(8);
        for (let i = 0; i < width; i += 10) { doc.line(i, 0, i, height); doc.text(i.toString(), i, 5); }
        for (let i = 0; i < height; i += 10) { doc.line(0, i, width, i); doc.text(i.toString(), 2, i); }
      }

      doc.setFont('times', 'bold');
      doc.setTextColor(40, 40, 40);

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
           doc.line(x - 2, y, x + 2, y);
           doc.line(x, y - 2, x, y + 2);
        }

        if (maxWidth && str.length > 0) {
           const lines = doc.splitTextToSize(str, maxWidth);
           const lineHeight = SHEET_LAYOUT.header.appearance.lineHeight || 4;
           lines.forEach((line: string, i: number) => {
              doc.text(line, x, y + (i * lineHeight), { align });
           });
        } else {
           doc.text(str, x, y, { align });
        }
      };

      // --- FILLING THE SHEET ---

      // 1. Header
      const h = SHEET_LAYOUT.header;
      drawText(character.name, h.name.x, h.name.y, h.name.size, 'center' as 'center');
      drawText(character.kin, h.kin.x, h.kin.y, h.kin.size);
      drawText(character.age, h.age.x, h.age.y, h.age.size);
      drawText(character.profession, h.profession.x, h.profession.y, h.profession.size);
      drawText(character.weakness, h.weakness.x, h.weakness.y, h.weakness.size, 'left', h.weakness.maxWidth);
      drawText(character.appearance, h.appearance.x, h.appearance.y, h.appearance.size, 'left', h.appearance.maxWidth);

      // 2. Attributes
      const att = SHEET_LAYOUT.attributes;
      drawText(character.attributes?.STR, att.str, att.y, att.size, 'center');
      drawText(character.attributes?.CON, att.con, att.y, att.size, 'center');
      drawText(character.attributes?.AGL, att.agl, att.y, att.size, 'center');
      drawText(character.attributes?.INT, att.int, att.y, att.size, 'center');
      drawText(character.attributes?.WIL, att.wil, att.y, att.size, 'center');
      drawText(character.attributes?.CHA, att.cha, att.y, att.size, 'center');

      // 3. Conditions
      const cond = SHEET_LAYOUT.conditions;
      if (character.conditions?.exhausted) drawText('X', cond.exhausted, cond.y, 14, 'center');
      if (character.conditions?.sickly) drawText('X', cond.sickly, cond.y, 14, 'center');
      if (character.conditions?.dazed) drawText('X', cond.dazed, cond.y, 14, 'center');
      if (character.conditions?.angry) drawText('X', cond.angry, cond.y, 14, 'center');
      if (character.conditions?.scared) drawText('X', cond.scared, cond.y, 14, 'center');
      if (character.conditions?.disheartened) drawText('X', cond.disheartened, cond.y, 14, 'center');

      // 4. Derived Ratings
      const der = SHEET_LAYOUT.derived;
      const strBonus = character.attributes?.STR && character.attributes.STR > 16 ? '+D6' : character.attributes?.STR && character.attributes.STR > 12 ? '+D4' : '-';
      const aglBonus = character.attributes?.AGL && character.attributes.AGL > 16 ? '+D6' : character.attributes?.AGL && character.attributes.AGL > 12 ? '+D4' : '-';
      
      drawText(strBonus, der.strBonus, der.y, 12, 'center');
      drawText(aglBonus, der.aglBonus, der.y, 12, 'center');
      drawText(calculateMovement(character.kin, character.attributes?.AGL), der.movement, der.y, 12, 'center');

      // 5. Skills
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

      coreSkillsList.forEach((skillName, index) => {
        const yPos = lists.skillsStart.y + (index * lists.skillsLineHeight);
        const key = Object.keys(charSkills).find(k => k.toLowerCase() === skillName.toLowerCase());
        
        if (key) {
           if (character.trained_skills?.includes(key)) {
             drawText('X', lists.skillsStart.x, yPos, 12, 'center');
           }
           drawText(charSkills[key], lists.skillsLevelX, yPos, 11, 'center');
        }
      });

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

      const usedSkills = [...coreSkillsList, ...weaponSkillsList].map(s => s.toLowerCase());
      const secondarySkills = Object.entries(charSkills)
        .filter(([k]) => !usedSkills.includes(k.toLowerCase()))
        .slice(0, 5);

      secondarySkills.forEach(([name, level], index) => {
        const yPos = lists.secondarySkillsStart.y + (index * lists.secondaryLineHeight);
        drawText(name, lists.secondarySkillsStart.x, yPos, 9);
        drawText(level, lists.weaponLevelX, yPos, 11, 'center');
      });

      // 6. Abilities & Spells
      const abilities = (character.heroic_abilities || []).join(', ');
      let spellText = abilities;
      if (character.spells) {
         if(character.spells.general && character.spells.general.length > 0) {
             spellText += `\nTricks: ${character.spells.general.join(', ')}`;
         }
         if(character.spells.school && character.spells.school.spells.length > 0) {
             spellText += `\n${character.spells.school.name}: ${character.spells.school.spells.join(', ')}`;
         }
      }

      const ab = SHEET_LAYOUT.abilities;
      doc.setFontSize(9);
      const abilityLines = doc.splitTextToSize(spellText, ab.maxWidth);
      doc.text(abilityLines, ab.x, ab.y);

      // 7. Inventory
      const items = character.equipment?.inventory || [];
      const inventoryLines = items.map(i => i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name);
      
      inventoryLines.slice(0, 10).forEach((line, index) => {
        const yPos = lists.inventoryStart.y + (index * lists.inventoryLineHeight);
        drawText(line, lists.inventoryStart.x, yPos, 9);
      });
      
      // Memento
      if (character.memento) {
          drawText(character.memento, lists.inventoryStart.x, lists.mementoY, 8);
      }

      // 8. Money
      const v = SHEET_LAYOUT.vitals;
      drawText(character.equipment?.money?.gold || 0, v.money_x, v.money_gold_y, 11, 'center');
      drawText(character.equipment?.money?.silver || 0, v.money_x, v.money_silver_y, 11, 'center');
      drawText(character.equipment?.money?.copper || 0, v.money_x, v.money_copper_y, 11, 'center');

      // 9. Vitals
      drawText(character.max_hp, v.hp_x, v.hp_y, 14, 'center');
      drawText(character.max_wp, v.wp_x, v.wp_y, 14, 'center');

      // 10. Armor & Helmet
      const armorName = character.equipment?.equipped?.armor 
        ? items.find(i => i.name === character.equipment!.equipped!.armor)?.name 
        : character.equipment?.equipped?.armor || "";
      
      const ar = SHEET_LAYOUT.armor;
      drawText(armorName, ar.name_x, ar.name_y, 9);
      // Rating placeholder
      // drawText(rating, ar.rating_x, ar.rating_y, 12, 'center');
      
      const helmetName = character.equipment?.equipped?.helmet || "";
      const hl = SHEET_LAYOUT.helmet;
      drawText(helmetName, hl.name_x, hl.name_y, 9);

      // 11. Weapons
      const weapons = character.equipment?.equipped?.weapons || [];
      weapons.slice(0, 4).forEach((w, index) => {
         const yPos = lists.weaponsStart.y + (index * lists.weaponsLineHeight);
         
         drawText(w.name, 15, yPos, 9);
         drawText(w.grip, 65, yPos, 9, 'center');
         drawText(w.range, 80, yPos, 9, 'center');
         drawText(w.damage, 95, yPos, 9, 'center');
         drawText(w.durability, 110, yPos, 9, 'center');
         
         const feats = Array.isArray(w.features) ? w.features.join(', ') : w.features;
         drawText(feats, 125, yPos, 8);
      });

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
