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

- [ ] Add immutable roll-request and roll-result records linked to campaign,
  session, encounter, actor, and user where applicable.
- [ ] Support player, server, and mixed roll modes.
- [ ] Generate server rolls with a cryptographically secure random source.
- [ ] Record dice expression, individual dice, target value, boons/banes,
  Dragon/Demon results, damage, outcome, source, and timestamps.
- [ ] Connect pushed rolls to their original roll and record the condition taken.
- [ ] Add MCP tools for requesting a roll, reading its result, performing an
  authorized server roll, and pushing an eligible failed roll.
- [ ] Deliver roll requests and results through the existing realtime system.
- [ ] Show trusted rolls consistently in the web app, encounter view, projector,
  and MCP campaign history.
- [ ] Prevent ChatGPT from supplying or replacing authoritative dice outcomes.
- [ ] Add tests for authorization, malformed dice expressions, retries,
  idempotency, pushed rolls, and concurrent results.

## Phase 3 — GM workflow package

- [ ] Package instructions that make ChatGPT load current campaign state before
  acting and treat Draconi as the authoritative source.
- [ ] Define the recommended session start, scene, player-decision, roll,
  encounter, combat-turn, and session-completion workflows.
- [ ] Define recovery behavior for stale revisions, interrupted conversations,
  missing identifiers, and reconnecting during an active session.
- [ ] Ensure summaries preserve important events and unresolved story threads
  without exposing private GM notes to players.
- [ ] Add example prompts for common GM and player workflows.

## Phase 4 — Production evaluations

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
- [ ] Normalize conditions into first-class records while preserving existing
  character-sheet behavior.
