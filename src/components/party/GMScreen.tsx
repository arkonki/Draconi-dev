import React, { useState } from 'react';
import { Shield, Swords, Heart, Map, BookOpen, AlertCircle, Skull, Dices } from 'lucide-react';

// --- (The large gmScreenData object is correct and unchanged) ---
const gmScreenData = {
  npcs: {
    title: "NPCs", icon: Skull, sections: [
      { title: "Typical NPCs", type: 'table', headers: ["Type", "Skills", "Heroic Abilities", "Dmg Bonus", "HP", "WP", "Gear"], rows: [ ["Guard", "Awareness 10, Swords 12", "—", "STR +D4", "12", "—", "Broadsword, studded leather"], ["Cultist", "Evade 14, Knives 14", "—", "AGL +D4", "12", "—", "Dagger"], ["Thief", "Evade 12, Knives 12", "—", "AGL +D4", "10", "—", "Knife"], ["Villager", "Brawling 8", "—", "—", "8", "—", "Wooden club"], ["Hunter", "Awareness 12, Bows 13", "—", "AGL +D4", "13", "—", "Longbow, leather armor"], ["Bandit", "Bows 12, Evade 10, Swords 12", "—", "—", "12", "—", "Short sword, short bow"], ["Adventurer", "Awareness 10, Swords 12", "—", "STR +D4", "13", "—", "Broadsword, studded leather"], ["Scholar", "Languages 13, Myths & Legends 13", "—", "—", "7", "—", "A good book"], ["Bandit Chief", "Awareness 12, Brawling 15, Hammers 15", "Berserker, Robust x6, Veteran", "STR +D6", "30", "16", "Heavy warhammer, chainmail"], ["Knight Champion", "Brawling 14, Swords 16", "Defensive, Double Slash, Focused x6, Robust x6", "STR +D6", "28", "26", "Longsword, plate armor, horse"], ["Archmage", "Magic School 15, Staves 13", "Focused x6, Master Spellcaster, Robust x4", "—", "22", "30", "Staff, grimoire"], ] },
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
       {
        title: "Fear Table (d8)",
        type: 'table',
        headers: ["D8", "Effect"],
        rows: [
          ["1", "Enfeebled. The fear drains your energy and determination. You lose 2D6 WP (to a minimum of zero) and become Disheartened."],
          ["2", "Shaken. You suffer the Scared condition."],
          ["3", "Panting. The intense fear leaves you out of breath and makes you Exhausted."],
          ["4", "Pale. Your face turns white as a sheet. You and all player characters within 10 meters and in sight of you become Scared."],
          ["5", "Scream. You scream in horror, which causes all player characters who hear the sound to immediately suffer a fear attack as well. Each person only ever needs to make one WIL roll to resist the same fear attack."],
          ["6", "Rage. Your fear turns to anger, and you are forced to attack its source on your next turn – in melee combat if possible. You also become Angry."],
          ["7", "Paralyzed. You are petrified with terror and unable to move. You cannot perform any action or movement on your next turn. Make another WIL roll on each subsequent turn (not an action) to break the paralysis."],
          ["8", "Wild Panic. In a fit of utter panic, you flee the scene as fast as you can. On your next turn you must dash away from the source of your fear. Make another WIL roll on each subsequent turn (not an action) to stop running and act normally again."]
        ]
      },
      {
        title: "Severe Injuries",
        type: 'table',
        headers: ["D20", "Injury", "Effect"],
        rows: [
          ["1-2", "Broken nose", "You get a bane on all AWARENESS rolls. Healing time: D6 days."],
          ["3-4", "Scarred face", "Bane on all PERFORMANCE and PERSUASION rolls. Healing time: 2D6 days."],
          ["5-6", "Teeth knocked out", "Your PERFORMANCE and PERSUASION skills levels are permanently reduced by 2 (to a minimum of 3)."],
          ["7-8", "Broken ribs", "Bane on all skills based on STR or AGL. Healing time: D6 days."],
          ["9-10", "Concussion", "Bane on all skills based on INT. Healing time: D6 days."],
          ["11-12", "Deep wounds", "Bane on all skills based on STR or AGL, and every roll against such skill inflicts D6 points of damage. Healing time: 2D6 days."],
          ["13", "Broken leg", "Your movement rate is halved. Healing time: 3D6 days."],
          ["14", "Broken arm", "You cannot use two-handed weapon, nor dual wield, and get a bane on all other actions normally using both arms, such as climbing. Healing time: 3D6 days."],
          ["15", "Severed toe", "Movement rate permanently reduced by 2 (to a minimum of 4)."],
          ["16", "Severed finger", "Your skill levels in all weapon skills are permanently reduced by 1 (to a minimum of 3)."],
          ["17", "Gouged eye", "Your skill level in SPOT HIDDEN is permanently reduced by 2 (to a minimum of 3)."],
          ["18", "Nightmares", "Roll to resist fear (page 52) each shift you sleep. If you fail, the shift doesn’t count as slept. Healing time: 2D6 days."],
          ["19", "Changed personality", "Randomly generate a new weakness (optional rule, page 26)."],
          ["20", "Amnesia", "You cannot remember who you or the other player characters are. The effect must be roleplayed. Healing time: D6 days."]
        ]
      },
      {
        title: "Damage Types & Armor",
        type: 'definitions',
        items: {
          "Context": "If the optional rule for damage types is used, the following rules apply:",
          "Leather/Studded": "Gain a +2 bonus to their armor rating against bludgeoning damage.",
          "Chainmail": "Gets a +2 bonus to its armor rating against slashing damage.",
          "Normal Effect": "If the type of damage is not stated, the armor has its normal effect."
        }
      },
      { title: "Healing & Resting", type: 'definitions', items: { "Round Rest": "10 sec. Recover D6 WP. Once/shift.", "Stretch Rest": "15 min. Heal D6 HP (2D6 with Healer), D6 WP, heal one condition. Once/shift.", "Shift Rest": "6 hours. Full recovery of HP/WP, all conditions healed." } }
    ]
  },
  journeys: {
    title: "Journeys", icon: Map, sections: [
        { title: "Wilderness Travel", type: 'definitions', items: { "Pathfinder": "One character must lead in pathless terrain.", "Hunger": "Must eat daily or become famished (cannot heal).", "Bushcraft Roll": "Pathfinder rolls BUSHCRAFT each shift. Failure causes a mishap.", "Dragon Roll": "Pathfinder finds a shortcut, doubling distance covered." } },
        { title: "Leaving The Adventure Site (d6)", type: 'table', headers: ["D6", "Consequence"], rows: [ ["1", "Enemies follow and attack later."], ["2", "Enemies get reinforcements (x2)."], ["3", "Someone else loots the site before you return."], ["4-6", "Nothing happens."] ] },
    ]
  },
  mishaps: {
    title: "Mishaps", icon: AlertCircle, sections: [
      { title: "Wilderness Mishaps (d12)", type: 'table', headers: ["D12", "Mishap"], rows: [ ["1", "Fog. Distance covered this shift is halved."], ["2", "Blocking Terrain. ACROBATICS roll to proceed."], ["3", "Torn Clothes. A random PC's clothes become rags."], ["4", "Lost. No progress this shift. Pathfinder must re-roll BUSHCRAFT."], ["5", "Dropped Item. A random PC drops or breaks an item."], ["6", "Mosquito Swarm. All PCs without a cloak become Angry."], ["7", "Sprained Ankle. Random PC takes D6 damage."], ["8", "Downpour. All PCs without a cloak must roll to withstand cold."], ["9", "Wasps. All PCs must EVADE or take D6 damage and a condition."], ["10", "Landslide. All PCs must EVADE or take D10 damage."], ["11", "Savage Animal. A wild animal attacks the party."], ["12", "Quicksand. All PCs must make a BUSHCRAFT roll or get stuck."] ] }
    ]
  },
  
};

type TabKey = keyof typeof gmScreenData;

const SectionCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="bg-white p-4 rounded-lg border shadow-sm break-inside-avoid">
    <h3 className="font-bold text-lg mb-3 text-gray-800 border-b pb-2">{title}</h3>
    <div className="space-y-3">{children}</div>
  </div>
);

const SimpleTable = ({ headers, rows }: { headers: string[], rows: string[][] }) => (
  <div className="overflow-x-auto text-sm">
    <table className="w-full">
      <thead><tr className="bg-gray-50">{headers.map(h => <th key={h} className="px-2 py-2 text-left font-semibold text-gray-600">{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => (<tr key={i} className="border-t hover:bg-gray-50">{row.map((cell, j) => <td key={j} className="px-2 py-2 align-top">{cell}</td>)}</tr>))}</tbody>
    </table>
  </div>
);

// --- UPDATED: Story Helper component with more context fields ---
const StoryHelper = () => {
  const [prompt, setPrompt] = useState('');
  const [partyData, setPartyData] = useState('');
  const [locationData, setLocationData] = useState('');
  const [npcData, setNpcData] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateStory = async () => {
    if (!prompt.trim()) {
      setError('Please enter a primary prompt.');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');

    try {
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error('Openrouter API key not found. Please add VITE_OPENROUTER_API_KEY to your .env file.');
      }

      // --- Construct a more detailed prompt for the AI ---
      let fullPrompt = `You are a helpful GM assistant for the Dragonbane RPG. Generate creative, engaging content based on the following information. Keep responses concise and focused on storytelling elements like plot ideas, NPC descriptions, or adventure hooks.\n\n--- Main Prompt ---\n${prompt}`;

      if (partyData.trim()) {
        fullPrompt += `\n\n--- Party Members ---\n${partyData}`;
      }
      if (locationData.trim()) {
        fullPrompt += `\n\n--- Current Location ---\n${locationData}`;
      }
      if (npcData.trim()) {
        fullPrompt += `\n\n--- Key NPCs ---\n${npcData}`;
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Dragonbane GM Screen'
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1-0528:free',
          messages: [
            {
              role: 'user',
              content: fullPrompt
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setResponse(data.choices[0]?.message?.content || 'No response generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const commonTextAreaClass = "w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y";

  return (
    <SectionCard title="AI Story Generator">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Main Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., 'Generate a plot twist for a dungeon crawl' or 'Describe a mysterious NPC encounter'..."
            className={commonTextAreaClass}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Party Members (Optional)</label>
            <textarea
              value={partyData}
              onChange={(e) => setPartyData(e.target.value)}
              placeholder="e.g., 'Kael, a hot-headed knight. Elara, a curious elven scholar...'"
              className={commonTextAreaClass}
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location Details (Optional)</label>
            <textarea
              value={locationData}
              onChange={(e) => setLocationData(e.target.value)}
              placeholder="e.g., 'The Whispering Crypt, a damp and ancient tomb known for its echoing halls...'"
              className={commonTextAreaClass}
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key NPCs (Optional)</label>
            <textarea
              value={npcData}
              onChange={(e) => setNpcData(e.target.value)}
              placeholder="e.g., 'Lord Valerius, the quest giver, seems trustworthy but has a secret agenda...'"
              className={commonTextAreaClass}
              rows={4}
            />
          </div>
        </div>

        <button
          onClick={generateStory}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating...' : 'Generate Story Idea'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {response && (
          <div className="p-3 bg-gray-50 rounded-md">
            <h4 className="font-semibold text-gray-800 mb-2">AI Response:</h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{response}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export function GMScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('npcs');
  
  const tabs = Object.keys(gmScreenData).map(key => ({
    id: key as TabKey,
    label: gmScreenData[key as TabKey].title,
    icon: gmScreenData[key as TabKey].icon,
  }));

  const renderContent = () => {
    if (activeTab === 'storyHelper') {
      return <StoryHelper />;
    }

    const tabData = gmScreenData[activeTab];
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
        {tabData.sections.map(section => (
          <SectionCard key={section.title} title={section.title}>
            {section.type === 'table' && <SimpleTable headers={section.headers!} rows={section.rows!} />}
            {section.type === 'text' && <p className="text-sm text-gray-600">{section.content}</p>}
            {section.type === 'list' && <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">{section.items!.map(item => <li key={item}>{item}</li>)}</ul>}
            {section.type === 'definitions' && <div className="space-y-2 text-sm">{Object.entries(section.items!).map(([title, desc]) => (<div key={title}><strong className="font-semibold text-gray-800">{title}:</strong> {desc}</div>))}</div>}
          </SectionCard>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <tab.icon className="w-5 h-5" /> {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="py-6">
        {renderContent()}
      </div>
    </div>
  );
}