```markdown
# Game Plan for Implementing Improvements

This plan outlines the steps to refactor and improve the DragonBane Character Manager codebase incrementally, modifying a maximum of three files per step.

**Phase 1: Data Fetching Abstraction (Using TanStack Query)**

1.  **Setup TanStack Query:**
    *   Install `@tanstack/react-query`.
    *   Modify `src/main.tsx`: Wrap `App` with `QueryClientProvider`.
    *   Create `src/lib/queryClient.ts`: Initialize and export the `QueryClient`.
    *   *(Files: `package.json`, `src/main.tsx`, `src/lib/queryClient.ts`)*

2.  **Refactor Character List Fetching:**
    *   Create `src/lib/api/characters.ts`: Add `fetchCharacters` function using Supabase.
    *   Modify `src/pages/Characters.tsx`: Replace direct Supabase call with `useQuery` hook using `fetchCharacters`. Update loading/error handling.
    *   *(Files: `src/lib/api/characters.ts`, `src/pages/Characters.tsx`)*

3.  **Refactor Single Character Fetching:**
    *   Modify `src/lib/api/characters.ts`: Add `fetchCharacterById` function.
    *   Modify `src/pages/CharacterPage.tsx`: Replace direct Supabase call with `useQuery` using `fetchCharacterById`. Update loading/error handling.
    *   *(Files: `src/lib/api/characters.ts`, `src/pages/CharacterPage.tsx`)*

4.  **Refactor Compendium Fetching:**
    *   Create `src/lib/api/compendium.ts`: Add `fetchCompendiumEntries` and `fetchCompendiumTemplates` functions.
    *   Modify `src/pages/Compendium.tsx`: Replace direct Supabase calls with `useQuery`.
    *   *(Files: `src/lib/api/compendium.ts`, `src/pages/Compendium.tsx`)*

5.  **Refactor Party List Fetching:**
    *   Create `src/lib/api/parties.ts`: Add `fetchParties` function (including members).
    *   Modify `src/pages/AdventureParty.tsx`: Replace direct Supabase call with `useQuery`.
    *   *(Files: `src/lib/api/parties.ts`, `src/pages/AdventureParty.tsx`)*

6.  **Refactor Single Party Fetching:**
    *   Modify `src/lib/api/parties.ts`: Add `fetchPartyById` function.
    *   Modify `src/pages/PartyView.tsx`: Replace direct Supabase call with `useQuery`.
    *   *(Files: `src/lib/api/parties.ts`, `src/pages/PartyView.tsx`)*

**Phase 2: Authentication Cleanup**

7.  **Remove Mock Auth (Part 1):**
    *   Delete `src/lib/auth/simpleAuth.ts`.
    *   *(Files: `src/lib/auth/simpleAuth.ts`)*

8.  **Remove Mock Auth (Part 2):**
    *   Modify `src/contexts/AuthContext.tsx`: Remove any potential imports or logic related to `SimpleAuth`. Ensure it solely relies on `src/lib/auth/auth.ts` (Supabase).
    *   *(Files: `src/contexts/AuthContext.tsx`)*
    *   *(Note: Search globally for any other `simpleAuth` imports if necessary in subsequent steps, respecting the 3-file limit)*

**Phase 3: Static Data Migration to Database**

9.  **Migrate Kin Data:**
    *   *(Manual Step: Ensure `kin` table exists in Supabase with necessary columns)*
    *   Create `src/lib/api/kin.ts`: Add `fetchKinList` function.
    *   Modify `src/components/character/steps/KinSelection.tsx`: Fetch data using `useQuery`.
    *   Modify `src/data/index.ts`: Remove `kins` export (or delete file if empty).
    *   *(Files: `src/lib/api/kin.ts`, `src/components/character/steps/KinSelection.tsx`, `src/data/index.ts`)*

10. **Migrate Profession Data:**
    *   *(Manual Step: Ensure `professions` table exists in Supabase)*
    *   Create `src/lib/api/professions.ts`: Add `fetchProfessionList` function.
    *   Modify `src/components/character/steps/ProfessionSelection.tsx`: Fetch data using `useQuery`.
    *   Modify `src/data/index.ts`: Remove `professions` export (or delete file if empty).
    *   *(Files: `src/lib/api/professions.ts`, `src/components/character/steps/ProfessionSelection.tsx`, `src/data/index.ts`)*

11. **Migrate Equipment Data (Part 1):**
    *   *(Manual Step: Ensure `game_items` table exists in Supabase)*
    *   Create `src/lib/api/items.ts`: Add `fetchItems`, `findItemByName` functions.
    *   Modify `src/components/character/InventoryModal.tsx`: Replace `findEquipment` usage with API calls/`useQuery`.
    *   Delete `src/data/equipment.json` and `src/data/equipment.ts`.
    *   *(Files: `src/lib/api/items.ts`, `src/components/character/InventoryModal.tsx`, `src/data/equipment.json`, `src/data/equipment.ts` - Note: Deleting 2 counts as modifying 2)*

12. **Migrate Equipment Data (Part 2):**
    *   Modify `src/components/character/EquipmentSection.tsx`: Use `useQuery` or API calls from `src/lib/api/items.ts`.
    *   Modify `src/components/character/steps/GearSelection.tsx`: Use `useQuery` or API calls from `src/lib/api/items.ts`.
    *   *(Files: `src/components/character/EquipmentSection.tsx`, `src/components/character/steps/GearSelection.tsx`)*

**Phase 4: Component Refactoring & Code Quality (Examples)**

13. **Refactor CharacterSheet (Part 1):**
    *   Create `src/components/character/AttributesDisplay.tsx`.
    *   Create `src/components/character/VitalsDisplay.tsx`.
    *   Modify `src/components/character/CharacterSheet.tsx`: Extract attribute and vitals logic into the new components and import them.
    *   *(Files: `src/components/character/AttributesDisplay.tsx`, `src/components/character/VitalsDisplay.tsx`, `src/components/character/CharacterSheet.tsx`)*

14. **Improve Type Safety (Example):**
    *   Modify `src/types/character.ts`: Add more specific types if `any` is used, refine existing types.
    *   Modify `src/lib/api/characters.ts`: Update function signatures and return types based on refined `Character` type.
    *   Modify `src/pages/CharacterPage.tsx`: Adjust component logic to use stricter types.
    *   *(Files: `src/types/character.ts`, `src/lib/api/characters.ts`, `src/pages/CharacterPage.tsx`)*

**Phase 5: Error Handling & Testing**

15. **Consistent Error Handling (Example - Characters):**
    *   Modify `src/pages/Characters.tsx`: Ensure `useErrorHandler` hook is used for any mutations (like delete, if added) or complex fetch scenarios not fully covered by `useQuery`'s error state.
    *   Modify `src/lib/api/characters.ts`: Potentially adjust error throwing for better context.
    *   Modify `src/hooks/useErrorHandler.ts`: Refine error message mapping if needed.
    *   *(Files: `src/pages/Characters.tsx`, `src/lib/api/characters.ts`, `src/hooks/useErrorHandler.ts`)*

16. **Setup Testing Framework:**
    *   Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
    *   Modify `vite.config.ts`: Add test configuration.
    *   Create `src/setupTests.ts` (if needed for global setup).
    *   *(Files: `package.json`, `vite.config.ts`, `src/setupTests.ts`)*

17. **Write First Unit Test:**
    *   Create `src/lib/movement.test.ts`: Write tests for `calculateMovement`.
    *   Modify `src/lib/movement.ts` (if needed to make it testable).
    *   *(Files: `src/lib/movement.test.ts`, `src/lib/movement.ts`)*

---

*This plan provides a structured approach. Each step focuses on a specific area and adheres to the file modification limit. Further steps would continue refactoring components, improving types, adding more tests, and implementing feature enhancements.*
    ```
