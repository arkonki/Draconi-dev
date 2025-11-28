import React, { useState } from 'react';
import { BookOpen, Swords, Heart, Map, X } from 'lucide-react';

// --- DATA STRUCTURE (Unchanged) ---
const aidData = {
  actions: {
    title: "Actions",
    icon: BookOpen,
    sections: [
      {
        title: "Common Actions",
        items: [
          { title: 'Dash', description: 'Doubles your movement rate for the round.' },
          { title: 'Pick Up Item', description: 'Pick up an item within 2 meters or from your inventory.' },
          { title: 'Equip/Unequip', description: 'Change your equipped armor, helmet, or weapons.' },
          { title: 'Break Down Door', description: 'Use your action to damage a door or obstacle.' },
          { title: 'Pick Lock', description: 'Requires a SLEIGHT OF HAND roll (bane without lockpicks).' },
          { title: 'Use Item', description: 'Use a potion or other consumable item.' },
          { title: 'Activate Ability', description: 'Use one of your innate or heroic abilities.' },
          { title: 'Cast Spell', description: 'Casting a spell typically counts as your action.' },
          { title: 'Helping', description: 'Grant another character a boon on a roll by helping them.' },
        ]
      },
      {
        title: "Free Actions",
        items: [
          { title: 'Draw Weapon', description: 'Draw, exchange, or put away a weapon kept at hand.' },
          { title: 'Change Position', description: 'Drop prone or stand up from being prone.' },
          { title: 'Drop Item', description: 'Drop an item you are holding onto the ground.' },
          { title: 'Shout', description: 'Say or shout a few words.' },
        ]
      }
    ]
  },
  combat: {
    title: "Combat",
    icon: Swords,
    sections: [
      {
        title: "Attack Actions",
        items: [
          { title: 'Melee Attack', description: 'Attack an enemy within 2 meters (4m for long weapons).' },
          { title: 'Ranged Attack', description: 'Use a ranged weapon against targets within its range.' },
          { title: 'Parry', description: 'Reaction to negate attack. Replaces next action. Shield needed for ranged.' },
          { title: 'Dodge', description: 'Reaction to avoid attack. Replaces next action.' },
          { title: 'Durability', description: 'If damage exceeds weapon durability on a parry, the weapon is damaged.' },
        ]
      },
      {
        title: "Special Attacks",
        items: [
          { title: 'Find Weak Spot', description: 'Take a bane. If hit, enemy is treated as unarmored.' },
          { title: 'Topple', description: 'Opposed roll (Weapon vs EVADE) to knock enemy prone.' },
          { title: 'Disarm', description: 'Opposed roll (Weapon vs Enemy) to make them drop weapon.' },
          { title: 'Grapple', description: 'Opposed BRAWLING. Both fall to ground.' },
          { title: 'Shove', description: 'If STR bonus is higher, push enemy 2m on hit.' },
        ]
      },
      {
        title: "Sneak Attack",
        items: [
            { title: 'Sneak Attack', description: 'Roll Sneaking (bane if close). Success = Surprise (Pick Init, Boon, No Parry/Dodge). Subtle weapon = +1 die.' },
            { title: 'Ambush', description: 'Sneak attack from hiding. Victims roll Awareness (bane if prepared). Failure = Draw init from bottom.' },
        ]
      },
      {
        title: "Damage Types",
        items: [
            { title: 'Leather/Studded', description: '+2 AR vs Bludgeoning.' },
            { title: 'Chainmail', description: '+2 AR vs Slashing.' },
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
                { title: 'First Aid', description: 'HEALING skill to save dying char.' },
                { title: 'Rally', description: 'PERSUASION to get ally at 0 HP fighting again.' },
                { title: 'Round Rest', description: '(10s) Recover D6 WP.' },
                { title: 'Stretch Rest', description: '(15m) Heal D6 HP/WP + 1 Condition.' },
                { title: 'Shift Rest', description: '(6h) Full recovery.' },
            ]
        },
        {
            title: "Severe Injuries",
            description: "Reduced to 0 HP? Roll for injury. Healing time halved with medical care.",
            items: [
                { title: 'Broken Nose', description: 'Bane on AWARENESS.' },
                { title: 'Scarred Face', description: 'Bane on PERFORMANCE/PERSUASION.' },
                { title: 'Broken Ribs', description: 'Bane on STR/AGL skills.' },
                { title: 'Deep Wounds', description: 'Bane on STR/AGL skills. Rolls deal D6 dmg.' },
                { title: 'Broken Leg', description: 'Movement halved.' },
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
                { title: 'Pathfinder', description: 'One char leads in pathless terrain.' },
                { title: 'Hunger', description: 'Must eat daily or cannot heal.' },
                { title: 'Bushcraft', description: 'Pathfinder rolls per shift. Failure = Mishap.' },
                { title: 'Dragon Roll', description: 'Find shortcut (x2 dist).' },
                { title: 'Difficult Terrain', description: 'Swamp/Jungle = Bane on Bushcraft.' },
            ]
        },
        {
            title: "Mishaps",
            items: [
                { title: 'Fog', description: 'Distance halved.' },
                { title: 'Lost', description: 'No progress. Re-roll.' },
                { title: 'Sprained Ankle', description: 'Random char takes D6 dmg.' },
                { title: 'Savage Animal', description: 'Attack encounter.' },
                { title: 'Quicksand', description: 'BUSHCRAFT or stuck.' },
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
  const [activeTab, setActiveTab] = useState<TabKey>('actions');
  const TabIcon = aidData[activeTab].icon;

  const renderContent = () => {
    const tabContent = aidData[activeTab];
    return (
      <div className="space-y-6">
        {tabContent.sections.map(section => (
          <div key={section.title}>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
              {section.title}
            </h4>
            
            {section.description && (
              <div className="mb-2 p-2 bg-yellow-50 border border-yellow-100 rounded text-xs text-yellow-800 italic">
                {section.description}
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200" onClick={e => e.stopPropagation()}>
        
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
                  flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold transition-all rounded-t-md border-t border-x border-transparent -mb-px relative
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
