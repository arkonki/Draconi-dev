import { z } from 'zod';
import {
  applyActorChangesInputSchema,
  idempotencyKeySchema,
  resolveGameActionInputSchema,
  resolveSoloCheckConsequenceInputSchema,
  revisionSchema,
  uuidSchema,
} from '../helper/schemas.js';

const mcpActorChangeSchema = z.object({
  type: z.enum([
    'damage',
    'heal',
    'spend_wp',
    'restore_wp',
    'add_condition',
    'remove_condition',
    'adjust_inventory',
  ]).describe('Mechanical change type. Supply only fields used by that type.'),
  amount: z.number().int().min(0).optional().describe('Required for damage, heal, spend_wp, and restore_wp.'),
  damage_type: z.string().trim().min(1).max(80).optional(),
  key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/).optional(),
  source: z.string().trim().min(1).max(200).optional(),
  condition_id: uuidSchema.optional(),
  item_id: uuidSchema.optional(),
  quantity_delta: z.number().int().optional().describe('Required and non-zero for adjust_inventory.'),
}).strict();

export const applyActorChangesMcpInputSchema = z.object({
  campaign_id: uuidSchema,
  actor_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(500),
  changes: z.array(mcpActorChangeSchema).min(1).max(20),
}).strict();

const mcpCombatActionEffectSchema = z.object({
  actor_id: uuidSchema,
  changes: z.array(mcpActorChangeSchema).min(1).max(20),
}).strict();

export const resolveGameActionMcpInputSchema = z.object({
  campaign_id: uuidSchema,
  combat_id: uuidSchema,
  actor_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  action: z.string().trim().min(1).max(200),
  outcome: z.enum(['success', 'failure', 'critical', 'fumble', 'automatic', 'not_applicable']),
  effects: z.array(mcpCombatActionEffectSchema).max(20).default([]),
  consume_turn: z.boolean().default(true),
  reason: z.string().trim().min(1).max(500),
}).strict();

function actorChangeForService(change) {
  switch (change.type) {
    case 'damage':
      return { type: change.type, amount: change.amount, damage_type: change.damage_type };
    case 'heal':
    case 'spend_wp':
    case 'restore_wp':
      return { type: change.type, amount: change.amount };
    case 'add_condition':
      return { type: change.type, key: change.key, source: change.source };
    case 'remove_condition':
      return { type: change.type, condition_id: change.condition_id };
    case 'adjust_inventory':
      return { type: change.type, item_id: change.item_id, quantity_delta: change.quantity_delta };
    default:
      throw new Error(`Unsupported actor change type: ${change.type}`);
  }
}

export function actorChangesServiceInput(input) {
  return applyActorChangesInputSchema.parse({
    ...input,
    changes: input.changes.map(actorChangeForService),
  });
}

export function gameActionServiceInput(input) {
  return resolveGameActionInputSchema.parse({
    ...input,
    effects: input.effects.map((effect) => ({
      actor_id: effect.actor_id,
      changes: effect.changes.map(actorChangeForService),
    })),
  });
}

const consequenceEffectTypeSchema = z.enum([
  'story_event',
  'advance_threat',
  'damage',
  'add_condition',
  'lose_item',
  'new_danger',
  'add_diversion_waypoint',
]);

const mcpConsequenceEffectSchema = z.object({
  type: consequenceEffectTypeSchema.describe('The one mechanical effect to apply.'),
  amount: z.number().int().min(1).max(100).optional().describe('Required for damage; 1 or 2 for advance_threat.'),
  damage_type: z.string().trim().min(1).max(80).optional().describe('Optional damage type when type is damage.'),
  key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/).optional().describe('Required condition key when type is add_condition.'),
  item_id: uuidSchema.optional().describe('Required existing inventory item UUID when type is lose_item.'),
  quantity: z.number().int().min(1).max(999).optional().describe('Quantity to expend when type is lose_item.'),
  title: z.string().trim().min(1).max(200).optional().describe('Required waypoint title when type is add_diversion_waypoint.'),
  description: z.string().trim().min(1).max(2_000).optional().describe('Required for new_danger and add_diversion_waypoint.'),
}).strict();

const mcpConsequenceOptionSchema = z.object({
  description: z.string().trim().min(1).max(2_000).describe('Player-confirmed narrative consequence.'),
  effect: mcpConsequenceEffectSchema,
}).strict();

// Keep this schema free of oneOf/anyOf and tuple-style items arrays. ChatGPT's
// MCP tool scanner accepts a simpler JSON Schema subset than the REST endpoint,
// while the adapter below restores and validates the strict service contract.
export const resolveSoloCheckConsequenceMcpInputSchema = z.object({
  campaign_id: uuidSchema,
  expected_revision: revisionSchema,
  idempotency_key: idempotencyKeySchema,
  source_roll_id: uuidSchema,
  resolution: z.object({
    mode: z.enum(['manual', 'roll_choice']).describe('manual requires one consequence; roll_choice requires exactly two.'),
    consequences: z.array(mcpConsequenceOptionSchema).min(1).max(2),
  }).strict(),
  confirmed_by_user: z.boolean().describe('Must be true after the player explicitly accepts this resolution.'),
  reason: z.string().trim().min(1).max(500),
}).strict();

function serviceEffect(effect) {
  switch (effect.type) {
    case 'story_event':
      return { type: effect.type };
    case 'advance_threat':
      return { type: effect.type, amount: effect.amount };
    case 'damage':
      return { type: effect.type, amount: effect.amount, damage_type: effect.damage_type };
    case 'add_condition':
      return { type: effect.type, key: effect.key };
    case 'lose_item':
      return { type: effect.type, item_id: effect.item_id, quantity: effect.quantity };
    case 'new_danger':
      return { type: effect.type, description: effect.description };
    case 'add_diversion_waypoint':
      return {
        type: effect.type,
        title: effect.title,
        description: effect.description,
      };
    default:
      throw new Error(`Unsupported Solo consequence effect: ${effect.type}`);
  }
}

export function soloCheckConsequenceServiceInput(input) {
  if (input.confirmed_by_user !== true) {
    throw new Error('The player must explicitly confirm the Solo consequence.');
  }
  const requiredCount = input.resolution.mode === 'manual' ? 1 : 2;
  if (input.resolution.consequences.length !== requiredCount) {
    throw new Error(`${input.resolution.mode} requires exactly ${requiredCount} consequence${requiredCount === 1 ? '' : 's'}.`);
  }
  const consequences = input.resolution.consequences.map((consequence) => ({
    description: consequence.description,
    effect: serviceEffect(consequence.effect),
  }));
  return resolveSoloCheckConsequenceInputSchema.parse({
    campaign_id: input.campaign_id,
    expected_revision: input.expected_revision,
    idempotency_key: input.idempotency_key,
    source_roll_id: input.source_roll_id,
    confirmed_by_user: input.confirmed_by_user,
    reason: input.reason,
    resolution: input.resolution.mode === 'manual'
      ? { mode: 'manual', consequence: consequences[0] }
      : { mode: 'roll_choice', consequences },
  });
}
