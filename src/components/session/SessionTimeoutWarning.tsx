import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { useSessionTimeout } from '../../contexts/SessionTimeoutContext';
import { Button } from '../shared/Button';

export function SessionTimeoutWarning() {
  const { showWarning, extendSession } = useSessionTimeout();

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 rounded-full">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Session Timeout Warning</h3>
            <p className="text-sm text-gray-600">
              Your session will expire in 30 seconds due to inactivity.
            </p>
          </div>
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              Click "Continue Session" to stay logged in, or your session will end automatically.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={extendSession}
          >
            Continue Session
          </Button>
        </div>
      </div>
    </div>
  );
}
