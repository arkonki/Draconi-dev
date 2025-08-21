import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
// Ensure only Supabase auth functions are imported
import { signUp as supabaseSignUp, signIn as supabaseSignIn, signOut as supabaseSignOut } from '../lib/auth/auth';

type UserRole = 'player' | 'dm' | 'admin';
const VALID_ROLES: UserRole[] = ['player', 'dm', 'admin'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, role: 'player' | 'dm') => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: () => boolean;
  isDM: () => boolean;
  isPlayer: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  // isLoading tracks initial session check and role fetching
  const [isLoading, setIsLoading] = useState(true);
  // isAuthenticating tracks the sign-in/sign-up/sign-out process itself
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const navigate = useNavigate();
  const { setGlobalError } = useApp();

  // Fetch user role, prioritizing metadata, then falling back to the 'users' table.
  const fetchUserRole = useCallback(async (userId: string): Promise<UserRole> => {
    try {
      // 1. Check auth metadata first
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        // Log internally or to a service if needed, but don't block flow
        console.error("[fetchUserRole] Error getting session for metadata check:", sessionError.message);
      } else {
        const userMetaDataRole = sessionData?.session?.user?.user_metadata?.role;
        if (userMetaDataRole && VALID_ROLES.includes(userMetaDataRole as UserRole)) {
            return userMetaDataRole as UserRole;
        }
      }

      // 2. Fallback: Fetch from 'users' table
      const { data, error, status } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) {
        // Handle specific errors gracefully
        if (error.code === 'PGRST116' || status === 404) {
          // User profile doesn't exist yet, default to player
          return 'player';
        }
         if (status === 401 || status === 403) {
            // Permission issue, likely RLS. Default to player and notify.
            setGlobalError('Permission issue accessing user data. Please contact support if this persists.');
            return 'player';
         }
        // Log other DB errors and default
        console.error('[fetchUserRole] Database error fetching role from table:', error);
        setGlobalError('Failed to retrieve user role data due to a database error.');
        return 'player';
      }

      // 3. Process successful result from 'users' table
      const tableRole = data?.role;
      if (tableRole && VALID_ROLES.includes(tableRole as UserRole)) {
        return tableRole as UserRole;
      } else {
         // Role missing or invalid in table, default to player
        return 'player';
      }

    } catch (error) {
      console.error('[fetchUserRole] Unexpected error during role fetch process:', error);
      setGlobalError('Failed to determine user role due to an unexpected error.');
      return 'player'; // Default role on unexpected errors
    }
  }, [setGlobalError]); // supabase is stable

  // Effect 1: Initialize session on mount
  useEffect(() => {
    setIsLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Role will be fetched by the user effect below
      if (!session?.user) {
        setIsLoading(false); // Stop loading only if no user initially
      }
    }).catch(error => {
      console.error("Error getting initial session:", error);
      setGlobalError("Failed to initialize user session.");
      setSession(null);
      setUser(null);
      setRole(null);
      setIsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Effect 2: Listen for auth state changes
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, sessionData) => {
      const currentUser = sessionData?.user ?? null;
      setSession(sessionData);
      setUser(currentUser); // Triggers role fetching effect

      if (event === 'SIGNED_OUT') {
        setRole(null);
        setIsLoading(false); // Ensure loading stops on sign out
        setGlobalError(null);
        navigate('/login');
      }
      // Navigate on successful sign-in if currently on login page
      else if (event === 'SIGNED_IN' && window.location.pathname === '/login' && currentUser) {
        navigate('/');
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, setGlobalError]); // Dependencies

  // Effect 3: Fetch role when user changes
  useEffect(() => {
    if (user) {
      // Only set loading true if it's not already (e.g., during initial load)
      if (!isLoading) setIsLoading(true);
      fetchUserRole(user.id)
        .then(fetchedRole => {
          setRole(fetchedRole);
        })
        .catch(error => {
          // Error already logged in fetchUserRole
          setRole('player'); // Default role on error
          // setGlobalError("Failed to fetch user role."); // Already set in fetchUserRole
        })
        .finally(() => {
          setIsLoading(false); // Stop loading after role fetch attempt
        });
    } else {
      // User is null (signed out or initial state)
      setRole(null);
      // If isLoading was true (e.g., initial check ongoing when sign out happens), set it false.
      if (isLoading) setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fetchUserRole]); // Depend on user and fetchUserRole


  // Sign Up handler
  const handleSignUp = async (email: string, password: string, username: string, role: 'player' | 'dm') => {
    try {
      setIsAuthenticating(true);
      setGlobalError(null);
      await supabaseSignUp(email, password, username, role);
      // Success message handled in Register component
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Signup failed');
      throw error; // Re-throw for the component to handle
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Sign In handler
  const handleSignIn = async (email: string, password: string) => {
    try {
      setIsAuthenticating(true);
      setGlobalError(null);
      await supabaseSignIn(email, password);
      // Auth listener handles state updates and navigation
    } catch (error) {
      let errorMessage = 'Authentication failed. Please check your credentials.';
       if (error instanceof Error) {
           if (error.message.includes('Invalid login credentials')) {
               errorMessage = 'Incorrect email or password.';
           } else if (error.message.includes('Email not confirmed')) {
               errorMessage = 'Please verify your email address before logging in.';
           } else if (error.message.includes('network error') || error.message.includes('Failed to fetch')) {
               errorMessage = 'Network error. Please check your connection and try again.';
           } else {
               errorMessage = error.message.length > 100 ? 'An unexpected authentication error occurred.' : error.message;
           }
       }
      setGlobalError(errorMessage);
      throw new Error(errorMessage); // Re-throw for the component
    } finally {
      setIsAuthenticating(false); // Stop auth loading indicator
    }
  };

  // Sign Out handler
  const handleSignOut = useCallback(async () => {
    if (isAuthenticating) return; // Prevent sign-out during other auth actions
    try {
      setIsAuthenticating(true);
      await supabaseSignOut();
      // Listener handles state clearing and navigation
    } catch (error) {
      console.error('Sign out error:', error); // Keep this log for critical failure
      setGlobalError('Failed to sign out');
    } finally {
      setIsAuthenticating(false);
    }
  }, [setGlobalError, isAuthenticating]);

  // Helper functions for role checks
  const isAdmin = () => role === 'admin';
  const isDM = () => role === 'dm' || role === 'admin';
  const isPlayer = () => role === 'player';

  // Combine loading states for the context value
  // isLoading covers initial load and role fetch
  // isAuthenticating covers active sign-in/up/out operations
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
