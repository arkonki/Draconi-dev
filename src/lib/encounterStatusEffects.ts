import type { EncounterStatusEffect } from '../types/encounter';

export const POISONED_STATUS_EFFECT = 'Poisoned';

const normalizeStatusEffectName = (name: string) => name.trim().toLowerCase();

export const normalizeEncounterStatusEffects = (
  statusEffects: EncounterStatusEffect[] | unknown[] | null | undefined
): EncounterStatusEffect[] => {
  if (!Array.isArray(statusEffects)) {
    return [];
  }

  return statusEffects.flatMap((effect) => {
    if (typeof effect === 'string') {
      const name = effect.trim();
      return name ? [{ name }] : [];
    }

    if (
      effect
      && typeof effect === 'object'
      && 'name' in effect
      && typeof effect.name === 'string'
      && effect.name.trim()
    ) {
      return [{ ...(effect as EncounterStatusEffect), name: effect.name.trim() }];
    }

    return [];
  });
};

export const hasEncounterStatusEffect = (
  statusEffects: EncounterStatusEffect[] | unknown[] | null | undefined,
  effectName: string
) => normalizeEncounterStatusEffects(statusEffects).some(
  (effect) => normalizeStatusEffectName(effect.name) === normalizeStatusEffectName(effectName)
);

export const toggleEncounterStatusEffect = (
  statusEffects: EncounterStatusEffect[] | unknown[] | null | undefined,
  effectName: string
) => {
  const normalizedEffects = normalizeEncounterStatusEffects(statusEffects);
  const normalizedTarget = normalizeStatusEffectName(effectName);
  const hasEffect = normalizedEffects.some(
    (effect) => normalizeStatusEffectName(effect.name) === normalizedTarget
  );

  if (hasEffect) {
    return normalizedEffects.filter(
      (effect) => normalizeStatusEffectName(effect.name) !== normalizedTarget
    );
  }

  return [...normalizedEffects, { name: effectName }];
};
