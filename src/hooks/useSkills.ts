import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Import supabase client

// Ensure GameSkill matches the game_skills table structure
export interface GameSkill {
  id: string; // Assuming UUID or unique identifier
  name: string;
  description?: string | null; // Allow null
  attribute?: string | null; // Allow null, e.g., 'STR', 'AGL'
  created_at?: string; // Optional timestamp
}

export function useSkills() {
  const [skills, setSkills] = useState<GameSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSkills() {
      setLoading(true);
      setError(null);
      console.log("useSkills: Fetching skills..."); // Log start
      try {
        // Fetch from the actual 'game_skills' table
        const { data, error: fetchError } = await supabase
          .from('game_skills') // *** Use the correct table name 'game_skills' ***
          .select('*')
          .order('name'); // Order alphabetically by name

        if (fetchError) {
          // Throw the specific Supabase error
          console.error("useSkills: Supabase error fetching skills:", fetchError);
          throw new Error(fetchError.message || 'Failed to fetch skills from database');
        }

        // *** ADDED LOGGING: Log raw data ***
        console.log("useSkills: Raw data received from Supabase:", data);

        // *** ADDED CHECK: Inspect individual items for problematic structure ***
        if (Array.isArray(data)) {
          let foundProblematic = false;
          data.forEach((item, index) => {
            if (item && typeof item === 'object') {
              const keys = Object.keys(item);
              // Heuristic check: Does the first key look like a UUID?
              // This is trying to find the specific "{uuid: value}" structure reported in the error.
              if (keys.length > 0 && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(keys[0])) {
                 // Further check: Does it lack expected keys like 'id' or 'name'?
                 if (!('id' in item) || !('name' in item)) {
                    console.warn(`useSkills: Potential problematic object structure found at index ${index}:`, item);
                    foundProblematic = true;
                 }
              }
              // Also check if standard fields are missing or have wrong types
              if (typeof item.id !== 'string' || typeof item.name !== 'string') {
                 console.warn(`useSkills: Item at index ${index} missing 'id' or 'name', or they have wrong types:`, item);
                 // Consider this problematic too, although maybe not the direct cause of *this* error
                 // foundProblematic = true;
              }

            } else {
              console.warn(`useSkills: Invalid non-object item found in fetched data at index ${index}:`, item);
              foundProblematic = true;
            }
          });
          if (!foundProblematic) {
            console.log("useSkills: Initial check of fetched data structure passed.");
          }
        } else {
           console.warn("useSkills: Fetched data is not an array:", data);
        }

        // Ensure data matches GameSkill[] type, handle potential null response
        const validatedData = Array.isArray(data) ? data as GameSkill[] : [];
        setSkills(validatedData);
        console.log(`useSkills: Successfully processed and set ${validatedData.length} skills.`);

      } catch (err) {
        // Catch any error (fetchError or others)
        console.error("useSkills: Error during fetch or processing:", err);
        const message = err instanceof Error ? err.message : 'An unknown error occurred while fetching skills';
        setError(message);
        setSkills([]); // Set empty array on error
      } finally {
        setLoading(false);
        console.log("useSkills: Fetch finished."); // Log end
      }
    }

    fetchSkills();
  }, []); // Empty dependency array means this runs once on mount

  return { skills, loading, error };
}
