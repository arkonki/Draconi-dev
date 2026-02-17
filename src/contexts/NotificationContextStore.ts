import { createContext } from 'react';
import type { UINotificationState } from '../lib/api/notifications';

export interface NotificationContextType {
  settings: UINotificationState | null;
  isLoading: boolean;
  updateSettings: (newSettings: UINotificationState) => Promise<void>;
  playSound: (type: 'dice' | 'notification') => void;
  sendDesktopNotification: (title: string, body: string, type: 'message' | 'invite' | 'session') => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const defaultSettings: UINotificationState = {
  email: { newMessage: true, partyInvite: true, sessionScheduled: true, systemUpdates: false },
  desktop: { newMessage: true, partyInvite: true, sessionScheduled: true, diceRolls: true },
  sounds: { enabled: true, volume: 80, diceRolls: true, notifications: true },
};
