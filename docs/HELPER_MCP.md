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
Dragonbane MCP server (:3100/mcp)
        |
        | versioned JSON REST calls
        v
Dragonbane Node API (:3000/api/v1)
        |
        | shared Zod schemas + domain services + authorization
        v
PostgreSQL
```

The MCP server intentionally has no database connection. Validation,
authorization, revision checks, idempotency, rules, and events live in the API
and domain layer.

## Existing-model mapping

| Helper concept | Existing application model |
| --- | --- |
| Campaign | `parties` |
| Player character actor | `characters` |
| NPC or monster actor | active `encounter_combatants` |
| Combat | `encounters` |
| User identity | `users` plus `app_sessions` |
| Owner | `parties.created_by` |
| GM | owner, administrator, or a party member whose user role is `dm` |
| Player | a user represented in `party_members` |

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
by `DEVELOPMENT_USER_EMAIL`. Identity never comes from MCP arguments.

Campaign access is checked on every endpoint:

- administrators may access all campaigns;
- owners have GM access;
- `dm` users who are party members have GM access;
- other party members have player access;
- only GM access receives `gmContext`;
- players may modify only their own player character;
- appending narrative events requires GM access.

The production OAuth scopes and observer role are not part of this MVP.

## MVP tools

Read-only:

- `list_campaigns`
- `get_campaign_state`
- `get_actor`
- `get_combat_state`
- `get_recent_events`

Modifying:

- `apply_actor_changes`
- `append_campaign_event`

The modifying tools have `readOnlyHint: false`, `idempotentHint: true`, and
`openWorldHint: false`. Read-only tools advertise `readOnlyHint: true`.

## Deliberate MVP limits

- OAuth 2.1/PKCE and protected-resource discovery are not implemented.
- Sessions can be read when present in the database, but MCP session
  start/complete tools are not yet exposed.
- Combat can be read, but start/advance/resolve/end tools remain in the combat
  phase.
- Actor changes adjust only existing inventory quantities; adding a new item is
  deferred until item-definition and freeform-item validation is finalized.
- Existing boolean character conditions are exposed as stable UUID condition
  instances without replacing the web UI storage format.
- Roll modes and cryptographically recorded server rolls are not implemented.
- Production scope grants, observer membership, and player-specific combat
  actions require the OAuth/roles phase.

## Next phases

1. Add `start_session` and `complete_session`, including summaries, unresolved
   threads, ending location, and revisioned events.
2. Add combat domain services and `start_combat`, `resolve_game_action`,
   `advance_combat_turn`, and `end_combat`, with atomic action effects.
3. Add OAuth 2.1 Authorization Code + PKCE, protected-resource and authorization
   server metadata, scopes, consent, and an explicit campaign membership table
   for owner/GM/player/observer.
4. Add player/server/mixed roll modes and immutable roll events.
5. Package the workflow skill and run production HTTPS/ChatGPT developer-mode
   evaluations before enabling the public connector.

