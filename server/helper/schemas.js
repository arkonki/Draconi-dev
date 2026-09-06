import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const revisionSchema = z.coerce.number().int().min(0);
export const idempotencyKeySchema = z.string().trim().min(8).max(200);

export const listCampaignsInputSchema = z.object({
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: uuidSchema.optional(),
}).strict();

export const campaignIdInputSchema = z.object({
  campaign_id: uuidSchema,
}).strict();

export const getCampaignStateInputSchema = z.object({
  campaign_id: uuidSchema,
  recent_event_limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const getSoloOptionsInputSchema = z.object({
  campaign_id: uuidSchema,
}).strict();

export const getSoloStateInputSchema = z.object({
  campaign_id: uuidSchema,
}).strict();

const soloModeSchema = z.enum(['custom', 'deepfall_breach']);
const oracleDefaultTiltSchema = z.enum(['even', 'ask']);

export const enableSoloModeInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  player_character_id: uuidSchema,
  mode: soloModeSchema.default('custom'),
  ruleset_version: z.literal('db-solo-v1.2').default('db-solo-v1.2'),
  oracle_default_tilt: oracleDefaultTiltSchema.default('ask'),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const enableSoloModeBodySchema = enableSoloModeInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const disableSoloModeInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const disableSoloModeBodySchema = disableSoloModeInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const selectSoloHeroicAbilityInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ability_id: uuidSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const selectSoloHeroicAbilityBodySchema = selectSoloHeroicAbilityInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const askFortuneInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  question: z.string().trim().min(1).max(1_000),
  category: z.enum(['yes_no', 'number', 'scale', 'power', 'quality', 'reaction']),
  tilt: z.enum(['unlikely', 'even', 'likely']),
  context: z.string().trim().max(5_000).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const askFortuneBodySchema = askFortuneInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

const inspirationColumnSchema = z.enum(['action', 'attribute', 'thing']);
const drawInspirationSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  columns: z.array(inspirationColumnSchema).min(1).max(3),
  context: z.string().trim().max(5_000).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const drawInspirationInputSchema = drawInspirationSchema.superRefine((value, context) => {
  if (new Set(value.columns).size !== value.columns.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each Inspiration column may be selected only once.' });
  }
});

export const drawInspirationBodySchema = drawInspirationSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true })
  .superRefine((value, context) => {
    if (new Set(value.columns).size !== value.columns.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each Inspiration column may be selected only once.' });
    }
  });

const openingWaypointSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Departure'),
  description: z.string().trim().min(1).max(2_000),
}).strict();

const missionThreatSchema = z.object({
  description: z.string().trim().min(1).max(2_000),
  recurring: z.boolean().default(false),
  trigger_effect: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const startSoloMissionInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(1).max(2_000),
  waypoint_count: z.number().int().min(2).max(12).default(3),
  opening_waypoint: openingWaypointSchema,
  threat: missionThreatSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const startSoloMissionBodySchema = startSoloMissionInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const advanceThreatInputSchema = z.object({
  campaign_id: uuidSchema,
  threat_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  amount: z.number().int().min(1).max(2).default(1),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const advanceThreatBodySchema = advanceThreatInputSchema
  .omit({ campaign_id: true, threat_id: true, expected_revision: true, idempotency_key: true });

export const searchWaypointInputSchema = z.object({
  campaign_id: uuidSchema,
  waypoint_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  known_location: z.boolean().default(false),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const searchWaypointBodySchema = searchWaypointInputSchema
  .omit({ campaign_id: true, waypoint_id: true, expected_revision: true, idempotency_key: true });

export const scavengeWaypointInputSchema = z.object({
  campaign_id: uuidSchema,
  waypoint_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  spend_stretch: z.boolean().default(false),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const scavengeWaypointBodySchema = scavengeWaypointInputSchema
  .omit({ campaign_id: true, waypoint_id: true, expected_revision: true, idempotency_key: true });

const soloRestTypeSchema = z.enum(['round', 'stretch', 'shift']);
const standardConditionSchema = z.enum([
  'exhausted',
  'sickly',
  'dazed',
  'angry',
  'scared',
  'disheartened',
]);
const soloRestFields = {
  rest_type: soloRestTypeSchema,
  use_healing: z.boolean().default(false),
  condition_to_clear: standardConditionSchema.optional(),
  safe_location: z.boolean().default(false),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};
function validateSoloRest(value, context) {
  if (value.rest_type !== 'stretch' && value.use_healing) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['use_healing'], message: 'Healing may only be used during a stretch rest.' });
  }
  if (value.rest_type !== 'stretch' && value.condition_to_clear) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['condition_to_clear'], message: 'A condition may only be cleared during a stretch rest.' });
  }
}

export const takeSoloRestInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloRestFields,
}).strict().superRefine(validateSoloRest);

export const takeSoloRestBodySchema = z.object(soloRestFields).strict().superRefine(validateSoloRest);

const soloDyingActionSchema = z.enum([
  'death_roll',
  'self_rally',
  'life_saving_healing',
  'recover_stabilized',
]);
const soloDyingActionFields = {
  action: soloDyingActionSchema,
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};
export const resolveSoloDyingActionInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloDyingActionFields,
}).strict();
export const resolveSoloDyingActionBodySchema = z.object(soloDyingActionFields).strict();

const soloNarrativeDamageFields = {
  severity: z.enum(['unknown', 'slight', 'moderate', 'severe']).default('unknown'),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};
export const resolveSoloNarrativeDamageInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloNarrativeDamageFields,
}).strict();
export const resolveSoloNarrativeDamageBodySchema = z.object(soloNarrativeDamageFields).strict();

export const revealWaypointInputSchema = z.object({
  campaign_id: uuidSchema,
  waypoint_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2_000).optional(),
  generated_from_roll_ids: z.array(uuidSchema).max(20).default([]),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const revealWaypointBodySchema = revealWaypointInputSchema
  .omit({ campaign_id: true, waypoint_id: true, expected_revision: true, idempotency_key: true });

export const completeSoloMissionInputSchema = z.object({
  campaign_id: uuidSchema,
  mission_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  outcome: z.enum(['success', 'failure', 'abandoned']),
  summary: z.string().trim().min(1).max(10_000),
  rewards: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const completeSoloMissionBodySchema = completeSoloMissionInputSchema
  .omit({ campaign_id: true, mission_id: true, expected_revision: true, idempotency_key: true });

export const getActorInputSchema = z.object({
  campaign_id: uuidSchema,
  actor_id: uuidSchema,
}).strict();

export const getCombatStateInputSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema.optional(),
}).strict();

export const getEncounterSetupOptionsInputSchema = z.object({
  campaign_id: uuidSchema,
  monster_search: z.string().trim().max(100).optional(),
  monster_limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const getRecentEventsInputSchema = z.object({
  campaign_id: uuidSchema,
  after_sequence: z.coerce.number().int().min(0).optional(),
  before_sequence: z.coerce.number().int().min(1).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  actor_id: uuidSchema.optional(),
  session_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const getSessionHistoryInputSchema = z.object({
  campaign_id: uuidSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const startSessionInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  title: z.string().trim().min(1).max(200),
  gm_notes: z.string().trim().max(5_000).optional(),
  opening_scene: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const startSessionBodySchema = startSessionInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const completeSessionInputSchema = z.object({
  campaign_id: uuidSchema,
  session_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  summary: z.string().trim().min(1).max(10_000),
  unresolved_threads: z.array(z.string().trim().min(1).max(500)).max(50),
  ending_scene: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const completeSessionBodySchema = completeSessionInputSchema
  .omit({ campaign_id: true, session_id: true, expected_revision: true, idempotency_key: true });

const damageChangeSchema = z.object({
  type: z.literal('damage'),
  amount: z.number().int().min(0),
  damage_type: z.string().trim().min(1).max(80).optional(),
}).strict();

const healChangeSchema = z.object({
  type: z.literal('heal'),
  amount: z.number().int().min(0),
}).strict();

const spendWillpowerChangeSchema = z.object({
  type: z.literal('spend_wp'),
  amount: z.number().int().min(1),
}).strict();

const restoreWillpowerChangeSchema = z.object({
  type: z.literal('restore_wp'),
  amount: z.number().int().min(1),
}).strict();

const addConditionChangeSchema = z.object({
  type: z.literal('add_condition'),
  key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
  source: z.string().trim().min(1).max(200).optional(),
}).strict();

const removeConditionChangeSchema = z.object({
  type: z.literal('remove_condition'),
  condition_id: uuidSchema,
}).strict();

const adjustInventoryChangeSchema = z.object({
  type: z.literal('adjust_inventory'),
  item_id: uuidSchema,
  quantity_delta: z.number().int().refine((value) => value !== 0, {
    message: 'quantity_delta cannot be zero',
  }),
}).strict();

export const actorChangeSchema = z.discriminatedUnion('type', [
  damageChangeSchema,
  healChangeSchema,
  spendWillpowerChangeSchema,
  restoreWillpowerChangeSchema,
  addConditionChangeSchema,
  removeConditionChangeSchema,
  adjustInventoryChangeSchema,
]);

export const applyActorChangesInputSchema = z.object({
  campaign_id: uuidSchema,
  actor_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500),
  changes: z.array(actorChangeSchema).min(1).max(20),
}).strict();

export const applyActorChangesBodySchema = applyActorChangesInputSchema
  .omit({ campaign_id: true, actor_id: true, expected_revision: true, idempotency_key: true });

export const createEncounterInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const createEncounterBodySchema = createEncounterInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

const encounterMonsterSelectionSchema = z.object({
  monster_id: uuidSchema,
  count: z.number().int().min(1).max(20).default(1),
  custom_name: z.string().trim().min(1).max(160).optional(),
  use_ferocity: z.boolean().default(true),
}).strict();

const addEncounterParticipantsSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  character_ids: z.array(uuidSchema).max(20).default([]),
  monsters: z.array(encounterMonsterSelectionSchema).max(20).default([]),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const addEncounterParticipantsInputSchema = addEncounterParticipantsSchema.superRefine((value, context) => {
  if (value.character_ids.length === 0 && value.monsters.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one character or monster.',
    });
  }
  if (new Set(value.character_ids).size !== value.character_ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Each character may be selected only once.',
    });
  }
});

export const addEncounterParticipantsBodySchema = addEncounterParticipantsSchema
  .omit({ campaign_id: true, combat_id: true, expected_revision: true, idempotency_key: true })
  .superRefine((value, context) => {
    if (value.character_ids.length === 0 && value.monsters.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one character or monster.',
      });
    }
    if (new Set(value.character_ids).size !== value.character_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each character may be selected only once.',
      });
    }
  });

export const removeEncounterParticipantInputSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  actor_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const removeEncounterParticipantBodySchema = removeEncounterParticipantInputSchema
  .omit({ campaign_id: true, combat_id: true, actor_id: true, expected_revision: true, idempotency_key: true });

const initiativeAssignmentSchema = z.object({
  actor_id: uuidSchema,
  initiative: z.number().int().min(1).max(10).optional(),
  initiative_slots: z.array(z.number().int().min(1).max(10)).min(1).max(2).optional(),
}).strict().superRefine((value, context) => {
  const slots = value.initiative_slots || (value.initiative === undefined ? [] : [value.initiative]);
  if (slots.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide initiative or initiative_slots.' });
  }
  if (new Set(slots).size !== slots.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Initiative slots for one actor must be distinct.' });
  }
});

function uniqueActorIds(value, context, message) {
  const actorIds = value.map((entry) => entry.actor_id);
  if (new Set(actorIds).size !== actorIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
  }
}

const startCombatSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  initiatives: z.array(initiativeAssignmentSchema).max(100).default([]),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const startCombatInputSchema = startCombatSchema.superRefine((value, context) => {
  uniqueActorIds(value.initiatives, context, 'Each combat actor may receive only one initiative assignment.');
});

export const startCombatBodySchema = startCombatSchema
  .omit({ campaign_id: true, combat_id: true, expected_revision: true, idempotency_key: true })
  .superRefine((value, context) => {
    uniqueActorIds(value.initiatives, context, 'Each combat actor may receive only one initiative assignment.');
  });

const combatActionEffectSchema = z.object({
  actor_id: uuidSchema,
  changes: z.array(actorChangeSchema).min(1).max(20),
}).strict();

const resolveGameActionSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  actor_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  action: z.string().trim().min(1).max(200),
  outcome: z.enum(['success', 'failure', 'critical', 'fumble', 'automatic', 'not_applicable']),
  effects: z.array(combatActionEffectSchema).max(20).default([]),
  consume_turn: z.boolean().default(true),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const resolveGameActionInputSchema = resolveGameActionSchema.superRefine((value, context) => {
  uniqueActorIds(value.effects, context, 'Combine changes for the same target actor into one effect entry.');
});

export const resolveGameActionBodySchema = resolveGameActionSchema
  .omit({ campaign_id: true, combat_id: true, expected_revision: true, idempotency_key: true })
  .superRefine((value, context) => {
    uniqueActorIds(value.effects, context, 'Combine changes for the same target actor into one effect entry.');
  });

export const advanceCombatTurnInputSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const advanceCombatTurnBodySchema = advanceCombatTurnInputSchema
  .omit({ campaign_id: true, combat_id: true, expected_revision: true, idempotency_key: true });

export const endCombatInputSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  outcome: z.enum(['victory', 'defeat', 'retreat', 'draw', 'abandoned', 'other']),
  summary: z.string().trim().min(1).max(2_000),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const endCombatBodySchema = endCombatInputSchema
  .omit({ campaign_id: true, combat_id: true, expected_revision: true, idempotency_key: true });

export const appendCampaignEventInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  type: z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_.-]*$/),
  visibility: z.enum(['public', 'players', 'gm', 'system']).default('gm'),
  actor_id: uuidSchema.optional(),
  target_id: uuidSchema.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(1).max(500),
  source_conversation_id: z.string().trim().min(1).max(200).optional(),
}).strict();

export const appendCampaignEventBodySchema = appendCampaignEventInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const mcpReadResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  campaign_revision: z.number().int().min(0).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
}).strict();

export const mcpWriteResultSchema = z.object({
  success: z.boolean(),
  campaign_revision: z.number().int().min(0).optional(),
  event_ids: z.array(uuidSchema).optional(),
  summary: z.string().optional(),
  state_excerpt: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
}).strict();
