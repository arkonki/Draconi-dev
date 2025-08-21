// Keep existing imports and code...
      import { useState, useEffect, useCallback } from 'react';
      import { supabase } from '../lib/supabase';
      import { Ability, Kin, Profession, Skill, SkillRequirement } from '../types/character';
      import { MonsterData } from '../types/bestiary'; // Import MonsterData

      export type DataCategory = 'spells' | 'items' | 'abilities' | 'kin' | 'profession' | 'skills' | 'monsters'; // Added 'monsters'

      // Make GameDataEntry a union of all possible types
      export type GameDataEntry =
        | { id?: string; name: string; description?: string; [key: string]: any } // Base structure
        | MonsterData; // Add other specific types if they don't fit the base


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
            case 'skills': return 'game_skills';
            case 'monsters': return 'monsters'; // Added monsters table
            default:
              console.error(`Invalid data category passed to getTableName: ${category}`);
              throw new Error(`Invalid data category: ${category}`);
          }
        }, []);

        const loadEntries = useCallback(async (category: DataCategory) => {
          setLoading(true);
          setError(null);
          let tableName: string | undefined;

          try {
            tableName = getTableName(category);
            console.log(`[useGameData] Attempting to load category: ${category}, using table: ${tableName}`);

            let queryBuilder = supabase.from(tableName);

            if (category === 'spells') {
              queryBuilder = queryBuilder.select(`
                *,
                magic_schools ( name )
              `);
            } else {
              queryBuilder = queryBuilder.select('*');
            }

            queryBuilder = queryBuilder.order('name');

            console.log(`[useGameData] Executing query for table: ${tableName}`);
            const { data, error: fetchError } = await queryBuilder;

            if (fetchError) {
              console.error(`[useGameData] Supabase fetch error for ${tableName}:`, fetchError);
              throw fetchError;
            }

            const formattedData: GameDataEntry[] = (data || []).map(item => {
              let processedItem = { ...item };
              if (category === 'spells') {
                processedItem.magic_schools = item.magic_schools?.name;
              }
              if (category === 'abilities' && typeof item.requirement === 'string') {
                try {
                  processedItem.requirement = JSON.parse(item.requirement);
                } catch { /* keep as string if not valid JSON */ }
              }
              // For monsters, stats and attacks are already JSONB, Supabase client handles parsing
              return processedItem as GameDataEntry;
            });

            console.log(`[useGameData] Loaded ${formattedData.length} entries for ${category} from ${tableName}`);
            setEntries(formattedData);

          } catch (err: any) {
            const contextName = tableName || category;
            console.error(`[useGameData] Error in loadEntries for ${contextName}:`, err);
            const errorMessage = err?.message || `Failed to load ${contextName}`;
            const errorDetails = err?.details ? `: ${err.details}` : '';
            setError(`${errorMessage}${errorDetails}`);
            setEntries([]);
          } finally {
            setLoading(false);
          }
        }, [getTableName]);

        const handleSave = useCallback(async (
          category: DataCategory,
          editingEntry: GameDataEntry,
          onSuccess: (savedEntry: GameDataEntry) => void,
          onError: (errorMessage: string | null) => void
        ) => {
          let tableName: string = '';
          try {
            onError(null);
            setLoading(true);

            tableName = getTableName(category);
            const { id, ...dataToSaveAny } = editingEntry;
            let dataToSave = { ...dataToSaveAny }; // Make a mutable copy

            if (!dataToSave.name || String(dataToSave.name).trim() === '') {
                throw new Error(`Cannot save ${category} without a name.`);
            }

            // --- Transformations ---
            if (category === 'abilities') {
              dataToSave.willpower_cost = (dataToSave.willpower_cost === '' || dataToSave.willpower_cost === undefined)
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
            if (category === 'monsters') {
              // Ensure stats and attacks are objects. Supabase client handles JSONB.
              // If they are not provided, default them to prevent DB errors if columns are NOT NULL
              // (though our schema has defaults for stats and attacks)
              const monsterEntry = editingEntry as MonsterData;
              dataToSave.stats = monsterEntry.stats || { FEROCITY: 0, SIZE: 'Normal', MOVEMENT: 0, ARMOR: 0, HP: 0 };
              dataToSave.attacks = monsterEntry.attacks || [];

              // Remove temporary client-side IDs from attacks and effects before saving
              if (Array.isArray(dataToSave.attacks)) {
                dataToSave.attacks = dataToSave.attacks.map((attack: any) => {
                  const { id: attackId, effects, ...restOfAttack } = attack;
                  if (Array.isArray(effects)) {
                    restOfAttack.effects = effects.map((effect: any) => {
                      const { id: effectId, ...restOfEffect } = effect;
                      return restOfEffect;
                    });
                  }
                  return restOfAttack;
                });
              }

              if (!id) { // Only for new entries
                const { data: userSession, error: sessionError } = await supabase.auth.getSession();
                if (sessionError || !userSession.session) {
                  throw new Error('User not authenticated. Cannot save monster.');
                }
                dataToSave.created_by = userSession.session.user.id;
              }
            }
            // --- End Transformations ---

            console.log(`[useGameData] Saving entry to ${tableName} (ID: ${id || 'new'}):`, dataToSave);

            let error: any = null;
            let savedData: GameDataEntry | null = null;

            if (id) {
              const { data: updateData, error: updateError } = await supabase
                .from(tableName)
                .update(dataToSave)
                .eq('id', id)
                .select()
                .single();
              error = updateError;
              savedData = updateData as GameDataEntry;
            } else {
              const { data: insertData, error: insertError } = await supabase
                .from(tableName)
                .insert([dataToSave])
                .select()
                .single();
               error = insertError;
               savedData = insertData as GameDataEntry;
            }

            if (error) {
                console.error(`[useGameData] Supabase Save Error (${tableName}):`, error);
                throw error;
            }

            if (!savedData) {
              console.warn(`[useGameData] Save operation for ${category} (ID: ${id || 'new'}) did not return data. Using input data for callback.`);
              // Fallback: use the data we sent, but it won't have DB-generated fields like created_at or a new ID.
              // This situation should ideally not happen if .select().single() is used correctly.
              onSuccess({ ...editingEntry, id: id || (savedData as any)?.id }); // Try to use returned ID if available
            } else {
              console.log(`[useGameData] Save operation successful for ${category} (ID: ${savedData.id})`);
              onSuccess(savedData);
            }
            await loadEntries(category);

          } catch (err: any) {
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
          if (!window.confirm(`Are you sure you want to delete this ${category} entry (ID: ${id})? This action cannot be undone.`)) {
              return;
          }

          let tableName: string = '';
          try {
            setError(null);
            setLoading(true);

            tableName = getTableName(category);
            console.log(`[useGameData] Deleting entry from ${tableName}, ID: ${id}`);

            const { error: deleteError } = await supabase
              .from(tableName)
              .delete()
              .eq('id', id);

            if (deleteError) {
                console.error(`[useGameData] Error deleting from ${tableName}:`, deleteError);
                throw deleteError;
            }

            console.log(`[useGameData] Delete successful for ID: ${id} in ${category}`);
            await loadEntries(category);

          } catch (err: any) {
            const contextName = tableName || category;
            const errorMessage = err?.message || 'An unexpected error occurred during deletion.';
            const errorDetails = err?.details ? ` (Details: ${err.details})` : '';
            const errorCode = err?.code ? ` (Code: ${err.code})` : '';
            const fullErrorMessage = `Error deleting ${contextName}: ${errorMessage}${errorDetails}${errorCode}`;

            console.error(`[useGameData] Error in handleDelete for ${contextName}:`, err);
            setError(fullErrorMessage);
          } finally {
              setLoading(false);
          }
        }, [getTableName, loadEntries]);

        const switchCategory = useCallback((newCategory: DataCategory) => {
          console.log(`[useGameData] Switching category from ${activeCategory} to ${newCategory}`);
          setActiveCategory(newCategory);
          loadEntries(newCategory);
        }, [activeCategory, loadEntries]);

        useEffect(() => {
          console.log(`[useGameData] Initial load effect for category: ${initialCategory}`);
          try {
              getTableName(initialCategory);
              loadEntries(initialCategory);
          } catch (err) {
              console.error(`[useGameData] Invalid initial category: ${initialCategory}`, err);
              setError(`Invalid initial category: ${initialCategory}`);
              setLoading(false);
          }
        }, [initialCategory, getTableName, loadEntries]); // Added loadEntries to dependencies

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
