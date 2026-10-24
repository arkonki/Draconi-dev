import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '../lib/localBackend.types';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginDestination } from '../lib/loginDestination';
import { useApp } from './useApp';
import { signUp as supabaseSignUp, signIn as supabaseSignIn, signOut as supabaseSignOut } from '../lib/auth/auth';
import { AuthContext, VALID_ROLES, type UserRole } from './AuthContextStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Always start true
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setGlobalError } = useApp();

  const fetchUserRole = useCallback(async (userId: string): Promise<UserRole> => {
    try {
      const { data, error } = await supabase.from('users').select('role').eq('id', userId).single();
      if (!error) {
        const tableRole = data?.role;
        if (tableRole && VALID_ROLES.includes(tableRole as UserRole)) {
          return tableRole as UserRole;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userMetaDataRole = sessionData?.session?.user?.user_metadata?.role;
      if (userMetaDataRole && VALID_ROLES.includes(userMetaDataRole as UserRole)) {
        return userMetaDataRole as UserRole;
      }

      if (error) {
        console.error('Error fetching user role from table:', error.message);
      }

      const tableRole = data?.role;
      return (tableRole && VALID_ROLES.includes(tableRole as UserRole)) ? (tableRole as UserRole) : 'player';
    } catch (error) {
      console.error('Unexpected error in fetchUserRole:', error);
      return 'player';
    }
  }, []);

  // Effect 1 & 2 combined: Set up session and auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Let Effect 3 handle the final loading state
    }).catch(error => {
      console.error("Error getting initial session:", error);
      setUser(null);
      setSession(null);
      setIsLoading(false); // Critical error, stop loading
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, sessionData) => {
      setSession(sessionData);
      setUser(sessionData?.user ?? null);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Effect 3: React to user changes to fetch role and finalize loading
  useEffect(() => {
    if (user) {
      fetchUserRole(user.id).then(setRole).finally(() => {
        setIsLoading(false);
      });
    } else {
      // No user, so we are definitely done loading
      setRole(null);
      setIsLoading(false);
    }
  }, [user, fetchUserRole]);

  const handleSignUp = async (
    email: string,
    password: string,
    username: string,
    role: 'player' | 'dm' = 'player'
  ) => {
    try {
      setIsAuthenticating(true);
      setGlobalError(null);
      await supabaseSignUp(email, password, username, role);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Signup failed');
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    try {
      setIsAuthenticating(true);
      setGlobalError(null);
      await supabaseSignIn(email, password);
      navigate(loginDestination(location.state), { replace: true });
    } catch (error) {
      let errorMessage = 'Authentication failed. Please check your credentials.';
      if (error instanceof Error) {
        if (error.message.includes('Invalid login credentials')) errorMessage = 'Incorrect email or password.';
        else if (error.message.includes('Email not confirmed')) errorMessage = 'Please verify your email address before logging in.';
        else if (error.message.includes('network error') || error.message.includes('Failed to fetch')) errorMessage = 'Network error. Please check your connection and try again.';
        else errorMessage = error.message.length > 100 ? 'An unexpected authentication error occurred.' : error.message;
      }
      // The sign-in form offers to resend the confirmation email when the account is not confirmed yet.
      const code = (error as { code?: string } | null)?.code;
      if (code === 'EMAIL_NOT_VERIFIED') errorMessage = 'Confirm your email address first. Check your inbox for the confirmation link.';
      setGlobalError(errorMessage);
      throw Object.assign(new Error(errorMessage), { code });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleUpdateUserPassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) {
      throw new Error('No authenticated user found.');
    }

    try {
      setIsAuthenticating(true);
      setGlobalError(null);

      // The server checks the current password itself, so it cannot be skipped by calling the API directly.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        currentPassword,
      });

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update password.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update password.';
      setGlobalError(message);
      throw new Error(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = useCallback(async () => {
    if (isAuthenticating) return;
    try {
      setIsAuthenticating(true);
      await supabaseSignOut();
      setUser(null);
      setSession(null);
      setRole(null);
      setGlobalError(null);
      navigate('/login');
    } catch (error) {
      console.error('Sign out error:', error);
      setGlobalError('Failed to sign out');
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, navigate, setGlobalError]);

  const isAdmin = () => role === 'admin';
  // Anyone can run or join a campaign, so what a person may do there comes from their role in that campaign
  // (see the campaign_role on a party). These two only describe the legacy account-wide flag; do not use them to gate features.
  /** @deprecated Use the campaign role instead. */
  const isDM = () => role === 'dm' || role === 'admin';
  /** @deprecated Use the campaign role, or ownership of the character, instead. */
  const isPlayer = () => role === 'player';

  const combinedIsLoading = isLoading || isAuthenticating;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isLoading: combinedIsLoading,
        signIn: handleSignIn,
        signUp: handleSignUp,
        updateUserPassword: handleUpdateUserPassword,
        signOut: handleSignOut,
        isAdmin,
        isDM,
        isPlayer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
