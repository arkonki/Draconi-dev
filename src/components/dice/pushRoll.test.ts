import { describe, expect, it } from 'vitest';
import {
  getAvailablePushRollConditions,
  getPushRollAvailability,
} from './pushRoll';

const eligibleRoll = {
  isSkillCheck: true,
  isPlayer: true,
  isFailure: true,
  isDemon: false,
  hasCharacter: true,
  hasAlreadyPushed: false,
  conditions: {
    exhausted: false,
    sickly: false,
    dazed: false,
    angry: false,
    scared: false,
    disheartened: false,
  },
};

describe('pushed test rolls', () => {
  it('offers only conditions the character has not already taken', () => {
    const available = getAvailablePushRollConditions({
      exhausted: true,
      sickly: false,
      dazed: true,
      angry: false,
      scared: false,
      disheartened: false,
    });

    expect(available.map((condition) => condition.key)).toEqual([
      'sickly',
      'angry',
      'scared',
      'disheartened',
    ]);
  });

  it('allows an eligible failed player test to be pushed', () => {
    expect(getPushRollAvailability(eligibleRoll)).toEqual({ canPush: true });
  });

  it('does not offer pushes for successful tests or non-player rolls', () => {
    expect(getPushRollAvailability({ ...eligibleRoll, isFailure: false })).toEqual({
      canPush: false,
    });
    expect(getPushRollAvailability({ ...eligibleRoll, isPlayer: false })).toEqual({
      canPush: false,
    });
  });

  it('blocks Demon rolls, repeat pushes, and characters with every condition', () => {
    expect(getPushRollAvailability({ ...eligibleRoll, isDemon: true })).toEqual({
      canPush: false,
      reason: 'A Demon roll cannot be pushed.',
    });
    expect(getPushRollAvailability({ ...eligibleRoll, hasAlreadyPushed: true })).toEqual({
      canPush: false,
      reason: 'This test has already been pushed.',
    });
    expect(getPushRollAvailability({
      ...eligibleRoll,
      conditions: {
        exhausted: true,
        sickly: true,
        dazed: true,
        angry: true,
        scared: true,
        disheartened: true,
      },
    })).toEqual({
      canPush: false,
      reason: 'All six conditions are already active.',
    });
  });

  it('allows a contextual ability to replace the condition cost', () => {
    expect(getPushRollAvailability({
      ...eligibleRoll,
      conditions: {
        exhausted: true,
        sickly: true,
        dazed: true,
        angry: true,
        scared: true,
        disheartened: true,
      },
      canPushWithoutCondition: true,
    })).toEqual({ canPush: true });
  });
});
