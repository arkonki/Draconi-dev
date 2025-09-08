import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useCharacterSheetStore } from '../stores/characterSheetStore';
import { Spell as DetailedSpell } from '../types/magic'; // Use the detailed type

// Define the shape of the data coming directly from the DB query
export interface DBSpell extends Omit<DetailedSpell, 'schoolId'> {
  power_level: 'yes' | null;
  magic_schools: { name: string } | null;
  school_id: string | null;
}


export function useSpells(characterId?: string) {
  const [dbSpells, setDbSpells] = useState<DBSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const character = useCharacterSheetStore((state) => state.character);

  // Extract learned spell NAMES based on the CORRECT structure
  const learnedSpellNames = useMemo(() => {
     if (!character?.spells) {
       return [];
     }

     let names: string[] = [];

     // Handle 'general' spells (array of strings/names)
     if (character.spells.general) {
       if (Array.isArray(character.spells.general)) {
         names = names.concat(character.spells.general);
       } else {
         // Log potential data structure issue
         console.warn("[useSpells] character.spells.general is not an array:", character.spells.general);
       }
     }

     // Handle specific school spells (nested object with array of strings/names)
     if (character.spells.school && character.spells.school.spells) {
        const schoolSpells = character.spells.school.spells;
        if (Array.isArray(schoolSpells)) {
           names = names.concat(schoolSpells);
        } else {
           // Log potential data structure issue
           console.warn("[useSpells] character.spells.school.spells is not an array:", schoolSpells);
        }
     }

     // Remove duplicates just in case
     return Array.from(new Set(names));
  }, [character?.spells]);


  useEffect(() => {
    // Ensure characterId exists AND there are spell names to fetch
    if (!characterId || learnedSpellNames.length === 0) {
      setLoading(false);
      setDbSpells([]); // No spells learned or no character ID
      return;
}

    async function loadLearnedSpellDetails() {
      setLoading(true);
      setError(null);
      try {
        // Fetch spells where the 'name' column is in the learnedSpellNames array
        const { data, error: fetchError } = await supabase
          .from('game_spells')
          .select(`
            *,
            power_level,
						dice,
            magic_schools ( name )
          `)
          .in('name', learnedSpellNames)
          .order('rank', { ascending: true })
          .order('name', { ascending: true });

        if (fetchError) throw fetchError;

        setDbSpells(data || []);

      } catch (err) {
        // Log critical fetch errors
        console.error('Error loading learned spell details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load spell details');
        setDbSpells([]);
      } finally {
        setLoading(false);
      }
    }

    loadLearnedSpellDetails();
  }, [characterId, learnedSpellNames]); // Rerun when learnedSpellNames change

  // Process DB spells into the detailed format expected by components
  const learnedSpells = useMemo((): DetailedSpell[] => {
    return dbSpells.map(dbSpell => ({
      id: dbSpell.id,
      name: dbSpell.name,
      schoolId: dbSpell.school_id, // Use school_id directly
      rank: dbSpell.rank,
      requirement: dbSpell.requirement,
      castingTime: dbSpell.casting_time,
      range: dbSpell.range,
      duration: dbSpell.duration,
      description: dbSpell.description,
      willpowerCost: dbSpell.willpower_cost,
      createdAt: dbSpell.created_at,
      powerLevel: dbSpell.power_level,
			dice: dbSpell.dice,// Map power_level
    }));
  }, [dbSpells]);

  // Determine character's magic school name (if any)
  const characterSchoolName = useMemo(() => {
    return character?.spells?.school?.name ?? null;
  }, [character?.spells?.school?.name]);


  return {
    learnedSpells, // Use this processed list
    characterSchoolName,
    loading,
    error,
  };
}
