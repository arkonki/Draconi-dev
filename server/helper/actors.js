import { conditionId, inventoryItemId } from './identifiers.js';
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

function characterEquipment(actorId, equipment) {
  const document = equipment && typeof equipment === 'object' && !Array.isArray(equipment)
    ? equipment
    : { inventory: Array.isArray(equipment) ? equipment : [], equipped: { weapons: [] }, money: {} };
  const inventory = Array.isArray(document.inventory) ? document.inventory : [];
  return {
    document,
    inventory: inventory.map((item, index) => ({
      id: inventoryItemId(actorId, item, index),
      definitionId: typeof item?.definition_id === 'string' ? item.definition_id : null,
      name: String(item?.name || item?.originalName || 'Unnamed item'),
      description: item?.description || null,
      quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1,
      weight: item?.weight ?? null,
      equipped: Boolean(item?.equipped),
      location: item?.containerId || null,
      properties: {
        category: item?.category || null,
        cost: item?.cost ?? null,
        unit: item?.unit || null,
      },
      _stored: item,
    })),
  };
}

function publicInventory(inventory) {
  return inventory.map((entry) => {
    const item = { ...entry };
    delete item._stored;
    return item;
  });
}

function combineConditions(actorId, characterConditions, combatantEffects) {
  const byKey = new Map();
  for (const condition of activeConditionEntries(actorId, characterConditions)) byKey.set(condition.key, condition);
  for (const condition of activeConditionEntries(actorId, combatantEffects)) byKey.set(condition.key, condition);
  return [...byKey.values()];
}

function characterActor(row, combatant) {
  const equipment = characterEquipment(row.id, row.equipment);
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
      attributes: row.attributes || {},
      skills: row.skill_levels || {},
      movement: null,
      armor: null,
      inventory: equipment.inventory,
      notes: row.notes || null,
      tags: [row.kin, row.profession].filter(Boolean),
      isAlive: currentHp > 0,
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
      inventory: [],
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
  const { currentHp, maxHp, currentWp, maxWp, inventory, ...rest } = actor;
  const output = {
    ...rest,
    hp: { current: currentHp, max: maxHp },
    wp: { current: currentWp, max: maxWp },
    inventory: publicInventory(inventory),
  };
  if (!includeGm && output.type !== 'pc') {
    output.attributes = {};
    output.skills = {};
    output.notes = null;
  }
  return output;
}

export async function loadActor(client, campaignId, actorId, { forUpdate = false } = {}) {
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
       ORDER BY e.updated_at DESC
       LIMIT 1
       ${forUpdate ? 'FOR UPDATE OF ec' : ''}`,
      [actorId, campaignId],
    );
    return characterActor(characters[0], combatants[0] || null);
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
     ${forUpdate ? 'FOR UPDATE OF ec' : ''}`,
    [actorId, campaignId],
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
    ...(entry._stored || {}),
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
         conditions = $5::jsonb, equipment = $6::jsonb
       WHERE id = $7`,
      [
        actor.currentHp,
        actor.maxHp,
        actor.currentWp,
        actor.maxWp,
        JSON.stringify(conditions),
        JSON.stringify(equipment),
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
