import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// Using standard PDF fonts (Helvetica/Times) to avoid network/loading errors
const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#fff', // White background for better printing
    fontFamily: 'Times-Roman',
    fontSize: 10,
    color: '#222',
  },
  // --- HEADER ---
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#8b2e2e',
    paddingBottom: 10,
  },
  titleBlock: {
    flexDirection: 'column',
    width: '65%',
  },
  charName: {
    fontSize: 28,
    fontFamily: 'Times-Bold',
    color: '#8b2e2e',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    marginBottom: 6,
  },
  metaLabel: {
    fontFamily: 'Times-Bold',
    fontSize: 9,
    color: '#666',
  },
  appearanceBlock: {
    width: '30%',
    fontSize: 8,
    fontStyle: 'italic',
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 6,
    backgroundColor: '#fafafa',
    height: 60,
  },

  // --- ATTRIBUTES & CONDITIONS ---
  attributesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  attrGroup: {
    alignItems: 'center',
    width: '16%',
  },
  attrCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    backgroundColor: '#f4f4f4',
  },
  attrValue: {
    fontSize: 18,
    fontFamily: 'Times-Bold',
  },
  attrLabel: {
    fontSize: 10,
    fontFamily: 'Times-Bold',
    marginBottom: 2,
  },
  conditionBox: {
    marginTop: 4,
    fontSize: 7,
    textTransform: 'uppercase',
    color: '#444',
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },

  // --- MAIN LAYOUT ---
  grid: {
    flexDirection: 'row',
    gap: 15,
  },
  column: {
    flex: 1,
  },
  
  // --- SECTIONS ---
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Times-Bold',
    backgroundColor: '#ddd',
    padding: 4,
    marginBottom: 6,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  // Skills
  skillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    fontSize: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    paddingBottom: 1,
  },
  trainedMark: {
    fontFamily: 'Times-Bold',
    fontSize: 8,
    marginRight: 4,
    color: '#000',
  },

  // Vitals Boxes (Pencil Friendly)
  vitalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  vitalBox: {
    width: '30%',
    borderWidth: 1,
    borderColor: '#000',
    height: 40,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalLabel: {
    position: 'absolute',
    top: -6,
    backgroundColor: '#fff',
    paddingHorizontal: 3,
    fontSize: 8,
    fontFamily: 'Times-Bold',
    textTransform: 'uppercase',
  },
  vitalMax: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    fontSize: 8,
    color: '#666',
  },
  
  // Death Rolls
  deathRollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    padding: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#000',
    marginHorizontal: 2,
  },

  // Weapons Table
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontSize: 8,
    fontFamily: 'Times-Bold',
    paddingBottom: 2,
    marginBottom: 2,
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    fontSize: 9,
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  colName: { width: '35%' },
  colSmall: { width: '10%', textAlign: 'center' },
  colMed: { width: '15%', textAlign: 'center' },
  colFeat: { width: '20%', fontSize: 8, color: '#444' },

  // Inventory
  inventoryItem: {
    fontSize: 9,
    marginBottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inventoryLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    flexGrow: 1,
    marginLeft: 5,
    marginTop: 8,
  }
});

const SkillRow = ({ name, value, isTrained, attribute }: any) => (
  <View style={styles.skillRow}>
    <Text>
      {name} <Text style={{ fontSize: 7, color: '#888' }}>({attribute})</Text>
    </Text>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {isTrained && <Text style={styles.trainedMark}>[T]</Text>}
      <Text style={{ fontFamily: isTrained ? 'Times-Bold' : 'Times-Roman' }}>{value}</Text>
    </View>
  </View>
);

export const DragonbanePdfDocument = ({ character }: { character: Character }) => {
  const getBaseChance = (val: number) => {
      if (val <= 5) return 3; if (val <= 8) return 4; if (val <= 12) return 5; if (val <= 15) return 6; return 7;
  };
  
  const skillAttributeMap: Record<string, string> = { 
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT', 'Bluffing': 'CHA', 
    'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL', 'Healing': 'INT', 'Hunting & Fishing': 'AGL', 
    'Languages': 'INT', 'Myths & Legends': 'INT', 'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 
    'Seamanship': 'INT', 'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL', 
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 
    'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR', 'Mentalism': 'WIL', 'Animism': 'WIL', 
    'Elementalism': 'WIL' 
  };

  const coreSkillsList = [
    'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft', 'Crafting', 'Evade', 
    'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 
    'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 'Spot Hidden', 'Swimming'
  ];
  
  const weaponSkillsList = [
     'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'
  ];

  const secondarySkills = Object.keys(character.skill_levels || {})
    .filter(skill => ![...coreSkillsList, ...weaponSkillsList].includes(skill))
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
              <View><Text style={styles.metaLabel}>KIN: </Text><Text>{character.kin}</Text></View>
              <View><Text style={styles.metaLabel}>PROFESSION: </Text><Text>{character.profession}</Text></View>
              <View><Text style={styles.metaLabel}>AGE: </Text><Text>{character.age}</Text></View>
            </View>
            <View style={{ marginTop: 4 }}>
              <Text style={styles.metaLabel}>WEAKNESS: <Text style={{ fontFamily: 'Times-Roman', color: '#000' }}>{character.flaw || "None"}</Text></Text>
            </View>
          </View>
          <View style={styles.appearanceBlock}>
            <Text>{character.appearance || "Appearance description..."}</Text>
          </View>
        </View>

        {/* ATTRIBUTES & CONDITIONS */}
        <View style={styles.attributesContainer}>
          {['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'].map((attr) => {
             const map: any = { STR: 'EXHAUSTED', CON: 'SICKLY', AGL: 'DAZED', INT: 'ANGRY', WIL: 'SCARED', CHA: 'DISHEARTENED' };
             return (
              <View key={attr} style={styles.attrGroup}>
                <Text style={styles.attrLabel}>{attr}</Text>
                <View style={styles.attrCircle}>
                  <Text style={styles.attrValue}>{character.attributes?.[attr as any]}</Text>
                </View>
                {/* Always print empty checkbox for pencil use */}
                <Text style={styles.conditionBox}>[  ] {map[attr]}</Text>
              </View>
             );
          })}
        </View>

        {/* MAIN GRID */}
        <View style={styles.grid}>
          
          {/* COL 1: SKILLS */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {coreSkillsList.map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}
          </View>

          {/* COL 2: COMBAT */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Weapon Skills</Text>
            {weaponSkillsList.map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}

            {secondarySkills.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Secondary Skills</Text>
                {secondarySkills.map(skill => (
                  <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill] || 'INT'} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
                ))}
              </>
            )}

            <Text style={styles.sectionTitle}>Abilities & Spells</Text>
            <View style={{ fontSize: 9, minHeight: 100, borderWidth: 1, borderColor: '#eee', padding: 5 }}>
               {character.heroic_abilities && character.heroic_abilities.map((ha, i) => (
                 <Text key={i} style={{ marginBottom: 2 }}>• {ha}</Text>
               ))}
               {character.spells?.general?.map((s: string, i: number) => <Text key={`t-${i}`}>• Trick: {s}</Text>)}
               {character.spells?.school?.spells.map((s: string, i: number) => <Text key={`s-${i}`}>• Spell: {s}</Text>)}
            </View>
          </View>

          {/* COL 3: VITALS & GEAR */}
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Status</Text>
            
            <View style={styles.vitalContainer}>
                <View style={styles.vitalBox}>
                    <Text style={styles.vitalLabel}>Hit Points</Text>
                    <Text style={styles.vitalMax}>Max: {character.max_hp}</Text>
                </View>
                <View style={styles.vitalBox}>
                    <Text style={styles.vitalLabel}>Willpower</Text>
                    <Text style={styles.vitalMax}>Max: {character.max_wp}</Text>
                </View>
                <View style={styles.vitalBox}>
                    <Text style={styles.vitalLabel}>Movement</Text>
                    <Text style={{ fontSize: 14, fontFamily: 'Times-Bold' }}>{calculateMovement(character.kin, character.attributes?.AGL)}</Text>
                </View>
            </View>
            
            {/* Death Rolls */}
            <View style={styles.deathRollRow}>
                <Text style={{ fontSize: 8, fontFamily: 'Times-Bold' }}>DEATH ROLLS</Text>
                <View style={{ flexDirection: 'column', gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                         <Text style={{ fontSize: 7, width: 40 }}>Success:</Text>
                         <View style={styles.checkbox} /><View style={styles.checkbox} /><View style={styles.checkbox} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                         <Text style={{ fontSize: 7, width: 40 }}>Failure:</Text>
                         <View style={styles.checkbox} /><View style={styles.checkbox} /><View style={styles.checkbox} />
                    </View>
                </View>
            </View>

            <Text style={styles.sectionTitle}>Equipment</Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, fontSize: 9 }}>
                <Text>Armor: <Text style={{ fontFamily: 'Times-Bold' }}>{character.equipment?.equipped?.armor || "-"}</Text></Text>
                <Text>Helm: <Text style={{ fontFamily: 'Times-Bold' }}>{character.equipment?.equipped?.helmet || "-"}</Text></Text>
            </View>

            <View style={{ borderTopWidth: 1, borderColor: '#000', marginBottom: 5 }} />
            
            <View style={{ marginBottom: 10 }}>
               {(character.equipment?.inventory || []).slice(0, 15).map((item, i) => (
                   <View key={i} style={styles.inventoryItem}>
                     <Text>{item.quantity > 1 ? `${item.name} (x${item.quantity})` : item.name}</Text>
                     <View style={styles.inventoryLine} />
                   </View>
               ))}
               {/* Print extra empty lines for writing */}
               {Array.from({ length: Math.max(0, 15 - (character.equipment?.inventory?.length || 0)) }).map((_, i) => (
                   <View key={`empty-${i}`} style={styles.inventoryItem}>
                       <View style={styles.inventoryLine} />
                   </View>
               ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, fontSize: 9, borderWidth: 1, borderColor: '#ccc', padding: 4 }}>
                <Text>Gold: {character.equipment?.money?.gold}</Text>
                <Text>Silver: {character.equipment?.money?.silver}</Text>
                <Text>Copper: {character.equipment?.money?.copper}</Text>
            </View>
          </View>
        </View>

        {/* WEAPONS TABLE */}
        <View>
            <View style={styles.tableHeader}>
                <Text style={styles.colName}>Weapon</Text>
                <Text style={styles.colSmall}>Grip</Text>
                <Text style={styles.colSmall}>Range</Text>
                <Text style={styles.colMed}>Damage</Text>
                <Text style={styles.colSmall}>Dur</Text>
                <Text style={styles.colFeat}>Features</Text>
            </View>
            {(character.equipment?.equipped?.weapons || []).map((w, i) => (
                <View key={i} style={styles.tableRow}>
                    <Text style={styles.colName}>{w.name}</Text>
                    <Text style={styles.colSmall}>{w.grip}</Text>
                    <Text style={styles.colSmall}>{w.range}</Text>
                    <Text style={styles.colMed}>{w.damage}</Text>
                    <Text style={styles.colSmall}>{w.durability}</Text>
                    <Text style={styles.colFeat}>{Array.isArray(w.features) ? w.features.join(', ') : w.features}</Text>
                </View>
            ))}
            {/* Empty rows for writing */}
            <View style={styles.tableRow}><Text style={styles.colName}> </Text></View>
            <View style={styles.tableRow}><Text style={styles.colName}> </Text></View>
        </View>

      </Page>
    </Document>
  );
};