import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import { notificationApi, UINotificationState, transformDBToState } from '../lib/api/notifications';

// Define the shape of our Context
interface NotificationContextType {
  settings: UINotificationState | null;
  isLoading: boolean;
  updateSettings: (newSettings: UINotificationState) => Promise<void>;
  playSound: (type: 'dice' | 'notification') => void;
  sendDesktopNotification: (title: string, body: string, type: 'message' | 'invite' | 'session') => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Default fallback settings
const defaultSettings: UINotificationState = {
  email: { newMessage: true, partyInvite: true, sessionScheduled: true, systemUpdates: false },
  desktop: { newMessage: true, partyInvite: true, sessionScheduled: true, diceRolls: true },
  sounds: { enabled: true, volume: 80, diceRolls: true, notifications: true }
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UINotificationState>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Audio Refs (Pre-load sounds to avoid lag)
  const diceAudio = useRef<HTMLAudioElement | null>(null);
  const notifAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize Audio Objects
    diceAudio.current = new Audio('/sounds/dice-roll.mp3');
    notifAudio.current = new Audio('/sounds/notification.mp3');
    
    // Request Desktop Permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Load Settings from DB
  useEffect(() => {
    async function loadSettings() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await notificationApi.getSettings(user.id);
        if (data) {
          setSettings(transformDBToState(data));
        }
      } catch (error) {
        console.error('Error loading notification settings', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [user]);

  // 1. Logic: Update Settings (Saves to DB + Updates Local State)
  const updateSettings = async (newSettings: UINotificationState) => {
    if (!user) return;
    // Optimistic update
    setSettings(newSettings);
    await notificationApi.updateSettings(user.id, newSettings);
  };

  // 2. Logic: Play Sound
  const playSound = (type: 'dice' | 'notification') => {
    if (!settings.sounds.enabled) return; // Master mute

    const volume = settings.sounds.volume / 100; // Convert 0-100 to 0.0-1.0

    if (type === 'dice' && settings.sounds.diceRolls && diceAudio.current) {
      diceAudio.current.volume = volume;
      diceAudio.current.currentTime = 0; // Reset to start
      diceAudio.current.play().catch(e => console.warn("Audio play failed", e));
    }
    
    if (type === 'notification' && settings.sounds.notifications && notifAudio.current) {
      notifAudio.current.volume = volume;
      notifAudio.current.currentTime = 0;
      notifAudio.current.play().catch(e => console.warn("Audio play failed", e));
    }
  };

  // 3. Logic: Desktop Notification (PWA Enhanced)
  const sendDesktopNotification = async (title: string, body: string, type: 'message' | 'invite' | 'session') => {
    // Check Browser Support
    if (!('Notification' in window)) return;

    // Check Permissions
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;

    // Check User Settings
    const shouldSend = 
      (type === 'message' && settings.desktop.newMessage) ||
      (type === 'invite' && settings.desktop.partyInvite) ||
      (type === 'session' && settings.desktop.sessionScheduled);

    if (!shouldSend) return;

    try {
      // Attempt 1: Service Worker (Best for PWA/Mobile)
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        
        // This creates a system notification that works on Android/iOS/Desktop
        await registration.showNotification(title, {
          body: body,
          icon: '/pwa-192x192.png', // Ensure this file exists in public/
          badge: '/pwa-192x192.png', // Small icon for Android status bar
          tag: type, // Grouping tag (prevents spamming if multiple come in at once)
          renotify: true, // Vibrate again even if tag is the same
          data: { url: window.location.href } // Payload for click handling
        });
        return;
      }
    } catch (e) {
      console.warn('Service Worker notification failed, falling back to standard API', e);
    }

    // Attempt 2: Fallback (Standard Desktop Web API)
    // This works for localhost or if SW is not ready
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
