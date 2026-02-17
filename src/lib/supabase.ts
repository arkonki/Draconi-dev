import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file configuration.');
}

// Configure retry options
const retryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  retryCondition: (err: unknown) => {
    const errorObj = typeof err === 'object' && err !== null
      ? (err as { status?: unknown; message?: unknown })
      : null;
    const status = typeof errorObj?.status === 'number' ? errorObj.status : undefined;
    const message = typeof errorObj?.message === 'string' ? errorObj.message : '';
    return (
      status === 500 || 
      status === 503 ||
      status === 504 ||
      status === 429 ||
      message.includes('Database error') ||
      message.includes('unexpected_failure') ||
      message.includes('schema') ||
      message.includes('network') ||
      message.includes('timeout')
    );
  }
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'dragonbane_auth',
    flowType: 'implicit'
  },
  global: {
    headers: {
      'X-Client-Info': 'dragonbane-character-manager'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  maxRetries: retryConfig.maxRetries,
  retryDelay: retryConfig.retryDelay,
  retryCondition: retryConfig.retryCondition
});

// Add auth state change listener with error handling
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'USER_DELETED' || event === 'SIGNED_OUT') {
    console.log('Auth event:', event);
  }
  
  if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed successfully');
  }
  
  // Handle any auth errors
  if (event === 'SIGNED_OUT' && !session) {
    console.error('Auth error: Session ended unexpectedly');
  }
});

// Add error handling for network issues
window.addEventListener('online', () => {
  supabase.auth.startAutoRefresh();
});

window.addEventListener('offline', () => {
  supabase.auth.stopAutoRefresh();
});

// Add health check function
export async function checkSupabaseConnection() {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });

  try {
    await Promise.race([
      supabase.auth.getSession(),
      timeout
    ]);
    return true;
  } catch (err) {
    console.error('Supabase connection check failed:', err);
    return false;
  }
}
