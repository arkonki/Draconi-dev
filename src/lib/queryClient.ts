import { QueryClient } from '@tanstack/react-query';

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduced from 5 minutes to 1 minute. 
      // Realtime subscriptions will handle immediate updates, 
      // but this ensures data doesn't get too stale if a socket drops.
      staleTime: 1000 * 60 * 1, 
      refetchOnWindowFocus: true, // Re-enabled to ensure freshness when switching tabs
      retry: 1,
    },
  },
});
