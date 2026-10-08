# Task List: Encounter Feature for PartyView

This document outlines the tasks required to implement the "Encounter" tab and functionality within the `PartyView` component. This feature will allow Dungeon Masters (DMs) to create, manage, and run encounters in real-time.

## I. Core Encounter Tab Setup in PartyView

1.  **Add "Encounter" Tab to `PartyView`**:
    *   Modify `PartyView.tsx` to include a new tab labeled "Encounter".
    *   Ensure this tab is only visible/accessible to users identified as DMs for the current party.
    *   Create a new component, e.g., `PartyEncounterView.tsx`, to render the content of this tab.
    *   Pass necessary props like `partyId` and `isDM` to `PartyEncounterView`.

## II. Encounter State Management (Supabase Backend)

1.  **Define Encounter Data Structure**:
    *   Design Supabase table(s) to store encounter state. This might include:
        *   `encounters` table: `id`, `party_id`, `name`, `description`, `status` (e.g., 'planning', 'active', 'completed'), `current_round`, `active_character_id` (or `active_combatant_id`).
        *   `encounter_combatants` table: `id`, `encounter_id`, `character_id` (nullable, for party members), `monster_id` (nullable, for monsters), `display_name`, `current_hp`, `current_wp` (if applicable), `status_effects` (JSONB or array of text), `initiative_roll`, `initiative_order`, `is_active_turn`.
        *   Consider how to store monster instances if multiple of the same monster type are in an encounter (e.g., unique instance ID, or just multiple entries in `encounter_combatants` referencing the same `monster_id` from `monsters` table).
2.  **Supabase Migrations**:
    *   Create SQL migration files for the new tables.
    *   Define RLS policies for these tables (DMs can manage encounters for their parties, players can read relevant parts of active encounters they are in).
3.  **Supabase Realtime Setup**:
    *   Enable Supabase Realtime for the encounter-related tables.
    *   Plan which table changes will trigger real-time updates to clients.
4.  **Supabase Functions (Edge Functions)**:
    *   **`start-encounter`**: Function to initialize an encounter, set its status to 'active', potentially roll initiative for NPCs/monsters if not manually set.
    *   **`next-turn`**: Function to advance the initiative order, update `active_combatant_id`, and potentially increment `current_round`.
    *   **`update-combatant-stat`**: Function to modify HP, WP, status effects, or initiative for a specific combatant. This needs to be secure and validate DM permissions.
    *   **`add-combatant`**: Function for DMs to add party members or monsters to an ongoing or planned encounter.
    *   **`remove-combatant`**: Function for DMs to remove a combatant.
    *   **`end-encounter`**: Function to mark an encounter as 'completed'.

## III. Encounter UI - DM View (`PartyEncounterView.tsx`)

1.  **Encounter Management Controls**:
    *   Button to "Create New Encounter" / "Start Encounter".
    *   Button to "End Encounter".
    *   Display current round number.
    *   Display whose turn it is.
    *   Button for "Next Turn".
2.  **Combatant Display Area**:
    *   Section to display party members.
    *   Section to display monsters.
    *   Ability to drag-and-drop to reorder initiative (if manual ordering is desired before/during combat).
3.  **Adding Monsters to Encounter**:
    *   UI to browse/search monsters from the `monsters` table (Bestiary).
    *   Mechanism to add selected monsters to the current encounter.
    *   Handle multiple instances of the same monster.
4.  **Party Member Cards**:
    *   Adapt or create a new `CharacterCardEncounterView.tsx` component.
    *   Display:
        *   Character Name
        *   Current HP / Max HP
        *   Current Willpower / Max Willpower
        *   Status Effects (e.g., "Cursed", "Poisoned", "Prone"). DM should be able to add/remove these.
        *   Initiative Number (display and allow DM to edit/swap).
5.  **Monster Cards**:
    *   Create `MonsterCardEncounterView.tsx` component.
    *   Display:
        *   Monster Name
        *   Key Stats (HP, Armor, Movement).
        *   Current HP (editable by DM).
        *   Attacks (summary or link to full details).
        *   Status Effects (editable by DM).
        *   Initiative Number(s):
            *   If Ferocity > 1, display multiple initiative slots/cards for that monster.
            *   DM should be able to assign actions/status independently to each initiative slot if needed.
6.  **Initiative Tracker UI**:
    *   Visual representation of the initiative order.
    *   Clearly highlight the active combatant.
    *   Allow DM to manually adjust initiative values or order.

## IV. Real-time Updates and Interactivity

1.  **Subscribe to Encounter Changes**:
    *   Use Supabase client to subscribe to real-time updates for the current encounter's data.
    *   Update UI components (HP, status, initiative order, active turn) dynamically as data changes in Supabase.
2.  **DM Actions Trigger Supabase Functions**:
    *   Wire up UI controls (Next Turn, Update HP, Add Status Effect) to call the respective Supabase Edge Functions.
    *   Provide immediate feedback to the DM (e.g., loading states) and update UI based on function response or real-time broadcast.

## V. Player View (Consideration for Future)

*   While the primary focus is the DM view, consider how players might see a simplified encounter view in the future (e.g., initiative order, their own status, targetable enemies). This is out of scope for the initial DM-focused implementation but good to keep in mind for data structures.

## VI. Site Notifications

1.  **Notification System Design**:
    *   Decide on the type of notifications (e.g., toast notifications, in-app alerts).
    *   Choose a library (e.g., `react-hot-toast`, `notistack`) or build a custom solution.
2.  **Notification Triggers**:
    *   DM actions (e.g., "Encounter Started", "Your turn!").
    *   Significant game events (e.g., "Character critically injured").
    *   Notifications could be triggered client-side based on real-time updates or pushed via Supabase functions.
3.  **Notification Component**:
    *   Create a reusable notification component.
    *   Integrate it into the main app layout.

## VII. API Layer (`src/lib/api/encounters.ts`)

1.  **Fetch Encounter Data**: Functions to get encounter details, list of combatants.
2.  **Mutations for Encounter Actions**: Wrapper functions to call Supabase Edge Functions for starting/ending encounters, managing turns, updating combatants.
3.  **React Query Integration**: Use TanStack Query for fetching and caching encounter data, and for managing mutations.

## VIII. Testing

1.  **Component Tests**: Test individual UI components for the encounter view.
2.  **Integration Tests**: Test the flow of DM actions, Supabase function calls, and real-time updates.
3.  **Manual Testing**: Thoroughly test encounter management from a DM's perspective.

## IX. Refinements & Polish

1.  **Loading States**: Implement clear loading indicators for asynchronous operations.
2.  **Error Handling**: Gracefully handle API errors and display informative messages.
3.  **UI/UX Polish**: Ensure the encounter interface is intuitive and visually appealing.
4.  **Responsiveness**: Ensure the encounter view works well on different screen sizes.

This task list provides a comprehensive overview. Tasks can be broken down further as development progresses.
