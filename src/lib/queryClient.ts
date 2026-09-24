import { QueryClient } from '@tanstack/react-query';
import { QUERY_STALE_TIME } from './queryKeys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME.standard,
      gcTime: 15 * 60_000,
      // Collaborative screens reconcile through the shared realtime transport.
      // Refetching every mounted query on each focus caused synchronized bursts
      // when several players returned to the app at the same time.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
