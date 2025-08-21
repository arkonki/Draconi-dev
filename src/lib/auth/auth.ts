import { supabase } from '../supabase';
import { Session, User } from '@supabase/supabase-js';

// REGISTRATION - Updated to accept role and insert into public.users
export async function signUp(email: string, password: string, username: string, role: 'player' | 'dm') {
  // Step 1: Create the authentication user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Store username and role in metadata temporarily if needed,
      // but primary storage will be in public.users
      data: {
        username: username.trim(),
        role: role
      }
    }
  });

  if (authError) {
    if (authError.message.includes('User already registered')) {
        throw new Error('An account with this email already exists.');
    }
    // Log the error internally if needed, but throw a user-friendly one
    console.error('Sign up error (auth):', authError.message);
    throw new Error(`Authentication error: ${authError.message}`);
  }

  if (!authData.user) {
    // This case should ideally not happen if authError is null, but good to check
    console.error('Sign up error: User object not returned after sign up.');
    throw new Error('Sign up failed: Could not retrieve user information.');
  }

  // Step 2: Insert into public.users table
  // Assumes RLS policies allow this insert (e.g., via security definer function or direct policy)
  const { error: profileError } = await supabase
    .from('users') // Ensure this matches your public users table name
    .insert({
      id: authData.user.id, // Link to the auth.users id
      username: username.trim(),
      role: role,
      email: email // Optionally store email here too if needed
    });

  if (profileError) {
    // Log the detailed error internally
    console.error('Sign up error (profile creation):', profileError.message);
    // Optional: Attempt to clean up the auth user if profile creation fails?
    // This is complex and requires admin privileges. For now, informthe user.
    // await supabase.auth.admin.deleteUser(authData.user.id); // Requires admin privileges
    throw new Error(`Account created, but failed to set up user profile: ${profileError.message}. Please contact support.`);
  }

  // Note: User still needs email verification.
  return authData.user;
}

// LOGIN
export async function signIn(email: string, password: string): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Log internally if needed
    // console.error('Sign in error:', error.message);
    throw error; // Re-throw the original Supabase error
  }

  // If login is successful, update last_login and updated_at timestamps
  if (data.user) {
    const { error: updateError } = await supabase
      .from('users')
      .update({
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.user.id);

    if (updateError) {
      // This is a non-critical error. We log it for monitoring but don't
      // want to fail the entire login process if it fails.
      console.error('Failed to update user timestamps on login:', updateError.message);
    }
  }

  // Handle edge case where session might be missing immediately after sign-in
  if (!data.session) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      // Log internally if needed
      // console.error('Error fetching session after sign in:', sessionError.message);
      throw sessionError; // Throw if session fetch fails
    }
    return { user: data.user, session: sessionData.session };
  }

  return { user: data.user, session: data.session };
}

// LOGOUT
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    // Log internally for monitoring critical failures
    console.error('Sign out error:', error.message);
    throw error; // Re-throw to be caught by AuthContext
  }
}

// REFRESH SESSION (Optional, Supabase client often handles this)
export async function refreshSession(): Promise<{ session: Session | null; error: any }> {
  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    // Log internally if needed
    // console.error('Session refresh error:', error.message);
  }

  return { session: data.session, error };
}
