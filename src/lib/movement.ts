interface KinMovement {
  kin: string;
  movement: number;
}

interface AgilityModifier {
  range: string;
  modifier: number;
}

export const kinData: KinMovement[] = [
  { kin: "Human", movement: 10 },
  { kin: "Halfling", movement: 8 },
  { kin: "Dwarf", movement: 8 },
  { kin: "Elf", movement: 10 },
  { kin: "Mallard", movement: 8 },
  { kin: "Wolfkin", movement: 12 },
];

export const agilityModifiers: AgilityModifier[] = [
  { range: "AGL 1–6", modifier: -4 },
  { range: "AGL 7–9", modifier: -2 },
  { range: "AGL 13–15", modifier: +2 },
  { range: "AGL 16–18", modifier: +4 },
];

export function calculateMovement(kin: string, agility: number): number {
  // Get base movement for kin
  const baseMovement = kinData.find(k => k.kin === kin)?.movement || 10;

  // Calculate agility modifier
  let agilityMod = 0;
  if (agility <= 6) agilityMod = -4;
  else if (agility <= 9) agilityMod = -2;
  else if (agility <= 12) agilityMod = 0;
  else if (agility <= 15) agilityMod = +2;
  else agilityMod = +4;

  return baseMovement + agilityMod;
}
