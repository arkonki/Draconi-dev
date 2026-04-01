import { createContext } from 'react';
import type { UINotificationState } from '../lib/api/notifications';

export interface DesktopNotificationOptions {
  title: string;
  body: string;
  type: 'message' | 'invite' | 'session' | 'encounter';
  url?: string;
  tag?: string;
}

export interface NotificationContextType {
  settings: UINotificationState | null;
  isLoading: boolean;
  pushSupported: boolean;
  isPushSubscribed: boolean;
  updateSettings: (newSettings: UINotificationState) => Promise<void>;
  playSound: (type: 'dice' | 'notification') => void;
  sendDesktopNotification: (options: DesktopNotificationOptions) => Promise<void>;
  syncPushSubscription: () => Promise<boolean>;
  unsubscribePushSubscription: () => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const defaultSettings: UINotificationState = {
  email: { newMessage: true, partyInvite: true, sessionScheduled: true, systemUpdates: false },
  desktop: { newMessage: true, partyInvite: true, sessionScheduled: true, diceRolls: true },
  sounds: { enabled: true, volume: 80, diceRolls: true, notifications: true },
};
