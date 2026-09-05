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

The modifying tools have `readOnlyHint: false`, `idempotentHint: true`, and
`openWorldHint: false`. Read-only tools advertise `readOnlyHint: true`.

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
   by the prepared combat state and cards 1–10.
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
- Roll modes and cryptographically recorded server rolls are not implemented.
- Inviting a GM or observer without first joining as a player is not yet
  implemented; owners can promote an existing campaign member in Campaign
  Roles.

## Next phases

The detailed, checkable roadmap is maintained in
[Draconi MCP To-Do List](MCP_TODO.md).

1. Add player/server/mixed roll modes and immutable roll events.
2. Package the workflow skill and run production HTTPS/ChatGPT developer-mode
   evaluations before enabling the public connector.
