import { supabase } from '../supabase';
import { Session, User } from '@supabase/supabase-js';

// REGISTRATION - Refactored to rely on Server-Side Triggers
export async function signUp(email: string, password: string, username: string, role: 'player' | 'dm') {
  // Step 1: Create the authentication user
  // The Postgres Trigger 'on_auth_user_created' will automatically handle 
  // creating the profile in public.users using the metadata provided here.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
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
    console.error('Sign up error (auth):', authError.message);
    throw new Error(`Authentication error: ${authError.message}`);
  }

  if (!authData.user) {
    console.error('Sign up error: User object not returned after sign up.');
    throw new Error('Sign up failed: Could not retrieve user information.');
  }

  // REMOVED: Manual insert into public.users. 
  // This is now handled by the database trigger for better security and reliability.

  return authData.user;
}

// LOGIN
export async function signIn(email: string, password: string): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  // If login is successful, update last_login
  if (data.user) {
    const { error: updateError } = await supabase
      .from('users')
      .update({
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.user.id);

    if (updateError) {
      console.error('Failed to update user timestamps on login:', updateError.message);
    }
  }

  if (!data.session) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    return { user: data.user, session: sessionData.session };
  }

  return { user: data.user, session: data.session };
}

// LOGOUT
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out error:', error.message);
    throw error;
  }
}

// REFRESH SESSION
export async function refreshSession(): Promise<{ session: Session | null; error: unknown }> {
  const { data, error } = await supabase.auth.refreshSession();
  return { session: data.session, error };
}
