/* @refresh reset */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

interface SessionTimeoutContextType {
  showWarning: boolean;
  extendSession: () => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | undefined>(undefined);

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const WARNING_DURATION = 30 * 1000; // 30 seconds
const ACTIVITY_CHECK_INTERVAL = 10 * 1000; // Check every 10 seconds

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  
  const lastActivityRef = useRef(Date.now());
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const warningIdRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showWarning, setShowWarning] = useState(false);

  const resetTimers = useCallback(() => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    if (warningIdRef.current) clearTimeout(warningIdRef.current);

    warningIdRef.current = setTimeout(() => {
      setShowWarning(true);
    }, TIMEOUT_DURATION - WARNING_DURATION);

    timeoutIdRef.current = setTimeout(async () => {
      await signOut();
      navigate('/login', { 
        state: { message: 'Your session has expired due to inactivity.' }
      });
    }, TIMEOUT_DURATION);

    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, [signOut, navigate]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'mousemove', 'click', 'touchstart'];
    let activityCheckInterval: ReturnType<typeof setInterval>;

    function debounce(func: Function, wait: number) {
      let timeout: NodeJS.Timeout;
      return function executedFunction(...args: any[]) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    const handleActivity = debounce(() => {
      if (Date.now() - lastActivityRef.current > 1000) {
        resetTimers();
      }
    }, 1000);

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    activityCheckInterval = window.setInterval(() => {
      const inactiveTime = Date.now() - lastActivityRef.current;
      
      if (inactiveTime >= TIMEOUT_DURATION - WARNING_DURATION) {
        setShowWarning(true);
      }
      
      if (inactiveTime >= TIMEOUT_DURATION) {
        signOut();
        navigate('/login', { 
          state: { message: 'Your session has expired due to inactivity.' }
        });
      }
    }, ACTIVITY_CHECK_INTERVAL);

    resetTimers();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      if (warningIdRef.current) clearTimeout(warningIdRef.current);
      window.clearInterval(activityCheckInterval);
    };
  }, [resetTimers, signOut, navigate]);

  return (
    <SessionTimeoutContext.Provider value={{ showWarning, extendSession }}>
      {children}
    </SessionTimeoutContext.Provider>
  );
}

export function useSessionTimeout() {
  const context = useContext(SessionTimeoutContext);
  if (context === undefined) {
    throw new Error('useSessionTimeout must be used within a SessionTimeoutProvider');
  }
  return context;
}
