import React, { useState } from 'react';
import { Swords, Heart, Map, X, Wand2, HelpCircle, Info } from 'lucide-react';

// --- DATA STRUCTURE ---
const aidData = {
  general: {
    title: "General",
    icon: HelpCircle,
    sections: [
      {
        title: "Pushing the Roll",
        description: "Re-roll ALL dice (even boons/banes). Must accept new result.",
        items: [
          { title: 'Cost', description: 'Take a Condition matching the attribute used.' },
          { title: 'Restrictions', description: 'Cannot push if you have all Conditions. Cannot push a Demon (20).' },
        ]
      },
      {
        title: "Conditions (Bane on...)",
        items: [
          { title: 'Exhausted (STR)', description: 'Bane on STR rolls & skills (Melee).' },
          { title: 'Sickly (CON)', description: 'Bane on CON rolls (Death saves).' },
          { title: 'Dazed (AGL)', description: 'Bane on AGL rolls (Dodge/Ranged).' },
          { title: 'Angry (INT)', description: 'Bane on INT rolls (Magic).' },
          { title: 'Scared (WIL)', description: 'Bane on WIL rolls (Fear/Magic).' },
          { title: 'Disheartened (CHA)', description: 'Bane on CHA rolls (Persuasion).' },
        ]
      },
      {
        title: "Encumbrance",
        items: [
          { title: 'Limit', description: 'Items = STR / 2 (rounded up).' },
          { title: 'Over-Encumbered', description: 'Must make STR roll to move.' },
          { title: 'Failure Effect', description: 'If STR roll fails: Drop gear OR Stay put.' },
        ]
      }
    ]
  },
  combat: {
    title: "Combat",
    icon: Swords,
    sections: [
      {
        title: "Reactions (Defenses)",
        description: "Reactions use your turn. Flip init card. Cannot use if already acted.",
        items: [
          { title: 'Parry', description: 'Roll skill. Fail = Hit. Dragon = Counterattack. Shields can parry Ranged. Shield parry use any STR-based melee skill (except KNIVES and STAVES). ' },
          { title: 'Dodge', description: 'Roll Evade. Success = No dmg & Move 2m. Works vs Monsters.' },
          { title: 'Durability', description: 'If damage > durability on a parry, weapon/shield is damaged and cannot be used until repaired with CRAFTING roll' },
        ]
      },
      {
        title: "Movement & Initiative",
        items: [
            { title: 'Free Attack', description: 'Moving out of 2m range triggers enemy attack. Roll EVADE to avoid.' },
            { title: 'Wait (Swap)', description: 'Swap init card with anyone acting AFTER you.' },
            { title: 'Stand/Crouch', description: 'Free action (only on your turn).' },
        ]
      },
      {
        title: "Special Attacks",
        items: [
          { title: 'Find Weak Spot', description: 'Piercing only. Take a bane. If hit, enemy armor is ignored.' },
          { title: 'Topple', description: 'Opposed roll (Weapon vs EVADE). Toppling weapon = Boon.' },
          { title: 'Disarm', description: 'Opposed roll. Bane if enemy holds weapon with 2 hands.' },
          { title: 'Grapple', description: 'Opposed BRAWLING. Both fall to ground.' },
          { title: 'Shove', description: 'If STR damage bonus >= enemy\'s, push enemy 2m on hit.' },
        ]
      },
      {
        title: "Modifiers",
        items: [
            { title: 'Sneak Attack', description: 'Success = Surprise (Pick Init, Boon, No Parry/Dodge).' },
            { title: 'Prone Target', description: 'Melee attacks vs Prone get Boon + D6 damage.' },
            { title: 'Long Weapon', description: 'Reach 4m. Can attack past friendly creatures.' },
        ]
      }
    ]
  },
  magic: {
    title: "Magic",
    icon: Wand2,
    sections: [
        {
            title: "Casting Rules",
            items: [
                { title: 'Cost', description: '2 WP per Power Level. Magic Tricks cost 1 WP.' },
                { title: 'Power from Body', description: 'If 0 or 1 WP left: Roll die (e.g. D6). Gain that WP but take equal Damage.' },
                { title: 'Metal', description: 'Cannot cast while wearing/holding metal armor/weapons.' },
                { title: 'Concentration', description: 'Broken if you take damage, fail Fear roll, or perform another action.' },
            ]
        },
        {
            title: "Results",
            items: [
                { title: 'Dragon (1)', description: 'Choose: Double Damage/Range, Free (0 WP), or Cast again immediately (w/ Bane).' },
                { title: 'Demon (20)', description: 'Mishap! Roll on Magical Mishap table.' },
            ]
        }
    ]
  },
  health: {
    title: "Health",
    icon: Heart,
    sections: [
        {
            title: "Healing & Resting",
            items: [
                { title: 'First Aid', description: 'HEALING skill to save dying char (Action). Stops death rolls.' },
                { title: 'Rally', description: 'PERSUASION to get ally at 0 HP fighting again (Action).' },
                { title: 'Round Rest', description: '(10s) Recover D6 WP. Once per shift.' },
                { title: 'Stretch Rest', description: '(15m) Heal D6 HP (2D6 w/ help), D6 WP, 1 Condition.' },
                { title: 'Shift Rest', description: '(6h) Full recovery of HP, WP, and Conditions.' },
            ]
        },
        {
            title: "Death (0 HP)",
            items: [
                { title: 'Death Rolls', description: 'Roll vs CON on turn. 3 Success = Stable. 3 Failures = Dead.' },
                { title: 'Crit/Fumble', description: 'Dragon (1) = 2 Successes. Demon (20) = 2 Failures.' },
                { title: 'Instant Death', description: 'If single attack reduces you to negative max HP.' },
                { title: 'Taking Damage', description: 'Counts as 1 failed Death Roll.' },
            ]
        },
        {
            title: "Severe Injuries (Roll D20)",
            description: "Roll CON. Fail = Injury. Healing time halved w/ medical care.",
            items: [
                { title: '1-2 Broken Nose', description: 'Bane on AWARENESS.' },
                { title: '5-6 Teeth Gone', description: 'PERFORMANCE/PERSUASION skill reduced by 2.' },
                { title: '7-8 Broken Ribs', description: 'Bane on STR/AGL skills.' },
                { title: '9-10 Concussion', description: 'Bane on INT skills.' },
                { title: '13 Broken Leg', description: 'Movement halved.' },
                { title: '14 Broken Arm', description: 'No 2H weapons or Dual Wield.' },
            ]
        }
    ]
  },
  journeys: {
    title: "Journeys",
    icon: Map,
    sections: [
        {
            title: "Wilderness Travel",
            items: [
                { title: 'Pathfinder', description: 'One char leads. Bushcraft roll/shift. Fail = Mishap.' },
                { title: 'Hunger', description: 'Must eat daily or cannot heal. 1 Dmg/day.' },
                { title: 'Dragon Roll', description: 'Find shortcut (x2 dist).' },
                { title: 'Foraging', description: 'Shift action. Bushcraft roll. Success = D3 rations.' },
                { title: 'Camp', description: 'Bushcraft roll. Fail = No sleep/rest benefits.' },
            ]
        },
        {
            title: "Mishaps",
            items: [
                { title: 'Fog', description: 'Distance halved.' },
                { title: 'Lost', description: 'No progress. Re-roll Bushcraft to find path.' },
                { title: 'Sprained Ankle', description: 'Random char takes D6 dmg. Armor no help.' },
                { title: 'Landslide', description: 'Evade roll or D10 damage.' },
            ]
        }
    ]
  }
};

interface PlayerAidModalProps {
  onClose: () => void;
}
type TabKey = keyof typeof aidData;

export function PlayerAidModal({ onClose }: PlayerAidModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const TabIcon = aidData[activeTab].icon;

  const renderContent = () => {
    const tabContent = aidData[activeTab];
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {tabContent.sections.map(section => (
          <div key={section.title}>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
              {section.title}
            </h4>
            
            {section.description && (
              <div className="mb-2 p-2 bg-yellow-50 border border-yellow-100 rounded text-xs text-yellow-800 italic flex gap-2 items-start">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{section.description}</span>
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {section.items.map((item) => (
                <div 
                  key={item.title} 
                  className="p-2 rounded border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <div className="font-bold text-indigo-700 text-xs mb-0.5">{item.title}</div>
                  <div className="text-[11px] text-gray-600 leading-tight">{item.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[90]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close player aid"
      />
      <div className="relative bg-white rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
        
        {/* Compact Header */}
        <div className="bg-white px-4 py-3 border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-100 rounded text-indigo-600">
              <TabIcon size={18} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Player Aid</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        {/* Compact Tabs */}
        <div className="bg-gray-50 border-b flex overflow-x-auto shrink-0 no-scrollbar px-2 pt-1">
          {(Object.keys(aidData) as TabKey[]).map(key => {
            const Icon = aidData[key].icon;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`
                  flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold transition-all rounded-t-md border-t border-x border-transparent -mb-px relative whitespace-nowrap
                  ${isActive 
                    ? 'bg-white text-indigo-600 border-gray-200 border-b-white z-10' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <Icon size={14} />
                <span>{aidData[key].title}</span>
              </button>
            )
          })}
        </div>

        {/* Dense Content Area */}
        <div className="flex-grow overflow-y-auto p-4 bg-gray-50/30 custom-scrollbar">
          {renderContent()}
        </div>

      </div>
    </div>
  );
}
