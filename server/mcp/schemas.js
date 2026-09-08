import { z } from 'zod';
import {
  idempotencyKeySchema,
  resolveSoloCheckConsequenceInputSchema,
  revisionSchema,
  uuidSchema,
} from '../helper/schemas.js';

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
