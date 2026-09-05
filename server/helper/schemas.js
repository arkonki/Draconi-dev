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
  initiative: z.number().int().min(1).max(10),
}).strict();

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
