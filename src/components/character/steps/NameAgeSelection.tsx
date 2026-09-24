import React from 'react';
import { useCharacterCreation } from '../../../stores/characterCreation';
import { User, Calendar, RefreshCw, Sparkles, Info } from 'lucide-react';
import { Button } from '../../shared/Button';

interface AgeModifiers {
  attributes: {
    STR: number;
    CON: number;
    AGL: number;
    INT: number;
    WIL: number;
    CHA: number;
  };
  electiveSkills: number;
}

const ageModifiers: Record<'Young' | 'Adult' | 'Old', AgeModifiers> = {
  Young: {
    attributes: { STR: 0, CON: +1, AGL: +1, INT: 0, WIL: 0, CHA: 0 },
    electiveSkills: 2 // Total 8 (6 Profession + 2 Elective)
  },
  Adult: {
    attributes: { STR: 0, CON: 0, AGL: 0, INT: 0, WIL: 0, CHA: 0 },
    electiveSkills: 4 // Total 10 (6 Profession + 4 Elective)
  },
  Old: {
    attributes: { STR: -2, CON: -2, AGL: -2, INT: +1, WIL: +1, CHA: 0 },
    electiveSkills: 6 // Total 12 (6 Profession + 6 Elective)
  }
};

// --- DATA: Names per Kin (from Rulebook) ---
const KIN_NAMES: Record<string, string[]> = {
  'Human': ['Joruna', 'Tym', 'Halvelda', 'Garmander', 'Verolun', 'Lothar'],
  'Halfling': ['Snappy', 'Brine', 'Cottar', 'Bumble', 'Perrywick', 'Theoline'],
  'Dwarf': ['Tinderrock', 'Halwyld', 'Tymolana', 'Traut', 'Urd', 'Fermer'],
  'Elf': ['Arasin', 'Illyriana', 'Galvander', 'Tyrindelia', 'Erwilnor', 'Andremone'],
  'Mallard': ['Qwucksum', 'Splats', 'Moggee', 'Groddy', 'Blisandina', 'Hackleswell'],
  'Wolfkin': ['Wyld', 'Wolfshadow', 'Lunariem', 'Obdurian', 'Frostbite', 'Wuldenhall']
};

// --- DATA: Nicknames per Profession (from Rulebook) ---
const PROFESSION_NICKNAMES: Record<string, string[]> = {
  'Artisan': ['Stonehammer', 'Woodcleaver', 'Strongfist', 'Barrelmaker', 'Bridgebuilder', 'Ironmaster'],
  'Bard': ['Odemaker', 'Talespinner', 'Silvervoice', 'Gildenclef', 'Honeytongue', 'Rhymesmith'],
  'Fighter': ['Gravemaker', 'Grimjaw', 'Windthaw', 'Coldsteel', 'The Fearless', 'The Butcher'],
  'Hunter': ['Forest Fox', 'Wolfbane', 'Pathfinder', 'The Weathered', 'Bloodhunger', 'Shadowbolt'],
  'Knight': ['Dragonheart', 'Goldlance', 'Grifﬁnclaw', 'The Noble', 'Gleamhelm', 'Mourningcloak'],
  'Mage': ['Rootheart', 'Crookback', 'Graycape', 'Stormhand', 'Stafflimper', 'Shadowbringer'],
  'Mariner': ['Whitewater', 'Waverider', 'Foamborn', 'Saltsplash', 'Seadog', 'Stormfarer'],
  'Merchant': ['Silvergrin', 'Goldtooth', 'Silktongue', 'The Truthful', 'Lardbelly', 'Skinflint'],
  'Scholar': ['Clearmind', 'Dustlung', 'Farsight', 'The Lettered', 'The All-Knowing', 'The Learned'],
  'Thief': ['Halffinger', 'Blackrat', 'Redeye', 'Quickfoot', 'Doubletongue', 'Nightstabber']
};

export function NameAgeSelection() {
  const { character, updateCharacter } = useCharacterCreation();

  React.useEffect(() => {
    if (!character.name || character.given_name !== undefined) return;
    const nicknameMatch = character.name.match(/"([^"]+)"/);
    const legacyGivenName = character.name.replace(/"[^"]+"/, '').trim();
    updateCharacter({
      given_name: legacyGivenName,
      nickname: character.nickname ?? nicknameMatch?.[1] ?? '',
      family_name: character.family_name ?? '',
    });
  }, [character.family_name, character.given_name, character.name, character.nickname, updateCharacter]);

  const givenName = character.given_name ?? character.name ?? '';
  const nickname = character.nickname ?? '';
  const familyName = character.family_name ?? '';

  const composeName = (given: string, nick: string, family: string) => (
    [given.trim(), nick.trim() ? `"${nick.trim()}"` : '', family.trim()].filter(Boolean).join(' ')
  );

  const updateNameParts = (parts: { given_name?: string; nickname?: string; family_name?: string }) => {
    const nextGiven = parts.given_name ?? givenName;
    const nextNickname = parts.nickname ?? nickname;
    const nextFamily = parts.family_name ?? familyName;
    updateCharacter({
      ...parts,
      name: composeName(nextGiven, nextNickname, nextFamily),
    });
  };

  const generateName = () => {
    if (!character.kin) return;
    const names = KIN_NAMES[character.kin] || KIN_NAMES['Human'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    updateNameParts({ given_name: randomName });
  };

  const generateNickname = () => {
    if (!character.profession) return;
    const nicknames = PROFESSION_NICKNAMES[character.profession] || [];
    if (nicknames.length === 0) return;
    
    const randomNickname = nicknames[Math.floor(Math.random() * nicknames.length)];
    
    updateNameParts({ nickname: randomNickname });
  };

  return (
    <div className="space-y-6">
      <div className="prose">
        <h3 className="text-xl font-bold mb-4">Identity & Age</h3>
        <p className="text-gray-600">
          Give your adventurer a name. Your age determines your starting attributes and the number of trained skills you begin with.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* Name Input Section */}
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="character-name" className="block text-sm font-medium text-gray-700">Given name</label>
              <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="character-name"
                type="text"
                value={givenName}
                onChange={(e) => updateNameParts({ given_name: e.target.value })}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Given name"
              />
              </div>
              <Button variant="secondary" onClick={generateName} disabled={!character.kin} title={!character.kin ? "Select Kin first" : "Generate Name based on Kin"} className="w-full justify-center">
                <RefreshCw className="w-4 h-4 mr-2" /> Generate name
              </Button>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="character-nickname" className="block text-sm font-medium text-gray-700">Nickname <span className="font-normal text-gray-400">(optional)</span></label>
              <input id="character-nickname" type="text" value={nickname} onChange={(e) => updateNameParts({ nickname: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-transparent focus:ring-2 focus:ring-purple-500" placeholder="The Swift" />
              <Button variant="outline" onClick={generateNickname} disabled={!character.profession} title={!character.profession ? "Select Profession first" : "Generate Nickname based on Profession"} className="w-full justify-center text-purple-700 border-purple-200 hover:bg-purple-50">
                <Sparkles className="w-4 h-4 mr-2" /> Generate nickname
              </Button>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="character-family-name" className="block text-sm font-medium text-gray-700">Family name <span className="font-normal text-gray-400">(optional)</span></label>
              <input id="character-family-name" type="text" value={familyName} onChange={(e) => updateNameParts({ family_name: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-transparent focus:ring-2 focus:ring-blue-500" placeholder="Family or clan name" />
              <div className="flex h-10 items-center rounded-md bg-gray-50 px-3 text-xs text-gray-500">Displayed after the nickname</div>
            </div>
          </div>
          {(!character.kin || !character.profession) && (
              <p className="text-xs text-gray-400 italic">Select Kin and Profession in previous steps to enable generators.</p>
          )}
        </div>

        {/* Age Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
             <span className="block text-sm font-medium text-gray-700">Age Category</span>
             <div className="group relative">
                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Young characters are physically fit (High Stats) but inexperienced. Old characters are frail (Low Stats) but highly skilled.
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['Young', 'Adult', 'Old'] as const).map((age) => {
              const mods = ageModifiers[age];
              const isSelected = character.age === age;
              
              return (
                <button
                  type="button"
                  key={age}
                  className={`relative rounded-lg border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                  onClick={() => updateCharacter({ age })}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                        <Calendar className={`h-5 w-5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                        <h4 className={`font-bold ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>{age}</h4>
                    </div>
                    {isSelected && <div className="h-2 w-2 rounded-full bg-blue-600" />}
                  </div>

                  <div className="space-y-3 text-sm">
                    {/* Attributes Section */}
                    <div className="bg-white/60 rounded p-2 border border-gray-100">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Attributes</p>
                        <div className="flex flex-wrap gap-2">
                           {Object.entries(mods.attributes).map(([attr, val]) => {
                               if (val === 0) return null;
                               return (
                                   <span key={attr} className={`text-xs px-1.5 py-0.5 rounded font-mono font-bold ${val > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                       {attr} {val > 0 ? '+' : ''}{val}
                                   </span>
                               );
                           })}
                           {Object.values(mods.attributes).every(v => v === 0) && <span className="text-xs text-gray-400 italic">No modifiers</span>}
                        </div>
                    </div>

                    {/* Skills Section */}
                    <div>
                        <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                            <span>Profession Skills:</span>
                            <span className="font-medium">6</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Elective Skills:</span>
                            <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-xs">
                                 +{mods.electiveSkills}
                            </span>
                        </div>
                        <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between items-center font-bold text-gray-800">
                             <span>Total Trained:</span>
                             <span>{6 + mods.electiveSkills}</span>
                        </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
