import React, { useState } from 'react';
import {
  Shield, Swords, Heart, Map as MapIcon, AlertCircle,
  Dices, Award, Gavel, Sparkles, Coins, ChevronDown
} from 'lucide-react';
import { BarteringCalculator } from './BarteringCalculator';

// --- TYPES ---
type SectionType = 'table' | 'text' | 'list' | 'definitions' | 'component';

interface Section {
  title: string;
  type: SectionType;
  content?: string;
  headers?: string[];
  rows?: string[][];
  items?: string[] | Record<string, string>;
  component?: React.ReactNode;
}

interface ScreenTab {
  id: string;
  title: string;
  icon: any;
  sections: Section[];
}

// --- DATA: DRAGONBANE RULES ---
const gmScreenData: Record<string, ScreenTab> = {
  core: {
    id: 'core',
    title: "Core & Skills",
    icon: Dices,
    sections: [
      {
        title: "Opposed Rolls (Page 33)",
        type: 'text',
        content: "Both parties roll. If both succeed, the one with the LOWER result wins. If tied, the active party (attacker) wins."
      },
      {
        title: "Pushing the Roll",
        type: 'definitions',
        items: {
          "Condition": "Cannot push if you already have the attribute's condition.",
          "Demon Roll": "Natural 20. Cannot be pushed. Mishap occurs.",
          "Effect": "Take 1 Condition to re-roll. (STR=Exhausted, CON=Sickly, AGL=Dazed, INT=Angry, WIL=Scared, CHA=Disheartened)"
        }
      },
      {
        title: "Movement Rates (Page 27)",
        type: 'table',
        headers: ["Kin", "Move", "Effect"],
        rows: [
          ["Human / Elf", "10", "-"],
          ["Halfling / Dwarf / Mallard", "8", "-"],
          ["Wolfkin", "12", "-"],
          ["Swimming", "Half", "Rounded up. Ranged attacks impossible."],
          ["Climbing", "Half", "Rounded up. Requires ACROBATICS."]
        ]
      },
      {
        title: "Resting (Page 52)",
        type: 'table',
        headers: ["Type", "Time", "Effect"],
        rows: [
          ["Round Rest", "1 Round", "Recover D6 WP. Once per shift."],
          ["Stretch Rest", "15 Min", "Heal D6 HP (or 2D6 w/ Healing). Recover D6 WP. Heal 1 Condition. Once per shift."],
          ["Shift Rest", "6 Hours", "Recover all HP, WP, and all Conditions. Must be in safe location."]
        ]
      }
    ]
  },
  combat: {
    id: 'combat',
    title: "Combat",
    icon: Swords,
    sections: [
      {
        title: "Situational Modifiers",
        type: 'definitions',
        items: {
          "Prone Target": "Attacker gets Boon. Melee deals +D6 damage.",
          "Sneak Attack": "Boon to hit. Enemy cannot Dodge/Parry. Weapon dmg +1 die (e.g. 2D8).",
          "Darkness": "Range attacks impossible. Melee requires AWARENESS roll (not an action) to hit.",
          "Obscured": "Bane on Ranged Attack.",
          "Long Range": "Bane on Ranged Attack (up to 2x listed range)."
        }
      },
      {
        title: "Actions (1 per round)",
        type: 'definitions',
        items: {
          "Dash": "Double movement.",
          "Melee Attack": "Standard attack within 2m.",
          "Ranged Attack": "Attack within range (Bane if enemy within 2m).",
          "Parry": "Reaction. Reduces damage by Weapon Durability (or shield).",
          "Dodge": "Reaction. Evade attack completely. Move 2m.",
          "Pick Up": "Get item from ground/bag.",
          "First Aid": "HEALING roll to save dying person.",
          "Rally": "PERSUADE person at 0 HP to act."
        }
      },
      {
        title: "Critical Hits (Dragon Roll)",
        type: 'list',
        items: [
          "Double Damage: Roll dice twice (excluding bonus).",
          "Second Attack: Free extra attack against another target.",
          "Pierce Armor: Armor has no effect (Piercing attacks only)."
        ]
      }
    ]
  },
  magic: {
    id: 'magic',
    title: "Magic",
    icon: Sparkles,
    sections: [
      {
        title: "Rules of Magic",
        type: 'list',
        items: [
          "Metal: Cannot cast spells while wearing metal armor or holding metal weapons.",
          "Cost: Spells cost 2 WP per Power Level. Tricks cost 1 WP.",
          "Power from Body: If 0 WP, roll random die (e.g. D6). Take that much damage to gain that much WP for one spell."
        ]
      },
      {
        title: "Magical Mishaps (D20)",
        type: 'table',
        headers: ["D20", "Effect"],
        rows: [
          ["1-6", "Condition (1:Dazed, 2:Exhausted, 3:Sickly, 4:Angry, 5:Scared, 6:Disheartened)."],
          ["7", "Magic ravages body: Take D6 damage per Power Level."],
          ["8", "Drain: Lose D6 WP per Power Level."],
          ["9", "Magical Disease (Virulence 3D6)."],
          ["10", "Another random spell activates."],
          ["11", "Vomit a frog when lying. Lasts until 1 rolled on D4 daily."],
          ["12", "Gold/Silver touched withers to dust. Lasts until 1 rolled on D4 daily."],
          ["13", "Blinded (Total Darkness). Lasts until 1 rolled on D4 daily."],
          ["14", "Amnesia (Forget party). Lasts until 1 rolled on D4 daily."],
          ["15", "Spell affects friend or unintended victim."],
          ["16", "Backfire: Offensive hits you, Healing damages you."],
          ["17", "Turn into animal (D6: 1 Cat, 2 Fox, 3 Goat, 4 Wolf, 5 Deer, 6 Bear)."],
          ["18", "Become 1 age category younger (Attributes change)."],
          ["19", "Become 1 age category older (Attributes change)."],
          ["20", "Attract a Demon! Appears within next shift."]
        ]
      },
    ]
  },
  damage: {
    id: 'damage',
    title: "Health & Injuries",
    icon: Heart,
    sections: [
      {
        title: "Death & Dying (Page 50)",
        type: 'list',
        items: [
          "0 HP: Drop prone. Cannot act (except Rally).",
          "Death Roll: Roll vs CON each round. 3 Successes = Live (D6 HP). 3 Failures = Die.",
          "Dragon Roll: Counts as 2 Successes.",
          "Demon Roll: Counts as 2 Failures.",
          "Instant Death: Negative HP > Max HP kills instantly."
        ]
      },
      {
        title: "Severe Injuries (Page 53)",
        type: 'table',
        headers: ["D20", "Injury", "Effect"],
        rows: [
          ["1-2", "Broken nose", "Bane on AWARENESS. Heal: D6 days."],
          ["3-4", "Scarred face", "Bane on PERFORMANCE/PERSUASION. Heal: 2D6 days."],
          ["5-6", "Teeth knocked out", "PERFORMANCE/PERSUASION reduced by 2."],
          ["7-8", "Broken ribs", "Bane on STR/AGL skills. Heal: D6 days."],
          ["9-10", "Concussion", "Bane on INT skills. Heal: D6 days."],
          ["11-12", "Deep wounds", "Bane on STR/AGL skills, roll causes D6 dmg. Heal: 2D6 days."],
          ["13", "Broken leg", "Movement halved. Heal: 3D6 days."],
          ["14", "Broken arm", "No 2H weapons/dual wield, bane on climbing. Heal: 3D6 days."],
          ["15", "Severed toe", "Movement reduced by 2."],
          ["16", "Severed finger", "Weapon skills reduced by 1 (min 3)."],
          ["17", "Gouged eye", "SPOT HIDDEN reduced by 2 (min 3)."],
          ["18", "Nightmares", "Roll vs Fear to sleep. Heal: 2D6 days."],
          ["19", "Changed personality", "New Random Weakness."],
          ["20", "Amnesia", "Forget identity. Heal: D6 days."]
        ]
      }
    ]
  },
  mishaps: {
    id: 'mishaps',
    title: "Mishaps",
    icon: AlertCircle,
    sections: [
      {
        title: "Melee Demon Roll (D6)",
        type: 'table',
        headers: ["D6", "Effect (Page 48)"],
        rows: [
          ["1", "Drop weapon. Action to pick up."],
          ["2", "Expose yourself. Enemy gets Free Attack."],
          ["3", "Weapon stuck. STR roll to free (Action)."],
          ["4", "Toss weapon D3+3 meters."],
          ["5", "Weapon damaged. Bane until repaired."],
          ["6", "Hit yourself. Normal damage (no bonus)."]
        ]
      },
      {
        title: "Ranged Demon Roll (D6)",
        type: 'table',
        headers: ["D6", "Effect (Page 51)"],
        rows: [
          ["1", "Drop weapon. Action to pick up."],
          ["2", "Out of ammo. Must reload/gather."],
          ["3", "Hit valuable item nearby."],
          ["4", "Weapon damaged. Bane until repaired."],
          ["5", "Hit friendly target (normal damage)."],
          ["6", "Hit yourself (normal damage)."]
        ]
      },
      {
        title: "Fear Table (D8)",
        type: 'table',
        headers: ["D8", "Effect (Page 53)"],
        rows: [
          ["1", "Enfeebled. Lose 2D6 WP. Disheartened."],
          ["2", "Shaken. Scared condition."],
          ["3", "Panting. Exhausted condition."],
          ["4", "Pale. You and allies w/in 10m Scared."],
          ["5", "Scream. Allies hearing suffer Fear attack."],
          ["6", "Rage. Attack source. Angry condition."],
          ["7", "Paralyzed. No action/move. WIL to break."],
          ["8", "Wild Panic. Flee. WIL to stop."]
        ]
      }
    ]
  },
  gear: {
    id: 'gear',
    title: "Gear & NPCs",
    icon: Shield,
    sections: [
      {
        title: "Weapons & Armor",
        type: 'definitions',
        items: {
          "Durability": "Damage exceeding this breaks the weapon/shield.",
          "Subtle": "Boon & +damage on Sneak Attack.",
          "Piercing": "Ignores armor on Critical Hit.",
          "Toppling": "Boon to Topple actions."
        }
      },
      {
        title: "Typical NPCs (Page 105)",
        type: 'table',
        headers: ["Type", "Skills", "Stats", "Gear"],
        rows: [
          ["Guard", "Awareness 10, Swords 12", "HP 12, STR+D4", "Broadsword, Studded Leather"],
          ["Cultist", "Evade 14, Knives 14", "HP 12, AGL+D4", "Dagger"],
          ["Thief", "Evade 12, Knives 12", "HP 10, AGL+D4", "Knife"],
          ["Hunter", "Awareness 12, Bows 13", "HP 13, AGL+D4", "Longbow, Leather"],
          ["Bandit Chief", "Brawling 15, Hammers 15", "HP 30, WP 16, STR+D6", "Warhammer, Chainmail, Abilities"],
          ["Knight", "Brawling 14, Swords 16", "HP 28, WP 26, STR+D6", "Longsword, Plate, Shield"],
          ["Monster", "Attacks automatically", "Ferocity = Actions/round", "Cannot Parry/Push"]
        ]
      }
    ]
  },
  travel: {
    id: 'travel',
    title: "Travel",
    icon: MapIcon,
    sections: [
      {
        title: "The Journey",
        type: 'definitions',
        items: {
          "Shift": "A day has 4 shifts (Morning, Day, Evening, Night).",
          "Hike": "15km per shift (foot). 30km (horse). Max 2 shifts/day.",
          "Forced March": "Travel 3rd shift = Exhausted.",
          "Pathfinder": "Rolls BUSHCRAFT each shift in wild.",
          "Making Camp": "BUSHCRAFT roll. Fail = No sleep (Sleep Deprivation)."
        }
      },
      {
        title: "Travel Mishaps (D12)",
        type: 'table',
        headers: ["D12", "Event (Page 102)"],
        rows: [
          ["1", "Fog. Distance halved."],
          ["2", "Blocking Terrain. ACROBATICS check."],
          ["3", "Torn Clothes. Rags."],
          ["4", "Lost. No progress. BUSHCRAFT to find way."],
          ["5", "Dropped Item."],
          ["6", "Mosquitoes. Angry condition."],
          ["7", "Sprained Ankle. D6 damage."],
          ["8", "Downpour. Roll vs Cold."],
          ["9", "Wasps. D6 damage + Condition."],
          ["10", "Landslide. EVADE or D10 damage."],
          ["11", "Savage Animal (Wolf/Bear)."],
          ["12", "Quicksand. Stuck. BUSHCRAFT to escape."]
        ]
      }
    ]
  },
  bartering: {
    id: 'bartering',
    title: "Bartering",
    icon: Coins,
    sections: [
      {
        title: "Trade Rules",
        type: 'text',
        content: "When haggling over the price of something you are buying or selling, roll for BARTERING. If you succeed, the price goes down or up by 20%. If you roll a dragon, the price is halved or doubled. If you roll a demon, you have offended the other party so badly that they refuse the trade."
      },
      {
        title: "Price Calculator",
        type: 'component',
        component: <BarteringCalculator />
      }
    ]
  },
  session: {
    id: 'session',
    title: "Session End",
    icon: Award,
    sections: [
      {
        title: "Advancement Marks",
        type: 'list',
        items: [
          "Did you participate in the session?",
          "Did you explore a new location?",
          "Did you defeat a dangerous adversary?",
          "Did you overcome an obstacle without force?",
          "Did you give in to your Weakness?"
        ]
      },
      {
        title: "Advancement Rolls",
        type: 'text',
        content: "Roll D20 for each mark. If result > current Skill Level, increase skill by 1 (Max 18)."
      },
      {
        title: "Weaknesses",
        type: 'definitions',
        items: {
          "Give In": "Gain 1 Advancement Mark immediately.",
          "Overcome": "If you act against your weakness, gain 2 Marks. You may remove the weakness. Play one session without a weakness before choosing a new one."
        }
      }
    ]
  }
};

import { TextWithDice } from '../shared/TextWithDice';

// --- SUB-COMPONENTS ---

const SectionCard = ({ section }: { section: Section }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden break-inside-avoid hover:shadow-md transition-shadow h-full flex flex-col">
    {/* Section Title with Interactive Dice */}
    <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
      <h3 className="text-gray-800 text-sm uppercase tracking-wide font-bold">
        <TextWithDice text={section.title} />
      </h3>
    </div>

    <div className="p-4 space-y-4 flex-1">
      {/* TEXT CONTENT */}
      {section.type === 'text' && (
        <p className="text-sm text-gray-600 leading-relaxed"><TextWithDice text={section.content || ''} /></p>
      )}

      {/* LIST ITEMS */}
      {section.type === 'list' && Array.isArray(section.items) && (
        <ul className="space-y-2">
          {section.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0" />
              <span className="leading-snug"><TextWithDice text={item} /></span>
            </li>
          ))}
        </ul>
      )}

      {/* DEFINITIONS (Dictionary style) */}
      {section.type === 'definitions' && !Array.isArray(section.items) && (
        <dl className="grid grid-cols-1 gap-3">
          {Object.entries(section.items || {}).map(([term, def]) => (
            <div key={term} className="text-sm">
              <dt className="font-bold text-gray-900 inline mr-1">{term}:</dt>
              <dd className="text-gray-600 inline"><TextWithDice text={def} /></dd>
            </div>
          ))}
        </dl>
      )}

      {/* TABLE CONTENT */}
      {section.type === 'table' && section.headers && section.rows && (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm text-left border-t border-gray-100">
            <thead className="bg-gray-50 text-gray-500 text-xs font-semibold">
              <tr>
                {section.headers.map(h => (
                  <th key={h} className="px-4 py-2 first:pl-4">
                    <TextWithDice text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {section.rows.map((row, i) => (
                <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2 text-gray-700 align-top">
                      {j === 0 ? <TextWithDice text={cell} bold /> : <TextWithDice text={cell} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* COMPONENT CONTENT */}
      {section.type === 'component' && section.component && (
        <div className="mt-2">
          {section.component}
        </div>
      )}
    </div>
  </div>
);

// --- MAIN COMPONENT ---

export function GMScreen() {
  const [activeTabId, setActiveTabId] = useState<string>('core');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const activeTab = gmScreenData[activeTabId];
  const tabs = Object.values(gmScreenData);

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-64px)] flex flex-col font-sans text-gray-800">

      {/* Navigation Bar - Dropdown Style */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm px-4 py-3">
        <div className="max-w-7xl mx-auto relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-full md:w-auto md:min-w-[300px] flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
          >
            <div className="flex items-center gap-2">
              <activeTab.icon size={20} className="text-indigo-600" />
              <span className="font-bold text-gray-900">{activeTab.title}</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute top-full left-0 right-0 md:w-[300px] mt-2 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                <div className="py-1">
                  {tabs.map(tab => {
                    const isActive = activeTabId === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTabId(tab.id);
                          setIsMenuOpen(false);
                        }}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b border-gray-50 last:border-0 ${isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                      >
                        <tab.icon size={18} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                        <span className="font-bold">{tab.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">

          {/* Header for current tab (Mobile mainly) */}
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <activeTab.icon size={24} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{activeTab.title}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-min">
            {activeTab.sections.map((section, idx) => (
              <SectionCard key={idx} section={section} />
            ))}
          </div>

          {/* Session End Special Footer */}
          {activeTabId === 'session' && (
            <div className="mt-8 p-6 bg-yellow-50 border border-yellow-100 rounded-xl text-center max-w-2xl mx-auto">
              <Gavel className="mx-auto text-yellow-600 mb-2 w-8 h-8 opacity-80" />
              <h3 className="text-lg font-bold text-yellow-900 mb-2">Game Master's Authority</h3>
              <p className="text-sm text-yellow-800 leading-relaxed">
                "It is the GM’s job to put obstacles in your path... But it is not up to the GM to decide everything that happens... It is what you are playing to find out."
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
