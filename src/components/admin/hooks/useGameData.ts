// Keep existing imports and code...
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Ability, SkillRequirement } from '../../../types/character';

export type DataCategory = 'spells' | 'items' | 'abilities' | 'kin' | 'profession' | 'skills';

export interface GameDataEntry {
  id?: string;
  name: string;
  description?: string;
  heroic_ability?: string;
  key_attribute?: string;
  willpower_cost?: number | null;
  requirement?: string | SkillRequirement | null;
  kin?: string | null;
  profession?: string | null;
  attribute?: string;
  [key: string]: any;
}


export function useGameData(initialCategory: DataCategory) {
  const [entries, setEntries] = useState<GameDataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<DataCategory>(initialCategory);

  const getTableName = useCallback((category: DataCategory): string => {
    switch (category) {
      case 'spells': return 'game_spells';
      case 'items': return 'game_items';
      case 'abilities': return 'heroic_abilities';
      case 'kin': return 'kin';
      case 'profession': return 'professions';
      case 'skills': return 'game_skills'; // Correct mapping
      default:
        console.error(`Invalid data category passed to getTableName: ${category}`);
        throw new Error(`Invalid data category: ${category}`);
    }
  }, []);

  const loadEntries = useCallback(async (category: DataCategory) => {
    setLoading(true);
    setError(null);
    let tableName: string | undefined; // Declare tableName outside try block

    try {
      tableName = getTableName(category); // Get table name
      console.log(`[useGameData] Attempting to load category: ${category}, using table: ${tableName}`); // Log intent

      // Explicitly build the query
      let queryBuilder = supabase.from(tableName); // Start query builder with the correct table name

      // Select columns based on category
      if (category === 'spells') {
        queryBuilder = queryBuilder.select(`
          *,
          magic_schools ( name )
        `);
      } else {
        queryBuilder = queryBuilder.select('*'); // Default select
      }

      // Apply ordering
      queryBuilder = queryBuilder.order('name');

      console.log(`[useGameData] Executing query for table: ${tableName}`); // Log right before execution

      // Execute the query
      const { data, error: fetchError } = await queryBuilder;

      if (fetchError) {
        console.error(`[useGameData] Supabase fetch error for ${tableName}:`, fetchError);
        // Throw the error to be caught by the outer catch block
        throw fetchError;
      }

      // Process data
      const formattedData: GameDataEntry[] = (data || []).map(item => ({
        ...item,
        // Flatten nested school name for spells
        magic_schools: category === 'spells' ? item.magic_schools?.name : undefined,
        // Attempt to parse requirement if it's a stringified JSON (for abilities)
        requirement: (category === 'abilities' && typeof item.requirement === 'string')
            ? (() => { try { return JSON.parse(item.requirement); } catch { return item.requirement; } })()
            : item.requirement,
      }));

      console.log(`[useGameData] Loaded ${formattedData.length} entries for ${category} from ${tableName}`);
      setEntries(formattedData);

    } catch (err: any) { // Catch any error, including the thrown fetchError
      // Use tableName in the error message if available, otherwise use category
      const contextName = tableName || category;
      console.error(`[useGameData] Error in loadEntries for ${contextName}:`, err);
      const errorMessage = err?.message || `Failed to load ${contextName}`;
      const errorDetails = err?.details ? `: ${err.details}` : '';
      setError(`${errorMessage}${errorDetails}`);
      setEntries([]); // Clear entries on error
    } finally {
      setLoading(false);
    }
  }, [getTableName]); // Dependency on getTableName

  const handleSave = useCallback(async (
    category: DataCategory,
    editingEntry: GameDataEntry,
    onSuccess: (savedEntry: GameDataEntry) => void, // Note: This will receive incomplete data now
    onError: (errorMessage: string | null) => void
  ) => {
    let tableName: string = ''; // Initialize tableName
    try {
      onError(null);
      setLoading(true);

      tableName = getTableName(category); // Get table name
      // IMPORTANT: Destructure id but keep it for potential use in success callback
      const { id, ...dataToSave } = editingEntry;

      if (!dataToSave.name || String(dataToSave.name).trim() === '') {
          throw new Error(`Cannot save ${category} without a name.`);
      }

      // --- Transformations (Keep as is) ---
      if (category === 'abilities') {
        dataToSave.willpower_cost = dataToSave.willpower_cost === '' || dataToSave.willpower_cost === undefined
          ? null
          : Number(dataToSave.willpower_cost);
        if (typeof dataToSave.requirement === 'object' && dataToSave.requirement !== null) {
            if (Object.keys(dataToSave.requirement).length > 0) {
                dataToSave.requirement = JSON.stringify(dataToSave.requirement);
            } else {
                dataToSave.requirement = null;
            }
        } else if (dataToSave.requirement === '' || dataToSave.requirement === undefined) {
            dataToSave.requirement = null;
        }
        dataToSave.kin = dataToSave.kin || null;
        dataToSave.profession = dataToSave.profession || null;
      }
      if (category === 'spells') {
         dataToSave.rank = Number(dataToSave.rank ?? 0);
         dataToSave.willpower_cost = Number(dataToSave.willpower_cost ?? 0);
         dataToSave.school_id = dataToSave.school_id || null;
         dataToSave.requirement = dataToSave.requirement || null;
      }
      if (category === 'skills') {
         dataToSave.attribute = dataToSave.attribute || null;
      }
      // --- End Transformations ---


      console.log(`[useGameData] Saving entry to ${tableName} (ID: ${id || 'new'}):`, dataToSave);

      let error: any = null;

      if (id) {
        // Update: REMOVED .select().maybeSingle()
        const { error: updateError } = await supabase
          .from(tableName)
          .update(dataToSave)
          .eq('id', id);
        error = updateError;

      } else {
        // Insert: REMOVED .select().single()
        const { error: insertError } = await supabase
          .from(tableName)
          .insert([dataToSave]);
         error = insertError;
      }

      // Centralized error check
      if (error) {
          console.error(`[useGameData] Supabase Save Error (${tableName}):`, error);
          throw error; // Throw the Supabase error object
      }

      // --- Success Handling (Modified) ---
      // Since we didn't .select(), we don't have the full returned data (like generated ID or created_at)
      // We'll just use the data we *sent* for the onSuccess callback and list refresh.
      // This is TEMPORARY for debugging.
      console.log(`[useGameData] Save operation successful (without select) for ${category} (ID: ${id || 'new - ID not returned'})`);

      // Construct a partial entry for the success callback
      const pseudoSavedEntry: GameDataEntry = {
          ...editingEntry, // Use the original entry data
          // We don't get the real ID back on insert this way
          id: id, // Keep original ID if updating, otherwise it's undefined
          // We don't get timestamps or DB defaults back
      };

      onSuccess(pseudoSavedEntry); // Call success with the data we have
      await loadEntries(category); // Refresh list (this *should* now fetch the newly saved item)

    } catch (err: any) { // Catch any error
      const contextName = tableName || category;
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'An unexpected error occurred during save.');
      const errorDetails = err?.details ? ` (Details: ${err.details})` : '';
      const errorCode = err?.code ? ` (Code: ${err.code})` : '';
      const fullErrorMessage = `Error saving ${contextName}: ${errorMessage}${errorDetails}${errorCode}`;

      console.error(`[useGameData] Error in handleSave for ${contextName}:`, err);
      onError(fullErrorMessage);
    } finally {
        setLoading(false);
    }
  }, [getTableName, loadEntries]);


  const handleDelete = useCallback(async (category: DataCategory, id: string) => {
    // Added confirmation dialog
    if (!window.confirm(`Are you sure you want to delete this ${category} entry (ID: ${id})? This action cannot be undone.`)) {
        return;
    }

    let tableName: string = ''; // Initialize tableName
    try {
      setError(null);
      setLoading(true);

      tableName = getTableName(category); // Get table name
      console.log(`[useGameData] Deleting entry from ${tableName}, ID: ${id}`);

      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (deleteError) {
          console.error(`[useGameData] Error deleting from ${tableName}:`, deleteError);
          throw deleteError; // Throw Supabase error
      }

      console.log(`[useGameData] Delete successful for ID: ${id} in ${category}`);
      await loadEntries(category); // Refresh list

    } catch (err: any) {
      const contextName = tableName || category;
      const errorMessage = err?.message || 'An unexpected error occurred during deletion.';
      const errorDetails = err?.details ? ` (Details: ${err.details})` : '';
      const errorCode = err?.code ? ` (Code: ${err.code})` : '';
      const fullErrorMessage = `Error deleting ${contextName}: ${errorMessage}${errorDetails}${errorCode}`;

      console.error(`[useGameData] Error in handleDelete for ${contextName}:`, err);
      setError(fullErrorMessage); // Set error state for potential display
    } finally {
        setLoading(false);
    }
  }, [getTableName, loadEntries]);

  const switchCategory = useCallback((newCategory: DataCategory) => {
    console.log(`[useGameData] Switching category from ${activeCategory} to ${newCategory}`);
    setActiveCategory(newCategory);
    loadEntries(newCategory);
  }, [activeCategory, loadEntries]); // Added activeCategory dependency

  useEffect(() => {
    console.log(`[useGameData] Initial load effect for category: ${initialCategory}`);
    // Ensure initialCategory is valid before loading
    try {
        getTableName(initialCategory); // Check if it's a valid category
        loadEntries(initialCategory);
    } catch (err) {
        console.error(`[useGameData] Invalid initial category: ${initialCategory}`, err);
        setError(`Invalid initial category: ${initialCategory}`);
        setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategory, getTableName]); // Added getTableName dependency

  return {
      entries,
      loading,
      error,
      activeCategory,
      switchCategory,
      handleSave,
      handleDelete
  };
}
