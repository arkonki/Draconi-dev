import React, { createContext, useContext, useMemo, useState } from 'react';

export type LiveSyncStatus = 'healthy' | 'reconnecting' | 'degraded';

interface LiveSyncContextValue {
  getScopeStatus: (scope: string | null) => LiveSyncStatus;
  setChannelStatus: (scope: string, channelKey: string, status: LiveSyncStatus) => void;
  clearChannelStatus: (scope: string, channelKey: string) => void;
}

const STATUS_PRIORITY: Record<LiveSyncStatus, number> = {
  healthy: 0,
  reconnecting: 1,
  degraded: 2,
};

const LiveSyncContext = createContext<LiveSyncContextValue | undefined>(undefined);

export function LiveSyncProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Record<string, Record<string, LiveSyncStatus>>>({});

  const value = useMemo<LiveSyncContextValue>(() => ({
    getScopeStatus: (scope) => {
      if (!scope || !statuses[scope]) {
        return 'healthy';
      }

      return Object.values(statuses[scope]).reduce<LiveSyncStatus>((worst, current) => (
        STATUS_PRIORITY[current] > STATUS_PRIORITY[worst] ? current : worst
      ), 'healthy');
    },
    setChannelStatus: (scope, channelKey, status) => {
      setStatuses((current) => {
        const existingScope = current[scope] || {};
        if (existingScope[channelKey] === status) {
          return current;
        }

        return {
          ...current,
          [scope]: {
            ...existingScope,
            [channelKey]: status,
          },
        };
      });
    },
    clearChannelStatus: (scope, channelKey) => {
      setStatuses((current) => {
        const existingScope = current[scope];
        if (!existingScope || !existingScope[channelKey]) {
          return current;
        }

        const nextScope = { ...existingScope };
        delete nextScope[channelKey];

        if (Object.keys(nextScope).length === 0) {
          const next = { ...current };
          delete next[scope];
          return next;
        }

        return {
          ...current,
          [scope]: nextScope,
        };
      });
    },
  }), [statuses]);

  return (
    <LiveSyncContext.Provider value={value}>
      {children}
    </LiveSyncContext.Provider>
  );
}

export function useLiveSync() {
  const context = useContext(LiveSyncContext);
  if (!context) {
    throw new Error('useLiveSync must be used within a LiveSyncProvider');
  }

  return context;
}
