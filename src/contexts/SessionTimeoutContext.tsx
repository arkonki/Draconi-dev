/* @refresh reset */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { SessionTimeoutContext } from './SessionTimeoutContextStore';
import { isLiveCollaborativePath } from '../lib/realtime/collaborativeRoutes';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const WARNING_DURATION = 30 * 1000; // 30 seconds
const ACTIVITY_CHECK_INTERVAL = 10 * 1000; // Check every 10 seconds

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const lastActivityRef = useRef(Date.now());
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const warningIdRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showWarning, setShowWarning] = useState(false);
  const isCollaborativeRoute = isLiveCollaborativePath(location.pathname);

  const resetTimers = useCallback(() => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    if (warningIdRef.current) clearTimeout(warningIdRef.current);

    lastActivityRef.current = Date.now();

    if (isCollaborativeRoute) {
      setShowWarning(false);
      return;
    }

    warningIdRef.current = setTimeout(() => {
      setShowWarning(true);
    }, TIMEOUT_DURATION - WARNING_DURATION);

    timeoutIdRef.current = setTimeout(async () => {
      await signOut();
      navigate('/login', { 
        state: { message: 'Your session has expired due to inactivity.' }
      });
    }, TIMEOUT_DURATION);

    setShowWarning(false);
  }, [isCollaborativeRoute, signOut, navigate]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'mousemove', 'click', 'touchstart'];
    function debounce<T extends (...args: never[]) => void>(func: T, wait: number) {
      let timeout: ReturnType<typeof setTimeout>;
      return function executedFunction(...args: Parameters<T>) {
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

    const activityCheckInterval = window.setInterval(() => {
      if (isCollaborativeRoute) {
        return;
      }

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
  }, [isCollaborativeRoute, resetTimers, signOut, navigate]);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    if (isCollaborativeRoute) {
      setShowWarning(false);
    } else {
      resetTimers();
    }
  }, [isCollaborativeRoute, resetTimers]);

  return (
    <SessionTimeoutContext.Provider value={{ showWarning, extendSession }}>
      {children}
    </SessionTimeoutContext.Provider>
  );
}
