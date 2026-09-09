import { z } from 'zod';

export const GM_WORKFLOW_URI = 'dragonbane://workflows/gm-session';
export const GM_WORKFLOW_VERSION = 'draconi-gm-v2';

export const gmWorkflowGuide = {
  version: GM_WORKFLOW_VERSION,
  authority: [
    'Draconi is the authoritative source for campaign, character, roll, session, encounter, and combat state.',
    'Call get_resume_state before narrating or changing an existing campaign. Never reconstruct state from conversation memory or event prose.',
    'Never invent campaign identifiers, actor identifiers, mechanics, dice, HP, WP, conditions, inventory, or hidden information.',
    'Use the latest campaign revision for every write and a unique idempotency key for every distinct intended change.',
  ],
  workflows: {
    sessionStart: [
      'If campaign_id is missing, call list_campaigns and ask the user to choose when more than one plausible campaign exists.',
      'Call get_resume_state. Its scene, checkpoint, characters, Solo progress, active combat, and roll handoffs are one consistent snapshot.',
      'If an active session already exists, resume it instead of creating a duplicate.',
      'If there is no active session, call start_session with the latest revision, a clear title, an optional opening scene, and private GM notes only when needed.',
      'Use the returned session and campaign revision as authoritative.',
    ],
    scene: [
      'Base narration only on the current campaign state, active session, recent events, and information the players may know.',
      'Present the immediate situation, stakes, and sensory details, then ask what the players do.',
      'Use append_campaign_event only for an important durable development that future sessions must remember. It records an event; it does not replace current_scene.',
      'Choose event visibility deliberately and never place secret GM information in player-visible event text.',
      'During sustained play, call checkpoint_session after a meaningful scene transition so the structured scene, active dangers, and unresolved threads remain resumable.',
    ],
    playerDecision: [
      'Resolve choices that need no mechanic in narration without creating a roll.',
      'When a mechanic changes stored state, explain the intended effect and use the appropriate authoritative tool.',
      'Read state again before writing when the web app, another player, or another tool may have changed the campaign.',
    ],
    roll: [
      'Call request_roll with the actor, purpose, expression, target, mode, and visibility.',
      'For server or mixed mode, call resolve_roll_server only when server dice are desired and permitted. For player mode, wait for the player to submit through Draconi.',
      'Call get_roll_request and narrate only the immutable returned result. Never supply physical dice through MCP.',
      'A failed ordinary D20 check may be pushed once only after the player chooses an inactive condition and describes how it applies. Call push_roll, then resolve or await the new request according to its mode.',
      'For Solo skill or attribute checks outside combat, use resolve_solo_check and the Solo consequence tools instead of the general request flow.',
    ],
    encounter: [
      'Call get_encounter_setup_options to discover valid character and monster identifiers.',
      'Call create_encounter with the latest revision, then add_encounter_participants using only returned identifiers.',
      'Read get_combat_state and confirm the planned opposition when the user needs to approve it.',
      'Call start_combat with valid initiative assignments. Army of One uses two distinct initiative slots for one actor.',
    ],
    combatTurn: [
      'Call get_combat_state before resolving each turn and use its active actor and initiative slot.',
      'Resolve only the active actor. Obtain any required roll through the trusted roll workflow.',
      'A rallied solo hero at 0 HP may take one normal action. resolve_game_action consumes the rallied state automatically; do not clear it separately.',
      'Call resolve_game_action with validated effects and the latest revision.',
      'After a turn-consuming action, call advance_combat_turn and use the returned active actor for the next turn.',
      'Call end_combat only when combat is actually over and save a durable, player-safe outcome summary.',
    ],
    sessionCompletion: [
      'Read get_resume_state and, when useful, get_recent_events before composing the record.',
      'Write a concise summary of durable events that players experienced or can know.',
      'Keep secrets and private GM notes out of the shared summary. Put unresolved secret threads only in unresolved_threads.',
      'Call complete_session with the active session identifier, latest revision, summary, explicit unresolved_threads array, and optional ending scene.',
      'Use get_session_history later to recover completed session summaries.',
    ],
  },
  recovery: {
    revisionConflict: [
      'On REVISION_CONFLICT, call get_resume_state again, reassess the intended action against the new state, and do not blindly replay stale arguments.',
      'Use a new idempotency key only for a newly assessed request. Reuse the prior key only when retrying the exact same request after an uncertain transport outcome.',
    ],
    interruptedConversation: [
      'Do not rely on remembered tool results. Read get_resume_state, then use get_recent_events only when narrative history beyond the checkpoint is needed.',
      'If a write may have succeeded but its response was lost, read state/events first. Retry the identical request with the same idempotency key only when confirmation is still impossible.',
    ],
    missingIdentifiers: [
      'Use list_campaigns, get_resume_state, get_encounter_setup_options, or get_combat_state to rediscover identifiers. Never guess them.',
    ],
    reconnect: [
      'If activeSession exists, resume it rather than calling start_session again.',
      'If combat is active, call get_combat_state and continue with its current active actor; never recreate or restart the encounter.',
      'If no session or combat is active, explain that clearly and ask whether the user wants to start one.',
    ],
    authorization: [
      'On an authentication or permission error, stop the protected operation and ask the user to reconnect or use an account with the required campaign role. Never work around authorization.',
    ],
  },
  privacy: {
    playerSafe: [
      'Campaign facts the characters experienced or could reasonably know.',
      'Public scene details, visible roll results, combat outcomes, and agreed character changes.',
    ],
    gmPrivate: [
      'gmContext, private GM notes, hidden motives, unrevealed content, and openThreads returned only to a GM.',
      'Do not quote, paraphrase, hint at, or place this material in player-facing narration, chat, events, or session summaries.',
    ],
    summaries: [
      'The shared session summary contains durable player-known facts.',
      'Secret future developments belong in unresolved_threads, not in summary or ending_scene.',
      'When unsure whether information is public, omit it from player-facing text and keep it private.',
    ],
  },
  examplePrompts: {
    gm: [
      'Run tonight\'s session for campaign <campaign_id>. Load the current state first, resume any active session, and open with the situation the players can currently perceive.',
      'Resume campaign <campaign_id> after our connection dropped. Verify the active session and combat turn before narrating anything.',
      'Prepare an encounter in campaign <campaign_id> with the current party and two goblins. Show me the planned participants before starting combat.',
      'Complete the active session in campaign <campaign_id>. Preserve the important player-known events and keep secret unresolved threads private.',
    ],
    player: [
      'Show me the player-safe current situation for campaign <campaign_id> and ask what my character does.',
      'Request a Spot Hidden roll for my character. I want to roll in Draconi, so wait for the recorded result.',
      'I want to push that failed roll. Show which conditions are eligible and ask how the chosen condition applies before changing anything.',
      'Tell me whose combat turn it is and what my character can currently perceive; do not reveal GM-only information.',
    ],
  },
};

const campaignIdArgument = z.string().uuid().optional().describe(
  'Draconi campaign UUID. Omit only when the assistant should discover accessible campaigns first.',
);

function requestLine(request) {
  return request?.trim()
    ? `\nThe user's current request is:\n${request.trim()}`
    : '\nAsk the user what they want to do after the authoritative state has been loaded.';
}

export const gmWorkflowPrompts = [
  {
    name: 'run_dragonbane_session',
    config: {
      title: 'Run a Dragonbane session',
      description: 'Start or resume a state-first Dragonbane session while keeping Draconi authoritative.',
      argsSchema: {
        campaign_id: campaignIdArgument,
        play_mode: z.enum(['standard', 'solo']).default('standard').describe('Select standard group play or Solo Mode.'),
        request: z.string().trim().max(4000).optional().describe('The GM or player request to handle after state is loaded.'),
      },
    },
    render: ({ campaign_id: campaignId, play_mode: playMode, request }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Run this Dragonbane ${playMode} session using the ${GM_WORKFLOW_VERSION} workflow.`,
            campaignId
              ? `The campaign ID is ${campaignId}. Call get_resume_state before narrating or acting.`
              : 'No campaign ID was supplied. Call list_campaigns and never guess an identifier.',
            playMode === 'solo'
              ? 'Use the Solo state included by get_resume_state; call get_solo_state later only for a detailed turn-by-turn refresh.'
              : 'If an active session exists, resume it; otherwise ask before starting a sustained session.',
            'Treat Draconi state, revisions, identifiers, and recorded dice as authoritative. Keep GM-only information out of player-facing text.',
            `Follow the complete workflow and recovery rules in ${GM_WORKFLOW_URI}.`,
            requestLine(request),
          ].join('\n'),
        },
      }],
    }),
  },
  {
    name: 'resume_dragonbane_session',
    config: {
      title: 'Recover a Dragonbane session',
      description: 'Recover safely after a disconnect, stale revision, or lost conversation context.',
      argsSchema: {
        campaign_id: campaignIdArgument,
        last_known_context: z.string().trim().max(4000).optional().describe('Untrusted conversational context to verify against Draconi.'),
      },
    },
    render: ({ campaign_id: campaignId, last_known_context: lastKnownContext }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Recover this Dragonbane session using the ${GM_WORKFLOW_VERSION} workflow.`,
            campaignId
              ? `Call get_resume_state for ${campaignId}. Use its active combat and latest checkpoint; call get_recent_events only if additional narrative history is needed.`
              : 'Call list_campaigns to rediscover the campaign. Never guess an identifier.',
            'Resume the returned active session and combat turn; do not create duplicates or replay remembered writes.',
            'Treat any supplied conversational context as unverified until it matches Draconi.',
            `Follow the recovery and privacy rules in ${GM_WORKFLOW_URI}.`,
            lastKnownContext?.trim()
              ? `\nLast known, non-authoritative context:\n${lastKnownContext.trim()}`
              : '\nNo prior conversational context is available.',
          ].join('\n'),
        },
      }],
    }),
  },
  {
    name: 'complete_dragonbane_session',
    config: {
      title: 'Complete a Dragonbane session',
      description: 'Close an active session with a durable player-safe summary and private unresolved threads.',
      argsSchema: {
        campaign_id: campaignIdArgument,
      },
    },
    render: ({ campaign_id: campaignId }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Complete this Dragonbane session using the ${GM_WORKFLOW_VERSION} workflow.`,
            campaignId
              ? `Call get_resume_state for ${campaignId} and get_recent_events before preparing the record.`
              : 'Call list_campaigns to identify the campaign. Never guess an identifier.',
            'Confirm an active session exists. Summarize durable events the players know, keep private GM notes out of the summary, and place secret unresolved story threads only in unresolved_threads.',
            'Call complete_session with the active session ID and latest revision. Do not invent events or identifiers.',
            `Follow the completion and privacy rules in ${GM_WORKFLOW_URI}.`,
          ].join('\n'),
        },
      }],
    }),
  },
];
