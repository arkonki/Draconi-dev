import React, { useState, useMemo } from 'react';
import { 
  Shield, Swords, Heart, Map, BookOpen, AlertCircle, Skull, Dices 
} from 'lucide-react';
import { useDice } from '../dice/DiceContext';

// --- DATA OBJECT ---
const gmScreenData = {
  npcs: {
    title: "NPCs", icon: Skull, sections: [
      { title: "Typical NPCs", type: 'table', headers: ["Type", "Skills", "Abilities", "Dmg", "HP", "WP", "Gear"], rows: [ ["Guard", "Awareness 10, Swords 12", "—", "STR +D4", "12", "—", "Broadsword, studded leather"], ["Cultist", "Evade 14, Knives 14", "—", "AGL +D4", "12", "—", "Dagger"], ["Thief", "Evade 12, Knives 12", "—", "AGL +D4", "10", "—", "Knife"], ["Villager", "Brawling 8", "—", "—", "8", "—", "Wooden club"], ["Hunter", "Awareness 12, Bows 13", "—", "AGL +D4", "13", "—", "Longbow, leather armor"], ["Bandit", "Bows 12, Evade 10, Swords 12", "—", "—", "12", "—", "Short sword, short bow"], ["Adventurer", "Awareness 10, Swords 12", "—", "STR +D4", "13", "—", "Broadsword, studded leather"], ["Scholar", "Languages 13, Myths 13", "—", "—", "7", "—", "A good book"], ["Bandit Chief", "Awareness 12, Brawling 15", "Berserker, Robust x6", "STR +D6", "30", "16", "Heavy warhammer, chainmail"], ["Knight Champion", "Brawling 14, Swords 16", "Defensive, Double Slash", "STR +D6", "28", "26", "Longsword, plate, horse"], ["Archmage", "Magic 15, Staves 13", "Master Spellcaster", "—", "22", "30", "Staff, grimoire"], ] },
      { title: "NPCs and Skills", type: 'text', content: "NPCs use skills like PCs, but the GM only rolls for actions that directly affect a player. For other actions, the GM decides the outcome. For an unlisted skill, an NPC's default skill level is 5." },
      { title: "Attributes for NPCs", type: 'text', content: "STR & AGL: Use damage bonus (+D6 ≈ 17, +D4 ≈ 14, none ≈ 10). WIL: Use max WP if listed, otherwise 10. INT & CHA: Roll against 10." },
    ]
  },
  rolling: {
    title: "Rolling", icon: Dices, sections: [
      { title: "Rolling a Dragon", type: 'list', items: ["You impress everyone around you.", "You achieve more than intended.", "The action is performed faster than usual."] },
      { title: "Dragon: Melee Combat", type: 'list', items: ["Roll double the dice for weapon damage.", "Immediately perform a second, free attack against another enemy.", "Armor has no effect (piercing damage only, optional rule)."] },
      { title: "Dragon: Ranged Combat", type: 'list', items: ["Weapon's damage is doubled (roll twice as many dice).", "Armor has no effect (piercing damage only, optional rule)."] },
      { title: "Rolling a Demon", type: 'list', items: ["The roll cannot be pushed.", "You damage yourself, someone else, or an item.", "You make a fool of yourself.", "You make a lot of noise."] },
      { title: "Demon: Melee Combat (d6)", type: 'table', headers: ["D6", "Effect"], rows: [ ["1", "Drop your weapon."], ["2", "Expose yourself; enemy gets a free attack."], ["3", "Weapon gets stuck (STR roll to free)."], ["4", "Accidentally toss your weapon D3+3 meters."], ["5", "Damage your weapon (bane on use until repaired)."], ["6", "You hit yourself (roll damage as usual, no bonus)."] ] },
      { title: "Demon: Ranged Combat (d6)", type: 'table', headers: ["D6", "Effect"], rows: [ ["1", "Drop your weapon."], ["2", "Run out of arrows (re-roll for slings/throwing)."], ["3", "You hit a valuable item nearby."], ["4", "You break your weapon (bane on use until repaired)."], ["5", "Accidentally hit a random friendly target."], ["6", "You hit yourself (roll damage as usual, no bonus)."] ] }
    ]
  },
  actions: {
    title: "Actions", icon: BookOpen, sections: [
      { title: "Common Actions", type: 'definitions', items: { "Dash": "Doubles your movement rate for the round.", "Melee/Ranged Attack": "Attack an enemy within range.", "Parry/Dodge": "A reaction to avoid an attack, replaces your next action.", "Pick Up Item": "Pick up an item within 2 meters.", "Equip/Unequip Armor": "Don or doff armor/helmets.", "First Aid": "HEALING skill to save a dying character.", "Rally": "PERSUADE an ally at 0 HP to keep fighting.", "Cast Spell": "Counts as an action, including tricks." } },
      { title: "Free Actions", type: 'definitions', items: { "Draw Weapon": "Draw, exchange, or sheathe a weapon.", "Change Position": "Drop prone or stand up.", "Drop Item": "Drop a held item.", "Shout": "Say a few words." } },
      { title: "Special Attacks", type: 'definitions', items: { "Find Weak Spot": "Take a bane on your attack to ignore enemy armor.", "Topple": "Opposed roll (weapon skill vs EVADE) to knock an enemy prone.", "Disarm": "Opposed roll (weapon skill vs enemy's) to make them drop their weapon.", "Grapple": "Opposed BRAWLING roll to trap an enemy.", "Shove": "Push an enemy 2m if your STR bonus is higher." } },
    ]
  },
  damage: {
    title: "Damage & Health", icon: Heart, sections: [
       { title: "Fear Table (d8)", type: 'table', headers: ["D8", "Effect"], rows: [ ["1", "Enfeebled. Lose 2D6 WP (min 0), become Disheartened."], ["2", "Shaken. You suffer the Scared condition."], ["3", "Panting. Become Exhausted."], ["4", "Pale. You and allies within 10m become Scared."], ["5", "Scream. Allies hearing this suffer fear attack."], ["6", "Rage. Must attack source. Become Angry."], ["7", "Paralyzed. No move/act. Roll WIL to break."], ["8", "Wild Panic. Dash away. Roll WIL to stop."] ] },
      { title: "Severe Injuries", type: 'table', headers: ["D20", "Injury", "Effect"], rows: [ ["1-2", "Broken nose", "Bane on AWARENESS. Heal: D6 days."], ["3-4", "Scarred face", "Bane on PERFORMANCE/PERSUASION. Heal: 2D6 days."], ["5-6", "Teeth lost", "PERFORMANCE/PERSUASION reduced by 2."], ["7-8", "Broken ribs", "Bane on STR/AGL skills. Heal: D6 days."], ["9-10", "Concussion", "Bane on INT skills. Heal: D6 days."], ["11-12", "Deep wounds", "Bane on STR/AGL skills, roll causes D6 dmg. Heal: 2D6 days."], ["13", "Broken leg", "Movement halved. Heal: 3D6 days."], ["14", "Broken arm", "No 2H weapons/dual wield, bane on climbing. Heal: 3D6 days."], ["15", "Severed toe", "Movement reduced by 2."], ["16", "Severed finger", "Weapon skills reduced by 1."], ["17", "Gouged eye", "SPOT HIDDEN reduced by 2."], ["18", "Nightmares", "Roll vs Fear to sleep. Heal: 2D6 days."], ["19", "Changed personality", "New Random Weakness."], ["20", "Amnesia", "Forget identity. Heal: D6 days."] ] },
      { title: "Damage Types", type: 'definitions', items: { "Leather": "+2 AR vs Bludgeoning.", "Chainmail": "+2 AR vs Slashing." } },
      { title: "Resting", type: 'definitions', items: { "Round Rest": "10 sec. Recover D6 WP.", "Stretch Rest": "15 min. Heal D6 HP, D6 WP, 1 condition.", "Shift Rest": "6 hours. Full recovery." } }
    ]
  },
  journeys: {
    title: "Journeys", icon: Map, sections: [
        { title: "Wilderness Travel", type: 'definitions', items: { "Pathfinder": "One character must lead in pathless terrain.", "Hunger": "Must eat daily or become famished (cannot heal).", "Bushcraft Roll": "Pathfinder rolls BUSHCRAFT each shift. Failure causes a mishap.", "Dragon Roll": "Pathfinder finds a shortcut, doubling distance covered." } },
        { title: "Leaving Site (d6)", type: 'table', headers: ["D6", "Consequence"], rows: [ ["1", "Enemies follow."], ["2", "Enemies reinforce (x2)."], ["3", "Site looted."], ["4-6", "Nothing happens."] ] },
    ]
  },
  mishaps: {
    title: "Mishaps", icon: AlertCircle, sections: [
      { title: "Wilderness Mishaps (d12)", type: 'table', headers: ["D12", "Mishap"], rows: [ ["1", "Fog. Distance halved."], ["2", "Blocking Terrain. ACROBATICS to proceed."], ["3", "Torn Clothes."], ["4", "Lost. No progress."], ["5", "Dropped Item."], ["6", "Mosquitoes. Become Angry."], ["7", "Sprained Ankle. D6 dmg."], ["8", "Downpour. Roll vs Cold."], ["9", "Wasps. EVADE or D6 dmg + Cond."], ["10", "Landslide. EVADE or D10 dmg."], ["11", "Savage Animal."], ["12", "Quicksand. BUSHCRAFT or stuck."] ] }
    ]
  },
};

type TabKey = keyof typeof gmScreenData;

// --- HELPER: TEXT WITH CLICKABLE DICE ---
const TextWithDice = ({ text }: { text: string }) => {
  const { toggleDiceRoller } = useDice();
  if (!text) return null;

  // Regex to find dice (e.g. 1D6, D4, d12, D6+1)
  const diceRegex = /(\b\d*[dD](?:4|6|8|10|12|20|66|100)(?:\s*[+\-]\s*\d+)?\b)/g;
  
  const parts = text.split(diceRegex);

  return (
    <span>
      {parts.map((part, index) => {
        if (part.match(diceRegex)) {
          const cleanFormula = part.toLowerCase().replace(/\s/g, '');
          return (
            <button
              key={index}
              onClick={() => toggleDiceRoller?.({ dice: cleanFormula, label: `GM Screen: ${part}` })}
              className="inline-flex items-center justify-center font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors cursor-pointer"
              title={`Roll ${part}`}
            >
              <Dices size={10} className="mr-1" />
              {part}
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

// --- SUB-COMPONENTS ---
const SectionCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden break-inside-avoid hover:shadow-md transition-shadow">
    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
      <h3 className="font-bold text-gray-800 text-base">{title}</h3>
    </div>
    <div className="p-4 space-y-4">{children}</div>
  </div>
);

const SimpleTable = ({ headers, rows }: { headers: string[], rows: string[][] }) => (
  <div className="overflow-x-auto rounded-lg border border-gray-200">
    <table className="w-full text-sm text-left">
      <thead className="bg-gray-100 text-gray-700 uppercase text-xs font-bold">
        <tr>{headers.map(h => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, i) => (
          <tr key={i} className="even:bg-gray-50 hover:bg-blue-50 transition-colors">
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 text-gray-700">
                <TextWithDice text={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DefinitionList = ({ items }: { items: Record<string, string> }) => (
  <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
    {Object.entries(items).map(([term, def]) => (
      <div key={term} className="bg-gray-50 p-2 rounded border border-gray-100">
        <dt className="font-bold text-gray-900 text-xs uppercase tracking-wide mb-1">{term}</dt>
        <dd className="text-sm text-gray-700 leading-relaxed">
          <TextWithDice text={def} />
        </dd>
      </div>
    ))}
  </dl>
);

const StyledList = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
        <span className="mt-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
        <span><TextWithDice text={item} /></span>
      </li>
    ))}
  </ul>
);

// --- MAIN COMPONENT ---
export function GMScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('npcs');
  
  // Safety check: if state holds a deleted tab (like 'storyHelper'), default to 'npcs'
  const safeActiveTab = gmScreenData[activeTab] ? activeTab : 'npcs';
  
  const tabs = Object.keys(gmScreenData).map(key => ({
    id: key as TabKey,
    label: gmScreenData[key as TabKey].title,
    icon: gmScreenData[key as TabKey].icon,
  }));

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6 font-sans">
      
      {/* Header / Nav */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 mb-6 sticky top-2 z-20 overflow-x-auto no-scrollbar">
        <nav className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all
                ${safeActiveTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="animate-in fade-in duration-300">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
          {gmScreenData[safeActiveTab].sections.map((section, idx) => (
            <SectionCard key={idx} title={section.title}>
              {section.type === 'table' && <SimpleTable headers={section.headers!} rows={section.rows!} />}
              {section.type === 'text' && (
                <p className="text-sm text-gray-700 leading-relaxed">
                  <TextWithDice text={section.content!} />
                </p>
              )}
              {section.type === 'list' && <StyledList items={section.items as string[]} />}
              {section.type === 'definitions' && <DefinitionList items={section.items as Record<string, string>} />}
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  );
}
