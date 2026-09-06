# Dragonbane Helper API and MCP architecture

## Goal

Dragonbane Helper is the authoritative campaign state store. ChatGPT or another
MCP client may read and request controlled changes, but it must not invent or
persist campaign state in conversation memory.

```text
ChatGPT / MCP client
        |
        | Streamable HTTP + bearer/OAuth token
        v
Dragonbane MCP transport (/mcp; integrated with production API)
        |
        | versioned JSON REST calls
        v
Dragonbane Node API (:3000/api/v1)
        |
        | shared Zod schemas + domain services + authorization
        v
PostgreSQL
```

The MCP transport calls the Helper REST contract instead of accessing campaign
tables. Validation, campaign authorization, revision checks, idempotency,
rules, and events live in the API and domain layer. The standalone port 3100
transport remains available for local tunnel testing.

## Existing-model mapping

| Helper concept | Existing application model |
| --- | --- |
| Campaign | `parties` |
| Player character actor | `characters` |
| NPC or monster actor | active `encounter_combatants` |
| Combat | `encounters` |
| User identity | `users` plus `app_sessions` |
| Campaign membership | `campaign_memberships` |
| Owner | campaign creator with an `owner` membership |
| GM | a user with a campaign-specific `gm` membership |
| Player | a user with a campaign-specific `player` membership |
| Observer | a user with a read-only `observer` membership |

This avoids a second character, encounter, or identity system. Actor reads
prefer active encounter HP/WP when a player character is in combat. Helper
writes update both the character and its active encounter combatant in the same
transaction.

## Consistency model

`parties.helper_revision` is the campaign revision. Helper writes lock the
campaign row, compare the supplied revision, suppress automatic revision
triggers for their internal row updates, and increment the campaign exactly
once. Writes made by the existing web application touch the revision through
database triggers, so an MCP client detects changes made outside `/api/v1`.
Those non-Helper writes also append a GM-visible
`app.<table>.<operation>` fallback event with the affected record and changed
field names. Helper commands suppress that fallback because they already append
richer domain events explicitly.

All Helper writes require an idempotency key. The database stores the canonical
request hash and original structured response. Replaying the same request
returns that response; reusing the key with different arguments returns
`IDEMPOTENCY_CONFLICT`.

`campaign_events` is append-only through application APIs. Events have a
per-campaign sequence, visibility, source, prior/resulting revisions, and the
idempotency key that caused the event. Campaign deletion may cascade its events
so existing application lifecycle behavior is not broken.

## Authorization

Development mode maps the secret `DEVELOPMENT_TOKEN` to the existing user named
by `DEVELOPMENT_USER_EMAIL`. Production uses OAuth 2.1 Authorization Code with
S256 PKCE. It publishes protected-resource and authorization-server metadata,
supports dynamic client registration, issues hashed short-lived access tokens
and rotating refresh tokens, and asks the user to sign in and consent on
Draconi. OAuth grants use `draconi:read` and `draconi:write`. Identity never
comes from MCP arguments.

Campaign access is checked on every endpoint:

- administrators may access all campaigns;
- owners and campaign-specific GMs have GM access;
- players have normal campaign and chat access;
- observers have read-only campaign and chat access;
- only GM access receives `gmContext`;
- players may modify only their own player character;
- appending narrative events requires GM access.

OAuth scopes are enforced at the Helper REST boundary. The current campaign
role is returned by Helper and MCP reads. The account-wide `users.role` value
does not grant access to an unrelated campaign.

## MVP tools

Read-only:

- `list_campaigns`
- `get_campaign_state`
- `get_actor`
- `get_combat_state`
- `get_encounter_setup_options`
- `get_session_history`
- `get_recent_events`
- `get_solo_options`
- `get_solo_state`

Modifying:

- `apply_actor_changes`
- `append_campaign_event`
- `create_encounter`
- `add_encounter_participants`
- `remove_encounter_participant`
- `start_combat`
- `resolve_game_action`
- `advance_combat_turn`
- `end_combat`
- `start_session`
- `complete_session`
- `enable_solo_mode`
- `disable_solo_mode`
- `select_solo_heroic_ability`
- `ask_fortune`
- `draw_inspiration`
- `start_solo_mission`
- `reveal_waypoint`
- `search_waypoint`
- `scavenge_waypoint`
- `take_solo_rest`
- `resolve_solo_dying_action`
- `resolve_solo_narrative_damage`
- `advance_threat`
- `complete_solo_mission`

The modifying tools have `readOnlyHint: false`, `idempotentHint: true`, and
`openWorldHint: false`. Read-only tools advertise `readOnlyHint: true`.

## Solo foundation

Custom solo campaigns can bind one existing campaign character to the
`db-solo-v1.2` rules model. Enabling solo mode never silently grants or replaces
a heroic ability; the response asks the user to review that character choice.
Existing campaigns remain non-solo until an owner or campaign GM explicitly
enables the mode.

After the user confirms the choice, `select_solo_heroic_ability` assigns one
additional heroic ability to the configured solo character. The two solo
abilities are stored as normal compendium abilities with stable rule keys:
`solo.army_of_one` and `solo.sole_survivor`. Replacing a previous solo choice
removes it only when Draconi originally granted it, so pre-existing character
abilities are preserved.

Campaign owners and GMs can configure the same state from the campaign's Solo
Mode settings panel. The panel selects the solo hero, Fortune default, and
additional heroic ability, and shows the active mission, waypoint, and threat.
Disabling solo mode is blocked during active combat or an active solo mission.
It removes only an additional ability that Draconi itself granted for solo play.

The campaign's Solo Adventure tab provides the playable web dashboard. It shows
the bound hero's HP, WP, conditions, equipped items and Solo ability alongside
the mission route, current waypoint, threat counter, active combat, and recent
authoritative rolls. Campaign owners and GMs can use the same guarded operations
as MCP to ask Fortune, draw Inspiration, create a custom mission, reveal the next
waypoint, advance its threat, and conclude it. Campaign events refresh this view
over the existing WebSocket channel, with periodic refetch as a fallback.

`Sole Survivor` is integrated into the failed-test push flow. A lone configured
solo character may spend exactly 3 WP to reroll without taking a condition;
the normal condition-based push remains available. `Army of One` is represented
as one combatant with two distinct initiative slots and two turns per round.
Monster ferocity actions remain separate participants and are interleaved with
both hero slots in global initiative order.

`ask_fortune` and `draw_inspiration` use cryptographically secure server rolls.
Every result stores the expression, every die, kept indices and values, table
version, result payload, user, active session, selected solo actor, and campaign
revision in the immutable `recorded_rolls` table. The same transaction advances
the campaign revision and appends a campaign event. Idempotent replay returns the
original roll instead of rolling again.

The Fortune table implements the Solo v1.2 category and tilt mechanics. Until an
authorized official data pack is installed, Inspiration uses the separately
versioned `draconi-generic-v1` table and is explicitly identified as non-official
in API responses. Deepfall Breach remains unavailable rather than exposing or
inventing protected module content.

Custom missions persist an objective, ordered waypoints, and one active threat.
Unknown waypoint payloads are stored separately from public waypoint rows and
are not returned by `get_solo_state` before revelation. Waypoints advance only
in sequence. Threats begin at 1, advance by 1 or 2 with an audited reason, and
trigger at 6; recurring threats reset to 1. A successful mission can only be
completed from its final objective waypoint.

The active waypoint also tracks Search and Scavenge usage. A thorough
`search_waypoint` resolves the solo hero's stored Spot Hidden value (unless the
hero already knows the exact hiding place), records the skill die and any find
dice, consumes one stretch, and advances the threat by 1. A Dragon offers two
find groups to choose between; failure finds nothing; a Demon reveals a new
danger. The first quick `scavenge_waypoint` attempt at a location does not
consume a stretch, while repeat attempts and explicitly prolonged scavenging
consume one stretch and advance the threat by 1. Both tools use the clearly
labelled `draconi-generic-v1` exploration table. Their abstract findings are
prompts and never silently add an item to character inventory.

`take_solo_rest` resolves recovery as an authoritative Solo action. A round
rest takes 10 seconds, restores D6 WP, and is available once per shift. A
stretch rest takes 15 minutes, restores D6 HP and D6 WP, clears one standard
condition explicitly chosen by the player, and is available once per shift.
The optional stored Healing test raises HP recovery to 2D6 on success; a failed
test retains the ordinary D6 recovery. A shift rest takes six hours, requires
the user to confirm a safe location, fully restores HP and WP, and clears the
six standard conditions. It begins a new shift and resets the round/stretch
limits. Stretch and shift rests advance an active mission threat by 1. Poison,
fear effects, and custom statuses are deliberately preserved. Every recovery
roll, state change, game-time advance, and threat consequence is recorded.

At 0 HP, `resolve_solo_dying_action` owns the authoritative dying flow. A death
roll tests CON; ordinary outcomes add one success or failure, while Dragon and
Demon add two. Three successes immediately recover D6 HP and create a severe
injury, while three failures record the character's death. The Solo self-rally
tests the stored Persuasion value without a bane and a successful life-saving
Healing test also recovers D6 HP. Recovery rolls a versioned severe-injury table
and persists the injury, mechanical effect, permanence, and rolled healing
days. Legacy characters already stored at three successes can explicitly
complete recovery without another death roll.

`resolve_solo_narrative_damage` applies damage outside combat only after the
player confirms the consequence. Known severity uses slight D6, moderate 2D6,
or severe 2D10; unknown severity first rolls the Solo D6 severity table. Damage
at 0 HP adds a failed death roll. Every die, HP transition, death counter, and
instant-death result is stored in the same transaction. Active combat rejects
this route so combat damage remains in `resolve_game_action`.

## Combat workflow

Combat preparation and runtime tools are GM-only:

1. Call `get_encounter_setup_options` to discover valid party characters,
   searchable local monsters, resolved monster ferocity, and existing planned
   encounters.
2. Read the latest campaign revision, call `create_encounter`, and then call
   `add_encounter_participants`. Monster `count` and ferocity expand into the
   same separate action entries used by the web UI. Participants can be removed
   while the encounter is still planning.
3. Call `start_combat` with initiative assignments using the actor IDs returned
   by the prepared combat state and cards 1–10. A lone solo character with
   `Army of One` must receive two distinct `initiative_slots`; all other actors
   receive one slot.
4. Read the active combat state, obtain the active actor's roll/outcome from the
   user or application, and call `resolve_game_action`. Its effects are applied
   atomically across all target actors.
5. After a turn-consuming action, call `advance_combat_turn`. It selects the
   next living participant and starts a new round after everyone has acted.
6. Call `end_combat` with the outcome and a durable summary.

Starting combat synchronizes player-character HP/WP from the character table.
Actor effects continue to synchronize character and active-combatant vitals.
Combat transitions also update the existing encounter log so the web combat UI
and MCP clients see the same progression.

## Game session workflow

Game session tools are GM-only except for session-history reads. A session is a
durable container for the campaign events produced during one period of play:

1. Read the campaign state and call `start_session` with a title, optional
   opening scene, and optional private GM notes.
2. Run narrative and combat play normally. New campaign events automatically
   receive the active session ID.
3. Read the latest revision and call `complete_session` with a durable summary,
   explicit unresolved threads (an empty array when there are none), and an
   optional ending scene.
4. Use `get_session_history` when resuming later to retrieve prior summaries.

Only one session may be active for a campaign. Completing it clears the active
session pointer while keeping its immutable event history.

## Deliberate MVP limits

- Initiative is preserved at round rollover. Re-drawing or swapping initiative
  remains a web application operation.
- Actor changes adjust only existing inventory quantities; adding a new item is
  deferred until item-definition and freeform-item validation is finalized.
- Existing boolean character conditions are exposed as stable UUID condition
  instances without replacing the web UI storage format.
- General player/manual/mixed roll modes are not implemented. Solo Fortune,
  Inspiration, Search, and Scavenge do have immutable cryptographically
  generated server rolls.
- Inviting a GM or observer without first joining as a player is not yet
  implemented; owners can promote an existing campaign member in Campaign
  Roles.

## Next phases

The detailed, checkable roadmap is maintained in
[Draconi MCP To-Do List](MCP_TODO.md).

1. Add player/server/mixed roll modes and immutable roll events.
2. Package the workflow skill and run production HTTPS/ChatGPT developer-mode
   evaluations before enabling the public connector.
