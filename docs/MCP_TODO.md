# Draconi MCP To-Do List

This checklist tracks the work that follows the production deployment of the
Draconi Helper MCP endpoint.

## Completed foundation

- [x] Public Streamable HTTP endpoint at `https://draconi.ee/mcp`.
- [x] OAuth 2.1 Authorization Code flow with S256 PKCE and discovery metadata.
- [x] Per-user Draconi authentication with read/write OAuth scopes.
- [x] Campaign, actor, encounter, combat, event, and session MCP tools.
- [x] Revision checks, idempotency, campaign authorization, and event history.
- [x] Production deployment, database safety backup, smoke tests, and server
  dependency audit.
- [x] Ensure non-Helper campaign writes append a fallback audit event whenever
  they advance the campaign revision.

## Phase 1 — Campaign-specific roles

- [x] Add an explicit campaign membership model with `owner`, `gm`, `player`,
  and `observer` roles.
- [x] Backfill existing party owners and members without losing current access.
- [x] Replace reliance on the global `users.role` value in campaign permission
  checks.
- [x] Allow one user to have different roles in different campaigns.
- [x] Define observer access as read-only, excluding private GM context.
- [x] Add member-role management to the campaign settings UI.
- [x] Enforce the new roles consistently in the web API, Helper API, realtime
  subscriptions, projector data, and MCP tools.
- [x] Add authorization tests for every role and cross-campaign access attempt.
- [ ] Allow an owner to invite a GM or observer who does not join with a
  character; invite-code joins currently create player access and can be
  promoted afterward.
- [ ] Add administrator-visible OAuth connection and token revocation controls.

## Phase 2 — Trusted dice rolls

Solo foundation already delivered toward this phase:

- [x] Add immutable server roll records for Solo Fortune and Inspiration.
- [x] Generate Solo server rolls with a cryptographically secure random source.
- [x] Expose `get_solo_options`, `enable_solo_mode`, `get_solo_state`,
  `ask_fortune`, and `draw_inspiration` through REST and MCP.
- [x] Preserve raw dice, kept values, table versions, revision, idempotency, and
  campaign events for those Solo operations.
- [x] Persist custom Solo missions, public/secret waypoint separation, and one
  active threat beginning at 1.
- [x] Expose sequential waypoint reveal, +1/+2 threat advancement and trigger,
  and mission completion through REST and MCP.
- [x] Test that later unknown waypoint content and an untriggered threat effect
  are absent from API responses.
- [x] Seed Army of One and Sole Survivor with stable rule keys and explicit
  passive/contextual activation metadata.
- [x] Add confirmed solo heroic-ability selection without overwriting a
  pre-existing character ability.
- [x] Apply Sole Survivor in the failed-roll push flow for exactly 3 WP and no
  condition.
- [x] Model Army of One as one actor with two distinct initiative slots and two
  ordered turns per round in both the web encounter and Helper combat flows.
- [x] Add campaign-level Solo Mode settings for the solo hero, Fortune default,
  additional ability, current mission/threat status, and safe disable behavior.
- [x] Add a responsive Solo Dashboard with hero vitals, mission/waypoint state,
  threat clock, authoritative roll history, realtime refresh, and controls for
  all currently implemented Solo operations.
- [x] Add rules-aware Search and Scavenge actions with stored Spot Hidden checks,
  immutable server dice, per-waypoint usage, and automatic stretch/threat
  consequences through REST, MCP, and the Solo Dashboard.
- [x] Add rules-aware round, stretch, and shift rests with authoritative
  recovery rolls, explicit condition and safety choices, per-shift limits,
  game-time advancement, and active-mission threat consequences.
- [x] Add authoritative Solo narrative damage and 0 HP resolution with CON
  death rolls, unbaned Persuasion self-rally, life-saving Healing, D6 recovery,
  and persisted severe injuries.
- [x] Track severe-injury recovery in six-hour shifts, advance it during shift
  rests, halve remaining time after successful medical care, limit failed care
  retries to once per shift, and retain audited manual healing corrections.
- [x] Generalize severe-injury persistence to every campaign character sheet,
  including authoritative injury rolls, owner/GM authorization, resolved
  history, medical care, and ordinary shift-rest recovery.
- [x] Add authoritative general Solo skill and attribute checks outside combat,
  including stored targets, normal/boon/bane dice, Dragon/Demon advancement
  marks, versioned generic critical prompts, fail-forward signalling, REST,
  MCP, dashboard controls, events, and immutable roll history.
- [x] Resolve failed and Demon Solo checks through a one-time fail-forward flow,
  including manual acceptance, authoritative D6 choice between two consequences,
  immutable source-roll linkage, guarded mechanical effects, realtime events,
  dashboard controls, REST, and MCP.

- [x] Add immutable roll-request and roll-result records linked to campaign,
  session, encounter, actor, and user where applicable.
- [x] Support player, server, and mixed roll modes.
- [x] Generate server rolls with a cryptographically secure random source.
- [x] Record dice expression, individual dice, target value, boons/banes,
  Dragon/Demon results, damage, outcome, source, and timestamps.
- [x] Connect pushed rolls to their original request and recorded roll, apply and
  record the chosen condition, and require its narrative context.
- [x] Add MCP tools for requesting a roll, reading its result, and performing an
  authorized server roll. Physical dice can be submitted only through the
  authenticated REST route, never by the model.
- [x] Add an MCP operation for pushing an eligible failed roll without accepting
  die values from the model.
- [x] Deliver roll requests and results through the existing realtime campaign
  event system, including assigned-user visibility.
- [x] Show visibility-filtered trusted rolls in the web app, encounter view,
  player projector, and dedicated MCP campaign history.
- [x] Prevent ChatGPT from supplying or replacing authoritative dice outcomes.
- [x] Add tests for malformed dice expressions, mode enforcement, retries,
  idempotency, secure server resolution, pushed-roll linkage, and immutable
  readback.
- [x] Add assigned-user/all-player visibility authorization and concurrent-result
  tests, alongside the existing campaign-role and cross-campaign coverage.

## Phase 3 — GM workflow package

- [x] Package instructions that make ChatGPT load current campaign state before
  acting and treat Draconi as the authoritative source.
- [x] Define the recommended session start, scene, player-decision, roll,
  encounter, combat-turn, and session-completion workflows.
- [x] Define recovery behavior for stale revisions, interrupted conversations,
  missing identifiers, and reconnecting during an active session.
- [x] Ensure summaries preserve important events and unresolved story threads
  without exposing private GM notes to players.
- [x] Add example prompts for common GM and player workflows.

## Phase 4 — Authoritative resume state and equipment

Phase 4 is implemented. Its versioned contracts and migration behavior are
documented in `MCP_PHASE4_RESUME.md`.

### P0 — Canonical equipment and item placement

- [x] Add one server-side equipment normalizer used by `get_actor`,
  `get_campaign_state`, `get_solo_state`, combat actor reads, and actor writes.
  It must read the whole character equipment document rather than only
  `equipment.inventory`.
- [x] Return `weapons[]` as stable structured records with at least `id`, `name`,
  `definitionId`, `damage`, `range`, `grip`, `durability`, `equipped`, and item
  placement fields. Enrich name-only legacy equipment from `game_items` while
  preserving custom stored values as the authority.
- [x] Return armor, helmet, and shield as separate structured records and add an
  explicit `armorStatus` value (`none`, `equipped`, or `unknown`) so `null` never
  ambiguously means either missing data or no armor.
- [x] Add an `equipment[]` projection that combines weapons, armor, shield,
  ordinary inventory, containers, animals, and special items without losing the
  category-specific arrays. Every physical instance must have a stable ID.
- [x] Define one placement object for every equipment entry: `ownerId`,
  `carriedByActorId`, `locationId`, `containerId`, `equipped`, `heldByActorId`,
  and `temporarilyPlaced`. Do not derive current placement from campaign-event
  prose.
- [x] Define item runtime state separately from placement, including extensible
  `state`, `isLit`, `remainingDuration`, and `charges` fields. Persist state that
  must survive a reconnect; use explicit `null` or `unknown` semantics for legacy
  records rather than inventing defaults.
- [x] Preserve all equipment subdocuments during actor changes. Add regression
  coverage proving that an inventory quantity update cannot remove equipped
  weapons, armor, containers, money, or item notes.
- [x] Decide and document the canonical storage migration. Prefer instance-based
  equipment records (or a versioned equipment JSON schema with stable IDs) over
  matching equipped items by display name. Backfill legacy name-only equipment
  idempotently and report unresolved definitions instead of silently dropping
  them.

Acceptance criteria:

- A character whose dagger exists only in `equipment.equipped.weapons` returns
  that dagger from both `get_actor` and the aggregate resume read.
- A carried torch and a temporarily placed special item each have an unambiguous
  placement and runtime state without reading recent events.
- Every equipment item appears exactly once in `equipment[]`, while typed views
  reference the same stable item ID.

### P0 — Scene checkpoint and one-call resume

- [x] Define and validate a versioned `CurrentScene` contract instead of accepting
  an unrestricted JSON object. It should cover `location`, `description`,
  `activeObjects`, `exits`, and `dangers`, with visibility rules for GM-only
  fields.
- [x] Add an idempotent, revision-checked `checkpoint_session` command for an
  active session. In one transaction it must store the checkpoint summary,
  update `parties.current_scene`, replace the explicit unresolved threads when
  supplied, advance the campaign revision once, and append one audited campaign
  event. If a lightweight `update_current_scene` command is also added, it must
  use the same scene schema and audit path.
- [x] Keep `start_session.opening_scene` and `complete_session.ending_scene`, but
  validate them with the same scene schema so all three write paths produce the
  same authoritative representation.
- [x] Add `get_resume_state` to REST and MCP. Build it in the Helper service layer
  from one authorization context and a consistent database snapshot; do not have
  the MCP adapter stitch together several HTTP responses that can observe
  different campaign revisions.
- [x] Return at least the following stable top-level contract, with an explicit
  `schemaVersion`, `campaignRevision`, and role-filtered visibility:

```json
{
  "schemaVersion": "resume-state-v1",
  "campaignRevision": 0,
  "character": {
    "vitals": {},
    "conditions": [],
    "weapons": [],
    "armor": [],
    "inventory": [],
    "specialItems": [],
    "heldItems": [],
    "equipment": []
  },
  "scene": {
    "location": "",
    "description": "",
    "activeObjects": [],
    "exits": [],
    "dangers": []
  },
  "session": {
    "activeSession": null,
    "lastCheckpoint": null,
    "unresolvedThreads": []
  },
  "combat": null,
  "solo": null
}
```

- [x] For campaigns with multiple player characters, return `characters[]` and
  an explicit `focusCharacterId`; retain the singular `character` convenience
  field only when a solo hero or an unambiguous requested actor is selected.
- [x] Include active combat, active Solo mission/waypoint/threat, structured
  dangers, and the latest checkpoint in the same snapshot. Hidden waypoint,
  danger, GM-context, and unresolved-thread data must retain current role-based
  filtering.
- [x] Update the published GM workflow and MCP server instructions to prefer
  `get_resume_state` for reconnect/resume, while keeping the narrower reads for
  turn-by-turn or diagnostic use.

Acceptance criteria:

- One read is sufficient to continue a standard or Solo session at exactly one
  campaign revision.
- Creating a checkpoint immediately changes the scene returned by
  `get_campaign_state`, `get_solo_state`, and `get_resume_state`.
- A reconnect never needs event-text parsing to determine the current scene,
  held items, placed items, active dangers, or unresolved threads.

### P1 — Conditions, load, time, dangers, and roll hand-off

- [x] Normalize conditions into first-class records with `source`, `appliedAt`,
  duration/expiry, description, and the affected checks or attributes. Preserve
  compatibility with the existing boolean condition map during migration.
- [x] Reuse one server-side encumbrance calculation for web-facing Helper
  responses. Return per-item weight, total carried load, capacity, container
  loads, threshold, and `isEncumbered`; do not duplicate the current UI-only
  calculation in the MCP adapter.
- [x] Normalize `gameTime` into a versioned round/stretch/shift model and advance
  finite item durations, including lit torches, through the same authoritative
  time service used by rests and combat.
- [x] Generalize structured scene dangers beyond `solo_dangers`, or introduce a
  common danger projection whose records can belong to either a campaign scene
  or a Solo waypoint. Add audited create/update/resolve operations and include
  only visible active dangers in resume state.
- [x] Keep physical/player dice outside MCP input. The existing authenticated
  player REST submission remains the trust boundary; make pending requests and
  their submission status obvious in resume state and ensure accepted player
  results immediately appear in roll history. Do not add an MCP tool that lets a
  model submit user-reported die values.
- [x] When free exploration is not modeled as a full Solo mission, persist a
  lightweight scene route/checkpoint structure so current waypoint-like location
  and threat state are still resumable.

### Delivery slices and verification

1. **Equipment read correctness:** normalizer, definition enrichment, stable IDs,
   typed arrays, write-preservation regression tests, and `get_actor` contract.
2. **Authoritative checkpoint:** versioned scene schema, checkpoint migration and
   command, shared start/complete validation, revision/idempotency/event tests.
3. **Resume snapshot:** service-layer consistent read, REST route, MCP tool,
   privacy filtering, workflow update, and reconnect evaluation.
4. **Runtime depth:** item state and time, encumbrance, first-class conditions,
   general scene dangers, and lightweight free-exploration structure.

Each slice must include Helper service tests, REST validation/authorization
tests, MCP registration and schema tests, an end-to-end smoke scenario, and a
production evaluation fixture covering reconnect after concurrent web-app and
MCP changes. Preserve existing response fields during the first release and
announce removals only through a later schema-version change.

## Phase 5 — Production evaluations

- [ ] Test complete exploration, social, skill-test, pushed-roll, and combat
  sessions through ChatGPT.
- [ ] Test reconnecting halfway through a session or combat encounter.
- [ ] Test concurrent changes from ChatGPT and the Draconi web application.
- [ ] Verify every GM-only operation is rejected for players and observers.
- [ ] Verify tool selection for direct, indirect, follow-up, and unsupported
  requests.
- [ ] Record baseline evaluation results and rerun them after MCP schema or
  workflow changes.

## Later MCP extensions

- [ ] Add and remove inventory items instead of changing only existing
  quantities.
- [ ] Create and manage NPCs.
- [ ] Support initiative redraw, swap, and delay actions.
- [ ] Manage treasure, rewards, experience, and advancement.
- [ ] Manage campaign locations, quests, journals, and relationships.
- [ ] Control projector scenes and combat presentation from MCP.
