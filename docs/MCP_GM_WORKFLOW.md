# Draconi MCP GM workflow

Draconi is the authoritative source during MCP-assisted play. Conversation
memory is useful context, but it never replaces current campaign state,
identifiers, revisions, or recorded dice.

The MCP server publishes this guidance as the static resource
`dragonbane://workflows/gm-session` and provides three reusable prompts:

- `run_dragonbane_session` starts or resumes standard or Solo play;
- `resume_dragonbane_session` recovers after a disconnect, stale context, or
  uncertain result;
- `complete_dragonbane_session` closes the active session with a safe durable
  record.

## Normal session flow

1. If the campaign ID is unknown, call `list_campaigns`; never guess an ID.
2. Call `get_campaign_state`. During Solo play, also call `get_solo_state`.
3. Resume the returned active session. If none exists and sustained play is
   beginning, call `start_session` with the latest revision.
4. Narrate only from current state and player-visible information. Ask what the
   players do. Save only important durable developments with
   `append_campaign_event`.
5. Resolve stored mechanical changes with the relevant tool and the latest
   revision. Read state again when another user, the web app, or an earlier tool
   may have changed it.
6. At the end, reread state and recent events, then call `complete_session` with
   a player-safe summary and explicit unresolved threads.

`append_campaign_event` records a durable event. It does not update the
campaign's `current_scene`; opening and ending scene state is stored through the
session lifecycle tools.

## Trusted roll flow

1. Call `request_roll` with actor, purpose, dice expression, target, mode, and
   visibility.
2. Resolve server or mixed requests with `resolve_roll_server` only when server
   dice are wanted. For player mode, wait for submission through Draconi.
3. Read the immutable result with `get_roll_request` and narrate that result.
4. A failed ordinary D20 check may be pushed once. First require the player to
   choose an inactive condition and describe how it applies, then call
   `push_roll` and resolve the returned request according to its mode.

Never pass physical dice through MCP or replace a recorded result. Solo skill
and attribute checks outside combat use `resolve_solo_check` and its consequence
flow instead.

## Encounter and combat flow

1. Discover legal participants with `get_encounter_setup_options`.
2. Call `create_encounter`, then `add_encounter_participants` using returned
   IDs. Read the planned combat state before starting when approval is needed.
3. Call `start_combat` with valid initiative assignments. Army of One uses two
   distinct slots for the same actor.
4. Before every turn, call `get_combat_state` and resolve only its active actor.
5. Obtain any required trusted roll, call `resolve_game_action`, then call
   `advance_combat_turn` after a turn-consuming action.
6. Call `end_combat` only when combat has ended and save a player-safe outcome.

## Recovery rules

- On `REVISION_CONFLICT`, reread campaign state and reassess. Do not replay
  stale arguments. A newly assessed action gets a new idempotency key.
- If a response was lost and a write might have succeeded, reread state and
  recent events first. Retry with the same key only when sending the exact same
  uncertain request.
- After conversation loss or reconnect, read state and recent events. Resume
  the active session and active combat turn; never recreate them.
- Rediscover missing campaign, actor, session, encounter, and combat IDs through
  read tools. Never infer IDs from names.
- On an authentication or permission error, reconnect or use the correct
  campaign role. Do not attempt a workaround.

## Privacy and summaries

Player-facing narration, events, ending scenes, and shared session summaries may
contain only facts the characters experienced or could reasonably know.
`gmContext`, private GM notes, hidden content, motives, and GM-only open threads
must not be quoted, paraphrased, or hinted at.

The session `summary` preserves important shared events. Secret hooks and future
developments go only in `unresolved_threads`. If it is unclear whether a fact is
public, leave it out of player-facing text.

## Example requests

GM examples:

- “Run tonight's session for campaign `<campaign_id>`. Load current state first
  and resume any active session.”
- “Resume campaign `<campaign_id>` after the connection dropped. Verify the
  active session and combat turn before narrating.”
- “Prepare an encounter with the current party and two goblins. Show me the
  planned participants before combat begins.”
- “Complete this session. Preserve player-known events and keep secret
  unresolved threads private.”

Player examples:

- “Show me the player-safe current situation and ask what my character does.”
- “Request a Spot Hidden test for my character. I will roll in Draconi.”
- “I want to push that failed roll. Show eligible conditions and ask how my
  choice applies before changing anything.”
- “Tell me whose turn it is and what my character perceives without revealing
  GM-only information.”
