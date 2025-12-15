import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { Download, Loader2 } from 'lucide-react';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// You need to host the empty character sheet image in your public folder
// Place the image at: public/assets/dragonbane-sheet-bg.jpg
const SHEET_IMAGE_URL = '/assets/dragonbane-sheet-bg.jpg';

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

      // A4 dimensions: 210 x 297 mm
      const width = 210;
      const height = 297;
      doc.addImage(img, 'JPEG', 0, 0, width, height);

      // 2. Set Font Styles
      doc.setFont('times', 'bold'); // Standard font, closer to serif style
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40); // Dark grey/black

      // 3. Helper to write text at coordinates (X, Y in mm)
      const text = (str: string | number | undefined, x: number, y: number, size = 10, align: 'left' | 'center' | 'right' = 'left') => {
        if (str === undefined || str === null) return;
        doc.setFontSize(size);
        doc.text(String(str), x, y, { align });
      };

      // --- MAPPING DATA TO COORDINATES ---
      // These coordinates are estimates based on the A4 sheet. 
      // You may need to fine-tune X/Y values by 1-2mm.

      // Header Info
      text(character.name, 105, 34, 16, 'center'); // Name centered under banner
      text(character.kin, 45, 18);
      text(character.age, 75, 18);
      text(character.profession, 45, 24);
      text(character.weakness, 45, 30);
      text(character.appearance, 150, 18, 9); // Multi-line usually, but single here

      // Attributes (The Circles)
      // STR, CON, AGL, INT, WIL, CHA
      const attrY = 48;
      text(character.attributes?.STR, 38, attrY, 14, 'center');
      text(character.attributes?.CON, 63, attrY, 14, 'center');
      text(character.attributes?.AGL, 88, attrY, 14, 'center');
      text(character.attributes?.INT, 113, attrY, 14, 'center');
      text(character.attributes?.WIL, 138, attrY, 14, 'center');
      text(character.attributes?.CHA, 163, attrY, 14, 'center');

      // Conditions (Checkboxes - represented by X if active)
      const condY = 57;
      if (character.conditions?.exhausted) text('X', 42, condY, 12, 'center');
      if (character.conditions?.sickly) text('X', 67, condY, 12, 'center');
      if (character.conditions?.dazed) text('X', 92, condY, 12, 'center');
      if (character.conditions?.angry) text('X', 117, condY, 12, 'center');
      if (character.conditions?.scared) text('X', 142, condY, 12, 'center');
      if (character.conditions?.disheartened) text('X', 167, condY, 12, 'center');

      // Derived Ratings (Banners)
      const strBonus = character.attributes?.STR && character.attributes.STR > 16 ? '+D6' : character.attributes?.STR && character.attributes.STR > 12 ? '+D4' : '-';
      const aglBonus = character.attributes?.AGL && character.attributes.AGL > 16 ? '+D6' : character.attributes?.AGL && character.attributes.AGL > 12 ? '+D4' : '-';
      
      text(strBonus, 50, 72, 12, 'center'); // Dmg Bonus STR
      text(aglBonus, 110, 72, 12, 'center'); // Dmg Bonus AGL
      text(calculateMovement(character.kin, character.attributes?.AGL), 170, 72, 12, 'center'); // Movement

      // Skills
      // We map skill names to approximate Y positions. 
      // Starting Y for Acrobatics is around 90mm, incrementing by ~6mm
      const skillMap: Record<string, number> = {
        'Acrobatics': 90,
        'Awareness': 96,
        'Bartering': 102,
        'Beast Lore': 108,
        'Bluffing': 114,
        'Bushcraft': 120,
        'Crafting': 126,
        'Evade': 132,
        'Healing': 138,
        'Hunting & Fishing': 144,
        'Languages': 150,
        'Myths & Legends': 156,
        'Performance': 162,
        'Persuasion': 168,
        'Riding': 174,
        'Seamanship': 180,
        'Sleight of Hand': 186,
        'Sneaking': 192,
        'Spot Hidden': 198,
        'Swimming': 204
      };

      // Fill Core Skills
      Object.entries(character.skill_levels || {}).forEach(([skill, level]) => {
        // Standardize skill name matching (some db keys might be uppercase)
        const matchedKey = Object.keys(skillMap).find(k => k.toUpperCase() === skill.toUpperCase());
        if (matchedKey) {
          // Checkbox for trained (simple X left of name)
          text('X', 65, skillMap[matchedKey], 10, 'center'); 
          // Skill Level (right of name)
          text(level, 82, skillMap[matchedKey], 10, 'center');
        }
      });

      // Weapon Skills (Right Column)
      const weaponSkillMap: Record<string, number> = {
        'Axes': 90,
        'Bows': 96,
        'Brawling': 102,
        'Crossbows': 108,
        'Hammers': 114,
        'Knives': 120,
        'Slings': 126,
        'Spears': 132,
        'Staves': 138,
        'Swords': 144
      };

      Object.entries(character.skill_levels || {}).forEach(([skill, level]) => {
        const matchedKey = Object.keys(weaponSkillMap).find(k => k.toUpperCase() === skill.toUpperCase());
        if (matchedKey) {
          text('X', 123, weaponSkillMap[matchedKey], 10, 'center'); 
          text(level, 140, weaponSkillMap[matchedKey], 10, 'center');
        }
      });

      // Secondary Skills (Custom lines below weapons)
      // Filter out core and weapon skills to find secondary
      const coreSkills = [...Object.keys(skillMap), ...Object.keys(weaponSkillMap)].map(k => k.toUpperCase());
      const secondarySkills = Object.entries(character.skill_levels || {})
        .filter(([k]) => !coreSkills.includes(k.toUpperCase()))
        .slice(0, 5); // Max 5 lines

      let secY = 160;
      secondarySkills.forEach(([name, level]) => {
        text(name, 125, secY, 8); // Name
        text(level, 140, secY, 10, 'center'); // Level
        secY += 6;
      });

      // Abilities & Spells (Left Column text area)
      const abilities = (character.heroic_abilities || []).map(a => a.name).join(', ');
      // Simple text wrapping
      const splitAbilities = doc.splitTextToSize(abilities, 55);
      doc.text(splitAbilities, 15, 90);

      // Inventory
      const items = character.inventory || [];
      let invY = 90;
      items.slice(0, 10).forEach((item) => {
        text(item.name, 160, invY, 9);
        invY += 6;
      });

      // Tiny Items
      // Assuming mapped to a single string or list in your data structure
      // text(character.tiny_items, 155, 175, 8);

      // Money
      text(character.equipment?.money?.gold, 35, 178, 10, 'center');
      text(character.equipment?.money?.silver, 35, 187, 10, 'center');
      text(character.equipment?.money?.copper, 35, 196, 10, 'center');

      // Vitals
      // Max HP
      text(character.max_hp, 185, 230, 14, 'center');
      // Current HP (Optional, usually you print blank sheets, but we can fill it)
      // text(character.current_hp, 185, 230, 14, 'center');

      // Max WP
      text(character.max_wp, 185, 212, 14, 'center');

      // Armor
      const armor = character.equipment?.armor;
      if (armor) {
        text(armor.name, 45, 215, 9);
        text(armor.rating, 27, 220, 12, 'center');
      }

      // Helmet
      const helmet = character.equipment?.helmet;
      if (helmet) {
        text(helmet.name, 105, 215, 9);
        text(helmet.rating, 88, 220, 12, 'center');
      }

      // Weapons (Bottom Table)
      // Assuming character.weapons is an array of equipped weapons
      const weapons = character.weapons || [];
      let weapY = 248;
      weapons.slice(0, 3).forEach((w) => {
        text(w.name, 15, weapY, 9); // Name
        text(w.grip, 65, weapY, 9, 'center'); // Grip
        text(w.range, 80, weapY, 9, 'center'); // Range
        text(w.damage, 95, weapY, 9, 'center'); // Damage
        text(w.durability, 110, weapY, 9, 'center'); // Durability
        text(w.features?.join(', '), 125, weapY, 8); // Features
        weapY += 8;
      });

      // Save
      doc.save(`${character.name.replace(/\s+/g, '_')}_Dragonbane.pdf`);

    } catch (err) {
      console.error('PDF Generation failed', err);
      alert('Failed to generate PDF. Please ensure background image is available.');
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
