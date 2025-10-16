// src/lib/api/storyIdeas.ts
import { supabase } from '../supabase';

export interface StoryIdea {
  id: string;
  created_at: string;
  prompt: string;
  response: string;
  context: {
    party: string;
    location: string;
    npc: string;
  };
}

// Fetch all saved ideas for a specific party
export const getStoryIdeasForParty = async (partyId: string): Promise<StoryIdea[]> => {
  const { data, error } = await supabase
    .from('story_ideas')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
};

// Save a new story idea
export const saveStoryIdea = async (ideaData: Omit<StoryIdea, 'id' | 'created_at'> & { party_id: string; user_id: string }) => {
  const { data, error } = await supabase.from('story_ideas').insert([ideaData]).select();
  if (error) throw new Error(error.message);
  return data;
};

// Add this function to your existing storyIdeas.ts file

export const updateStoryIdea = async (
  ideaId: string,
  updates: { response: string }
) => {
  const { data, error } = await supabase
    .from('story_ideas')
    .update(updates)
    .eq('id', ideaId)
    .select(); // .select() returns the updated record

  if (error) throw new Error(error.message);
  return data;
};

// Delete a story idea
export const deleteStoryIdea = async (ideaId: string) => {
  const { error } = await supabase.from('story_ideas').delete().eq('id', ideaId);
  if (error) throw new Error(error.message);
};
