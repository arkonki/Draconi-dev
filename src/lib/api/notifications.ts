import { supabase } from '../supabase'; // Adjust path to your supabase client

// 1. EXACT Match of your Database Columns
export interface DBNotificationSettings {
  id: string;
  user_id: string;
  // Email
  email_new_message: boolean;
  email_party_invite: boolean;
  email_session_scheduled: boolean;
  email_system_updates: boolean;
  // Desktop
  desktop_new_message: boolean;
  desktop_party_invite: boolean;
  desktop_session_scheduled: boolean;
  desktop_dice_rolls: boolean;
  // Sound
  sound_enabled: boolean;
  sound_volume: number;
  sound_dice_rolls: boolean;
  sound_notifications: boolean;
  
  created_at: string;
  updated_at: string;
}

// 2. Type Definition for UI State (Unchanged)
export interface UINotificationState {
  email: {
    newMessage: boolean;
    partyInvite: boolean;
    sessionScheduled: boolean;
    systemUpdates: boolean;
  };
  desktop: {
    newMessage: boolean;
    partyInvite: boolean;
    sessionScheduled: boolean;
    diceRolls: boolean;
  };
  sounds: {
    enabled: boolean;
    volume: number;
    diceRolls: boolean;
    notifications: boolean;
  };
}

// 3. Helper: Convert DB Flat Object to UI Nested Object
export function transformDBToState(db: DBNotificationSettings): UINotificationState {
  return {
    email: {
      newMessage: db.email_new_message,
      partyInvite: db.email_party_invite,
      sessionScheduled: db.email_session_scheduled,
      systemUpdates: db.email_system_updates,
    },
    desktop: {
      newMessage: db.desktop_new_message,
      partyInvite: db.desktop_party_invite,
      sessionScheduled: db.desktop_session_scheduled,
      diceRolls: db.desktop_dice_rolls,
    },
    sounds: {
      enabled: db.sound_enabled,
      volume: db.sound_volume,
      diceRolls: db.sound_dice_rolls,
      notifications: db.sound_notifications,
    },
  };
}

// 4. Helper: Convert UI Nested Object to DB Flat Object
export function transformStateToDB(state: UINotificationState, userId: string): Partial<DBNotificationSettings> {
  return {
    user_id: userId,
    // Email
    email_new_message: state.email.newMessage,
    email_party_invite: state.email.partyInvite,
    email_session_scheduled: state.email.sessionScheduled,
    email_system_updates: state.email.systemUpdates,
    // Desktop
    desktop_new_message: state.desktop.newMessage,
    desktop_party_invite: state.desktop.partyInvite,
    desktop_session_scheduled: state.desktop.sessionScheduled,
    desktop_dice_rolls: state.desktop.diceRolls,
    // Sound
    sound_enabled: state.sounds.enabled,
    sound_volume: state.sounds.volume,
    sound_dice_rolls: state.sounds.diceRolls,
    sound_notifications: state.sounds.notifications,
  };
}

// 5. API Functions
export const notificationApi = {
  getSettings: async (userId: string) => {
    const { data, error } = await supabase
      .from('user_notification_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data as DBNotificationSettings | null;
  },

  updateSettings: async (userId: string, settings: UINotificationState) => {
    const dbPayload = transformStateToDB(settings, userId);
    
    // We remove 'id', 'created_at', and 'updated_at' to let Supabase handle them
    const { data, error } = await supabase
      .from('user_notification_settings')
      .upsert(dbPayload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return data as DBNotificationSettings;
  }
};
