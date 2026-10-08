# GM View & Encounter Management Worklist

This document outlines the tasks required to implement a Game Master (GM) view within the Adventure Party feature, including encounter management, initiative tracking, and a shared dice rolling system using Supabase Realtime.

## I. Supabase Schema & Realtime Setup

*   [ ] **Define `encounters` Table:**
    *   Columns: `id` (uuid, PK), `party_id` (uuid, FK to `parties.id`), `name` (text, not null), `description` (text), `status` (text, e.g., 'pending', 'active', 'completed', default 'pending'), `created_at` (timestamptz), `updated_at` (timestamptz).
    *   RLS: Enable. Policies for GMs (creator of the party) to CRUD, party members to read.
*   [ ] **Define `encounter_participants` Table:**
    *   Columns: `id` (uuid, PK), `encounter_id` (uuid, FK to `encounters.id`), `character_id` (uuid, FK to `characters.id`, nullable), `user_id` (uuid, FK to `auth.users` table, nullable, for non-character participants controlled by a user/GM), `name` (text, not null - character name or monster name), `is_monster` (boolean, default false), `initiative` (integer, nullable), `current_hp` (integer, nullable), `max_hp` (integer, nullable), `status` (text, e.g., 'active', 'defeated', 'fled', default 'active'), `monster_stats` (jsonb, nullable for custom monster details).
    *   RLS: Enable. Policies for GMs to CRUD, party members to read.
*   [ ] **Define `shared_dice_rolls` Table:**
    *   Columns: `id` (uuid, PK), `party_id` (uuid, FK to `parties.id`), `encounter_id` (uuid, FK to `encounters.id`, nullable), `user_id` (uuid, FK to `auth.users` table, who made the roll), `roller_name` (text, display name of roller), `description` (text), `dice_pool` (jsonb, e.g., `["d20", "d6"]`), `results` (jsonb, e.g., `[{"type": "d20", "value": 15}, {"type": "d6", "value": 4}]`), `boon_results` (jsonb, nullable), `final_outcome` (text or number), `is_boon` (boolean, default false), `is_bane` (boolean, default false), `target_value` (integer, nullable), `is_success` (boolean, nullable), `is_critical` (boolean, nullable), `rolled_at` (timestamptz, default `now()`).
    *   RLS: Enable. Policies for party members to create and read.
*   [ ] **Supabase Realtime Configuration:**
    *   Enable Realtime for `shared_dice_rolls` table.
    *   Enable Realtime for `encounter_participants` table (for initiative, HP, status updates).
    *   Enable Realtime for `encounters` table (for status updates).
*   [ ] **Create SQL Migrations:** Generate migration files for the new tables and RLS policies.

## II. Adventure Party Page Enhancements (`src/pages/AdventureParty.tsx` & `src/pages/PartyDetail.tsx`)

*   [ ] **Conditional GM View:**
    *   In `AdventureParty.tsx` or a new `PartyDetail.tsx` (if navigating to a specific party view), check if `user` is the `created_by` of the party (or a more explicit `is_gm` flag on `party_members` if that's preferred).
    *   If GM, display additional UI elements for encounter management.
*   [ ] **"Encounters" Tab/Section:**
    *   Add a new section or tab within the party view for GMs to manage encounters.

## III. Encounter Management Components

*   [ ] **`EncounterList.tsx` Component:**
    *   Display a list of encounters for the current party (pending, active, completed).
    *   Allow GMs to initiate the creation of a new encounter (e.g., button opening `CreateEncounterModal.tsx`).
    *   Allow GMs to select an encounter to view/manage its details (`ActiveEncounterView.tsx`).
    *   Allow GMs to start a 'pending' encounter (changes status to 'active').
    *   Allow GMs to end an 'active' encounter (changes status to 'completed').
    *   Allow GMs to delete 'pending' encounters.
*   [ ] **`CreateEncounterModal.tsx` Component:**
    *   Form for GMs to create a new encounter:
        *   Input for encounter `name` and `description`.
        *   Interface to add participants:
            *   List available characters from the party to add.
            *   Section to add custom monsters/NPCs (name, max HP, basic notes/stats).
    *   Mutation to save the new encounter and its initial participants.
*   [ ] **`ActiveEncounterView.tsx` Component:**
    *   Main view for managing an ongoing encounter.
    *   Displays encounter name and description.
    *   Includes `InitiativeTracker.tsx` component.
    *   Includes `EncounterParticipantList.tsx` component.
    *   Includes `SharedDiceRollDisplay.tsx` component.
    *   Controls for GM to manage the encounter (e.g., "End Encounter").

## IV. Initiative Tracking Components

*   [ ] **`EncounterParticipantList.tsx` Component (within `ActiveEncounterView.tsx`):**
    *   Displays all participants (characters and monsters).
    *   For each participant:
        *   Name.
        *   Input for `initiative` (editable by GM).
        *   Input for `current_hp` / `max_hp` (editable by GM).
        *   Dropdown/buttons to change `status` (e.g., 'defeated', 'fled').
        *   Button for GM to make a quick roll for this participant (opens dice roller with context).
    *   Updates to participants should be saved to Supabase and reflect in realtime.
*   [ ] **`InitiativeTracker.tsx` Component (within `ActiveEncounterView.tsx`):**
    *   Displays participants sorted by `initiative` (highest first).
    *   Clearly highlights the participant whose turn it currently is.
    *   "Next Turn" button for GM to advance to the next participant in initiative order.
    *   "Previous Turn" button.
    *   Visual indication of current round number.
    *   (Optional) Button to "Roll Initiative for All" un-set participants.

## V. Shared Dice Rolling System

*   [ ] **Modify `DiceContext.tsx` & `DiceRollerModal.tsx`:**
    *   Add a "Broadcast Roll" checkbox/toggle in the `DiceRollerModal.tsx`, visible to all users.
    *   When a roll is made and "Broadcast Roll" is checked:
        *   The roll details (dice, results, outcome, description, roller info) are saved to the `shared_dice_rolls` table in Supabase.
        *   The `party_id` and current `encounter_id` (if in an active encounter) should be associated with the roll.
    *   The `currentConfig` in `DiceContext` might need to accept `encounterId` if a roll is specific to an encounter.
*   [ ] **`SharedRollDisplay.tsx` Component (within `ActiveEncounterView.tsx` or a global toast-like system):**
    *   Subscribes to the `shared_dice_rolls` table via Supabase Realtime, filtered by the current `party_id` (and `encounter_id` if applicable).
    *   Displays incoming dice rolls from any user in the party who chose to broadcast.
    *   Format should be similar to the existing roll history, showing roller name, description, dice, and outcome.
    *   Consider how this integrates with or complements the local `rollHistory` in `DiceContext`.

## VI. API and State Management (`src/lib/api/`)

*   [ ] **`src/lib/api/encounters.ts`:**
    *   `fetchEncounters(partyId: string): Promise<Encounter[]>`
    *   `fetchEncounterDetails(encounterId: string): Promise<EncounterWithParticipants>` (type to define)
    *   `createEncounter(partyId: string, data: { name: string; description?: string; participants: NewParticipant[] }): Promise<Encounter>`
    *   `updateEncounter(encounterId: string, data: { name?: string; description?: string; status?: string }): Promise<Encounter>`
    *   `deleteEncounter(encounterId: string): Promise<void>`
    *   `addEncounterParticipant(encounterId: string, participantData: NewParticipantData): Promise<EncounterParticipant>`
    *   `updateEncounterParticipant(participantId: string, updates: { initiative?: number; currentHp?: number; status?: string }): Promise<EncounterParticipant>`
    *   `removeEncounterParticipant(participantId: string): Promise<void>`
*   [ ] **`src/lib/api/diceRolls.ts` (or integrate into existing dice logic):**
    *   `broadcastSharedRoll(rollData: SharedRollPayload): Promise<SharedDiceRoll>`
*   [ ] **React Query Updates:**
    *   Define new query keys for encounters, encounter details, and shared rolls.
    *   Implement `useQuery` hooks for fetching encounter data.
    *   Implement `useMutation` hooks for creating/updating/deleting encounters and participants, and for broadcasting rolls.
    *   Ensure proper cache invalidation and optimistic updates where appropriate.

## VII. UI/UX Considerations

*   [ ] **Clear Visual Distinction:** Ensure GM-specific controls are clearly identifiable and separate from player views.
*   [ ] **Intuitive Controls:** Design forms and interactions for ease of use, especially during active gameplay.
*   [ ] **Realtime Feedback:** Provide immediate visual feedback for actions that trigger realtime updates (e.g., initiative change, HP update, shared roll).
*   [ ] **Loading & Error States:** Implement robust loading and error handling for all asynchronous operations and realtime subscriptions.
*   [ ] **Responsive Design:** Ensure the GM view and encounter management tools are usable on various screen sizes.

## VIII. Types (`src/types/`)

*   [ ] Define `Encounter`, `EncounterParticipant`, `SharedDiceRoll` TypeScript types.
*   [ ] Update `Database` type in `database.types.ts` after schema changes.

This worklist provides a structured approach to developing the GM view and related functionalities.
