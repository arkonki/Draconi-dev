# Recommended Improvements

This document outlines potential areas for improvement in the Dragonbane Character Manager codebase.

## 1. State Management (Zustand)

*   **Review Store Structure:** The current stores (`characterSheetStore`, `characterCreation`) seem appropriate for their respective domains. However, as the application grows, consider:
    *   **Splitting Large Stores:** If a store becomes overly complex, break it down into smaller, more focused stores.
    *   **Selectors:** Use selectors extensively to optimize component re-renders. Ensure components only subscribe to the specific state slices they need.
    *   **Middleware:** Explore Zustand middleware (like `persist` for local storage, `devtools` for debugging, `immer` for immutable updates) if not already used or if beneficial.

## 2. Data Fetching (React Query & Supabase)

*   **Query Key Management:** Establish a consistent and centralized strategy for managing React Query keys. This improves cache invalidation and refetching logic. Consider creating constants or helper functions for generating keys.
*   **Error Handling:** Standardize error handling for Supabase calls and React Query hooks. The `useErrorHandler` hook is a good start, but ensure its consistent application and potentially enhance it to provide more context-specific feedback.
*   **Data Transformation:** Perform data transformations (e.g., shaping data from Supabase for the UI) within query functions or selectors rather than directly in components to keep components cleaner.
*   **Optimistic Updates:** For mutations that should feel instantaneous (e.g., adding an item to inventory), implement optimistic updates with React Query for a better user experience.

## 3. Component Structure & Reusability

*   **Atomic Design Principles:** Consider adopting principles similar to Atomic Design (Atoms, Molecules, Organisms, Templates, Pages) to further improve component organization and reusability, especially within `src/components/shared`.
*   **Prop Drilling:** Identify instances of prop drilling and refactor using Context API, Zustand, or component composition where appropriate.
*   **Component Complexity:** Break down large components (e.g., potentially `CharacterSheet.tsx`, `CharacterCreationWizard.tsx`) into smaller, more manageable sub-components.
*   **Conditional Rendering:** Simplify complex conditional rendering logic within JSX. Use helper functions or variables if needed.

## 4. Routing (React Router)

*   **Route Definitions:** Consider centralizing route path definitions in a constants file to avoid magic strings and make refactoring easier.
*   **Lazy Loading:** Implement route-based code splitting (lazy loading) for pages/components that are not immediately required. This can significantly improve initial load time. Vite supports this easily with `React.lazy` and `Suspense`.

## 5. TypeScript Usage

*   **Stricter Types:** Enable stricter TypeScript compiler options (`strict: true` in `tsconfig.json` if not already enabled) to catch more potential errors at compile time.
*   **Type Inference:** Leverage TypeScript's type inference where possible, but be explicit with types for function signatures, API boundaries, and complex objects.
*   **Shared Types:** Ensure types shared between frontend and potentially a backend (or Supabase definitions) are consistent. Consider generating types from Supabase schema if possible.

## 6. Styling (Tailwind CSS)

*   **Component Variants:** Utilize libraries like `class-variance-authority` (already installed) more extensively to manage complex component styling variations (e.g., button types, card states).
*   **Theme Customization:** Ensure Tailwind's `tailwind.config.js` is well-organized for theme customizations (colors, fonts, spacing) to maintain design consistency.
*   **CSS Specificity:** Be mindful of CSS specificity issues, especially when mixing Tailwind utility classes with custom CSS (`index.css`, `homebrew.css`).

## 7. Error Handling & Logging

*   **Global Error Boundary:** The existing `ErrorBoundary` is good. Ensure it logs errors effectively (e.g., to an external service in production) and provides a user-friendly fallback UI.
*   **Specific Error Messages:** Provide more specific and user-friendly error messages instead of generic ones where possible.

## 8. Testing (Vitest)

*   **Increase Coverage:** Expand test coverage, particularly for:
    *   Critical hooks (`useCharacterAbilities`, `useMagic`, etc.)
    *   Utility functions (`inventoryUtils`, `movement`, etc.)
    *   Complex components and state logic.
    *   API interaction mocks.
*   **Integration Tests:** Add integration tests that cover user flows (e.g., character creation steps, logging in, joining a party).
*   **Testing Library Best Practices:** Adhere to Testing Library's guiding principles (testing user behavior, not implementation details).

## 9. Accessibility (a11y)

*   **Semantic HTML:** Continue using semantic HTML elements correctly.
*   **ARIA Attributes:** Add appropriate ARIA attributes where necessary, especially for custom components or complex UI interactions.
*   **Keyboard Navigation:** Ensure all interactive elements are navigable and operable via keyboard.
*   **Color Contrast:** Verify sufficient color contrast ratios, especially between text and background colors.
*   **Form Labels:** Ensure all form inputs have associated labels.

## 10. Performance

*   **Bundle Size Analysis:** Periodically analyze the production bundle size (e.g., using `vite-plugin-bundle-analyzer`) to identify large dependencies or chunks that could be optimized.
*   **Memoization:** Use `React.memo`, `useMemo`, and `useCallback` judiciously to prevent unnecessary re-renders, especially in complex components or lists. Profile components to identify bottlenecks before applying memoization.
*   **Debouncing/Throttling:** Apply debouncing or throttling for expensive operations triggered by frequent events (e.g., search inputs, window resizing).

## 11. Security

*   **Input Sanitization:** While `rehype-sanitize` is used for Markdown, ensure all user inputs are properly validated and sanitized, especially data sent to Supabase. Use Zod for validation where possible.
*   **Supabase RLS:** Double-check and ensure Row Level Security (RLS) policies in Supabase are correctly configured and enforced for all data access patterns. Frontend checks are not sufficient for security.
*   **Environment Variables:** Ensure sensitive keys (`SUPABASE_KEY`) are not exposed client-side if they are admin/service keys. Use Supabase's anonymous key for client-side operations and secure operations via edge functions or server-side logic if necessary. Review the `.env` and `.env.example` setup.

## 12. Documentation & Code Comments

*   **JSDoc/TSDoc:** Add comments (using JSDoc/TSDoc syntax) to explain complex logic, component props, hook functionalities, and utility functions.
*   **README:** Keep the `README.md` updated with setup instructions, project overview, and contribution guidelines (if applicable).
