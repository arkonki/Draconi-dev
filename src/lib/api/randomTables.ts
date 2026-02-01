import { supabase } from '../supabase';
import type { RandomTable } from '../../types/randomTable';

export async function fetchRandomTables(partyId: string): Promise<RandomTable[]> {
    const { data, error } = await supabase
        .from('random_tables')
        .select('*')
        .eq('party_id', partyId)
        .order('name');

    if (error) {
        console.error('Error fetching random tables:', error);
        throw error;
    }
    return (data as unknown as RandomTable[]) || [];
}

export async function createRandomTable(table: Omit<RandomTable, 'id' | 'created_at' | 'updated_at'>): Promise<RandomTable> {
    const { data, error } = await supabase
        .from('random_tables')
        .insert(table as any)
        .select()
        .single();

    if (error) throw error;
    return data as unknown as RandomTable;
}

export async function updateRandomTable(id: string, updates: Partial<RandomTable>): Promise<RandomTable> {
    const { data, error } = await supabase
        .from('random_tables')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data as unknown as RandomTable;
}

export async function deleteRandomTable(id: string): Promise<void> {
    const { error } = await supabase
        .from('random_tables')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
