```markdown
# Implementing Notification Configuration

This document outlines the steps required to make the notification settings in `NotificationSettings.tsx` fully functional, allowing users to save and load their preferences.

## Phase 1: Configuration Persistence

This phase focuses on enabling users to save their notification preferences and have them loaded when they visit the settings page.

### 1. Database Setup (Supabase)

We need a new table in Supabase to store user-specific notification preferences.

**Table Name:** `user_notification_settings`

**Columns:**

*   `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
*   `user_id`: `uuid` (Foreign Key referencing `auth.users.id`, UNIQUE, NOT NULL). This ensures each user has only one row of settings.
*   `created_at`: `timestamptz` (Default: `now()`, NOT NULL)
*   `updated_at`: `timestamptz` (Default: `now()`, NOT NULL)

*   **Email Notifications:**
    *   `email_new_message_enabled`: `boolean` (Default: `true`)
    *   `email_party_invite_enabled`: `boolean` (Default: `true`)
    *   `email_session_scheduled_enabled`: `boolean` (Default: `true`)
    *   `email_system_updates_enabled`: `boolean` (Default: `false`)

*   **Desktop Notifications:**
    *   `desktop_new_message_enabled`: `boolean` (Default: `true`)
    *   `desktop_party_invite_enabled`: `boolean` (Default: `true`)
    *   `desktop_session_scheduled_enabled`: `boolean` (Default: `true`)
    *   `desktop_dice_rolls_enabled`: `boolean` (Default: `true`)

*   **Sound Settings:**
    *   `sound_enabled`: `boolean` (Default: `true`)
    *   `sound_volume`: `integer` (Default: `80`, Constraints: `0-100`)
    *   `sound_dice_rolls_enabled`: `boolean` (Default: `true`)
    *   `sound_notifications_enabled`: `boolean` (Default: `true`)

**Row Level Security (RLS):**

*   Enable RLS on the `user_notification_settings` table.
*   **Policy 1: Users can manage their own settings.**
    *   `FOR ALL`
    *   `TO authenticated`
    *   `USING (auth.uid() = user_id)`
    *   `WITH CHECK (auth.uid() = user_id)`
*   **Policy 2 (Optional but good practice): Admins can view all settings (if needed for support).**
    *   `FOR SELECT`
    *   `TO authenticated`
    *   `USING (SELECT is_admin FROM public.users WHERE id = auth.uid())` - *This assumes you have an `is_admin` column or similar role check in your `public.users` table.*

**Indexes:**

*   Create an index on `user_id` for faster lookups.

### 2. API Layer

Create a new file `src/lib/api/notificationSettings.ts` to handle communication with the `user_notification_settings` table.

**TypeScript Interface:**

Define an interface for the notification settings data structure. This will be used by the API functions and the React component.

```typescript
// src/lib/api/notificationSettings.ts (or a shared types file)
export interface NotificationPreferences {
  user_id: string; // Will be set internally by API, not part of form data
  email_new_message_enabled: boolean;
  email_party_invite_enabled: boolean;
  email_session_scheduled_enabled: boolean;
  email_system_updates_enabled: boolean;
  desktop_new_message_enabled: boolean;
  desktop_party_invite_enabled: boolean;
  desktop_session_scheduled_enabled: boolean;
  desktop_dice_rolls_enabled: boolean;
  sound_enabled: boolean;
  sound_volume: number;
  sound_dice_rolls_enabled: boolean;
  sound_notifications_enabled: boolean;
  // Timestamps can be excluded if not directly managed by client
}

// Type for updates, user_id will be handled by the function
export type NotificationPreferencesUpdate = Omit<Partial<NotificationPreferences>, 'user_id' | 'id' | 'created_at' | 'updated_at'>;
```

**API Functions:**

*   **`getNotificationSettings(userId: string): Promise<NotificationPreferences | null>`**
    *   Takes `userId` as input.
    *   Fetches the settings for that user from `user_notification_settings`.
    *   Uses `.select('*').eq('user_id', userId).maybeSingle()`.
    *   Returns the settings object or `null` if not found (or an error).
    *   Handles potential errors (e.g., database errors, user not found).

*   **`updateNotificationSettings(userId: string, settings: NotificationPreferencesUpdate): Promise<NotificationPreferences>`**
    *   Takes `userId` and a `settings` object (matching `NotificationPreferencesUpdate`) as input.
    *   Performs an "upsert" operation on the `user_notification_settings` table for the given `userId`.
        *   If a row for `userId` exists, it updates it.
        *   If no row exists, it inserts a new one with `user_id` and the provided settings.
        *   Supabase's `.upsert([{ user_id, ...settings }], { onConflict: 'user_id' })` can be used.
    *   Updates the `updated_at` timestamp.
    *   Returns the updated/inserted settings object.
    *   Handles potential errors.

### 3. Component Integration (`src/components/settings/NotificationSettings.tsx`)

Modify the existing component to use the new API layer.

**State Management:**

*   The local `settings` state in the component should align with the `NotificationPreferencesUpdate` type.
*   The initial state can still be the hardcoded defaults, but it will be overwritten by fetched data.

**Fetching User ID:**

*   Use the `useAuth()` hook to get the current `user.id`.

**Loading Settings:**

*   Use a `useEffect` hook that runs when the component mounts and when `user.id` changes.
*   Inside the `useEffect`:
    *   If `user.id` is available, call `getNotificationSettings(user.id)`.
    *   If settings are successfully fetched:
        *   Update the component's local `settings` state with the fetched data.
    *   If `null` is returned (no settings found for the user):
        *   Keep the default local state. Optionally, you could consider automatically creating default settings for the user here by calling `updateNotificationSettings` with the defaults, but it's often better to do this on first save attempt or explicitly.
    *   Handle loading states (e.g., display a spinner while fetching).
    *   Handle errors (e.g., display an error message).

**Saving Settings (`handleSubmit`):**

*   Modify the `handleSubmit` function:
    *   Prevent default form submission.
    *   Set `loading` state to `true`.
    *   If `user.id` is available:
        *   Call `updateNotificationSettings(user.id, currentLocalSettings)`.
        *   On success:
            *   Optionally, update the local `settings` state with the (potentially transformed) response from the API.
            *   Show a success message/toast (e.g., "Settings saved!").
        *   On error:
            *   Show an error message/toast.
    *   Set `loading` state to `false` in a `finally` block.

**Error and Success Feedback:**

*   Implement user-friendly feedback for loading, success, and error states (e.g., using toasts, inline messages). The `useApp` context's `setGlobalError` or a local notification system can be used.

## Phase 2: Actual Notification Delivery (Future Work - Not part of this initial implementation)

This phase is about making the application *act* on the saved preferences. It's a separate and more complex undertaking.

*   **Email Notifications:**
    *   Requires backend logic (e.g., Supabase Edge Functions, server-side code) triggered by application events (new message, party invite, etc.).
    *   This logic would check the user's `user_notification_settings` before sending an email.
    *   Integration with Supabase Auth's email sending capabilities or a third-party email service.

*   **Desktop Notifications:**
    *   Use the browser's [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).
    *   Request permission from the user.
    *   Trigger notifications based on in-app events or real-time updates (e.g., from Supabase Realtime).
    *   Check the user's `user_notification_settings` before displaying a notification.

*   **Sound Notifications:**
    *   Use the browser's [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).
    *   Play sounds for specific events (dice rolls, new messages).
    *   Check the user's `user_notification_settings` (sound enabled, volume, specific sound toggles) before playing a sound.

This `notification.md` provides a roadmap. We will proceed with Phase 1 first.
```
