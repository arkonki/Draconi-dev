# Encounters Feature: Build Plan

This document outlines the development plan for the "Encounters" feature, enabling Dungeon Masters (DMs) to build, run, and manage combat encounters in real-time for their parties.

## 1. Goals & Overview

*   **DM Encounter Building**: Allow DMs to create encounters by selecting a party and adding multiple monsters (same or different types) from the Bestiary.
*   **Real-time Encounter Dashboard**: Provide a shared view for DMs and players participating in an encounter.
    *   Display Player Characters (PCs) with compact info cards (HP, WP, status, initiative).
    *   Display Monsters with "Beastcards" (stats, rollable attacks, multiple initiatives).
*   **Dynamic Initiative System**:
    *   Players set their initiative (1-10) via a popup when an encounter starts.
    *   Monsters have initiative values, potentially multiple based on their "Ferocity" stat.
    *   All participants see all initiatives in real-time.
    *   DMs can override/reassign initiative values.
*   **Real-time Updates**: Changes to combatant status (HP, initiative, etc.) are reflected live for all participants.

## 2. Database Schema (Supabase)

We'll need two main tables: `encounters` to define an encounter instance, and `encounter_combatants` to list who/what is involved and their state within that specific encounter.

### 2.1. `encounters` Table

Stores metadata about each encounter.

*   `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
*   `party_id`: `uuid` (Foreign Key referencing `parties.id`, NOT NULL) - The party this encounter is for.
*   `created_by`: `uuid` (Foreign Key referencing `auth.users.id`, NOT NULL) - The DM who created it.
*   `name`: `text` (NOT NULL, e.g., "Goblin Ambush in the Woods")
*   `description`: `text` (Optional, for DM notes)
*   `status`: `text` (NOT NULL, default: `'planning'`, values: `'planning'`, `'active'`, `'paused'`, `'completed'`)
*   `current_round`: `integer` (Default: `0` or `1`, tracks combat rounds)
*   `environment_details`: `jsonb` (Optional, e.g., `{ "lighting": "dim", "terrain": "rocky" }`)
*   `created_at`: `timestamptz` (Default: `now()`, NOT NULL)
*   `updated_at`: `timestamptz` (Default: `now()`, NOT NULL)

**RLS Policies for `encounters`:**
*   DMs can create encounters for parties they are members of (or a specific DM role).
*   Party members can view encounters their party is part of.
*   Only the creating DM (or designated DMs) can update/delete encounters or change their status.

### 2.2. `encounter_combatants` Table

Links characters and monsters to a specific encounter instance and tracks their dynamic state.

*   `id`: `uuid` (Primary Key, default: `gen_random_uuid()`)
*   `encounter_id`: `uuid` (Foreign Key referencing `encounters.id` ON DELETE CASCADE, NOT NULL)
*   `character_id`: `uuid` (Foreign Key referencing `characters.id` ON DELETE SET NULL, nullable) - If this combatant is a player character.
*   `monster_id`: `uuid` (Foreign Key referencing `monsters.id` ON DELETE SET NULL, nullable) - If this combatant is a monster (references the *type* of monster from the bestiary).
*   `monster_instance_alias`: `text` (Nullable, e.g., "Goblin Boss", "Wolf Alpha", "Skeleton 1") - To distinguish multiple monsters of the same type. If null, a default can be generated (e.g., "Monster Name #N").
*   `is_player_character`: `boolean` (NOT NULL, set automatically based on `character_id` presence)
*   `current_hp`: `integer` (NOT NULL)
*   `max_hp`: `integer` (NOT NULL, copied from character/monster at time of adding)
*   `current_wp`: `integer` (Nullable, for PCs, copied from character at time of adding)
*   `max_wp`: `integer` (Nullable, for PCs)
*   `status_effects`: `jsonb` (Default: `'[]'::jsonb`, array of objects: `{ id: uuid, name: string, description: string, duration_rounds: number | null, source: string }`)
*   `initiative_values`: `integer[]` (Default: `'{}'`, array of initiative scores. PCs usually one value, monsters can have multiple based on Ferocity.)
*   `turn_order_position`: `integer` (Nullable, can be used for sorting if initiative values are equal or for manual DM override of turn sequence)
*   `is_active_turn`: `boolean` (Default: `false`, indicates if it's this combatant's turn)
*   `notes_dm_only`: `text` (Optional, for DM's private notes on this specific combatant in this encounter)
*   `created_at`: `timestamptz` (Default: `now()`, NOT NULL)
*   `updated_at`: `timestamptz` (Default: `now()`, NOT NULL)

**RLS Policies for `encounter_combatants`:**
*   DMs (creator of the encounter) can CRUD combatants within their encounters.
*   Party members (whose characters are combatants) can view their own combatant entry and other combatants' non-sensitive info (HP, initiative, status effects).
*   Party members can update their own initiative (if encounter status allows).
*   Sensitive fields like `notes_dm_only` should only be visible to the DM.

**Indexes:**
*   On `encounters(party_id)`
*   On `encounter_combatants(encounter_id)`
*   On `encounter_combatants(character_id)`
*   On `encounter_combatants(monster_id)`

## 3. API Layer (`src/lib/api/encounters.ts`, `src/lib/api/combatants.ts`)

Functions to interact with the Supabase tables.

### 3.1. Encounter Management (`encounters.ts`)

*   `createEncounter(partyId: string, name: string, description?: string): Promise<Encounter>`
*   `fetchEncountersForParty(partyId: string): Promise<Encounter[]>`
*   `fetchEncounterDetails(encounterId: string): Promise<EncounterWithCombatants>` (joins with combatants)
*   `updateEncounter(encounterId: string, updates: Partial<Encounter>): Promise<Encounter>` (for name, description, status, current_round)
*   `deleteEncounter(encounterId: string): Promise<void>`
*   `startEncounter(encounterId: string): Promise<Encounter>` (sets status to 'active', potentially triggers initiative phase)
*   `endEncounter(encounterId: string): Promise<Encounter>` (sets status to 'completed')

### 3.2. Combatant Management (`combatants.ts`)

*   `addCharacterToEncounter(encounterId: string, characterId: string): Promise<EncounterCombatant>`
    *   Copies relevant stats (HP, WP) from the `characters` table.
    *   Sets `is_player_character` to `true`.
*   `addMonsterToEncounter(encounterId: string, monsterId: string, alias?: string): Promise<EncounterCombatant>`
    *   Copies relevant stats (HP, Ferocity for initiative slots) from the `monsters` table.
    *   Sets `is_player_character` to `false`.
    *   Generates multiple `initiative_values` slots based on Ferocity (e.g., an array of nulls or default values).
*   `fetchCombatantsForEncounter(encounterId: string): Promise<EncounterCombatant[]>`
*   `updateCombatant(combatantId: string, updates: Partial<EncounterCombatant>): Promise<EncounterCombatant>`
    *   Used for HP changes, status effects, initiative updates.
*   `removeCombatant(combatantId: string): Promise<void>`
*   `setPlayerInitiative(combatantId: string, initiative: number): Promise<EncounterCombatant>` (specific for players, checks permissions)

## 4. UI Components

### 4.1. `EncounterBuilder` (DM-only View)

*   Route: e.g., `/dm/parties/:partyId/encounters/new` or `/dm/encounters/:encounterId/edit`
*   Functionality:
    *   Select/confirm party.
    *   Set encounter name, description.
    *   Monster selection area:
        *   Browse/search Bestiary (reusing existing Bestiary components if possible).
        *   Button to "Add Monster to Encounter".
        *   Specify quantity or add individually.
        *   Assign aliases to monsters (e.g., "Goblin 1", "Goblin Leader").
    *   List of currently added monsters and party characters (characters might be auto-added or selectable).
    *   Save encounter (status: 'planning').
    *   Button to "Start Encounter".

### 4.2. `EncounterDashboard` (Shared View for DM & Players)

*   Route: e.g., `/party/:partyId/encounters/:encounterId` or `/encounters/:encounterId`
*   Displays encounter name, status, current round.
*   Layout:
    *   **Left Pane (or top for mobile): Player Characters**
        *   List of `CompactCharacterCard` components.
    *   **Main/Right Pane: Monsters & Initiative Tracker**
        *   List of `BeastCard` components for each monster instance.
        *   `InitiativeTracker` component displaying all combatants (PCs and Monsters) sorted by initiative.
*   DM Controls (visible only to DM):
    *   Advance round.
    *   Manually edit HP/WP/status/initiative for any combatant.
    *   Remove combatant.
    *   Add monster "on the fly".
    *   End encounter.

### 4.3. `CompactCharacterCard`

*   Input: `combatantData: EncounterCombatant` (where `is_player_character` is true), `characterData: Character` (full character sheet for reference if needed).
*   Display:
    *   Character Name & Avatar.
    *   Current HP / Max HP.
    *   Current WP / Max WP.
    *   Active Status Effects (icons or short text).
    *   Current Initiative Value(s).
    *   (DM View) Quick edit buttons for HP/status.

### 4.4. `BeastCard` (New Component)

*   Input: `combatantData: EncounterCombatant` (where `is_player_character` is false), `monsterData: MonsterData` (from Bestiary, linked via `combatantData.monster_id`).
*   Display:
    *   Monster Name & Alias (e.g., "Goblin (Goblin Scout 1)").
    *   Key Stats (Armor, Movement, Size - from `monsterData.stats`).
    *   Current HP / Max HP (from `combatantData`).
    *   Active Status Effects.
    *   Current Initiative Value(s) (from `combatantData.initiative_values`).
    *   Rollable Attack Table (from `monsterData.attacks`):
        *   List attack names.
        *   Clicking an attack name could show its full description and a button to "Roll Attack" (DM only).
        *   Rolling could trigger dice rolls and display results (integration with dice roller).
        *   Effects associated with attacks.
    *   (DM View) Quick edit buttons for HP/status/initiative.

### 4.5. `InitiativePopup` (Player View)

*   Modal or prominent overlay.
*   Triggered for players when an encounter they are part of transitions to `status: 'active'` and their `initiative_values` are not yet set.
*   Content: "Encounter Started! Set your initiative (1-10)."
*   Input field for initiative value.
*   Submit button -> calls `setPlayerInitiative()`.

### 4.6. `InitiativeTracker`

*   Displays a list of all combatants (PCs and Monsters) in the current encounter.
*   Each entry shows: Combatant Name/Alias, Initiative Value(s).
*   Sorted by initiative (highest first). Tie-breaking rules might be needed (e.g., Dexterity, or DM decides).
*   Highlights the combatant whose `is_active_turn` is true.

## 5. Real-time Implementation

*   Leverage Supabase Realtime for `encounters` and `encounter_combatants` tables.
*   The existing `useEncounterRealtime(encounterId)` hook is a good foundation. It needs to be integrated into the `EncounterDashboard` and other relevant components.
*   When data changes (e.g., HP update, initiative set, status change):
    *   Supabase sends a message.
    *   The hook triggers a refetch of data via React Query (`queryClient.invalidateQueries`).
    *   Components re-render with new data.
*   Specific actions like setting initiative or DM updates will call API functions, which modify the database, triggering the real-time flow.

## 6. Workflow Details

1.  **DM Creates Encounter**:
    *   DM navigates to encounter creation UI.
    *   Selects party, names encounter, adds monsters (setting aliases), adds PCs.
    *   Saves encounter (status: 'planning').
2.  **DM Starts Encounter**:
    *   DM clicks "Start Encounter" on a 'planning' encounter.
    *   Encounter status changes to 'active'.
    *   This change is picked up by players' clients via real-time subscription.
3.  **Players Set Initiative**:
    *   Players in the active encounter (whose `character_id` is in `encounter_combatants`) see the `InitiativePopup`.
    *   They submit their initiative (1-10). This updates their `initiative_values` in `encounter_combatants`.
    *   The `InitiativeTracker` updates for everyone.
4.  **Monsters Get Initiative**:
    *   When a monster is added, or when the encounter starts, the DM (or system automatically) sets initiative for each of the monster's Ferocity-based slots. This could be a roll or a fixed value.
    *   The `InitiativeTracker` updates.
5.  **Combat Round**:
    *   DM manages turn order (potentially highlighting active combatant, `is_active_turn`).
    *   DM updates monster HP, applies status effects.
    *   Players might report their actions, DM updates their character's HP/status in the encounter.
    *   `BeastCard` allows DM to quickly reference monster attacks and roll them.
    *   All changes are real-time.
6.  **DM Reassigns Initiative (Optional)**:
    *   DM can click on an initiative value in the tracker or a card and change it.
7.  **DM Ends Encounter**:
    *   DM clicks "End Encounter".
    *   Status changes to 'completed'.
    *   Dashboard might show a summary or become read-only.

## 7. Key Considerations & Challenges

*   **Monster Ferocity & Multiple Initiatives**:
    *   The `initiative_values: integer[]` array in `encounter_combatants` will store these.
    *   The `InitiativeTracker` needs to correctly display and sort combatants that might appear multiple times in the initiative order if they have multiple initiative values.
    *   The UI needs to be clear about which initiative slot for a monster is currently active if it has multiple turns.
*   **Data Synchronization**: Ensuring data consistency between `characters`/`monsters` (source of truth for base stats) and `encounter_combatants` (instance-specific state).
*   **DM Authority vs. Player Agency**: Balancing DM control with player input (e.g., players setting their own initiative initially).
*   **UI Complexity**: The `EncounterDashboard` can become dense. Clear, intuitive design is crucial. Responsive design for different screen sizes.
*   **Error Handling & Edge Cases**: Network issues, concurrent updates, invalid inputs.
*   **Performance**: With many combatants and frequent updates, ensure React Query and real-time subscriptions are optimized.

## 8. Future Enhancements (Post-MVP)

*   Automated turn tracking (next/previous combatant buttons).
*   Visual map/grid integration.
*   More complex status effect management (durations, automated effects).
*   Saving encounter "templates" for DMs to reuse.
*   Player-controlled actions that directly update their combatant state (e.g., "Use Healing Potion" button).

This plan provides a detailed roadmap. Implementation should proceed iteratively, starting with database schema, then core API functions, followed by DM encounter building, and finally the real-time dashboard components.
