// Slot weights, not kilograms. Used by both the character UI and Helper/MCP.
export function finiteNonNegative(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function itemBundle(name = '') {
  const match = String(name).trim().match(/^(.*?)\s*\((\d+)\s*([a-z]*)\)$/i);
  const measured = match && /^(m|meters?|ft|feet|kg|l|liters?)$/i.test(match[3]);
  return match && !measured && Number(match[2]) > 0
    ? { name: match[1].trim(), size: Number(match[2]) }
    : { name: String(name).trim(), size: 1 };
}

// One catalogue row is one purchase: `quantity` units (Bandages: 10, a 10 m rope: 1) that weigh `weight` slots in
// all. Older rows wrote the count into the name instead, as in "Bandages (10)", so that still counts.
export function listingUnits(definition) {
  const bundle = itemBundle(definition?.name);
  if (bundle.size > 1) return bundle.size;
  const count = Number(definition?.quantity);
  return Number.isSafeInteger(count) && count > 0 ? count : 1;
}

// What one purchase of a catalogue item puts in an inventory: that many single units, named without the count.
export function listingContents(definition) {
  return { name: itemBundle(definition?.name).name, quantity: listingUnits(definition) };
}

// A stored "Bandages (10)" x1 from the loot window is a whole pack, so it weighs what the purchase does. Old shop
// purchases kept the name but counted single units ("Arrows (20)" x20), so a whole number of packs means units.
export function isStoredPack(item) {
  const size = itemBundle(item?.name).size;
  const quantity = finiteNonNegative(item?.quantity) ?? 1;
  return size > 1 && !(quantity >= size && quantity % size === 0);
}

export function findItemDefinition(item, definitions = []) {
  const record = typeof item === 'string' ? { name: item } : item || {};
  const id = record.definitionId || record.definition_id;
  const names = [record.name, record.originalName].map(name => String(name || '').trim().toLowerCase()).filter(Boolean);
  const nameOf = definition => String(definition.name || '').trim().toLowerCase();
  return (id && definitions.find(definition => definition.id === id))
    || names.map(named => definitions.find(definition => nameOf(definition) === named)).find(Boolean)
    || names.map(named => definitions.find(definition => itemBundle(nameOf(definition)).name === itemBundle(named).name)).find(Boolean);
}

export function resolveItemSlots(item, definition) {
  const record = typeof item === 'string' ? { name: item } : item || {};
  const savedWeight = finiteNonNegative(record.weight);
  const catalogueWeight = finiteNonNegative(definition?.weight);
  const unitsInListing = definition ? listingUnits(definition) : 1;
  const perItem = isStoredPack(record) ? 1 : unitsInListing;
  let unitWeight;
  if (savedWeight === null) unitWeight = (catalogueWeight ?? 1) / perItem;
  else if (record.weightBasis === 'unit') unitWeight = savedWeight;
  // Legacy shop purchases copied the purchase's weight onto every unit; any other saved weight is a custom unit weight.
  else if (record.weightBasis === 'bundle' || savedWeight === catalogueWeight) unitWeight = savedWeight / perItem;
  else unitWeight = savedWeight;
  return { unitWeight, unknownWeight: savedWeight === null && catalogueWeight === null, bundleSize: unitsInListing };
}

// Single coins are tiny items until there are 100 of them: 100-199 coins weigh as one item, 200-299 as two, and so on.
export function coinCount(money) {
  if (!money || typeof money !== 'object') return 0;
  return ['gold', 'silver', 'copper'].reduce((sum, key) => sum + Math.floor(finiteNonNegative(money[key]) ?? 0), 0);
}

const cleanLoad = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function calculateSlotEncumbrance({ strength, actorId, inventory = [], equipped = [], coins = 0 }) {
  const baseCapacity = Math.ceil((finiteNonNegative(strength) ?? 0) / 2);
  const providers = new Map(equipped.filter(item => item.id && ['container', 'animal'].includes(item.slot)).map(item => [item.id, item]));
  const unresolvedContainerItemIds = [];
  const isExternal = (item, seen = new Set()) => {
    if (item.slot === 'animal' || item.external) return true;
    if (item.carriedByActorId && actorId && item.carriedByActorId !== actorId) return true;
    if (item.temporarilyPlaced && !item.carriedByActorId) return true;
    const parentId = item.containerId || item.equippedOn;
    if (!parentId || seen.has(parentId)) return false;
    const parent = providers.get(parentId);
    if (!parent) return false; // Unresolved references must not erase load.
    return isExternal(parent, new Set([...seen, parentId]));
  };
  // Only carrying equipment grants extra slots. Legacy item records often have
  // a default modifier of 1, including weapons, armor, and clothes.
  const capacityBonuses = equipped.filter(item => item.slot === 'container' && item.equipped !== false && !isExternal(item))
    .map(item => ({ id: item.id, name: item.name, slots: finiteNonNegative(item.encumbranceModifier) ?? 0 }))
    .filter(bonus => bonus.slots > 0);
  const capacity = baseCapacity + capacityBonuses.reduce((sum, bonus) => sum + bonus.slots, 0);
  const containerStats = {};
  for (const [id, item] of providers) {
    // A backpack or saddle bag only adds carrying slots; real storage is a mount or a container such as a chest.
    if (item.slot !== 'animal' && !item.isContainer) continue;
    const mounted = item.slot === 'animal' || (item.equippedOn && providers.get(item.equippedOn)?.slot === 'animal');
    let containerCapacity = finiteNonNegative(item.containerCapacity);
    if (!containerCapacity) containerCapacity = item.isContainer ? 10 : capacity;
    if (item.slot === 'animal') {
      containerCapacity += equipped.filter(bag => bag.slot === 'container' && bag.equipped !== false && bag.equippedOn === id)
        .reduce((sum, bag) => sum + (finiteNonNegative(bag.encumbranceModifier) ?? 0), 0);
    }
    containerStats[id] = {
      id, name: item.name, load: 0, capacity: containerCapacity,
      countsTowardCarriedLoad: !isExternal(item),
      storageKind: mounted ? 'mount' : isExternal(item) ? 'external' : 'carried',
      isOverloaded: false,
    };
  }
  // Older items may sit "in" a backpack or saddle bag; they belong to whatever carries that bag.
  const storageFor = (id, seen = new Set()) => {
    if (!id || seen.has(id)) return undefined;
    return containerStats[id] || storageFor(providers.get(id)?.equippedOn, new Set([...seen, id]));
  };
  let load = 0;
  let rationCount = 0;
  let externalLoad = 0;
  const containerRations = {};
  const unknownWeightItemIds = [];
  const itemLocations = {};
  for (const item of inventory) {
    const quantity = finiteNonNegative(item.quantity) ?? 1;
    const weight = finiteNonNegative(item.weight) ?? 1;
    const ration = /ration/i.test(item.name || '');
    const itemLoad = (ration ? 0.25 : weight) * quantity;
    const external = isExternal(item);
    if (item.id) itemLocations[item.id] = external ? 'external' : 'carried';
    if (item.unknownWeight) unknownWeightItemIds.push(item.id);
    if (item.containerId && !providers.has(item.containerId)) unresolvedContainerItemIds.push(item.id);
    const container = storageFor(item.containerId);
    if (container) {
      if (ration) containerRations[container.id] = (containerRations[container.id] || 0) + quantity;
      else container.load += itemLoad;
    }
    if (external) externalLoad += itemLoad;
    else if (ration) rationCount += quantity;
    else load += itemLoad;
  }
  // A chest or basket you carry weighs what it weighs on top of its contents; worn packs and bags do not.
  const carriedContainerLoad = equipped
    .filter(item => item.slot === 'container' && item.isContainer && !isExternal(item))
    .reduce((sum, item) => sum + (finiteNonNegative(item.weight) ?? 1) * (finiteNonNegative(item.quantity) ?? 1), 0);
  const coinLoad = Math.floor((finiteNonNegative(coins) ?? 0) / 100);
  load = cleanLoad(load + Math.ceil(rationCount / 4) + coinLoad + carriedContainerLoad);
  for (const container of Object.values(containerStats)) {
    container.load = cleanLoad(container.load + Math.ceil((containerRations[container.id] || 0) / 4));
    container.isOverloaded = container.load > container.capacity;
  }
  return {
    baseCapacity, capacityBonuses, capacity, load, coinLoad, isEncumbered: load > capacity,
    externalLoad: cleanLoad(externalLoad), containerStats,
    unknownWeightItemIds, unresolvedContainerItemIds, itemLocations,
  };
}
