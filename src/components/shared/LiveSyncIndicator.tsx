import { RefreshCw, WifiOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useLiveSync } from '../../contexts/LiveSyncContext';
import { getCollaborativeScope } from '../../lib/realtime/collaborativeRoutes';

export function LiveSyncIndicator() {
  const location = useLocation();
  const { getScopeStatus } = useLiveSync();
  const scope = getCollaborativeScope(location.pathname);
  const status = getScopeStatus(scope);

  if (!scope || status === 'healthy') {
    return null;
  }

  const isDegraded = status === 'degraded';

  return (
    <div className="fixed bottom-4 right-4 z-[85]">
      <div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-sm ${
        isDegraded
          ? 'border-amber-300/40 bg-amber-500/15 text-amber-50'
          : 'border-sky-300/35 bg-sky-500/15 text-sky-50'
      }`}>
        {isDegraded ? <WifiOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4 animate-spin" />}
        <span>{isDegraded ? 'Live sync delayed' : 'Reconnecting live sync...'}</span>
      </div>
    </div>
  );
}
