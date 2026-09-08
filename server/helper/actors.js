import { conditionId, equipmentItemId, inventoryItemId } from './identifiers.js';
import { HelperError } from './errors.js';

function activeConditionEntries(actorId, value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const key = typeof entry === 'string'
        ? entry.trim().toLowerCase().replaceAll(' ', '_')
        : String(entry?.key || entry?.name || '').trim().toLowerCase().replaceAll(' ', '_');
      if (!key) return [];
      return [{
        id: conditionId(actorId, key),
        key,
        name: typeof entry === 'object' && entry?.name ? String(entry.name) : key.replaceAll('_', ' '),
        description: typeof entry === 'object' ? entry?.description || null : null,
        source: typeof entry === 'object' ? entry?.source || null : null,
        duration: typeof entry === 'object' && entry?.duration
          ? entry.duration
          : { type: 'indefinite', remaining: null },
        appliedAt: typeof entry === 'object' ? entry?.applied_at || entry?.appliedAt || null : null,
      }];
    });
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .filter(([, active]) => Boolean(active))
    .map(([key]) => ({
      id: conditionId(actorId, key),
      key,
      name: key.replaceAll('_', ' '),
      description: null,
      source: null,
      duration: { type: 'indefinite', remaining: null },
      appliedAt: null,
    }));
}

function storedItemObject(value) {
  if (typeof value === 'string') return { name: value };
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function definitionForItem(item, definitionsByName) {
  const name = nullableString(item.name || item.originalName);
  return name ? definitionsByName.get(name.toLowerCase()) || null : null;
}

function itemPlacement(actorId, item, { equipped = false, held = false } = {}) {
  const explicitlyPlaced = Boolean(item.temporarilyPlaced || item.temporarily_placed);
  return {
    ownerId: nullableString(item.ownerId || item.owner_id) || actorId,
    carriedByActorId: explicitlyPlaced
      ? nullableString(item.carriedByActorId || item.carried_by_actor_id)
      : nullableString(item.carriedByActorId || item.carried_by_actor_id) || actorId,
    locationId: nullableString(item.locationId || item.location_id),
    containerId: nullableString(item.containerId || item.container_id),
    equipped: Boolean(item.equipped ?? equipped),
    heldByActorId: nullableString(item.heldByActorId || item.held_by_actor_id)
      || (held ? actorId : null),
    temporarilyPlaced: explicitlyPlaced,
  };
}

function normalizedItem(actorId, value, index, {
  slot = 'inventory',
  equipped = false,
  held = false,
  definitionsByName = new Map(),
  itemNotes = {},
} = {}) {
  const item = storedItemObject(value);
  const definition = definitionForItem(item, definitionsByName);
  const definitionId = nullableString(item.definitionId || item.definition_id) || definition?.id || null;
  const notes = definitionId ? itemNotes?.[definitionId] || null : null;
  const placement = itemPlacement(actorId, item, { equipped, held });
  const id = slot === 'inventory'
    ? inventoryItemId(actorId, item, index)
    : equipmentItemId(actorId, slot, item, index);
  return {
    id,
    slot,
    definitionId,
    name: String(item.name || item.originalName || definition?.name || 'Unnamed item'),
    description: item.description ?? definition?.description ?? null,
    category: item.category ?? definition?.category ?? null,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1,
    weight: item.weight ?? definition?.weight ?? null,
    damage: item.damage ?? definition?.damage ?? null,
    range: item.range ?? definition?.range ?? null,
    grip: item.grip ?? definition?.grip ?? null,
    durability: item.durability ?? definition?.durability ?? null,
    armorRating: item.armorRating ?? item.armor_rating ?? definition?.armor_rating ?? null,
    features: item.features ?? definition?.features ?? [],
    equipped: placement.equipped,
    location: placement.containerId || placement.locationId,
    placement,
    state: {
      status: nullableString(item.state?.status || item.status) || 'unknown',
      isLit: typeof item.state?.isLit === 'boolean'
        ? item.state.isLit
        : typeof item.isLit === 'boolean' ? item.isLit : null,
      remainingDuration: item.state?.remainingDuration ?? item.remainingDuration ?? null,
      charges: item.state?.charges ?? item.charges ?? null,
      broken: typeof item.state?.broken === 'boolean'
        ? item.state.broken
        : typeof notes?.broken === 'boolean' ? notes.broken : null,
      enhanced: typeof notes?.enhanced === 'boolean' ? notes.enhanced : null,
      bonus: notes?.bonus || null,
    },
    properties: {
      category: item.category ?? definition?.category ?? null,
      cost: item.cost ?? definition?.cost ?? null,
      unit: item.unit ?? null,
    },
    _stored: value,
  };
}

function uniqueItems(items) {
  const byId = new Map();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

export function normalizeCharacterEquipment(actorId, equipment, {
  definitions = [],
  itemNotes = {},
} = {}) {
  const document = equipment && typeof equipment === 'object' && !Array.isArray(equipment)
    ? equipment
    : { inventory: Array.isArray(equipment) ? equipment : [], equipped: { weapons: [] }, money: {} };
  const inventory = Array.isArray(document.inventory) ? document.inventory : [];
  const equipped = document.equipped && typeof document.equipped === 'object'
    ? document.equipped
    : {};
  const definitionsByName = new Map(definitions.flatMap((definition) => (
    nullableString(definition?.name) ? [[definition.name.trim().toLowerCase(), definition]] : []
  )));
  const options = { definitionsByName, itemNotes };
  const normalizedInventory = inventory.map((item, index) => normalizedItem(
    actorId,
    item,
    index,
    { ...options, slot: 'inventory' },
  ));
  const weapons = (Array.isArray(equipped.weapons) ? equipped.weapons : []).map((item, index) => (
    normalizedItem(actorId, item, index, {
      ...options,
      slot: 'weapon',
      equipped: true,
      held: true,
    })
  ));
  const defensiveItem = (slot, item, { held = false } = {}) => (
    item === undefined || item === null || item === ''
      ? null
      : normalizedItem(actorId, item, 0, {
        ...options,
        slot,
        equipped: true,
        held,
      })
  );
  const bodyArmor = defensiveItem('armor', equipped.armor);
  const helmet = defensiveItem('helmet', equipped.helmet);
  const shield = defensiveItem('shield', equipped.shield, { held: true });
  const armor = [bodyArmor, helmet].filter(Boolean);
  const wornClothes = (Array.isArray(equipped.wornClothes) ? equipped.wornClothes : []).map(
    (item, index) => normalizedItem(actorId, item, index, {
      ...options,
      slot: 'worn-clothes',
      equipped: true,
    }),
  );
  const containers = (Array.isArray(equipped.containers) ? equipped.containers : []).map(
    (item, index) => normalizedItem(actorId, item, index, {
      ...options,
      slot: 'container',
      equipped: true,
    }),
  );
  const animals = (Array.isArray(equipped.animals) ? equipped.animals : []).map(
    (item, index) => normalizedItem(actorId, item, index, {
      ...options,
      slot: 'animal',
      equipped: true,
    }),
  );
  const allEquipment = uniqueItems([
    ...weapons,
    ...armor,
    ...(shield ? [shield] : []),
    ...normalizedInventory,
    ...wornClothes,
    ...containers,
    ...animals,
  ]);
  const specialCategories = new Set(['SPECIAL', 'MAGIC', 'QUEST', 'MEMENTO', 'ARTIFACT']);
  return {
    document,
    inventory: normalizedInventory,
    weapons,
    armor,
    bodyArmor,
    helmet,
    shield,
    wornClothes,
    containers,
    animals,
    equipment: allEquipment,
    specialItems: allEquipment.filter((item) => specialCategories.has(String(item.category || '').toUpperCase())),
    heldItems: allEquipment.filter((item) => item.placement.heldByActorId === actorId),
    armorStatus: bodyArmor || helmet ? 'equipped' : 'none',
  };
}

function publicInventory(inventory) {
  return inventory.map((entry) => {
    const item = { ...entry };
    delete item._stored;
    return item;
  });
}

function publicItem(entry) {
  if (!entry) return null;
  const item = { ...entry };
  delete item._stored;
  return item;
}

export function combineConditions(actorId, characterConditions, combatantEffects) {
  const byKey = new Map();
  for (const condition of activeConditionEntries(actorId, characterConditions)) byKey.set(condition.key, condition);
  for (const condition of activeConditionEntries(actorId, combatantEffects)) byKey.set(condition.key, condition);
  return [...byKey.values()];
}

function characterActor(row, combatant, definitions = []) {
  const equipment = normalizeCharacterEquipment(row.id, row.equipment, {
    definitions,
    itemNotes: row.item_notes || {},
  });
  const currentHp = combatant?.current_hp ?? row.current_hp;
  const maxHp = combatant?.max_hp ?? row.max_hp;
  const currentWp = combatant?.current_wp ?? row.current_wp;
  const maxWp = combatant?.max_wp ?? row.max_wp;
  return {
    actor: {
      id: row.id,
      campaignId: row.party_id,
      type: 'pc',
      name: row.name,
      description: row.background || null,
      portraitUrl: row.portrait_url || null,
      hp: { current: currentHp, max: maxHp },
      wp: { current: currentWp, max: maxWp },
      currentHp,
      maxHp,
      currentWp,
      maxWp,
      conditions: combineConditions(row.id, row.conditions, combatant?.status_effects),
      isRallied: Boolean(row.is_rallied),
      deathRolls: {
        passed: Number(row.death_rolls_passed || 0),
        failed: Number(row.death_rolls_failed || 0),
      },
      lifeStatus: Number(row.death_rolls_failed || 0) >= 3
        ? 'dead'
        : currentHp <= 0 ? 'dying' : 'active',
      attributes: row.attributes || {},
      skills: row.skill_levels || {},
      markedSkills: Array.isArray(row.marked_skills) ? row.marked_skills : [],
      movement: null,
      weapons: equipment.weapons,
      armor: equipment.armor,
      bodyArmor: equipment.bodyArmor,
      helmet: equipment.helmet,
      shield: equipment.shield,
      armorStatus: equipment.armorStatus,
      inventory: equipment.inventory,
      specialItems: equipment.specialItems,
      heldItems: equipment.heldItems,
      equipment: equipment.equipment,
      notes: row.notes || null,
      tags: [row.kin, row.profession].filter(Boolean),
      isAlive: currentHp > 0 && Number(row.death_rolls_failed || 0) < 3,
      isVisibleToPlayers: true,
      revision: Number(row.campaign_revision || 0),
      updatedAt: row.updated_at,
    },
    storage: {
      type: 'character',
      row,
      combatant,
      equipmentDocument: equipment.document,
    },
  };
}

function combatantActor(row) {
  const currentWp = row.current_wp ?? 0;
  const maxWp = row.max_wp ?? 0;
  const actorType = row.monster_id ? 'monster' : 'npc';
  return {
    actor: {
      id: row.id,
      campaignId: row.party_id,
      type: actorType,
      name: row.display_name,
      description: row.monster_description || null,
      portraitUrl: null,
      hp: { current: row.current_hp, max: row.max_hp },
      wp: { current: currentWp, max: maxWp },
      currentHp: row.current_hp,
      maxHp: row.max_hp,
      currentWp,
      maxWp,
      conditions: activeConditionEntries(row.id, row.status_effects),
      attributes: row.monster_stats || {},
      skills: {},
      movement: row.monster_stats?.movement ?? row.monster_stats?.MOVEMENT ?? null,
      armor: row.monster_stats?.armor ?? row.monster_stats?.ARMOR ?? null,
      armorStatus: row.monster_stats?.armor !== undefined || row.monster_stats?.ARMOR !== undefined
        ? 'equipped'
        : 'unknown',
      weapons: [],
      inventory: [],
      bodyArmor: null,
      helmet: null,
      shield: null,
      specialItems: [],
      heldItems: [],
      equipment: [],
      notes: null,
      tags: [actorType],
      isAlive: row.current_hp > 0,
      isVisibleToPlayers: true,
      revision: Number(row.campaign_revision || 0),
      updatedAt: row.updated_at,
    },
    storage: { type: 'combatant', row },
  };
}

export function actorForOutput(actor, { includeGm = true } = {}) {
  const {
    currentHp,
    maxHp,
    currentWp,
    maxWp,
    inventory,
    weapons = [],
    armor,
    bodyArmor = null,
    helmet = null,
    shield = null,
    specialItems = [],
    heldItems = [],
    equipment = [],
    ...rest
  } = actor;
  const output = {
    ...rest,
    hp: { current: currentHp, max: maxHp },
    wp: { current: currentWp, max: maxWp },
    inventory: publicInventory(inventory),
    weapons: publicInventory(weapons),
    armor: Array.isArray(armor) ? publicInventory(armor) : armor,
    bodyArmor: publicItem(bodyArmor),
    helmet: publicItem(helmet),
    shield: publicItem(shield),
    specialItems: publicInventory(specialItems),
    heldItems: publicInventory(heldItems),
    equipment: publicInventory(equipment),
  };
  if (!includeGm && output.type !== 'pc') {
    output.attributes = {};
    output.skills = {};
    output.notes = null;
  }
  return output;
}

export async function loadActor(client, campaignId, actorId, { forUpdate = false, combatId = null } = {}) {
  const lock = forUpdate ? 'FOR UPDATE OF c' : '';
  const { rows: characters } = await client.query(
    `SELECT c.*, p.helper_revision AS campaign_revision
     FROM characters c
     JOIN parties p ON p.id = c.party_id
     WHERE c.id = $1 AND c.party_id = $2
     ${lock}`,
    [actorId, campaignId],
  );
  if (characters[0]) {
    const { rows: combatants } = await client.query(
      `SELECT ec.*
       FROM encounter_combatants ec
       JOIN encounters e ON e.id = ec.encounter_id
       WHERE ec.character_id = $1 AND e.party_id = $2 AND e.status = 'active'
         AND ($3::uuid IS NULL OR e.id = $3)
       ORDER BY e.updated_at DESC
       LIMIT 1
       ${forUpdate ? 'FOR UPDATE OF ec' : ''}`,
      [actorId, campaignId, combatId],
    );
    const equipmentDocument = characters[0].equipment && typeof characters[0].equipment === 'object'
      ? characters[0].equipment
      : {};
    const equippedDocument = equipmentDocument.equipped && typeof equipmentDocument.equipped === 'object'
      ? equipmentDocument.equipped
      : {};
    const equipmentNames = [
      ...(Array.isArray(equipmentDocument.inventory) ? equipmentDocument.inventory : []),
      ...(Array.isArray(equippedDocument.weapons) ? equippedDocument.weapons : []),
      equippedDocument.armor,
      equippedDocument.helmet,
      equippedDocument.shield,
      ...(Array.isArray(equippedDocument.wornClothes) ? equippedDocument.wornClothes : []),
      ...(Array.isArray(equippedDocument.containers) ? equippedDocument.containers : []),
      ...(Array.isArray(equippedDocument.animals) ? equippedDocument.animals : []),
    ].flatMap((item) => {
      const stored = storedItemObject(item);
      const name = nullableString(stored.name || stored.originalName);
      return name ? [name.toLowerCase()] : [];
    });
    let definitions = [];
    if (equipmentNames.length > 0) {
      const { rows } = await client.query(
        `SELECT * FROM game_items
         WHERE lower(name) = ANY($1::text[])
         ORDER BY lower(name), COALESCE(is_custom, false), created_at`,
        [[...new Set(equipmentNames)]],
      );
      definitions = rows;
    }
    return characterActor(characters[0], combatants[0] || null, definitions);
  }

  const { rows: combatants } = await client.query(
    `SELECT ec.*, e.party_id, p.helper_revision AS campaign_revision,
       m.description AS monster_description,
       m.stats AS monster_stats
     FROM encounter_combatants ec
     JOIN encounters e ON e.id = ec.encounter_id
     JOIN parties p ON p.id = e.party_id
     LEFT JOIN monsters m ON m.id = ec.monster_id
     WHERE ec.id = $1 AND e.party_id = $2
       AND ($3::uuid IS NULL OR e.id = $3)
     ${forUpdate ? 'FOR UPDATE OF ec' : ''}`,
    [actorId, campaignId, combatId],
  );
  if (!combatants[0]) throw new HelperError(404, 'NOT_FOUND', 'Actor not found.');
  return combatantActor(combatants[0]);
}

function storedConditionObject(original, conditions) {
  const next = original && typeof original === 'object' && !Array.isArray(original)
    ? { ...original }
    : {};
  for (const key of Object.keys(next)) next[key] = false;
  for (const condition of conditions) next[condition.key] = true;
  return next;
}

function storedInventory(actor) {
  return actor.inventory.map((entry) => ({
    ...storedItemObject(entry._stored),
    id: entry.id,
    name: entry.name,
    description: entry.description ?? undefined,
    quantity: entry.quantity,
    weight: entry.weight ?? undefined,
    containerId: entry.location ?? undefined,
  }));
}

export async function persistActor(client, actor, storage) {
  if (storage.type === 'character') {
    const conditions = storedConditionObject(storage.row.conditions, actor.conditions);
    const equipment = {
      ...storage.equipmentDocument,
      inventory: storedInventory(actor),
    };
    await client.query(
      `UPDATE characters
       SET current_hp = $1, max_hp = $2, current_wp = $3, max_wp = $4,
         conditions = $5::jsonb, equipment = $6::jsonb,
         is_rallied = $7, death_rolls_passed = $8, death_rolls_failed = $9
       WHERE id = $10`,
      [
        actor.currentHp,
        actor.maxHp,
        actor.currentWp,
        actor.maxWp,
        JSON.stringify(conditions),
        JSON.stringify(equipment),
        Boolean(actor.isRallied),
        Number(actor.deathRolls?.passed || 0),
        Number(actor.deathRolls?.failed || 0),
        actor.id,
      ],
    );
    await client.query(
      `UPDATE encounter_combatants ec
       SET current_hp = $1, max_hp = $2, current_wp = $3, max_wp = $4
       FROM encounters e
       WHERE ec.encounter_id = e.id
         AND e.status = 'active'
         AND ec.character_id = $5`,
      [actor.currentHp, actor.maxHp, actor.currentWp, actor.maxWp, actor.id],
    );
    return;
  }

  const effects = actor.conditions.map((condition) => ({
    id: condition.id,
    key: condition.key,
    name: condition.name,
    description: condition.description,
    source: condition.source,
    duration: condition.duration,
    applied_at: condition.appliedAt,
  }));
  await client.query(
    `UPDATE encounter_combatants
     SET current_hp = $1, max_hp = $2, current_wp = $3, max_wp = $4,
       status_effects = $5::jsonb
     WHERE id = $6`,
    [
      actor.currentHp,
      actor.maxHp,
      actor.currentWp,
      actor.maxWp,
      JSON.stringify(effects),
      actor.id,
    ],
  );
}
