import React from 'react';
import { Document, Page, Text, View, StyleSheet, Svg, Path } from '@react-pdf/renderer';
import { Character } from '../../types/character';
import { calculateMovement } from '../../lib/movement';

// --- STYLES ---
const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#fff',
    fontFamily: 'Times-Roman',
    fontSize: 10,
    color: '#222',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#8b2e2e',
    paddingBottom: 10,
  },
  titleBlock: { flexDirection: 'column', width: '65%' },
  charName: { fontSize: 26, fontFamily: 'Times-Bold', color: '#8b2e2e', textTransform: 'uppercase', marginBottom: 4 },
  subHeader: { fontSize: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginBottom: 4 },
  metaLabel: { fontFamily: 'Times-Bold', fontSize: 9, color: '#666' },
  appearanceBlock: { width: '30%', fontSize: 8, fontStyle: 'italic', borderWidth: 1, borderColor: '#ccc', padding: 4, height: 50 },

  // Attributes
  attributesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  attrGroup: { alignItems: 'center', width: '16%' },
  attrCircle: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 2,
    borderColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    backgroundColor: '#f4f4f4',
  },
  attrValue: { fontSize: 16, fontFamily: 'Times-Bold' },
  attrLabel: { fontSize: 9, fontFamily: 'Times-Bold', marginBottom: 2 },
  conditionBox: { fontSize: 6, marginTop: 2, textTransform: 'uppercase', color: '#888', borderWidth: 1, borderColor: '#ccc', padding: 2 },
  conditionActive: { color: '#cc0000', fontFamily: 'Times-Bold' },

  // --- 3-COLUMN LAYOUT ---
  mainGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    flexGrow: 1, 
  },
  colLeft: { width: '30%' },
  colMid: { width: '35%', borderRightWidth: 1, borderRightColor: '#eee', paddingRight: 5, borderLeftWidth: 1, borderLeftColor: '#eee', paddingLeft: 5 },
  colRight: { width: '35%' },

  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Times-Bold',
    backgroundColor: '#eee',
    padding: 3,
    marginBottom: 4,
    marginTop: 6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // Skills
  skillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
    fontSize: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  trainedMark: { fontFamily: 'Times-Bold', fontSize: 7, marginRight: 3 },

  // Inventory
  inventoryItem: { fontSize: 8, marginBottom: 2, flexDirection: 'row', justifyContent: 'space-between' },
  inventoryLine: { borderBottomWidth: 0.5, borderBottomColor: '#eee', flexGrow: 1, marginLeft: 4, marginTop: 7 },

  // --- COMBAT SECTION (Bottom) ---
  combatContainer: {
    flexDirection: 'column',
    marginTop: 5,
    borderTopWidth: 2,
    borderTopColor: '#444',
    paddingTop: 5,
  },
  
  // Armor Row
  armorRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  armorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 4,
    padding: 5,
    minWidth: 120,
    backgroundColor: '#fafafa',
  },
  armorIcon: { width: 24, height: 24, marginRight: 8 },
  armorText: { flexDirection: 'column' },
  armorLabel: { fontSize: 7, color: '#666', textTransform: 'uppercase' },
  armorName: { fontSize: 9, fontFamily: 'Times-Bold' },
  armorVal: { fontSize: 10, fontFamily: 'Times-Bold', color: '#1a472a' },

  // Bottom Split (Weapons Left, Vitals Right)
  bottomSplit: { flexDirection: 'row', gap: 15 },
  weaponsArea: { width: '65%' },
  vitalsArea: { width: '35%' },

  // Weapons Table
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', fontSize: 7, fontFamily: 'Times-Bold', paddingBottom: 2, marginBottom: 2 },
  tableRow: { flexDirection: 'row', fontSize: 8, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  colName: { width: '35%' },
  colSmall: { width: '10%', textAlign: 'center' },
  colMed: { width: '15%', textAlign: 'center' },
  colFeat: { width: '20%', fontSize: 7, color: '#444' },

  // Vitals Boxes
  vitalContainer: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  vitalBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#222',
    height: 45,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  vitalLabel: {
    position: 'absolute',
    top: -6,
    backgroundColor: '#fff',
    paddingHorizontal: 2,
    fontSize: 7,
    fontFamily: 'Times-Bold',
    textTransform: 'uppercase',
  },
  vitalMax: {
    position: 'absolute',
    bottom: 2,
    right: 3,
    fontSize: 7,
    color: '#666',
  },
  
  // Death Rolls
  deathRollBox: {
    borderWidth: 1,
    borderColor: '#888',
    padding: 5,
    borderRadius: 4,
  },
  deathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  checkbox: { width: 10, height: 10, borderWidth: 1, borderColor: '#000', backgroundColor: '#fff' },

});

// --- ICONS ---
const ArmorIcon = () => (
  <Svg viewBox="0 0 24 24" width={20} height={20}>
     <Path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" fill="#ddd" stroke="#000" strokeWidth={2} />
     <Path d="M12 6V18" stroke="#000" strokeWidth={1} />
     <Path d="M4 10H20" stroke="#000" strokeWidth={1} />
  </Svg>
);

const HelmetIcon = () => (
  <Svg viewBox="0 0 24 24" width={20} height={20}>
     <Path d="M12 2C7 2 3 6 3 11V18H21V11C21 6 17 2 12 2Z" fill="#ddd" stroke="#000" strokeWidth={2} />
     <Path d="M12 2V18" stroke="#000" strokeWidth={1} />
     <Path d="M3 11H21" stroke="#000" strokeWidth={1} />
  </Svg>
);

// --- HELPERS ---
const SkillRow = ({ name, value, isTrained, attribute }: any) => (
  <View style={styles.skillRow}>
    <Text>{name} <Text style={{ fontSize: 6, color: '#888' }}>({attribute})</Text></Text>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {isTrained && <Text style={styles.trainedMark}>[T]</Text>}
      <Text style={{ fontFamily: isTrained ? 'Times-Bold' : 'Times-Roman' }}>{value}</Text>
    </View>
  </View>
);

export const DragonbanePdfDocument = ({ character }: { character: Character }) => {
  // Logic Helpers
  const getBaseChance = (val: number) => {
      if (val <= 5) return 3; if (val <= 8) return 4; if (val <= 12) return 5; if (val <= 15) return 6; return 7;
  };
  
  const skillAttributeMap: Record<string, string> = { 
    'Acrobatics': 'AGL', 'Awareness': 'INT', 'Bartering': 'CHA', 'Beast Lore': 'INT', 'Bluffing': 'CHA', 
    'Bushcraft': 'INT', 'Crafting': 'STR', 'Evade': 'AGL', 'Healing': 'INT', 'Hunting & Fishing': 'AGL', 
    'Languages': 'INT', 'Myths & Legends': 'INT', 'Performance': 'CHA', 'Persuasion': 'CHA', 'Riding': 'AGL', 
    'Seamanship': 'INT', 'Sleight of Hand': 'AGL', 'Sneaking': 'AGL', 'Spot Hidden': 'INT', 'Swimming': 'AGL', 
    'Axes': 'STR', 'Bows': 'AGL', 'Brawling': 'STR', 'Crossbows': 'AGL', 'Hammers': 'STR', 'Knives': 'AGL', 
    'Slings': 'AGL', 'Spears': 'STR', 'Staves': 'AGL', 'Swords': 'STR', 'Mentalism': 'WIL', 'Animism': 'WIL', 'Elementalism': 'WIL' 
  };
  
  const coreSkillsList = [ 'Acrobatics', 'Awareness', 'Bartering', 'Beast Lore', 'Bluffing', 'Bushcraft', 'Crafting', 'Evade', 'Healing', 'Hunting & Fishing', 'Languages', 'Myths & Legends', 'Performance', 'Persuasion', 'Riding', 'Seamanship', 'Sleight of Hand', 'Sneaking', 'Spot Hidden', 'Swimming'];
  const weaponSkillsList = [ 'Axes', 'Bows', 'Brawling', 'Crossbows', 'Hammers', 'Knives', 'Slings', 'Spears', 'Staves', 'Swords'];
  
  const secondarySkills = Object.keys(character.skill_levels || {}).filter(skill => ![...coreSkillsList, ...weaponSkillsList].includes(skill)).sort();

  const getSkillValue = (name: string) => character.skill_levels?.[name] || getBaseChance(character.attributes?.[skillAttributeMap[name] as any] || 10);
  const isTrained = (name: string) => character.trained_skills?.includes(name);

  // Equipment Parsing
  const items = character.equipment?.inventory || [];
  const armorName = character.equipment?.equipped?.armor || "None";
  const armorItem = items.find(i => i.name === armorName);
  // Note: Assuming you have armor rating available in item object or separate lookup. 
  // For PDF static generation without API calls, we might default to placeholder if not passed.
  // Ideally 'character' object has resolved armor rating, or we pass it in. 
  // Since we don't have it here, we'll leave value blank for user to fill or guess.
  
  const helmetName = character.equipment?.equipped?.helmet || "None";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* --- HEADER --- */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.charName}>{character.name}</Text>
            <View style={styles.subHeader}>
              <Text><Text style={styles.metaLabel}>KIN: </Text>{character.kin}</Text>
              <Text><Text style={styles.metaLabel}>PROF: </Text>{character.profession}</Text>
              <Text><Text style={styles.metaLabel}>AGE: </Text>{character.age}</Text>
            </View>
            <Text style={{ fontSize: 8 }}>
              <Text style={styles.metaLabel}>WEAKNESS: </Text>{character.flaw}
            </Text>
            <Text style={{ fontSize: 8 }}>
              <Text style={styles.metaLabel}>MOVE: </Text>{calculateMovement(character.kin, character.attributes?.AGL)}
            </Text>
          </View>
          <View style={styles.appearanceBlock}>
            <Text>{character.appearance || "Appearance..."}</Text>
          </View>
        </View>

        {/* --- ATTRIBUTES --- */}
        <View style={styles.attributesContainer}>
          {['STR', 'CON', 'AGL', 'INT', 'WIL', 'CHA'].map((attr) => {
             const map: any = { STR: 'EXHAUSTED', CON: 'SICKLY', AGL: 'DAZED', INT: 'ANGRY', WIL: 'SCARED', CHA: 'DISHEARTENED' };
             const condKey = map[attr].toLowerCase();
             const isActive = character.conditions?.[condKey];
             return (
              <View key={attr} style={styles.attrGroup}>
                <Text style={styles.attrLabel}>{attr}</Text>
                <View style={styles.attrCircle}><Text style={styles.attrValue}>{character.attributes?.[attr as any]}</Text></View>
                <Text style={styles.conditionBox}>[  ] {map[attr]}</Text>
              </View>
             );
          })}
        </View>

        {/* --- MAIN COLUMNS --- */}
        <View style={styles.mainGrid}>
          
          {/* LEFT: Abilities & Spells */}
          <View style={styles.colLeft}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Abilities & Spells</Text>
            <View style={{ fontSize: 8 }}>
               {character.heroic_abilities && character.heroic_abilities.map((ha, i) => (
                 <Text key={i} style={{ marginBottom: 3 }}>• {ha}</Text>
               ))}
               {character.spells?.general && character.spells.general.length > 0 && (
                 <View style={{ marginTop: 5 }}>
                   <Text style={{ fontFamily: 'Times-Bold' }}>Tricks:</Text>
                   {character.spells.general.map((s: string, i: number) => <Text key={i}>  - {s}</Text>)}
                 </View>
               )}
               {character.spells?.school && character.spells.school.spells.length > 0 && (
                 <View style={{ marginTop: 5 }}>
                   <Text style={{ fontFamily: 'Times-Bold' }}>{character.spells.school.name}:</Text>
                   {character.spells.school.spells.map((s: string, i: number) => <Text key={i}>  - {s}</Text>)}
                 </View>
               )}
            </View>
          </View>

          {/* MIDDLE: Skills */}
          <View style={styles.colMid}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Skills</Text>
            {coreSkillsList.map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}

            <Text style={styles.sectionTitle}>Weapon Skills</Text>
            {weaponSkillsList.map(skill => (
              <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill]} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
            ))}

            {secondarySkills.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Secondary</Text>
                {secondarySkills.map(skill => (
                  <SkillRow key={skill} name={skill} attribute={skillAttributeMap[skill] || 'INT'} value={getSkillValue(skill)} isTrained={isTrained(skill)} />
                ))}
              </>
            )}
          </View>

          {/* RIGHT: Inventory */}
          <View style={styles.colRight}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Inventory</Text>
            <View style={{ fontSize: 9 }}>
               {(character.equipment?.inventory || []).slice(0, 20).map((item, i) => (
                   <View key={i} style={styles.inventoryItem}>
                     <Text>{item.quantity > 1 ? `${item.name} (x${item.quantity})` : item.name}</Text>
                     <View style={styles.inventoryLine} />
                   </View>
               ))}
               {/* Filler lines */}
               {Array.from({ length: Math.max(0, 15 - (character.equipment?.inventory?.length || 0)) }).map((_, i) => (
                   <View key={`empty-${i}`} style={styles.inventoryItem}><View style={styles.inventoryLine} /></View>
               ))}
            </View>
            
            <View style={{ borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 5, marginBottom: 5, marginTop: 5 }}>
                <Text style={{ fontSize: 8 }}>MONEY:</Text>
                <View style={{ flexDirection: 'row', gap: 10, fontSize: 9 }}>
                    <Text>{character.equipment?.money?.gold || 0} G</Text>
                    <Text>{character.equipment?.money?.silver || 0} S</Text>
                    <Text>{character.equipment?.money?.copper || 0} C</Text>
                </View>
            </View>
             {character.memento && (
              <View style={{ padding: 3, borderWidth: 1, borderColor: '#ddd', borderRadius: 2 }}>
                  <Text style={{ fontSize: 7, fontFamily: 'Times-Bold' }}>MEMENTO</Text>
                  <Text style={{ fontSize: 8, fontStyle: 'italic' }}>{character.memento}</Text>
              </View>
            )}
          </View>
        </View>

        {/* --- COMBAT ROW (Bottom) --- */}
        <View style={styles.combatContainer}>
           <View style={styles.armorRow}>
              {/* ARMOR */}
              <View style={styles.armorBox}>
                  <View style={styles.armorIcon}><ArmorIcon /></View>
                  <View style={styles.armorText}>
                      <Text style={styles.armorLabel}>Body Armor</Text>
                      <Text style={styles.armorName}>{armorName}</Text>
                      <Text style={styles.armorVal}>Rating: ___</Text>
                  </View>
              </View>
              {/* HELMET */}
              <View style={styles.armorBox}>
                  <View style={styles.armorIcon}><HelmetIcon /></View>
                  <View style={styles.armorText}>
                      <Text style={styles.armorLabel}>Helmet</Text>
                      <Text style={styles.armorName}>{helmetName}</Text>
                      <Text style={styles.armorVal}>Rating: ___</Text>
                  </View>
              </View>
           </View>
           
           <View style={styles.bottomSplit}>
               {/* Weapons Table */}
               <View style={styles.weaponsArea}>
                  <Text style={[styles.sectionTitle, {marginTop: 0, marginBottom: 2}]}>Equipped Weapons</Text>
                  <View style={styles.tableHeader}>
                        <Text style={styles.colName}>Weapon</Text><Text style={styles.colSmall}>Grip</Text><Text style={styles.colSmall}>Range</Text><Text style={styles.colMed}>Damage</Text><Text style={styles.colSmall}>Dur</Text><Text style={styles.colFeat}>Feats</Text>
                  </View>
                  {(character.equipment?.equipped?.weapons || []).map((w, i) => (
                    <View key={i} style={styles.tableRow}>
                        <Text style={styles.colName}>{w.name}</Text><Text style={styles.colSmall}>{w.grip}</Text><Text style={styles.colSmall}>{w.range}</Text><Text style={styles.colMed}>{w.damage}</Text><Text style={styles.colSmall}>{w.durability}</Text><Text style={styles.colFeat}>{Array.isArray(w.features) ? w.features.join(', ') : w.features}</Text>
                    </View>
                  ))}
                  <View style={styles.tableRow}><Text> </Text></View>
               </View>

               {/* Vitals & Death Rolls */}
               <View style={styles.vitalsArea}>
                  <View style={styles.vitalContainer}>
                      <View style={styles.vitalBox}>
                          <Text style={styles.vitalLabel}>HP</Text>
                          <Text style={styles.vitalMax}>Max {character.max_hp}</Text>
                      </View>
                      <View style={styles.vitalBox}>
                          <Text style={styles.vitalLabel}>WP</Text>
                          <Text style={styles.vitalMax}>Max {character.max_wp}</Text>
                      </View>
                  </View>
                  
                  <View style={styles.deathRollBox}>
                      <Text style={{ fontSize: 7, fontFamily: 'Times-Bold', marginBottom: 2, textAlign: 'center' }}>DEATH ROLLS</Text>
                      <View style={styles.deathRow}>
                          <Text style={{ fontSize: 7 }}>Success</Text>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                             <View style={styles.checkbox} /><View style={styles.checkbox} /><View style={styles.checkbox} />
                          </View>
                      </View>
                      <View style={styles.deathRow}>
                          <Text style={{ fontSize: 7 }}>Failure</Text>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                             <View style={styles.checkbox} /><View style={styles.checkbox} /><View style={styles.checkbox} />
                          </View>
                      </View>
                  </View>
               </View>
           </View>
        </View>

        {/* Footer */}
        <Text style={{ position: 'absolute', bottom: 20, left: 30, fontSize: 7, color: '#aaa' }}>Generated by Dragonbane App</Text>
      </Page>
    </Document>
  );
};