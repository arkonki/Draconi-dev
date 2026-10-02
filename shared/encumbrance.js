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

export function findItemDefinition(item, definitions = []) {
  const record = typeof item === 'string' ? { name: item } : item || {};
  const id = record.definitionId || record.definition_id;
  const named = String(record.name || record.originalName || '').trim().toLowerCase();
  return (id && definitions.find(definition => definition.id === id))
    || definitions.find(definition => String(definition.name || '').trim().toLowerCase() === named)
    || definitions.find(definition => itemBundle(definition.name).name.toLowerCase() === itemBundle(named).name.toLowerCase());
}

export function resolveItemSlots(item, definition) {
  const record = typeof item === 'string' ? { name: item } : item || {};
  const savedWeight = finiteNonNegative(record.weight);
  const catalogueWeight = finiteNonNegative(definition?.weight);
  const bundle = itemBundle(definition?.name || record.originalName || record.name);
  let unitWeight = savedWeight ?? catalogueWeight ?? 1;
  // Legacy shop purchases stored a bundle's weight on every individual.
  // Explicit unit weights and custom overrides must not be divided twice.
  if (bundle.size > 1 && record.weightBasis !== 'unit'
      && (savedWeight === null || record.weightBasis === 'bundle' || savedWeight === catalogueWeight)) {
    unitWeight /= bundle.size;
  }
  return { unitWeight, unknownWeight: savedWeight === null && catalogueWeight === null, bundleSize: bundle.size };
}

const cleanLoad = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function calculateSlotEncumbrance({ strength, actorId, inventory = [], equipped = [] }) {
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
  const capacityBonuses = equipped.filter(item => item.equipped !== false && !isExternal(item))
    .map(item => ({ id: item.id, name: item.name, slots: finiteNonNegative(item.encumbranceModifier) ?? 0 }))
    .filter(bonus => bonus.slots > 0);
  const capacity = baseCapacity + capacityBonuses.reduce((sum, bonus) => sum + bonus.slots, 0);
  const containerStats = {};
  for (const [id, item] of providers) {
    const mounted = item.slot === 'animal' || (item.equippedOn && providers.get(item.equippedOn)?.slot === 'animal');
    let containerCapacity = finiteNonNegative(item.containerCapacity);
    if (!containerCapacity) containerCapacity = item.isContainer ? 10 : capacity;
    if (item.slot === 'animal') {
      containerCapacity += equipped.filter(bag => bag.equippedOn === id)
        .reduce((sum, bag) => sum + (finiteNonNegative(bag.encumbranceModifier) ?? 0), 0);
    }
    containerStats[id] = {
      id, name: item.name, load: 0, capacity: containerCapacity,
      countsTowardCarriedLoad: !isExternal(item),
      storageKind: mounted ? 'mount' : isExternal(item) ? 'external' : 'carried',
      isOverloaded: false,
    };
  }
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
    const container = containerStats[item.containerId];
    if (container) {
      if (ration) containerRations[item.containerId] = (containerRations[item.containerId] || 0) + quantity;
      else container.load += itemLoad;
    }
    if (external) externalLoad += itemLoad;
    else if (ration) rationCount += quantity;
    else load += itemLoad;
  }
  load = cleanLoad(load + Math.ceil(rationCount / 4));
  for (const container of Object.values(containerStats)) {
    container.load = cleanLoad(container.load + Math.ceil((containerRations[container.id] || 0) / 4));
    container.isOverloaded = container.load > container.capacity;
  }
  return {
    baseCapacity, capacityBonuses, capacity, load, isEncumbered: load > capacity,
    externalLoad: cleanLoad(externalLoad), containerStats,
    unknownWeightItemIds, unresolvedContainerItemIds, itemLocations,
  };
}
