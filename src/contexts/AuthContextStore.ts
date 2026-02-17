import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'player' | 'dm' | 'admin';

export const VALID_ROLES: UserRole[] = ['player', 'dm', 'admin'];

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, role?: 'player' | 'dm') => Promise<void>;
  updateUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: () => boolean;
  isDM: () => boolean;
  isPlayer: () => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
