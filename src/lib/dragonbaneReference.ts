// Short rules reminders shown while resolving combat. They follow the tables on the GM Screen.

export const CRITICAL_HIT_OPTIONS = [
  { id: 'double', label: 'Double damage', detail: 'Roll the damage dice twice (not the damage bonus) and enter the total.' },
  { id: 'second', label: 'Second attack', detail: 'A free extra attack against another target.' },
  { id: 'pierce', label: 'Pierce armor', detail: 'Armor has no effect. Only for piercing attacks.' },
] as const;

export const MELEE_DEMON_TABLE = [
  'Drop weapon. Picking it up takes an action.',
  'Expose yourself. The enemy gets a free attack.',
  'Weapon stuck. A STR roll (an action) frees it.',
  'Toss the weapon D3+3 meters.',
  'Weapon damaged. Bane until repaired.',
  'Hit yourself. Normal damage, no bonus.',
] as const;

export const RANGED_DEMON_TABLE = [
  'Drop weapon. Picking it up takes an action.',
  'Out of ammo. Reload or gather more.',
  'Hit a valuable item nearby.',
  'Weapon damaged. Bane until repaired.',
  'Hit a friendly target. Normal damage.',
  'Hit yourself. Normal damage.',
] as const;

export const PARRY_REMINDER = 'A successful parry stops the hit. Damage above the parrying weapon or shield’s Durability breaks it.';

export const DEATH_ROLL_REMINDER = 'Death roll each round: D20 at or under CON. Three successes stabilise, three failures kill. Dragon counts as two successes, Demon as two failures, and being hit while down is a failure.';
