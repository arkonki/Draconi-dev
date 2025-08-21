# Appearance Settings & Dark Mode: Build Plan

This document outlines the plan to implement functional Appearance Settings, including theme selection (light, dark, system), font size adjustment, and a reduced motion toggle. These settings will be persisted and applied globally.

## 1. Goals & Overview

*   **Functional Theme Selection**: Allow users to choose between 'Light', 'Dark', and 'System' themes.
*   **Functional Font Size**: Allow users to select 'Small', 'Medium', or 'Large' font sizes.
*   **Functional Reduced Motion**: Allow users to toggle a 'Reduce motion' preference.
*   **Persistence**: Save user preferences so they persist across sessions and devices (for logged-in users).
*   **Global Application**: Ensure selected theme, font size, and reduced motion settings are applied throughout the application.
*   **Integration**: Update `AppearanceSettings.tsx` to manage and reflect these global settings.

## 2. Persistence Strategy

Given the project's use of Supabase for user data, we will use a new Supabase table `user_preferences` to store these settings for authenticated users. This allows preferences to sync across devices. For unauthenticated users or as a fallback, `localStorage` could be considered, but the primary approach will be Supabase.

## 3. Database Schema (Supabase)

### 3.1. `user_preferences` Table

*   `user_id`: `uuid` (Primary Key, Foreign Key referencing `auth.users.id` ON DELETE CASCADE, NOT NULL)
*   `theme`: `text` (Default: `'system'`, values: `'light'`, `'dark'`, `'system'`, NOT NULL)
*   `font_size`: `text` (Default: `'medium'`, values: `'small'`, `'medium'`, `'large'`, NOT NULL)
*   `reduced_motion`: `boolean` (Default: `false`, NOT NULL)
*   `created_at`: `timestamptz` (Default: `now()`, NOT NULL)
*   `updated_at`: `timestamptz` (Default: `now()`, NOT NULL)

**RLS Policies for `user_preferences`:**
*   Users can select (read) their own preferences.
*   Users can insert their own preferences (once, on first save).
*   Users can update their own preferences.
*   No public read/write access.

**Indexes:**
*   On `user_preferences(user_id)` (automatically created for PK/FK).

## 4. Global State Management (`ThemeContext`)

We'll create a `ThemeContext` to manage and provide appearance settings globally.

### 4.1. `src/contexts/ThemeContext.tsx`

*   **Context Definition**:
    *   `theme: 'light' | 'dark' | 'system'`
    *   `effectiveTheme: 'light' | 'dark'` (actual theme applied, considering 'system')
    *   `fontSize: 'small' | 'medium' | 'large'`
    *   `reducedMotion: boolean`
    *   `setTheme: (theme: 'light' | 'dark' | 'system') => void`
    *   `setFontSize: (size: 'small' | 'medium' | 'large') => void`
    *   `setReducedMotion: (enabled: boolean) => void`
    *   `loadingPreferences: boolean`
*   **`ThemeProvider` Component**:
    *   Wraps the entire application (likely inside `AppProvider` or around `AppRouter`).
    *   **State**: Manages `theme`, `fontSize`, `reducedMotion`, `effectiveTheme`, and `loadingPreferences`.
    *   **On Mount/Auth Change**:
        *   If a user is authenticated, attempts to load preferences from Supabase via `getUserPreferences`.
        *   If no Supabase preferences or user is unauthenticated, falls back to `localStorage` or system defaults.
        *   Sets `loadingPreferences` during this process.
    *   **Effect for Theme Application**:
        *   `useEffect` hook listens to `theme` state and `window.matchMedia('(prefers-color-scheme: dark)')` for 'system' theme.
        *   Calculates `effectiveTheme`.
        *   Applies/removes `.dark` class to `document.documentElement`.
        *   Updates `effectiveTheme` state.
    *   **Effect for Font Size Application**:
        *   `useEffect` hook listens to `fontSize` state.
        *   Applies a class like `font-size-small`, `font-size-medium`, or `font-size-large` to `document.documentElement`.
    *   **Effect for Reduced Motion Application**:
        *   `useEffect` hook listens to `reducedMotion` state.
        *   Sets a data attribute like `data-reduced-motion="true/false"` on `document.documentElement`.
    *   **Update Functions**:
        *   `setTheme`, `setFontSize`, `setReducedMotion` update the local state and then call `updateUserPreferences` to persist changes to Supabase (if authenticated). They also update `localStorage` as a non-authenticated fallback or for immediate reflection.

## 5. API Layer

### 5.1. `src/lib/api/userPreferences.ts`

*   **Types/Interfaces**:
    *   `UserPreferences` (matching the table structure)
    *   `UserPreferencesUpdate` (for partial updates)
*   **Functions**:
    *   `getUserPreferences(): Promise<UserPreferences | null>`
        *   Fetches preferences for the currently authenticated user.
        *   Requires access to the Supabase client and current user session.
    *   `updateUserPreferences(updates: UserPreferencesUpdate): Promise<UserPreferences>`
        *   Updates (or creates if not exists using `upsert`) preferences for the authenticated user.

## 6. Tailwind CSS Configuration

### 6.1. `tailwind.config.js`

*   **Enable Class-based Dark Mode**:
    ```javascript
    export default {
      // ... other config
      darkMode: 'class', // CRITICAL for dark mode to work with a class on <html>
      theme: {
        extend: {
          // ... existing extensions
        },
      },
      plugins: [
        // ... existing plugins
      ],
    };
    ```
*   **Font Size Classes (Optional, if not handled by Tailwind utilities directly)**:
    If we apply global font size classes, we might need to define what they do, or ensure Tailwind's base/utility classes respond appropriately. Often, just setting a base font size on `html` or `body` and using `rem` units is sufficient, and Tailwind's text utilities (`text-sm`, `text-base`, `text-lg`) can be used. The `AppearanceSettings` preview can demonstrate this. The global font size setting might adjust the root font size, affecting `rem` units.

## 7. Component Modifications

### 7.1. `src/components/settings/AppearanceSettings.tsx`

*   **Consume `ThemeContext`**:
    *   Use `useContext(ThemeContext)` to get current `theme`, `fontSize`, `reducedMotion`, and their setter functions, plus `loadingPreferences`.
*   **State Management**:
    *   The component's local state for these settings (`theme`, `fontSize`, `reducedMotion` in `AppearanceSettings.tsx`) will now primarily reflect the context's state.
    *   The `setTheme`, `setFontSize`, `setReducedMotion` functions from the context will be called on user interaction.
*   **Form Submission (`handleSubmit`)**:
    *   This function might become simpler. Since changes are applied and persisted on interaction (via context setters), the "Save Changes" button could:
        1.  Trigger a batch update if changes weren't persisted immediately (though immediate persistence is often better UX for these types of settings).
        2.  Simply provide user feedback (e.g., "Preferences saved").
        3.  Or, if setters in context are debounced, this could be the trigger for the actual persistence. For simplicity, immediate persistence on change is recommended.
    *   The local `loading` state in `AppearanceSettings.tsx` can be driven by `loadingPreferences` from the context or specific loading states for update operations if the context setters are async.

### 7.2. `src/App.tsx` (or Root Layout Component like `src/components/layout/RootLayout.tsx`)

*   Wrap the main application structure with `<ThemeProvider>`:
    ```tsx
    // Example in a root layout or App.tsx
    import { AppProvider } from './contexts/AppContext';
    import { ThemeProvider } from './contexts/ThemeContext';
    import AppRouter from './router'; // Or your main app content

    function App() {
      return (
        <AppProvider> {/* Existing global provider */}
          <ThemeProvider>
            {/* AppRouter or main layout components */}
            <AppRouter />
          </ThemeProvider>
        </AppProvider>
      );
    }
    ```

## 8. Styling for Themes and Font Sizes

*   **Dark Mode**: Utilize Tailwind's `dark:` variants in components (e.g., `bg-white dark:bg-gray-800`).
*   **Font Sizes**:
    *   If global font size classes are added to `<html>` (e.g., `font-size-small`), define these in `src/index.css` or a dedicated CSS file:
        ```css
        /* Example for src/index.css or a new theme.css */
        html.font-size-small { font-size: 14px; } /* Adjust base font size */
        html.font-size-medium { font-size: 16px; } /* Default */
        html.font-size-large { font-size: 18px; } /* Adjust base font size */
        ```
    *   Components should use `rem` units for sizing and typography to scale correctly with the root font size. Tailwind's default utilities mostly use `rem`.
*   **Reduced Motion**:
    *   Apply conditional styling or logic based on `data-reduced-motion="true"` attribute or `prefers-reduced-motion` media query.
    *   Example CSS:
        ```css
        /* Disable transitions if reduced motion is preferred */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
        /* Or using the data attribute set by ThemeProvider */
        [data-reduced-motion="true"] *,
        [data-reduced-motion="true"] *::before,
        [data-reduced-motion="true"] *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
        ```

## 9. Workflow Summary

1.  **App Load**: `ThemeProvider` loads, fetches user preferences from Supabase (if logged in) or defaults. Applies initial theme/font/motion settings to `document.documentElement`.
2.  **User Navigates to Appearance Settings**: `AppearanceSettings.tsx` mounts, reads current settings from `ThemeContext`.
3.  **User Changes a Setting (e.g., clicks "Dark" theme button)**:
    *   `AppearanceSettings.tsx` calls `setTheme('dark')` from `ThemeContext`.
    *   `ThemeProvider` updates its internal state.
    *   `ThemeProvider`'s `useEffect` for theme changes:
        *   Removes `light` (if present), adds `dark` class to `document.documentElement`.
        *   Updates `effectiveTheme` state.
    *   `ThemeProvider` calls `updateUserPreferences` API to save `theme: 'dark'` to Supabase.
4.  **Global Application**: All components styled with Tailwind `dark:` variants automatically adapt. Text and elements sized with `rem` units adapt if root font size changed. Animations are reduced if `data-reduced-motion="true"`.

## 10. Implementation Steps

1.  **Database**: Create `user_preferences` table and RLS policies in Supabase.
2.  **Tailwind Config**: Update `tailwind.config.js` with `darkMode: 'class'`.
3.  **API Layer**: Implement `src/lib/api/userPreferences.ts`.
4.  **Context**: Create `src/contexts/ThemeContext.tsx` with `ThemeProvider`.
5.  **Global Integration**: Wrap app with `ThemeProvider` in `App.tsx` or root layout.
6.  **Component Update**: Refactor `src/components/settings/AppearanceSettings.tsx` to use `ThemeContext`.
7.  **Styling**: Add base CSS for font sizes and reduced motion if necessary. Ensure components use `dark:` variants.
8.  **Testing**: Thoroughly test theme switching, font size changes, reduced motion toggle, persistence, and behavior for logged-in vs. anonymous users.

This plan provides a comprehensive approach to implementing robust appearance settings.
