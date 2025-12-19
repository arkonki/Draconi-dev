 import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image as PdfImage } from '@react-pdf/renderer';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// Register a nice serif font (optional, using standard Times here)
// You can register custom fonts like "DragonbaneFont" if you have the .ttf file
Font.register({
  family: 'StandardSerif',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/crimsontext/v18/wlp2gwHKFkZgtmSR3NB0oRJfbwhT.ttf' }, // Regular
    { src: 'https://fonts.gstatic.com/s/crimsontext/v18/wlppgwHKFkZgtmSR3NB0oRJX1C1i.ttf', fontWeight: 'bold' } // Bold
  ]
});

// Define CSS-like styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#fdfbf7', // Parchment color
    fontFamily: 'StandardSerif',
    color: '#2d2d2d',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottom: '2px solid #8b2e2e', // Dragonbane Red
    paddingBottom: 10,
  },
  titleBlock: {
    flexDirection: 'column',
    width: '60%',
  },
  charName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8b2e2e',
    textTransform: 'uppercase',
  },
  subHeader: {
    fontSize: 10,
    flexDirection: 'row',
    gap: 10,
    marginTop: 5,
    color: '#555',
  },
  appearanceBlock: {
    width: '35%',
    fontSize: 8,
    fontStyle: 'italic',
    border: '1px solid #ddd',
    padding: 5,
    backgroundColor: '#fff',
  },
  
  // Attributes Row
  attributesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    paddingVertical: 10,
    backgroundColor: '#f4f1ea',
    borderRadius: 5,
    border: '1px solid #d4c5a3',
  },
  attrBox: {
    alignItems: 'center',
  },
  attrCircle: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    border: '2px solid #1a472a', // Dragonbane Green
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  attrValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  attrLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  conditionBox: {
    fontSize: 7,
    marginTop: 2,
    color: '#888',
    textTransform: 'uppercase',
  },
  conditionActive: {
    color: '#cc0000',
    fontWeight: 'bold',
  },

  // Main Content Grid
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#1a472a',
    color: '#e8d5b5',
    padding: 3,
    marginBottom: 5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  
  // Lists
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
    fontSize: 9,
    borderBottom: '1px solid #eee',
    paddingBottom: 1,
  },
  label: { fontWeight: 'bold' },
  value: {},
  
  // Weapons Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#ddd',
    fontSize: 8,
    padding: 2,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    fontSize: 8,
    padding: 2,
    borderBottom: '1px solid #ccc',
  },
  colName: { width: '30%' },
  colGrip: { width: '10%', textAlign: 'center' },
  colRange: { width: '10%', textAlign: 'center' },
  colDmg: { width: '15%', textAlign: 'center' },
  colDur: { width: '10%', textAlign: 'center' },
  colFeat: { width: '25%' },
});

// Helper for skill lists
const SkillRow = ({ name, value, isTrained, attribute }: any) => (
  <View style={styles.row}>
    <Text style={{ fontFamily: isTrained ? 'StandardSerif' : 'StandardSerif', fontWeight: isTrained ? 'bold' : 'normal' }}>
      {name} <Text style={{ fontSize: 7, color: '#666' }}>({attribute})</Text>
    </Text>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {isTrained && <Text style={{ fontSize: 7, marginRight: 4 }}>[T]</Text>}
      <Text>{value}</Text>
    </View>
  </View>
);

export const DragonbanePdfDocument = ({ character }: { character: Character }) => {
  // Logic helpers (same as before)
  const getBaseChance = (val: number) => {
      if (val <= 5) return 3; if (val <= 8) return 4; if (val <= 12) return 5; if (val <= 15) return 6; return 7;
  };
  
  const skillAttributeMap: Record<string, string> = { 'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT', 'Bluffing': 'CHA', 'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL', 'Healing': 'INT', 'Hunting & Fishing': 'AGL', 'Languages': 'INT', 'Myths & Legends': 'INT', 'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 'Seamanship': 'INT', 'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL', 'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR' };
  
  const getSkillValue = (name: string) => {
    return character.skill_levels?.[name] || getBaseChance(character.attributes?.[skillAttributeMap[name] as any] || 10);
  };
  
  const isTrained = (name: string) => character.trained_skills?.includes(name);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.charName}>{character.name}</Text>
            <View style={styles.subHeader}>
              <Text>{character.kin}</Text>
              <Text>|</Text>
              <Text>{character.profession}</Text>
              <Text>|</Text>
              <Text>Age: {character.age}</Text>
            </View>
            <Text style={{ fontSize: 9, marginTop: 5, color: '#cc0000' }}>
              Weakness: {character.weak_spot || "None"}
            </Text>
          </View>
          <View style={styles.appearanceBlock}>
            <Text>{character.appearance || "No appearance description."}</Text>
          </View>
        </View>

        {/* ATTRIBUTES */}
        <View style={styles.attributesRow}>
          {['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'].map((attr) => (
            <View key={attr} style={styles.attrBox}>
              <Text style={styles.attrLabel}>{attr}</Text>
              <View style={styles.attrCircle}>
                <Text style={styles.attrValue}>{character.attributes?.[attr as any]}</Text>
              </View>
              {/* Map attribute to condition name */}
              {(() => {
                const map: any = { STR: 'exhausted', CON: 'sickly', AGL: 'dazed', INT: 'angry', WIL: 'scared', CHA: 'disheartened' };
                const condKey = map[attr];
                const isActive = character.conditions?.[condKey];
                return (
                  <Text style={[styles.conditionBox, isActive ? styles.conditionActive : {}]}>
                    {isActive ? '[X] ' : '[ ] '}{condKey}
                  </Text>
                );
              })()}
            </View>
          ))}
        </View>

        {/* 3-COLUMN LAYOUT */}
        <View style={styles.grid}>
          
          {/* COL 1: SKILLS */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>General Skills</Text>
            {[ 'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft', 'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 'Spot Hidden', 'Swimming'].map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}
          </View>

          {/* COL 2: COMBAT & ABILITIES */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Weapon Skills</Text>
            {['Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'].map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Abilities & Spells</Text>
            <View style={{ fontSize: 9 }}>
               {character.heroic_abilities && character.heroic_abilities.map((ha, i) => (
                 <Text key={i} style={{ marginBottom: 2 }}>• {ha}</Text>
               ))}
               {character.spells?.general && character.spells.general.length > 0 && (
                 <View style={{ marginTop: 5 }}>
                   <Text style={{ fontWeight: 'bold' }}>Tricks:</Text>
                   {character.spells.general.map((s: string, i: number) => <Text key={i}>- {s}</Text>)}
                 </View>
               )}
               {character.spells?.school && character.spells.school.spells.length > 0 && (
                 <View style={{ marginTop: 5 }}>
                   <Text style={{ fontWeight: 'bold' }}>{character.spells.school.name}:</Text>
                   {character.spells.school.spells.map((s: string, i: number) => <Text key={i}>- {s}</Text>)}
                 </View>
               )}
            </View>
          </View>

          {/* COL 3: INVENTORY & VITALS */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Vitals</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <View>
                    <Text style={{ fontSize: 8 }}>Hit Points</Text>
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{character.max_hp}</Text>
                </View>
                <View>
                    <Text style={{ fontSize: 8 }}>Willpower</Text>
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{character.max_wp}</Text>
                </View>
                <View>
                    <Text style={{ fontSize: 8 }}>Movement</Text>
                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{calculateMovement(character.kin, character.attributes?.AGL)}</Text>
                </View>
            </View>
            <View style={{ borderTop: '1px solid #ccc', paddingTop: 5, marginBottom: 10 }}>
                <Text style={{ fontSize: 9 }}>Money:</Text>
                <View style={{ flexDirection: 'row', gap: 5, fontSize: 10 }}>
                    <Text style={{ color: '#b8860b' }}>{character.equipment?.money?.gold || 0} G</Text>
                    <Text style={{ color: '#718096' }}>{character.equipment?.money?.silver || 0} S</Text>
                    <Text style={{ color: '#a0522d' }}>{character.equipment?.money?.copper || 0} C</Text>
                </View>
            </View>

            <Text style={styles.sectionTitle}>Inventory</Text>
            <View style={{ fontSize: 9 }}>
               {(character.equipment?.inventory || []).map((item, i) => (
                   <Text key={i} style={{ marginBottom: 2 }}>
                     {item.quantity > 1 ? `${item.name} (x${item.quantity})` : item.name}
                   </Text>
               ))}
               {(!character.equipment?.inventory || character.equipment.inventory.length === 0) && (
                   <Text style={{ color: '#aaa', fontStyle: 'italic' }}>Empty</Text>
               )}
            </View>

            <View style={{ marginTop: 10, padding: 5, border: '1px solid #ccc', borderRadius: 4 }}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' }}>Memento</Text>
                <Text style={{ fontSize: 9, fontStyle: 'italic' }}>{character.memento || "None"}</Text>
            </View>
          </View>
        </View>

        {/* BOTTOM: WEAPONS TABLE */}
        <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>Equipped Weapons & Armor</Text>
            
            <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
                <Text style={{ fontSize: 9 }}>Armor: <Text style={{ fontWeight: 'bold' }}>{character.equipment?.equipped?.armor || "None"}</Text></Text>
                <Text style={{ fontSize: 9 }}>Helmet: <Text style={{ fontWeight: 'bold' }}>{character.equipment?.equipped?.helmet || "None"}</Text></Text>
            </View>

            <View style={styles.tableHeader}>
                <Text style={styles.colName}>Weapon</Text>
                <Text style={styles.colGrip}>Grip</Text>
                <Text style={styles.colRange}>Range</Text>
                <Text style={styles.colDmg}>Damage</Text>
                <Text style={styles.colDur}>Durability</Text>
                <Text style={styles.colFeat}>Features</Text>
            </View>
            {(character.equipment?.equipped?.weapons || []).map((w, i) => (
                <View key={i} style={styles.tableRow}>
                    <Text style={styles.colName}>{w.name}</Text>
                    <Text style={styles.colGrip}>{w.grip}</Text>
                    <Text style={styles.colRange}>{w.range}</Text>
                    <Text style={styles.colDmg}>{w.damage}</Text>
                    <Text style={styles.colDur}>{w.durability}</Text>
                    <Text style={styles.colFeat}>{Array.isArray(w.features) ? w.features.join(', ') : w.features}</Text>
                </View>
            ))}
        </View>

        {/* Footer Credit */}
        <Text style={{ position: 'absolute', bottom: 30, left: 30, fontSize: 8, color: '#aaa' }}>
            Generated by Dragonbane App
        </Text>
      </Page>
    </Document>
  );
};