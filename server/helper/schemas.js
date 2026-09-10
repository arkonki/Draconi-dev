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

export const getResumeStateInputSchema = z.object({
  campaign_id: uuidSchema,
  actor_id: uuidSchema.optional(),
}).strict();

const trustedRollKindSchema = z.enum(['generic', 'check', 'damage', 'recovery', 'advancement']);
const trustedRollModeSchema = z.enum(['player', 'server', 'mixed']);
const trustedRollModifierSchema = z.enum(['normal', 'boon', 'bane']);

const createRollRequestFields = {
  actor_id: uuidSchema.optional(),
  encounter_id: uuidSchema.optional(),
  assigned_user_id: uuidSchema.optional(),
  purpose: z.string().trim().min(1).max(200),
  expression: z.string().trim().min(3).max(100),
  roll_kind: trustedRollKindSchema.default('generic'),
  target_value: z.number().int().min(1).max(20).optional(),
  modifier: trustedRollModifierSchema.default('normal'),
  mode: trustedRollModeSchema,
  visibility: z.enum(['gm', 'players', 'assigned']).default('assigned'),
  context: z.string().trim().max(5_000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  expires_at: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(1).max(500),
};

export const createRollRequestInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...createRollRequestFields,
}).strict();

export const createRollRequestBodySchema = z.object(createRollRequestFields).strict();

export const getRollRequestInputSchema = z.object({
  campaign_id: uuidSchema,
  request_id: uuidSchema,
}).strict();

export const getRollHistoryInputSchema = z.object({
  campaign_id: uuidSchema,
  encounter_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

const resolveRollRequestFields = {
  reason: z.string().trim().min(1).max(500),
};

export const resolveRollRequestServerInputSchema = z.object({
  campaign_id: uuidSchema,
  request_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...resolveRollRequestFields,
}).strict();

export const resolveRollRequestServerBodySchema = z.object(resolveRollRequestFields).strict();

const submitManualRollFields = {
  dice: z.array(z.number().int()).min(1).max(20),
  reason: z.string().trim().min(1).max(500),
};

export const submitManualRollResultInputSchema = z.object({
  campaign_id: uuidSchema,
  request_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...submitManualRollFields,
}).strict();

export const submitManualRollResultBodySchema = z.object(submitManualRollFields).strict();

const pushRollConditionSchema = z.enum([
  'exhausted',
  'sickly',
  'dazed',
  'angry',
  'scared',
  'disheartened',
]);

const pushRollRequestFields = {
  condition: pushRollConditionSchema,
  condition_context: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(500),
};

export const pushRollRequestInputSchema = z.object({
  campaign_id: uuidSchema,
  request_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...pushRollRequestFields,
}).strict();

export const pushRollRequestBodySchema = z.object(pushRollRequestFields).strict();

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

const replaceSoloHeroicAbilityFields = {
  removed_ability_name: z.string().trim().min(1).max(200),
  replacement_ability_id: uuidSchema,
  confirmed_by_user: z.literal(true),
  reason: z.string().trim().min(1).max(500),
};

export const replaceSoloHeroicAbilityInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...replaceSoloHeroicAbilityFields,
}).strict();

export const replaceSoloHeroicAbilityBodySchema = z.object(replaceSoloHeroicAbilityFields).strict();

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

const soloCheckFields = {
  check_type: z.enum(['skill', 'attribute']),
  check_name: z.string().trim().min(1).max(100),
  modifier: z.enum(['normal', 'boon', 'bane']).default('normal'),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};

export const resolveSoloCheckInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloCheckFields,
}).strict();

export const resolveSoloCheckBodySchema = z.object(soloCheckFields).strict();

const pushSoloCheckFields = {
  cost: z.enum(['condition', 'sole_survivor']),
  condition: pushRollConditionSchema.optional(),
  explanation: z.string().trim().min(1).max(1_000),
  reason: z.string().trim().min(1).max(500),
};

function validatePushSoloCheck(value, context) {
  if (value.cost === 'condition' && !value.condition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['condition'],
      message: 'A condition is required when pushing a Solo check with a condition.',
    });
  }
  if (value.cost === 'sole_survivor' && value.condition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['condition'],
      message: 'Do not supply a condition when using Sole Survivor.',
    });
  }
}

export const pushSoloCheckInputSchema = z.object({
  campaign_id: uuidSchema,
  source_roll_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...pushSoloCheckFields,
}).strict();

export const pushSoloCheckBodySchema = z.object(pushSoloCheckFields)
  .strict()
  .superRefine(validatePushSoloCheck);

const soloConsequenceEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('story_event') }).strict(),
  z.object({
    type: z.literal('advance_threat'),
    amount: z.number().int().min(1).max(2).default(1),
  }).strict(),
  z.object({
    type: z.literal('damage'),
    amount: z.number().int().min(1).max(100),
    damage_type: z.string().trim().min(1).max(80).optional(),
  }).strict(),
  z.object({
    type: z.literal('add_condition'),
    key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
  }).strict(),
  z.object({
    type: z.literal('lose_item'),
    item_id: uuidSchema,
    quantity: z.number().int().min(1).max(999).default(1),
  }).strict(),
  z.object({
    type: z.literal('new_danger'),
    description: z.string().trim().min(1).max(2_000),
  }).strict(),
  z.object({
    type: z.literal('add_diversion_waypoint'),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2_000),
  }).strict(),
]);

const soloConsequenceOptionSchema = z.object({
  description: z.string().trim().min(1).max(2_000),
  effect: soloConsequenceEffectSchema,
}).strict();

const soloConsequenceResolutionSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('manual'),
    consequence: soloConsequenceOptionSchema,
  }).strict(),
  z.object({
    mode: z.literal('roll_choice'),
    consequences: z.tuple([soloConsequenceOptionSchema, soloConsequenceOptionSchema]),
  }).strict(),
]);

const soloCheckConsequenceFields = {
  source_roll_id: uuidSchema,
  resolution: soloConsequenceResolutionSchema,
  confirmed_by_user: z.literal(true),
  reason: z.string().trim().min(1).max(500),
};

export const resolveSoloCheckConsequenceInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloCheckConsequenceFields,
}).strict();

export const resolveSoloCheckConsequenceBodySchema = z.object(soloCheckConsequenceFields)
  .omit({ source_roll_id: true })
  .strict();

const openingWaypointSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Departure'),
  description: z.string().trim().min(1).max(2_000),
}).strict();

const missionThreatSchema = z.object({
  description: z.string().trim().min(1).max(2_000),
  recurring: z.boolean().default(false),
  trigger_effect: z.record(z.string(), z.unknown()).default({}),
}).strict();

const foreseenWaypointSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2_000),
}).strict();

const startSoloMissionSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(1).max(2_000),
  waypoint_count: z.number().int().min(2).max(12).default(3),
  unknown_waypoint_count: z.number().int().min(0).max(10).optional(),
  foreseen_waypoints: z.array(foreseenWaypointSchema).max(8).default([]),
  opening_waypoint: openingWaypointSchema,
  threat: missionThreatSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

function validateMissionRoute(value, context) {
  if (value.unknown_waypoint_count !== undefined
    && value.foreseen_waypoints.length + value.unknown_waypoint_count + 2 > 12) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unknown_waypoint_count'],
      message: 'Opening, objective, foreseen, and unknown waypoints may total at most 12.',
    });
  }
}

export const startSoloMissionInputSchema = startSoloMissionSchema;

export const startSoloMissionBodySchema = startSoloMissionSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true })
  .superRefine(validateMissionRoute);

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

export const resolveThreatInputSchema = z.object({
  campaign_id: uuidSchema,
  threat_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  resolution: z.string().trim().min(1).max(2_000),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const resolveThreatBodySchema = resolveThreatInputSchema
  .omit({ campaign_id: true, threat_id: true, expected_revision: true, idempotency_key: true });

export const setSoloThreatInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  description: z.string().trim().min(1).max(2_000),
  recurring: z.boolean().default(false),
  trigger_effect: z.record(z.string(), z.unknown()).default({}),
  replace_existing: z.boolean().default(true),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const setSoloThreatBodySchema = setSoloThreatInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const addSoloWaypointsInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  count: z.number().int().min(1).max(6),
  kind: z.enum(['unknown', 'diversion']).default('diversion'),
  generate_locations: z.boolean().default(true),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const addSoloWaypointsBodySchema = addSoloWaypointsInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

const beginSoloReturnSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  route_type: z.enum(['cleared', 'dangerous', 'alternative']),
  check_skill: z.enum(['Awareness', 'Sneaking']).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

function validateSoloReturn(value, context) {
  if (value.route_type === 'dangerous' && !value.check_skill) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['check_skill'], message: 'Dangerous return routes require Awareness or Sneaking.' });
  }
}

export const beginSoloReturnInputSchema = beginSoloReturnSchema;

export const beginSoloReturnBodySchema = beginSoloReturnSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true })
  .superRefine(validateSoloReturn);

const searchWaypointFields = {
  known_location: z.boolean().default(false),
  known_nature: z.boolean().default(false),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};

function validateSearchWaypoint(value, context) {
  if (value.known_nature && !value.known_location) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['known_nature'],
      message: 'Known nature requires a specific known hiding place.',
    });
  }
}

export const searchWaypointInputSchema = z.object({
  campaign_id: uuidSchema,
  waypoint_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...searchWaypointFields,
}).strict().superRefine(validateSearchWaypoint);

export const searchWaypointBodySchema = z.object(searchWaypointFields)
  .strict()
  .superRefine(validateSearchWaypoint);

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

const soloInjuryActionFields = {
  action: z.enum(['medical_care', 'mark_healed']),
  confirmed_by_user: z.literal(true),
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};
export const resolveSoloInjuryActionInputSchema = z.object({
  campaign_id: uuidSchema,
  injury_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloInjuryActionFields,
}).strict();
export const resolveSoloInjuryActionBodySchema = z.object(soloInjuryActionFields).strict();

export const getCharacterInjuriesInputSchema = z.object({
  campaign_id: uuidSchema,
  character_id: uuidSchema,
}).strict();

const rollCharacterSevereInjuryFields = {
  context: z.string().trim().max(2_000).optional(),
  reason: z.string().trim().min(1).max(500),
};
export const rollCharacterSevereInjuryInputSchema = z.object({
  campaign_id: uuidSchema,
  character_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...rollCharacterSevereInjuryFields,
}).strict();
export const rollCharacterSevereInjuryBodySchema = z.object(rollCharacterSevereInjuryFields).strict();

export const resolveCharacterInjuryActionInputSchema = z.object({
  campaign_id: uuidSchema,
  character_id: uuidSchema,
  injury_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...soloInjuryActionFields,
}).strict();

const advanceCharacterInjuryRecoveryFields = {
  elapsed_shifts: z.literal(1).default(1),
  confirmed_by_user: z.literal(true),
  reason: z.string().trim().min(1).max(500),
};
export const advanceCharacterInjuryRecoveryInputSchema = z.object({
  campaign_id: uuidSchema,
  character_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ...advanceCharacterInjuryRecoveryFields,
}).strict();
export const advanceCharacterInjuryRecoveryBodySchema = z.object(advanceCharacterInjuryRecoveryFields).strict();

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

export const selectSoloMissionMarksInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  skills: z.array(z.string().trim().min(1).max(100)).length(5),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const selectSoloMissionMarksBodySchema = z.object({
  skills: z.array(z.string().trim().min(1).max(100)).length(5),
  reason: z.string().trim().min(1).max(500),
}).strict().superRefine((value, context) => {
  if (new Set(value.skills.map((skill) => skill.toLocaleLowerCase())).size !== 5) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['skills'], message: 'Choose exactly five different skills.' });
  }
});

export const resolveSoloAdvancementInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const resolveSoloAdvancementBodySchema = resolveSoloAdvancementInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

export const claimSoloAdvancementAbilityInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  ability_id: uuidSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export const claimSoloAdvancementAbilityBodySchema = claimSoloAdvancementAbilityInputSchema
  .omit({ campaign_id: true, expected_revision: true, idempotency_key: true });

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

const sceneVisibilitySchema = z.enum(['players', 'gm']).default('players');

const sceneObjectSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  state: z.record(z.string(), z.unknown()).default({}),
  visibility: sceneVisibilitySchema,
}).strict();

const sceneExitSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200),
  destination: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2_000).optional(),
  status: z.enum(['open', 'closed', 'blocked', 'unknown']).default('unknown'),
  visibility: sceneVisibilitySchema,
}).strict();

const sceneDangerSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2_000),
  status: z.enum(['active', 'resolved', 'unknown']).default('active'),
  source: z.string().trim().max(500).optional(),
  appliedAt: z.string().datetime({ offset: true }).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),
  visibility: sceneVisibilitySchema,
}).strict();

export const currentSceneSchema = z.object({
  schemaVersion: z.literal('current-scene-v1').default('current-scene-v1'),
  location: z.string().trim().max(500).default(''),
  description: z.string().trim().max(5_000).default(''),
  situation: z.string().trim().max(5_000).optional(),
  activeObjects: z.array(sceneObjectSchema).max(100).default([]),
  exits: z.array(sceneExitSchema).max(100).default([]),
  dangers: z.array(sceneDangerSchema).max(100).default([]),
}).strict();

export const startSessionInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  title: z.string().trim().min(1).max(200),
  gm_notes: z.string().trim().max(5_000).optional(),
  opening_scene: currentSceneSchema.optional(),
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
  ending_scene: currentSceneSchema.optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const completeSessionBodySchema = completeSessionInputSchema
  .omit({ campaign_id: true, session_id: true, expected_revision: true, idempotency_key: true });

export const checkpointSessionInputSchema = z.object({
  campaign_id: uuidSchema,
  session_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  summary: z.string().trim().min(1).max(10_000),
  scene: currentSceneSchema,
  unresolved_threads: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const checkpointSessionBodySchema = checkpointSessionInputSchema
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
