import type { Conditions } from '../../types/character';

export const PUSH_ROLL_CONDITIONS = [
  {
    key: 'exhausted',
    label: 'Exhausted',
    attribute: 'STR',
    description: 'Bane on Strength-based tests.',
  },
  {
    key: 'sickly',
    label: 'Sickly',
    attribute: 'CON',
    description: 'Bane on Constitution-based tests.',
  },
  {
    key: 'dazed',
    label: 'Dazed',
    attribute: 'AGL',
    description: 'Bane on Agility-based tests.',
  },
  {
    key: 'angry',
    label: 'Angry',
    attribute: 'INT',
    description: 'Bane on Intelligence-based tests.',
  },
  {
    key: 'scared',
    label: 'Scared',
    attribute: 'WIL',
    description: 'Bane on Willpower-based tests.',
  },
  {
    key: 'disheartened',
    label: 'Disheartened',
    attribute: 'CHA',
    description: 'Bane on Charisma-based tests.',
  },
] as const;

export type PushRollCondition = typeof PUSH_ROLL_CONDITIONS[number];
export type PushRollConditionKey = PushRollCondition['key'];

export interface PushRollAvailabilityInput {
  isSkillCheck: boolean;
  isPlayer: boolean;
  isFailure: boolean;
  isDemon: boolean;
  hasCharacter: boolean;
  hasAlreadyPushed: boolean;
  conditions?: Partial<Conditions> | null;
  canPushWithoutCondition?: boolean;
}

export interface PushRollAvailability {
  canPush: boolean;
  reason?: string;
}

export function getAvailablePushRollConditions(
  conditions?: Partial<Conditions> | null,
): PushRollCondition[] {
  return PUSH_ROLL_CONDITIONS.filter((condition) => !conditions?.[condition.key]);
}

export function getPushRollAvailability({
  isSkillCheck,
  isPlayer,
  isFailure,
  isDemon,
  hasCharacter,
  hasAlreadyPushed,
  conditions,
  canPushWithoutCondition = false,
}: PushRollAvailabilityInput): PushRollAvailability {
  if (!isSkillCheck || !isPlayer || !isFailure || !hasCharacter) {
    return { canPush: false };
  }
  if (isDemon) {
    return { canPush: false, reason: 'A Demon roll cannot be pushed.' };
  }
  if (hasAlreadyPushed) {
    return { canPush: false, reason: 'This test has already been pushed.' };
  }
  if (getAvailablePushRollConditions(conditions).length === 0 && !canPushWithoutCondition) {
    return { canPush: false, reason: 'All six conditions are already active.' };
  }
  return { canPush: true };
}
