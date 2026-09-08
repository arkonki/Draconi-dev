# MCP Phase 4: authoritative resume state

Phase 4 uses PostgreSQL as the authority for reconnecting an MCP-assisted game.
The preferred read is `get_resume_state` (REST:
`GET /api/v1/campaigns/{campaignId}/resume-state`). The service performs that
read in one repeatable-read, read-only transaction and returns
`resume-state-v1` with one `campaignRevision`.

The snapshot contains all campaign characters, an explicit
`focusCharacterId`, the singular `character` convenience projection when a
focus is known, current scene, latest checkpoint, unresolved threads for GMs,
active combat, active Solo mission/waypoint/threat/dangers, visible pending and
recent roll requests, and `game-time-v1`.

## Equipment v2

Migration 0030 converts legacy top-level inventory arrays without discarding
them and marks every character equipment document as `equipment-v2`. The
parallel `instanceIds` map gives name-only equipped slots a persisted stable
UUID while leaving the web character-sheet storage shape compatible. Existing
valid item UUIDs remain authoritative.

Every Helper actor item has separate `placement` and `state` records. Placement
contains owner, carrier, location, container, equipped/held, and temporary
placement fields. Runtime state contains explicit status, lit state, remaining
duration, charges, broken/enhanced state, and bonus data. Actor writes preserve
these fields, and unresolved catalog definitions are reported in
`unresolvedEquipmentDefinitions`.

The server returns `encumbrance-v1`, including capacity, carried load,
container loads, threshold, overload flags, and items whose weight had to use
the legacy one-slot fallback. Rations retain the existing four-per-load rule.

## Conditions and time

Migration 0029 retains the web-compatible boolean condition map and adds a
normalized details document. Helper condition records consistently contain
source, application/expiry timestamps, description, duration, and affected
checks/attributes. A database trigger keeps details aligned when the web app
changes the boolean map.

Game time uses `game-time-v1`: elapsed seconds plus derived rounds, stretches,
and shifts. Solo rests and completed combat rounds advance it. Finite item
durations advance in the same transaction; an expired lit item is persisted as
unlit with status `expired`.

## Scenes and handoffs

All session opening, checkpoint, and ending scenes use `current-scene-v1`.
Scene dangers support active/resolved status, visibility, source, and
application/resolution timestamps. `checkpoint_session` is the audited create,
update, and resolve path for scene dangers and also supports ordinary
exploration outside a Solo mission.

The resume snapshot exposes visible pending roll requests separately under
`rolls.pending` and includes their resolved history under `rolls.recent`.
Physical dice remain accepted only by the authenticated player REST endpoint;
MCP has no manual-dice submission tool.
