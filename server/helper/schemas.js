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

export const getRecentEventsInputSchema = z.object({
  campaign_id: uuidSchema,
  after_sequence: z.coerce.number().int().min(0).optional(),
  before_sequence: z.coerce.number().int().min(1).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  actor_id: uuidSchema.optional(),
  session_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

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

