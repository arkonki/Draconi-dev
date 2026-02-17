import { supabase } from '../supabase';
import { User } from '@supabase/supabase-js';

// Define the structure for a Party Task
export interface PartyTask {
  id: string;
  party_id: string;
  created_by_user_id: string | null;
  title: string;
  description: string | null;
  status: 'open' | 'completed';
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // Optional: Include creator's display name if you plan to join user data
  creator_display_name?: string | null;
}

// Define the structure for creating a new task
export interface NewPartyTaskData {
  party_id: string;
  title: string;
  description?: string;
  // created_by_user_id will be derived from the authenticated user
}

// Define the structure for updating a task
export interface PartyTaskUpdateData {
  title?: string;
  description?: string;
  status?: 'open' | 'completed';
}

/**
 * Fetches all tasks for a given party.
 * @param partyId The ID of the party.
 * @returns A promise that resolves to an array of party tasks.
 */
export async function fetchTasks(partyId: string): Promise<PartyTask[]> {
  if (!partyId) {
    console.warn('fetchTasks called without partyId');
    return [];
  }

  const { data, error } = await supabase
    .from('party_tasks')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching tasks:', error);
    throw new Error(error.message || 'Failed to fetch tasks');
  }
  return data || [];
}

/**
 * Creates a new task for a party.
 * @param taskData The data for the new task.
 * @param currentUser The currently authenticated Supabase user.
 * @returns A promise that resolves to the created party task.
 */
export async function createTask(taskData: NewPartyTaskData, currentUser: User | null): Promise<PartyTask> {
  if (!currentUser) {
    throw new Error('User must be authenticated to create a task.');
  }
  if (!taskData.party_id) {
    throw new Error('Party ID is required to create a task.');
  }
  if (!taskData.title || taskData.title.trim() === '') {
    throw new Error('Task title cannot be empty.');
  }

  const { data, error } = await supabase
    .from('party_tasks')
    .insert({
      party_id: taskData.party_id,
      title: taskData.title,
      description: taskData.description,
      created_by_user_id: currentUser.id,
      status: 'open', // Default status
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error);
    throw new Error(error.message || 'Failed to create task');
  }
  if (!data) {
    throw new Error('Task creation did not return data.');
  }
  return data;
}

/**
 * Updates an existing task.
 * @param taskId The ID of the task to update.
 * @param updates The partial data to update the task with.
 * @returns A promise that resolves to the updated party task.
 */
export async function updateTask(taskId: string, updates: PartyTaskUpdateData): Promise<PartyTask> {
  if (!taskId) {
    throw new Error('Task ID is required to update a task.');
  }

  const updatePayload: Record<string, unknown> = { ...updates };

  // If status is being updated, manage completed_at accordingly
  if (updates.status) {
    if (updates.status === 'completed') {
      updatePayload.completed_at = new Date().toISOString();
    } else if (updates.status === 'open') {
      updatePayload.completed_at = null;
    }
  }
  // Ensure updated_at is handled by the trigger, no need to set it here manually

  const { data, error } = await supabase
    .from('party_tasks')
    .update(updatePayload)
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('Error updating task:', error);
    throw new Error(error.message || 'Failed to update task');
  }
  if (!data) {
    throw new Error('Task update did not return data.');
  }
  return data;
}

/**
 * Deletes a task.
 * @param taskId The ID of the task to delete.
 * @returns A promise that resolves when the task is deleted.
 */
export async function deleteTask(taskId: string): Promise<void> {
  if (!taskId) {
    throw new Error('Task ID is required to delete a task.');
  }

  const { error } = await supabase
    .from('party_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Error deleting task:', error);
    throw new Error(error.message || 'Failed to delete task');
  }
}
