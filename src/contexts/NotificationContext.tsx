import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import { notificationApi, UINotificationState, transformDBToState } from '../lib/api/notifications';

interface NotificationContextType {
  settings: UINotificationState | null;
  isLoading: boolean;
  updateSettings: (newSettings: UINotificationState) => Promise<void>;
  playSound: (type: 'dice' | 'notification') => void;
  sendDesktopNotification: (title: string, body: string, type: 'message' | 'invite' | 'session') => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const defaultSettings: UINotificationState = {
  email: { newMessage: true, partyInvite: true, sessionScheduled: true, systemUpdates: false },
  desktop: { newMessage: true, partyInvite: true, sessionScheduled: true, diceRolls: true },
  sounds: { enabled: true, volume: 80, diceRolls: true, notifications: true }
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UINotificationState>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Audio Refs
  const diceAudio = useRef<HTMLAudioElement | null>(null);
  const notifAudio = useRef<HTMLAudioElement | null>(null);

  // Keep a ref to settings to access latest value inside closures/effects without dependency issues
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    diceAudio.current = new Audio('/sounds/dice-roll.mp3');
    notifAudio.current = new Audio('/sounds/notification.mp3');
  }, []);

  useEffect(() => {
    async function loadSettings() {
      if (!user) { setIsLoading(false); return; }
      try {
        const data = await notificationApi.getSettings(user.id);
        if (data) setSettings(transformDBToState(data));
      } catch (error) {
        console.error('Error loading notification settings', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [user]);

  const updateSettings = async (newSettings: UINotificationState) => {
    if (!user) return;
    setSettings(newSettings);
    await notificationApi.updateSettings(user.id, newSettings);
  };

  const playSound = (type: 'dice' | 'notification') => {
    const currentSettings = settingsRef.current; // Use Ref for latest state
    if (!currentSettings.sounds.enabled) return;

    const volume = currentSettings.sounds.volume / 100;

    if (type === 'dice' && currentSettings.sounds.diceRolls && diceAudio.current) {
      diceAudio.current.volume = volume;
      diceAudio.current.currentTime = 0;
      diceAudio.current.play().catch(e => console.warn("Audio play failed", e));
    }
    
    if (type === 'notification' && currentSettings.sounds.notifications && notifAudio.current) {
      notifAudio.current.volume = volume;
      notifAudio.current.currentTime = 0;
      notifAudio.current.play().catch(e => console.warn("Audio play failed", e));
    }
  };

  const sendDesktopNotification = async (title: string, body: string, type: 'message' | 'invite' | 'session') => {
    const currentSettings = settingsRef.current;
    
    // 1. Browser Check
    if (!('Notification' in window)) return;

    // 2. Permission Check
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      console.warn("Notification permission not granted");
      return;
    }

    // 3. Settings Check
    const shouldSend = 
      (type === 'message' && currentSettings.desktop.newMessage) ||
      (type === 'invite' && currentSettings.desktop.partyInvite) ||
      (type === 'session' && currentSettings.desktop.sessionScheduled);

    if (!shouldSend) return;

    // 4. Send Notification (with Fallback)
    try {
      if ('serviceWorker' in navigator) {
        // TIMEOUT RACE: If SW isn't ready in 500ms, use standard notification
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject('SW_TIMEOUT'), 500))
        ]) as ServiceWorkerRegistration;

        await registration.showNotification(title, {
          body: body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: type,
          renotify: true,
          data: { url: window.location.href }
        });
        return;
      }
    } catch (e) {
      // Fall through to standard notification
      if (e !== 'SW_TIMEOUT') console.warn('Service Worker notification failed:', e);
    }

    // Fallback: Standard Web API
    new Notification(title, { 
      body, 
      icon: '/pwa-192x192.png' 
    });
  };

  return (
    <NotificationContext.Provider value={{ settings, isLoading, updateSettings, playSound, sendDesktopNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
