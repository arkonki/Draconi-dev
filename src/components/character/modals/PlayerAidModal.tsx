import React, { useState } from 'react';
import { BookOpen, Swords, Heart, Map, X } from 'lucide-react';

// --- (Data structure is unchanged) ---
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
          { title: 'Parry', description: 'A reaction to negate a melee or ranged attack (requires a shield for ranged). Replaces your next action.' },
          { title: 'Dodge', description: 'A reaction to avoid a melee or ranged attack. Replaces your next action.' },
        ]
      },
      {
        title: "Special Attacks",
        items: [
          { title: 'Find Weak Spot', description: 'Take a bane on your attack. If you hit, the enemy is treated as unarmored.' },
          { title: 'Topple', description: 'Opposed roll (your weapon skill vs enemy EVADE) to knock an enemy prone.' },
          { title: 'Disarm', description: 'Opposed roll (your weapon skill vs enemy\'s) to make them drop their weapon.' },
          { title: 'Grapple', description: 'Opposed BRAWLING roll to trap an enemy. Both you and the enemy fall to the ground.' },
          { title: 'Shove', description: 'If your STR bonus is higher than the enemy\'s, you can push them 2 meters on a successful hit.' },
        ]
      },
      {
        title: "Sneak Attack & Ambush",
        items: [
            { title: 'Sneak Attack', description: 'If you approach undetected, roll Sneaking (with a bane if moving within 2 meters). On failure, you’re noticed and initiative is drawn. On success, the attack is surprising: you pick initiative, gain a boon on the attack, and the target cannot dodge or parry. With a Subtle weapon, damage increases by one die. Sneak attacks are always made by a single attacker against a single target.' },
            { title: 'Ambush', description: 'A sneak attack made from hiding. Each victim rolls Awareness (with a bane if attackers are well prepared). Those who fail draw initiative cards from the bottom of the deck (#10 and up) at random.' },
        ]
      },
      {
        title: "Damage Types & Armor",
        items: [
            { title: 'Leather/Studded', description: 'Gains a +2 bonus to its armor rating against Bludgeoning damage.' },
            { title: 'Chainmail', description: 'Gains a +2 bonus to its armor rating against Slashing damage.' },
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
                { title: 'First Aid', description: 'Use the HEALING skill to save a dying character at zero HP.' },
                { title: 'Rally', description: 'Use PERSUASION to get an ally at 0 HP back into the fight.' },
                { title: 'Round Rest', description: '(10 sec) Recover D6 WP. Once per shift.' },
                { title: 'Stretch Rest', description: '(15 min) Heal D6 HP (2D6 with a Healer), recover D6 WP, and heal one condition. Once per shift.' },
                { title: 'Shift Rest', description: '(6 hours) In a safe location, recover all HP & WP and heal all conditions.' },
            ]
        },
        {
            title: "Severe Injuries",
            description: "If you are reduced to zero HP but survive, you may suffer a severe injury. The healing time is halved with medical care (a successful HEALING roll each shift).",
            items: [
                { title: 'Broken Nose (D6 Days)', description: 'Bane on all AWARENESS rolls.' },
                { title: 'Scarred Face (2D6 Days)', description: 'Bane on all PERFORMANCE and PERSUASION rolls.' },
                { title: 'Broken Ribs (D6 Days)', description: 'Bane on all skills based on STR or AGL.' },
                { title: 'Deep Wounds (2D6 Days)', description: 'Bane on STR/AGL skills. Every roll against such a skill inflicts D6 damage.' },
                { title: 'Broken Leg (3D6 Days)', description: 'Your movement rate is halved.' },
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
                { title: 'Pathfinder', description: 'In pathless terrain, one character must be the pathfinder.' },
							  { title: 'Hunger', description: 'You must eat at least one ration of food per day. After one day without food you become famished and cannot heal HP, WP, or conditions except through magic.' },
                { title: 'Bushcraft Roll', description: 'The pathfinder must make a BUSHCRAFT roll every shift to find the way. Failure results in a mishap.' },
                { title: 'Rolling a Dragon', description: 'The pathfinder finds a shortcut, doubling the distance covered in the shift.' },
                { title: 'Difficult Terrain', description: 'If the terrain is difficult (swamp, dense jungle), the BUSHCRAFT roll gets a bane.' },
            ]
        },
        {
            title: "Mishaps (Examples)",
            items: [
                { title: 'Fog', description: 'Distance covered this shift is halved.' },
                { title: 'Lost', description: 'The party makes no progress this shift and must roll again to find the way.' },
                { title: 'Sprained Ankle', description: 'A random character suffers D6 damage.' },
                { title: 'Savage Animal', description: 'A wild animal feels threatened and attacks the party.' },
                { title: 'Quicksand', description: 'The ground collapses! Everyone must make a BUSHCRAFT roll to avoid sinking.' },
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
      <div className="space-y-8">
        {tabContent.sections.map(section => (
          <div key={section.title}>
            <h4 className="font-bold text-lg mb-3 text-gray-800 border-b pb-2">{section.title}</h4>
            {section.description && <p className="text-sm text-gray-600 mb-4 italic">{section.description}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {section.items.map((item, index) => (
                <div 
                  key={item.title} 
                  // --- THIS IS THE FIX ---
                  // It now checks if the ROW index is even, not the item index.
                  className={`p-3 rounded-md ${Math.floor(index / 2) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <p className="text-gray-700">
                    <span className="font-bold text-gray-900">{item.title}:</span> {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full flex flex-col max-h-[90vh] shadow-xl">
        <div className="sticky top-0 bg-white flex justify-between items-center px-6 pt-6 pb-4 border-b z-20">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <TabIcon className="w-6 h-6 text-indigo-600" /> Player Aid
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="sticky top-[73px] bg-white flex border-b z-10">
          {(Object.keys(aidData) as TabKey[]).map(key => {
            const Icon = aidData[key].icon;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 p-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{aidData[key].title}</span>
              </button>
            )
          })}
        </div>

        <div className="overflow-y-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
