import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// NOTE: Using standard fonts to ensure compatibility
const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#fdfbf7',
    fontFamily: 'Times-Roman',
    color: '#2d2d2d',
    fontSize: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#8b2e2e',
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
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 10,
    flexDirection: 'row',
    gap: 10,
    color: '#555',
  },
  appearanceBlock: {
    width: '35%',
    fontSize: 8,
    fontStyle: 'italic',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 5,
    backgroundColor: '#fff',
    color: '#666',
  },
  attributesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    paddingVertical: 10,
    backgroundColor: '#f4f1ea',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d4c5a3',
  },
  attrBox: { alignItems: 'center' },
  attrCircle: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 2,
    borderColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  attrValue: { fontSize: 14, fontWeight: 'bold' },
  attrLabel: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' },
  conditionBox: { fontSize: 7, marginTop: 2, color: '#aaa', textTransform: 'uppercase' },
  conditionActive: { color: '#cc0000', fontWeight: 'bold' },
  
  grid: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#1a472a',
    color: '#e8d5b5',
    padding: 3,
    marginBottom: 5,
    marginTop: 10,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 1,
  },
  
  // Vitals
  vitalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  vitalLabel: { fontSize: 8, color: '#666' },
  vitalValue: { fontSize: 14, fontWeight: 'bold' },

  // Weapons Table
  tableHeader: { flexDirection: 'row', backgroundColor: '#ddd', fontSize: 8, padding: 3, fontWeight: 'bold', marginTop: 5 },
  tableRow: { flexDirection: 'row', fontSize: 8, padding: 3, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  colName: { width: '30%' },
  colGrip: { width: '10%', textAlign: 'center' },
  colRange: { width: '10%', textAlign: 'center' },
  colDmg: { width: '15%', textAlign: 'center' },
  colDur: { width: '10%', textAlign: 'center' },
  colFeat: { width: '25%' },
});

const SkillRow = ({ name, value, isTrained, attribute }: any) => (
  <View style={styles.row}>
    <Text>
      {name} <Text style={{ fontSize: 7, color: '#888' }}>{attribute ? `(${attribute})` : ''}</Text>
    </Text>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {isTrained && <Text style={{ fontSize: 7, marginRight: 4, color: '#1a472a' }}>[T]</Text>}
      <Text style={{ fontWeight: isTrained ? 'bold' : 'normal' }}>{value}</Text>
    </View>
  </View>
);

export const DragonbanePdfDocument = ({ character }: { character: Character }) => {
  const getBaseChance = (val: number) => {
      if (!val) return 3; // Fallback
      if (val <= 5) return 3; if (val <= 8) return 4; if (val <= 12) return 5; if (val <= 15) return 6; return 7;
  };
  
  const skillAttributeMap: Record<string, string> = { 
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT', 'Bluffing': 'CHA', 
    'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL', 'Healing': 'INT', 'Hunting & Fishing': 'AGL', 
    'Languages': 'INT', 'Myths & Legends': 'INT', 'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 
    'Seamanship': 'INT', 'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL', 
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 
    'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR', 
    'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL' 
  };

  const coreSkillsList = [
    'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft', 'Crafting', 'Evade', 
    'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 
    'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 'Spot Hidden', 'Swimming'
  ];
  
  const weaponSkillsList = [
     'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'
  ];

  // Logic to find Secondary Skills (Any skill in skill_levels that isn't in core lists)
  const allStandardSkills = new Set([...coreSkillsList, ...weaponSkillsList]);
  const secondarySkills = Object.keys(character.skill_levels || {})
    .filter(skill => !allStandardSkills.has(skill))
    .sort();

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
              <Text>{character.kin}</Text><Text>|</Text>
              <Text>{character.profession}</Text><Text>|</Text>
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
              {(() => {
                const map: any = { STR: 'EXHAUSTED', CON: 'SICKLY', AGL: 'DAZED', INT: 'ANGRY', WIL: 'SCARED', CHA: 'DISHEARTENED' };
                const condKey = map[attr].toLowerCase();
                const isActive = character.conditions?.[condKey];
                return <Text style={isActive ? styles.conditionActive : styles.conditionBox}>{map[attr]}</Text>;
              })()}
            </View>
          ))}
        </View>

        {/* 3-COLUMN CONTENT */}
        <View style={styles.grid}>
          
          {/* COL 1: GENERAL SKILLS */}
          <View style={styles.column}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>General Skills</Text>
            {coreSkillsList.map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}
          </View>

          {/* COL 2: WEAPONS & SECONDARY */}
          <View style={styles.column}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Weapon Skills</Text>
            {weaponSkillsList.map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}

            {/* NEW: SECONDARY SKILLS SECTION */}
            {secondarySkills.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Secondary Skills</Text>
                {secondarySkills.map(skill => (
                  <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill] || 'INT'} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
                ))}
              </>
            )}

            <Text style={styles.sectionTitle}>Abilities & Spells</Text>
            <View style={{ fontSize: 9 }}>
               {character.heroic_abilities && character.heroic_abilities.map((ha, i) => (
                 <Text key={i} style={{ marginBottom: 3 }}>• {ha}</Text>
               ))}
               {character.spells?.general && character.spells.general.length > 0 && (
                 <View style={{ marginTop: 5 }}>
                   <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>Tricks:</Text>
                   {character.spells.general.map((s: string, i: number) => <Text key={i}>  - {s}</Text>)}
                 </View>
               )}
               {character.spells?.school && character.spells.school.spells.length > 0 && (
                 <View style={{ marginTop: 5 }}>
                   <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>{character.spells.school.name}:</Text>
                   {character.spells.school.spells.map((s: string, i: number) => <Text key={i}>  - {s}</Text>)}
                 </View>
               )}
            </View>
          </View>

          {/* COL 3: VITALS & INVENTORY */}
          <View style={styles.column}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Vitals</Text>
            <View style={styles.vitalRow}>
                <View><Text style={styles.vitalLabel}>Hit Points</Text><Text style={styles.vitalValue}>{character.current_hp}/{character.max_hp}</Text></View>
                <View><Text style={styles.vitalLabel}>Willpower</Text><Text style={styles.vitalValue}>{character.current_wp}/{character.max_wp}</Text></View>
                <View><Text style={styles.vitalLabel}>Move</Text><Text style={styles.vitalValue}>{calculateMovement(character.kin, character.attributes?.AGL)}</Text></View>
            </View>
            
            <View style={{ borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 5, marginBottom: 10 }}>
                <Text style={{ fontSize: 9, marginBottom: 2 }}>Money:</Text>
                <View style={{ flexDirection: 'row', gap: 10, fontSize: 10 }}>
                    <Text style={{ color: '#b8860b', fontWeight: 'bold' }}>{character.equipment?.money?.gold || 0} G</Text>
                    <Text style={{ color: '#555', fontWeight: 'bold' }}>{character.equipment?.money?.silver || 0} S</Text>
                    <Text style={{ color: '#a0522d', fontWeight: 'bold' }}>{character.equipment?.money?.copper || 0} C</Text>
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

            {character.memento && (
              <View style={{ marginTop: 10, padding: 5, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 }}>Memento</Text>
                  <Text style={{ fontSize: 9, fontStyle: 'italic' }}>{character.memento}</Text>
              </View>
            )}
          </View>
        </View>

        {/* WEAPONS TABLE */}
        <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>Equipped Weapons & Armor</Text>
            <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
                <Text style={{ fontSize: 9 }}>Armor: <Text style={{ fontWeight: 'bold' }}>{character.equipment?.equipped?.armor || "None"}</Text></Text>
                <Text style={{ fontSize: 9 }}>Helmet: <Text style={{ fontWeight: 'bold' }}>{character.equipment?.equipped?.helmet || "None"}</Text></Text>
            </View>
            {character.equipment?.equipped?.weapons && character.equipment.equipped.weapons.length > 0 ? (
              <>
                <View style={styles.tableHeader}>
                    <Text style={styles.colName}>Weapon</Text><Text style={styles.colGrip}>Grip</Text><Text style={styles.colRange}>Range</Text><Text style={styles.colDmg}>Damage</Text><Text style={styles.colDur}>Dur</Text><Text style={styles.colFeat}>Features</Text>
                </View>
                {character.equipment.equipped.weapons.map((w, i) => (
                    <View key={i} style={styles.tableRow}>
                        <Text style={styles.colName}>{w.name}</Text><Text style={styles.colGrip}>{w.grip}</Text><Text style={styles.colRange}>{w.range}</Text><Text style={styles.colDmg}>{w.damage}</Text><Text style={styles.colDur}>{w.durability}</Text><Text style={styles.colFeat}>{Array.isArray(w.features) ? w.features.join(', ') : w.features}</Text>
                    </View>
                ))}
              </>
            ) : <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#888' }}>No weapons equipped.</Text>}
        </View>
        <Text style={{ position: 'absolute', bottom: 30, left: 30, fontSize: 8, color: '#aaa' }}>Generated by Dragonbane App</Text>
      </Page>
    </Document>
  );
};