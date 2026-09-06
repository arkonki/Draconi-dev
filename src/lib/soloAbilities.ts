export const SOLO_ABILITY_RULE_KEYS = {
  armyOfOne: 'solo.army_of_one',
  soleSurvivor: 'solo.sole_survivor',
} as const;

export const SOLO_ABILITY_NAMES = {
  armyOfOne: 'Army of One',
  soleSurvivor: 'Sole Survivor',
} as const;

export const SOLE_SURVIVOR_WP_COST = 3;

type AbilityReference = {
  name?: string | null;
  rule_key?: string | null;
};

function normalized(value: string | null | undefined) {
  return String(value || '').trim().toLocaleLowerCase();
}

export function isSoloAbility(
  ability: AbilityReference,
  key: keyof typeof SOLO_ABILITY_RULE_KEYS,
) {
  return ability.rule_key === SOLO_ABILITY_RULE_KEYS[key]
    || normalized(ability.name) === normalized(SOLO_ABILITY_NAMES[key]);
}

export function characterHasSoloAbility(
  abilityNames: string[] | null | undefined,
  key: keyof typeof SOLO_ABILITY_NAMES,
) {
  const expected = normalized(SOLO_ABILITY_NAMES[key]);
  return (abilityNames || []).some((name) => normalized(name) === expected);
}
