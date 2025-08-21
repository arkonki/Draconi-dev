import { supabase } from '../supabase';
import { User } from '@supabase/supabase-js';

// Define the structure of the user profile data from the public.users table
export interface UserProfile {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  // Add other fields from public.users if needed elsewhere
}

// Type for data used in updates (excluding id, email, etc.)
export type UserProfileUpdate = Omit<Partial<UserProfile>, 'id'>;


/**
 * Fetches the user's profile from the public.users table.
 * @param userId The ID of the user whose profile to fetch.
 * @returns The user profile data or null if not found/error.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) {
    console.error("getUserProfile: No user ID provided.");
    return null;
  }

  try {
    const { data, error, status } = await supabase
      .from('users')
      .select('id, username, first_name, last_name, avatar_url, bio')
      .eq('id', userId)
      .single(); // Use single() as ID should be unique

    if (error) {
      // Handle case where profile might not exist yet (e.g., right after signup)
      if (status === 406 || error.code === 'PGRST116') {
        console.warn(`No profile found for user ID: ${userId}. This might be expected.`);
        return null; // Return null, the component can handle this
      }
      // Log other errors
      console.error('Error fetching user profile:', error.message);
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }

    return data as UserProfile; // Cast because select() narrows the type

  } catch (err) {
     // Catch potential network or unexpected errors
     console.error("Unexpected error in getUserProfile:", err);
     if (err instanceof Error) {
       throw err; // Re-throw the caught error
     } else {
       throw new Error("An unknown error occurred while fetching the user profile.");
     }
  }
}

/**
 * Updates the user's profile in the public.users table.
 * Does NOT handle email changes (use supabase.auth.updateUser for that).
 * @param userId The ID of the user whose profile to update.
 * @param updates An object containing the fields to update.
 * @returns The updated user profile data.
 */
export async function updateUserProfile(userId: string, updates: UserProfileUpdate): Promise<UserProfile> {
   if (!userId) {
     throw new Error("updateUserProfile: No user ID provided.");
   }
   if (!updates || Object.keys(updates).length === 0) {
     throw new Error("updateUserProfile: No updates provided.");
   }

   // Ensure we don't try to update forbidden fields like 'id' or 'email' here
   const allowedUpdates: UserProfileUpdate = {
       username: updates.username,
       first_name: updates.first_name,
       last_name: updates.last_name,
       avatar_url: updates.avatar_url,
       bio: updates.bio,
       // Add other allowed fields here if necessary
   };

   // Remove undefined fields to avoid overwriting with null in Supabase
   Object.keys(allowedUpdates).forEach(key => {
       const typedKey = key as keyof UserProfileUpdate;
       if (allowedUpdates[typedKey] === undefined) {
           delete allowedUpdates[typedKey];
       }
       // Also remove empty strings for optional fields if desired, to store NULL instead
       // Example: if (allowedUpdates[typedKey] === '') delete allowedUpdates[typedKey];
   });


   if (Object.keys(allowedUpdates).length === 0) {
       console.warn("updateUserProfile: No valid fields to update after filtering.");
       // Optionally, fetch and return the current profile instead of throwing an error
       const currentProfile = await getUserProfile(userId);
       if (!currentProfile) throw new Error("Could not retrieve current profile after filtering updates.");
       return currentProfile;}


  try {
    const { data, error } = await supabase
      .from('users')
      .update({
          ...allowedUpdates,
          updated_at: new Date().toISOString(), // Manually update timestamp
      })
      .eq('id', userId)
      .select('id, username, first_name, last_name, avatar_url, bio') // Select the fields we care about
      .single(); // Expecting a single row back

    if (error) {
      console.error('Error updating user profile:', error.message);
      // Add more specific error handling if needed (e.g., unique constraint violation on username)
      if (error.code === '23505') { // Unique violation
          // Try to determine which field caused the violation (might require parsing error.details)
          if (error.message.includes('users_username_key')) {
              throw new Error(`Failed to update profile: Username '${allowedUpdates.username}' is already taken.`);
          }
          throw new Error(`Failed to update profile: ${error.details || 'A unique value constraint was violated.'}`);
      }
      throw new Error(`Failed to update user profile: ${error.message}`);
    }

    if (!data) {
        throw new Error("Failed to update user profile: No data returned.");
    }

    return data as UserProfile;

  } catch (err) {
     console.error("Unexpected error in updateUserProfile:", err);
     if (err instanceof Error) {
       throw err; // Re-throw the caught error
     } else {
       throw new Error("An unknown error occurred while updating the user profile.");
     }
  }
}

/**
 * Updates the user's authentication email.
 * This triggers Supabase's email change verification flow.
 * @param newEmail The new email address.
 */
export async function updateUserAuthEmail(newEmail: string): Promise<void> {
    if (!newEmail) {
        throw new Error("updateUserAuthEmail: No new email provided.");
    }

    // Basic email format validation (consider a more robust library if needed)
    if (!/\S+@\S+\.\S+/.test(newEmail)) {
        throw new Error("updateUserAuthEmail: Invalid email format provided.");
    }

    try {
        // Note: Supabase handles checking if the email is already in use by another user.
        const { data, error } = await supabase.auth.updateUser(
            { email: newEmail },
            // Optionally add emailRedirectTo if you want to control where the verification link sends the user
            // { emailRedirectTo: 'https://your-app.com/profile-settings' }
        );

        if (error) {
            console.error('Error updating user auth email:', error.message);
            // Provide more user-friendly messages for common errors
            if (error.message.includes('User not found') || error.status === 404) {
                 throw new Error("Failed to initiate email update: Could not find the current user.");
            } else if (error.message.includes('Email rate limit exceeded')) {
                 throw new Error("Failed to initiate email update: Please wait before trying again.");
            } else if (error.message.includes('same as the existing email')) {
                 throw new Error("The new email address is the same as the current one.");
            }
            // Default error
            throw new Error(`Failed to initiate email update: ${error.message}`);
        }

        // Important: Inform the user they need to check both old and new email inboxes
        // for verification links. The actual email change completes upon verification.
        console.log("User auth email update initiated. Verification required.", data);
        // Consider showing a persistent message to the user in the UI.

    } catch (err) {
        console.error("Unexpected error in updateUserAuthEmail:", err);
        if (err instanceof Error) {
            throw err; // Re-throw the caught error
        } else {
            throw new Error("An unknown error occurred while updating the user's email.");
        }
    }
}
