import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { notificationApi, UINotificationState, transformDBToState } from '../lib/api/notifications';
import { pushSubscriptionApi, isPushSupported as detectPushSupport } from '../lib/api/pushSubscriptions';
import {
  DesktopNotificationOptions,
  NotificationContext,
  defaultSettings,
} from './NotificationContextStore';

const ICON_PATH = '/icons/icon-192x192.png';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UINotificationState>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const pushSupported = detectPushSupport();

  const diceAudio = useRef<HTMLAudioElement | null>(null);
  const notifAudio = useRef<HTMLAudioElement | null>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    diceAudio.current = new Audio('/sounds/dice-roll.mp3');
    notifAudio.current = new Audio('/sounds/notification.mp3');
  }, []);

  const refreshPushSubscriptionState = useCallback(async () => {
    if (!pushSupported) {
      setIsPushSubscribed(false);
      return false;
    }

    try {
      const subscription = await pushSubscriptionApi.getBrowserSubscription();
      const subscribed = Boolean(subscription);
      setIsPushSubscribed(subscribed);
      return subscribed;
    } catch (error) {
      console.warn('Failed to inspect push subscription state:', error);
      setIsPushSubscribed(false);
      return false;
    }
  }, [pushSupported]);

  useEffect(() => {
    void refreshPushSubscriptionState();
  }, [refreshPushSubscriptionState]);

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

    void loadSettings();
  }, [user]);

  const updateSettings = async (newSettings: UINotificationState) => {
    if (!user) {
      return;
    }

    setSettings(newSettings);
    await notificationApi.updateSettings(user.id, newSettings);
  };

  const playSound = (type: 'dice' | 'notification') => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.sounds.enabled) {
      return;
    }

    const volume = currentSettings.sounds.volume / 100;

    if (type === 'dice' && currentSettings.sounds.diceRolls && diceAudio.current) {
      diceAudio.current.volume = volume;
      diceAudio.current.currentTime = 0;
      void diceAudio.current.play().catch((error) => console.warn('Audio play failed', error));
    }

    if (type === 'notification' && currentSettings.sounds.notifications && notifAudio.current) {
      notifAudio.current.volume = volume;
      notifAudio.current.currentTime = 0;
      void notifAudio.current.play().catch((error) => console.warn('Audio play failed', error));
    }
  };

  const syncPushSubscription = useCallback(async () => {
    if (!user || !pushSupported) {
      setIsPushSubscribed(false);
      return false;
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') {
      setIsPushSubscribed(false);
      return false;
    }

    const subscription = await pushSubscriptionApi.subscribeCurrentBrowser();
    await pushSubscriptionApi.saveSubscription(user.id, subscription);
    setIsPushSubscribed(true);
    return true;
  }, [pushSupported, user]);

  const unsubscribePushSubscription = useCallback(async () => {
    if (!pushSupported) {
      setIsPushSubscribed(false);
      return;
    }

    try {
      await pushSubscriptionApi.unsubscribeCurrentBrowser();
    } finally {
      setIsPushSubscribed(false);
    }
  }, [pushSupported]);

  useEffect(() => {
    if (!user || !pushSupported) {
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void syncPushSubscription().catch((error) => {
        console.warn('Failed to sync push subscription:', error);
      });
    }
  }, [pushSupported, syncPushSubscription, user]);

  const sendDesktopNotification = async ({
    title,
    body,
    type,
    url,
    tag,
  }: DesktopNotificationOptions) => {
    const currentSettings = settingsRef.current;

    if (!('Notification' in window)) {
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
      if (permission === 'granted') {
        try {
          await syncPushSubscription();
        } catch (error) {
          console.warn('Push subscription setup failed after permission grant:', error);
        }
      }
    }

    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    const shouldSend =
      (type === 'message' && currentSettings.desktop.newMessage) ||
      (type === 'invite' && currentSettings.desktop.partyInvite) ||
      ((type === 'session' || type === 'encounter') && currentSettings.desktop.sessionScheduled);

    if (!shouldSend) {
      return;
    }

    const targetUrl = url || window.location.href;

    try {
      if ('serviceWorker' in navigator) {
        const registration = (await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('SW_TIMEOUT')), 500)),
        ])) as ServiceWorkerRegistration;

        await registration.showNotification(title, {
          body,
          icon: ICON_PATH,
          badge: ICON_PATH,
          tag: tag || type,
          renotify: true,
          data: { url: targetUrl },
        });
        return;
      }
    } catch (error) {
      if (!(error instanceof Error && error.message === 'SW_TIMEOUT')) {
        console.warn('Service Worker notification failed:', error);
      }
    }

    new Notification(title, {
      body,
      icon: ICON_PATH,
      tag: tag || type,
      data: { url: targetUrl },
    });
  };

  return (
    <NotificationContext.Provider
      value={{
        settings,
        isLoading,
        pushSupported,
        isPushSubscribed,
        updateSettings,
        playSound,
        sendDesktopNotification,
        syncPushSubscription,
        unsubscribePushSubscription,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
