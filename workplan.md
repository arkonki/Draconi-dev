# MCP Token Optimization Workplan

## Objective

Reduce the token cost of the Draconi MCP integration without weakening authorization, revision checks, idempotency, privacy filtering, trusted rolls, or authoritative game-state behavior.

The current baseline is:

- 61 registered MCP tools
- 108,193 serialized bytes in the backwards-compatible full `tools/list`
- Roughly 22,000–27,000 model tokens for the complete tool catalog, depending on tokenizer
- 818 bytes in always-on server instructions
- A legacy full resume payload that remains available for compatibility; focused and compact profiles remove its duplicate projections

## Implementation status — 2026-09-15

- Phase 0 measurement coverage is complete. Deterministic full-catalog, per-tool, surface, core-catalog, instruction, representative resume, read, and write measurements now run through `npm run mcp:measure` and regression tests.
- Phase 1 core work is complete. Always-on instructions contain only universal authority, revision, idempotency, recovery, identifier, and privacy rules; detailed procedures remain in the GM workflow resource and prompts.
- MCP JSON resources now use compact serialization.
- Phase 3 resume profiles are implemented across MCP, REST, and the shared Helper service. Omitted `detail` remains the backwards-compatible `resume-state-v1`; `compact` and `focused` return `resume-state-v2`.
- Phase 4 resume deduplication is implemented in the v2 profiles. They remove repeated character/equipment projections, nested campaign scene/time, checkpoint scene, and pending/recent roll overlap.
- AI-GM workflow instructions and prompts now prefer `detail="focused"` with five recent rolls; `full` remains available for diagnostics and existing clients.
- Compact and focused response budgets are enforced against six deterministic campaign shapes. Current maxima are 3,547 bytes compact and 21,769 bytes focused, versus up to 184,985 bytes for the legacy full response.
- Phase 2 client-capability analysis is complete. [OpenAI tool search/deferred loading](https://developers.openai.com/api/docs/guides/tools-tool-search) is configured by the Responses or Agents client, not by an MCP-server capability flag. The measured 11-tool core surface is 24,386 bytes, within the 40 KB target; the complete endpoint remains available for compatibility. Client integrations should enable deferred loading or restrict `allowed_tools` to the relevant capability group.
- Phase 5 is implemented at the MCP response boundary for actor and combat writes. `apply_actor_changes` returns a 299-byte field-level delta; combat writes retain the active-turn summary without echoing large rosters; representative ordinary writes are 299–1,124 bytes. A broader per-operation audit remains rollout work.
- Phase 6 is complete. Recent events, trusted rolls, and session/checkpoint history default to 10 records; roll and session history expose continuation cursors; monster discovery defaults to 20; MCP session history omits its duplicate latest-checkpoint projection.
- Phase 7 compact resource serialization and generic output-schema reduction are complete. The repeated output-schema surface fell from 39,335 to 9,882 bytes, reducing the full catalog by about 29.5 KB without changing runtime structured results. Further input-description trimming is optional and should be judged against model reliability.

## Target budgets

| Surface | Current baseline | Target |
|---|---:|---:|
| Core `tools/list` | 24,386 bytes when client-filtered | 40,000 bytes or less |
| Always-on server instructions | 818 bytes | 1,500 bytes or less |
| Typical focused resume response | 8,367–21,769 bytes in fixtures | 25,000 bytes or less |
| Compact resume response | 2,588–3,547 bytes in fixtures | 12,000 bytes or less |
| Ordinary write response | 299–1,124 bytes in fixtures | 5,000 bytes or less |
| Default recent rolls | 10 history / 5 focused resume | 5–10 |
| Default recent events | 10 | 10 |
| Default session history | 10 sessions and 10 checkpoints | 5–10 per collection |

Budgets should be enforced using serialized JSON byte or character counts in automated tests. Tokenizer-specific measurements may be collected as diagnostics, but CI should use deterministic character counts.

---

## Phase 0 — Add measurement and regression protection

**Goal:** Establish repeatable measurements before changing contracts.

Tasks:

- Add a test that creates the MCP server in memory and serializes `tools/list`.
- Record:
  - Total registered tools
  - Total catalog characters
  - Per-tool definition characters
  - Ten largest tool definitions
- Add representative fixture measurements for:
  - Compact campaign
  - Multi-character campaign
  - Equipment-heavy character
  - Active combat
  - Active Solo mission with maximum waypoints
  - Campaign containing recent rolls and checkpoints
- Measure serialized responses for:
  - `get_resume_state`
  - `get_campaign_state`
  - `get_actor`
  - `get_solo_state`
  - `get_roll_history`
  - `get_session_history`
  - Representative write operations
- Add a temporary baseline report without enforcing reduced budgets yet.
- Document which target MCP clients support deferred or selective tool discovery.

Acceptance criteria:

- Measurements run locally and in CI.
- Test output identifies the largest schemas and responses.
- Baselines are deterministic and do not require a production database.
- No API behavior changes in this phase.

Estimated effort: 0.5–1 day.

---

## Phase 1 — Reduce always-on instructions

**Goal:** Keep only universal safety rules in the MCP initialization response.

Tasks:

- Replace the current detailed instruction block with a concise core policy:
  - Draconi is authoritative.
  - Call `get_resume_state` before continuing an existing campaign.
  - Use the latest campaign revision and an idempotency key for writes.
  - Never guess identifiers, mechanics, dice, or stored state.
  - Protect GM-private information.
  - Load the relevant workflow resource for detailed procedures.
- Remove the duplicated combat-preparation instruction.
- Keep detailed procedures in the existing workflow resource:
  - Combat
  - Trusted rolls and pushes
  - Solo checks and fail-forward
  - Treasure cards
  - Rest and injury recovery
  - Mission advancement
  - NPC behavior
- Review the three published prompts and remove text already guaranteed by the core instructions or workflow resource.
- Keep privacy and write-safety rules explicit even if some repetition remains.

Primary files:

- `server/mcp/server.js`
- `server/mcp/workflows.js`
- `docs/MCP_GM_WORKFLOW.md`

Acceptance criteria:

- Server instructions are 1,500 characters or less.
- Detailed workflows remain discoverable as resources and prompts.
- Tests still verify authority, revision, idempotency, recovery, and privacy instructions.
- No protected workflow relies solely on conversation memory.

Estimated effort: 0.5–1 day.

---

## Phase 2 — Design capability-focused tool catalogs

**Goal:** Avoid sending all 61 tool schemas to every model interaction.

Proposed tool groups:

### Core campaign and session

- `list_campaigns`
- `get_campaign_state`
- `get_resume_state`
- `get_actor`
- `get_recent_events`
- `get_session_history`
- `start_session`
- `checkpoint_session`
- `complete_session`
- `append_campaign_event`
- `apply_actor_changes`

### Campaign time and rolls

- `get_campaign_time`
- `advance_campaign_time`
- `create_time_roll_reminder`
- `set_time_roll_reminder_active`
- `resolve_time_roll_notification`
- `request_roll`
- `get_roll_request`
- `get_roll_history`
- `push_roll`
- `resolve_roll_server`

### Encounter and combat

- `get_combat_state`
- `get_encounter_setup_options`
- `create_encounter`
- `add_encounter_participants`
- `remove_encounter_participant`
- `start_combat`
- `resolve_game_action`
- `advance_combat_turn`
- `end_combat`

### Solo play

- Solo setup and state
- Fortune and Inspiration
- Solo checks, pushes, and consequences
- Mission, waypoint, threat, and treasure operations
- Solo rest, dying, damage, and injury operations
- Solo advancement and heroic abilities
- Solo NPC generation and behavior

Evaluate these delivery options in order:

1. Client-supported deferred tool discovery.
2. Dynamically exposed tools based on OAuth scope, campaign mode, or active workflow.
3. Separate MCP endpoints for core, combat, and Solo capabilities.
4. A small number of carefully designed domain commands only if the preceding options are not practical.

Do not collapse all writes into an unrestricted generic action tool. Explicit schemas are important for validation and mechanical safety.

Tasks:

- Prototype the chosen catalog strategy without removing existing tools.
- Keep stable tool names and argument contracts where possible.
- Define how clients move from the core catalog into combat or Solo capabilities.
- Ensure reconnect and resume flows can rediscover the required capability group.
- Publish resource documentation describing available capability groups.
- Decide whether the original complete endpoint remains available during migration.

Acceptance criteria:

- The default/core catalog is 40,000 serialized characters or less.
- Solo-only schemas are absent during standard play unless requested.
- Combat-only schemas are absent when combat support is not active or selected.
- Existing authorization rules apply identically across catalogs.
- A client can still recover from a lost conversation using the core endpoint.

Estimated effort: 2–4 days, depending on client capability support.

---

## Phase 3 — Introduce resume response profiles

**Goal:** Make the default resume response useful for continuation without returning every available detail.

Extend `get_resume_state` with a backwards-compatible detail selector:

```json
{
  "campaign_id": "uuid",
  "actor_id": "uuid",
  "detail": "focused",
  "recent_roll_limit": 5
}
```

Profiles:

### `compact`

Return:

- Schema version
- Campaign identity and revision
- Current game time
- Active session identity and latest continuation summary
- Current scene summary
- Focus character identity and vital summary
- Active combat identity and current actor
- Pending roll identities
- Solo mission, waypoint, and threat summary when applicable

### `focused`

Return everything in `compact`, plus:

- Full focus character
- Active conditions
- Relevant equipped items
- Active combat state
- Current Solo waypoint, threat, and dangers
- A bounded recent-roll summary

This should become the preferred default after a compatibility period.

### `full`

Preserve the current comprehensive behavior for diagnostics, migration, and clients that explicitly need all state.

Tasks:

- Add `detail` and bounded history arguments to the input schema.
- Implement each projection in the Helper service layer so MCP and REST share it.
- Keep every profile revision-consistent within one read-only snapshot.
- Add a response `profile` field.
- Version the changed response contract if field removal would otherwise be ambiguous.
- Update workflow guidance to request `focused` for ordinary continuation.
- Use `full` only when the user requests a complete audit or the workflow genuinely needs it.

Primary files:

- `server/helper/schemas.js`
- `server/helper/service.js`
- `server/helper/api.js`
- `server/helper/openapi.js`
- `server/mcp/client.js`
- `server/mcp/server.js`
- `docs/MCP_PHASE4_RESUME.md`

Acceptance criteria:

- `compact` is no more than 12,000 characters for representative fixtures.
- `focused` is no more than 25,000 characters for representative fixtures.
- `full` preserves all currently documented authoritative state.
- Every profile applies the same GM/player privacy filtering.
- Every profile reports one internally consistent campaign revision.

Estimated effort: 2–3 days.

---

## Phase 4 — Remove duplicated resume data

**Goal:** Eliminate repeated projections that add tokens without adding information.

Tasks:

- Retain only one of `character` and `focusCharacter` in the next versioned contract.
- Return character summaries in `characters[]`; keep the complete object only for the selected focus character.
- Avoid repeating scene and game-time data inside both `campaign` and top-level fields.
- Avoid returning the checkpoint scene when it is identical to the current scene.
- Return either:
  - `rolls.recent` with a status marker, or
  - Separate `pending` and `recentResolved` arrays without overlap.
- Return only the current and immediately relevant Solo waypoints in `focused` mode.
- Return waypoint summaries rather than complete records where full details are unnecessary.
- Define a compact actor equipment projection:
  - Stable item ID
  - Name
  - Quantity
  - Equipped or held status
  - Relevant runtime state
- Keep complete typed and combined equipment projections in `full` mode or `get_actor`.
- Ensure the removal of duplicate projections does not break web clients using the shared REST service.

Compatibility strategy:

- Add a new resume schema version before deleting established fields.
- Support the previous version for a documented transition period.
- Add contract tests for both versions during migration.

Acceptance criteria:

- No focus-character object appears more than once in a focused response.
- Pending rolls are not duplicated in recent rolls.
- Scene and game time each have one canonical location.
- Non-focused characters use summary projections.
- Stable IDs remain available for follow-up reads.

Estimated effort: 2–3 days.

---

## Phase 5 — Make write responses delta-oriented

**Goal:** Return enough information to narrate and continue safely without echoing complete actor or combat state.

Define a compact write result:

```json
{
  "success": true,
  "campaign_revision": 44,
  "event_ids": ["uuid"],
  "summary": "Alaric spent 2 WP.",
  "changes": [
    {
      "actor_id": "uuid",
      "field": "wp.current",
      "before": 8,
      "after": 6
    }
  ],
  "next": {
    "read_required": false
  }
}
```

Tasks:

- Audit every write operation and classify its required response data.
- Replace full actor or combat `state_excerpt` values with field-level deltas where safe.
- Return next-turn identity after combat actions without returning unrelated combatants.
- Return due reminders after time advancement without returning unrelated campaign state.
- Preserve full immutable roll results where the actual dice result is the purpose of the operation.
- Add an optional `response_detail` argument only where callers genuinely need a larger response.
- Keep human-readable summaries concise.
- Determine whether textual `content` can omit the summary duplication while maintaining compatibility with target clients.

Acceptance criteria:

- Ordinary writes stay below 5,000 serialized characters.
- Responses contain the resulting campaign revision.
- The model can identify the changed values and required next action.
- Trusted dice, combat turn, time notifications, and error details retain authoritative information.
- Idempotent retries return the same compact result.

Estimated effort: 2–4 days.

---

## Phase 6 — Improve history pagination and defaults

**Goal:** Prevent historical data from consuming context unless explicitly requested.

Tasks:

- Add cursor pagination to roll history.
- Add cursor pagination to session and checkpoint history.
- Return sessions and checkpoints as one ordered timeline or give each collection an independent limit.
- Remove the duplicated `latestCheckpoint` when it is already the first returned checkpoint.
- Lower defaults:
  - Recent events: 10
  - Recent rolls: 5–10
  - Session history: 5–10
  - Encounter monster search: 20
- Add explicit `nextCursor` values.
- Keep sequence-based event recovery available.
- Update workflow guidance so historical reads are called only when continuation data is insufficient.

Acceptance criteria:

- Every potentially growing history has bounded defaults.
- Clients can request additional pages without repeating previous records.
- Resume does not automatically include 30 complete roll records.
- Recovery workflows still retrieve all required history when requested.

Estimated effort: 1–2 days.

---

## Phase 7 — Compact resources and refine schemas

**Goal:** Remove smaller recurring costs after the main catalog and response work is complete.

Tasks:

- Serialize JSON resources without pretty-print whitespace.
- Shorten tool titles and descriptions where the schema already communicates the same rule.
- Remove repeated descriptions from nested schema fields when validation names are self-explanatory.
- Preserve descriptions for dangerous, privacy-sensitive, or mechanically ambiguous fields.
- Review large session scene schemas for unnecessary repeated definitions.
- Keep common output envelopes concise.
- Do not replace `unknown` output fields with enormous duplicated schemas unless model reliability testing proves the benefit.
- Review error `details` payloads and whitelist concise, actionable fields.

Acceptance criteria:

- Resource data is serialized compactly.
- Error responses do not echo large upstream payloads.
- Schema reductions do not make mechanically important arguments ambiguous.
- Catalog budget remains below its target after documentation updates.

Estimated effort: 1 day.

---

## Phase 8 — Compatibility, quality, and rollout

**Goal:** Deploy optimizations without breaking existing MCP clients or campaign workflows.

Test coverage:

- MCP initialization and catalog listing
- Tool availability by capability group
- Resource and prompt discovery
- Compact, focused, and full resume projections
- GM versus player visibility
- Multi-character focus selection
- Active combat continuation
- Active Solo mission continuation
- Pending trusted rolls
- Campaign time and due reminders
- Revision conflicts
- Idempotent retries
- Error response size and content
- Previous resume-schema compatibility

Rollout plan:

1. Deploy measurement tests and instruction reduction.
2. Add response profiles without changing the default.
3. Introduce capability-focused catalogs as opt-in endpoints or negotiated behavior.
4. Validate with supported MCP clients.
5. Change the recommended resume profile to `focused`.
6. Change the default only after client compatibility is confirmed.
7. Deprecate duplicated fields with a documented date and migration path.
8. Enforce final CI token budgets.

Acceptance criteria:

- Existing clients continue to work during the migration period.
- No reduction exposes GM-private information.
- No write bypasses expected revisions or idempotency.
- Standard and Solo sessions can recover after reconnect.
- Final measurements meet the defined token budgets.

Estimated effort: 1.5–2 days.

---

## Recommended implementation order

1. Measurement and regression tests
2. Always-on instruction reduction
3. Resume profiles
4. Resume deduplication
5. Capability-focused tool catalogs
6. Delta-oriented write responses
7. History pagination and lower defaults
8. Resource and schema cleanup
9. Compatibility rollout and final budget enforcement

## Estimated total effort

Approximately **12.5–20 engineer-days**, depending primarily on MCP client support for deferred or dynamic tool discovery and the required backwards-compatibility period.

## First releasable optimization milestone

The first release should include:

- Automated catalog and response-size measurements
- Always-on instructions below 1,500 characters
- Removal of the duplicated combat instruction
- `compact`, `focused`, and `full` resume profiles
- A default recent-roll limit of no more than 10
- Removal of duplicate focus-character and roll projections in the new resume contract

This milestone reduces recurring session cost without requiring an immediate endpoint split or removal of existing tools.

## Definition of done

Optimization work is complete when:

- The default tool catalog is 40,000 characters or less.
- Core instructions are 1,500 characters or less.
- Focused and compact resume responses meet their budgets.
- Ordinary write responses meet their budget.
- All growing histories are paginated and bounded.
- Safety, privacy, revision, idempotency, and trusted-roll tests pass.
- Existing clients have a documented migration path.
- Token-size regression tests run in CI.
