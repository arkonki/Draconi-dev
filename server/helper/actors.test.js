// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  actorForOutput,
  loadActor,
  normalizeCharacterEquipment,
  persistActor,
} from './actors.js';

const actorId = '3ced9760-b661-4a31-b219-8a754e815b55';
const campaignId = '5aec6ed0-441d-4d03-a7d1-d114776d62c6';
const daggerDefinitionId = '52e61370-9aaa-4332-b33d-78c534663bb1';

describe('Dragonbane Helper actor equipment', () => {
  it('normalizes equipped weapons and enriches legacy name-only data', () => {
    const result = normalizeCharacterEquipment(actorId, {
      inventory: [{ name: 'Torch', quantity: 2 }],
      equipped: { weapons: [{ name: 'Moon-rim dagger' }] },
      money: { gold: 1 },
    }, {
      definitions: [{
        id: daggerDefinitionId,
        name: 'Moon-rim dagger',
        category: 'WEAPON',
        damage: '1D8',
        range: 2,
        grip: '1H',
        durability: 12,
        weight: 1,
      }],
    });

    expect(result.weapons).toHaveLength(1);
    expect(result.weapons[0]).toMatchObject({
      definitionId: daggerDefinitionId,
      name: 'Moon-rim dagger',
      damage: '1D8',
      range: 2,
      grip: '1H',
      durability: 12,
      equipped: true,
      placement: {
        ownerId: actorId,
        carriedByActorId: actorId,
        heldByActorId: actorId,
        equipped: true,
        temporarilyPlaced: false,
      },
    });
    expect(result.equipment).toHaveLength(2);
    expect(result.heldItems.map(({ id }) => id)).toEqual([result.weapons[0].id]);
  });

  it('keeps explicit placement and runtime state for inventory items', () => {
    const result = normalizeCharacterEquipment(actorId, {
      inventory: [{
        name: 'Torch',
        quantity: 1,
        locationId: 'gate-panel',
        temporarilyPlaced: true,
        state: { status: 'burning', isLit: true, remainingDuration: 600 },
      }],
      equipped: { weapons: [] },
    });

    expect(result.inventory[0]).toMatchObject({
      name: 'Torch',
      placement: {
        carriedByActorId: null,
        locationId: 'gate-panel',
        temporarilyPlaced: true,
      },
      state: { status: 'burning', isLit: true, remainingDuration: 600 },
    });
  });

  it('returns all equipment views from a loaded player character', async () => {
    const row = {
      id: actorId,
      party_id: campaignId,
      name: 'Lunariem',
      current_hp: 10,
      max_hp: 10,
      current_wp: 5,
      max_wp: 5,
      conditions: {},
      equipment: {
        inventory: [],
        equipped: {
          weapons: [{ name: 'Moon-rim dagger' }],
          armor: 'Leather armor',
          shield: 'Round shield',
        },
        money: {},
      },
      item_notes: {},
      campaign_revision: 7,
      updated_at: '2026-09-08T00:00:00.000Z',
    };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{
          id: daggerDefinitionId,
          name: 'Moon-rim dagger',
          category: 'WEAPON',
          damage: '1D8',
        }, {
          id: 'd744e25b-68ef-4d5c-b6a0-3bf2565071e2',
          name: 'Leather armor',
          category: 'ARMOR',
          armor_rating: 2,
        }, {
          id: '27c32e9b-31d1-4fc0-8b63-3804af630ef0',
          name: 'Round shield',
          category: 'SHIELD',
          durability: 12,
        }] }),
    };

    const loaded = await loadActor(client, campaignId, actorId);
    const output = actorForOutput(loaded.actor);

    expect(output.weapons[0]).toMatchObject({ name: 'Moon-rim dagger', damage: '1D8' });
    expect(output.armor).toHaveLength(1);
    expect(output.bodyArmor).toMatchObject({ name: 'Leather armor', slot: 'armor' });
    expect(output.helmet).toBeNull();
    expect(output.shield).toMatchObject({
      name: 'Round shield',
      slot: 'shield',
      placement: { heldByActorId: actorId },
    });
    expect(output.armorStatus).toBe('equipped');
    expect(output.equipment).toHaveLength(3);
    expect(output.equipment.every((item) => !('_stored' in item))).toBe(true);
  });

  it('preserves non-inventory equipment fields when persisting actor changes', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const equipmentDocument = {
      inventory: [{ name: 'Torch', quantity: 1 }],
      equipped: { weapons: [{ name: 'Moon-rim dagger' }], armor: 'Leather armor' },
      money: { gold: 3, silver: 2, copper: 1 },
    };
    const normalized = normalizeCharacterEquipment(actorId, equipmentDocument);
    const actor = {
      id: actorId,
      currentHp: 10,
      maxHp: 10,
      currentWp: 5,
      maxWp: 5,
      conditions: [],
      inventory: [{ ...normalized.inventory[0], quantity: 2 }],
      isRallied: false,
      deathRolls: { passed: 0, failed: 0 },
    };

    await persistActor(client, actor, {
      type: 'character',
      row: { conditions: {} },
      equipmentDocument,
    });

    const persisted = JSON.parse(client.query.mock.calls[0][1][5]);
    expect(persisted.equipped).toEqual(equipmentDocument.equipped);
    expect(persisted.money).toEqual(equipmentDocument.money);
    expect(persisted.inventory[0]).toMatchObject({ name: 'Torch', quantity: 2 });
  });
});
