import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DBSpell } from './useSpells'; // Assuming DBSpell is defined correctly elsewhere

export function useMagicSpells(magicSchool?: string) {
  const [tricks, setTricks] = useState<DBSpell[]>([]);
  const [spells, setSpells] = useState<DBSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSpells() {
      try {
        setLoading(true);
        setError(null);

        // Load magic tricks (rank 0 spells)
        const { data: tricksData, error: tricksError } = await supabase
          .from('game_spells')
          .select('*')
          .eq('rank', 0)
          .order('name');

        if (tricksError) throw tricksError;
        setTricks(tricksData || []);

        // Build the query for rank 1 spells
        let spellsQuery = supabase
          .from('game_spells')
          .select(`
            *,
            magic_schools ( name )
          `)
          .eq('rank', 1)
          .order('name');

        // If no magicSchool is provided, use .is() to filter for SQL NULL (general spells).
        if (!magicSchool) {
          spellsQuery = spellsQuery.is('school_id', null);
        } else {
          // Otherwise, get spells that are either general (null) or that match the provided magicSchool UUID.
          // This correctly handles fetching general spells alongside school-specific ones if needed,
          // or just school-specific ones depending on the exact requirement.
          // The current logic fetches general OR school-specific.
          spellsQuery = spellsQuery.or(`school_id.is.null,school_id.eq.${magicSchool}`);
        }

        const { data: spellsData, error: spellsError } = await spellsQuery;
        if (spellsError) throw spellsError;
        setSpells(spellsData || []);
      } catch (err) {
        console.error('Error loading spells:', err);
        setError(err instanceof Error ? err.message : 'Failed to load spells');
      } finally {
        setLoading(false);
      }
    }

    loadSpells();
  }, [magicSchool]);

  return {
    tricks,
    spells,
    loading,
    error,
  };
}
