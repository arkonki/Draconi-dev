// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  advanceCampaignTimeInputSchema,
  createCampaignTimeReminderInputSchema,
  deleteCampaignTimeReminderInputSchema,
  generateSoloNpcInputSchema,
  getCampaignStateInputSchema,
  getEncounterSetupOptionsInputSchema,
  getRecentEventsInputSchema,
  getResumeStateInputSchema,
  getRollHistoryInputSchema,
  getSessionHistoryInputSchema,
  recordManualTreasureDrawInputSchema,
  resolveSoloNpcBehaviorInputSchema,
  searchWaypointInputSchema,
} from './schemas.js';

const baseSearch = {
  campaign_id: '5a135eb4-13a0-4d18-b000-8e050647c04f',
  waypoint_id: '7d2d87a5-83c8-43af-8c9f-738032664570',
  expected_revision: 3,
  idempotency_key: 'solo-search-schema-test',
  reason: 'Test the Solo Search contract.',
};

describe('Helper API schemas', () => {
  it('uses small default read pages and accepts opaque history cursors', () => {
    const cursor = '7d2d87a5-83c8-43af-8c9f-738032664570';
    expect(getCampaignStateInputSchema.parse({ campaign_id: baseSearch.campaign_id })).toMatchObject({
      recent_event_limit: 10,
    });
    expect(getRecentEventsInputSchema.parse({ campaign_id: baseSearch.campaign_id })).toMatchObject({ limit: 10 });
    expect(getRollHistoryInputSchema.parse({ campaign_id: baseSearch.campaign_id, cursor })).toMatchObject({
      cursor,
      limit: 10,
    });
    expect(getSessionHistoryInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      session_cursor: cursor,
      checkpoint_cursor: cursor,
    })).toMatchObject({ session_cursor: cursor, checkpoint_cursor: cursor, limit: 10 });
    expect(getEncounterSetupOptionsInputSchema.parse({ campaign_id: baseSearch.campaign_id })).toMatchObject({
      monster_limit: 20,
    });
  });

  it('accepts bounded token-conscious resume profiles without changing the legacy default', () => {
    expect(getResumeStateInputSchema.parse({ campaign_id: baseSearch.campaign_id })).toEqual({
      campaign_id: baseSearch.campaign_id,
    });
    expect(getResumeStateInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      detail: 'focused',
      recent_roll_limit: 5,
    })).toMatchObject({ detail: 'focused', recent_roll_limit: 5 });
    expect(() => getResumeStateInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      detail: 'summary',
    })).toThrow();
  });

  it('defaults Solo Search knowledge flags to false', () => {
    expect(searchWaypointInputSchema.parse(baseSearch)).toMatchObject({
      known_location: false,
      known_nature: false,
    });
  });

  it('requires a known location before the hidden item nature can be known', () => {
    expect(() => searchWaypointInputSchema.parse({
      ...baseSearch,
      known_location: false,
      known_nature: true,
    })).toThrow(/known nature requires/i);
    expect(searchWaypointInputSchema.parse({
      ...baseSearch,
      known_location: true,
      known_nature: true,
    })).toMatchObject({ known_location: true, known_nature: true });
  });

  it('accepts one or two supported roles for a simple Solo NPC', () => {
    expect(generateSoloNpcInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      expected_revision: 3,
      idempotency_key: 'solo-npc-schema-test',
      name: 'Ashfang Captain',
      template: 'boss',
      roles: ['melee', 'ranged'],
      reason: 'Create the foe established in the scene.',
    })).toMatchObject({ template: 'boss', roles: ['melee', 'ranged'] });
  });

  it('keeps the NPC behavior schema flat for MCP conversion', () => {
    expect(resolveSoloNpcBehaviorInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      npc_id: '7d2d87a5-83c8-43af-8c9f-738032664570',
      expected_revision: 4,
      idempotency_key: 'solo-npc-action-test',
      behavior: 'attack',
      role: 'sneaky',
      reason: 'Resolve the active NPC turn.',
    })).toMatchObject({
      behavior: 'attack', role: 'sneaky', oracle: 'fortune',
      inspiration_columns: ['action', 'thing'],
    });
  });

  it('accepts duplicate physical treasure cards and preserves every entered record', () => {
    const parsed = recordManualTreasureDrawInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      expected_revision: 5,
      idempotency_key: 'solo-treasure-schema-test',
      card_count: 2,
      cards: [
        { title: 'Duplicate', contents: 'First physical card record.' },
        { title: 'Duplicate', contents: 'First physical card record.' },
      ],
      shuffled_before_draw: true,
      returned_and_shuffled: true,
      reason: 'Record the two cards drawn from the physical deck.',
    });
    expect(parsed.cards).toHaveLength(2);
    expect(parsed.cards[0]).toEqual(parsed.cards[1]);
  });

  it('accepts bounded Dragonbane campaign-time advances', () => {
    expect(advanceCampaignTimeInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      expected_revision: 6,
      idempotency_key: 'campaign-time-advance-test',
      unit: 'stretch',
      amount: 2,
      reason: 'The party searches the ruins.',
    })).toMatchObject({ unit: 'stretch', amount: 2 });
    expect(advanceCampaignTimeInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      expected_revision: 6,
      idempotency_key: 'campaign-time-day-advance-test',
      unit: 'day',
      amount: 9,
      reason: 'Nine days pass during the journey.',
    })).toMatchObject({ unit: 'day', amount: 9 });
    expect(() => advanceCampaignTimeInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      expected_revision: 6,
      idempotency_key: 'campaign-time-invalid-test',
      unit: 'hour',
      amount: 1,
      reason: 'Invalid unit.',
    })).toThrow();
  });

  it('restricts time reminders to trusted dice notation', () => {
    const reminder = {
      campaign_id: baseSearch.campaign_id,
      expected_revision: 6,
      idempotency_key: 'campaign-time-reminder-test',
      label: 'Encounter check',
      dice_expression: '1d12',
      interval_unit: 'stretch',
      interval_count: 4,
      reason: 'Schedule the adventure-specific check.',
    };
    expect(createCampaignTimeReminderInputSchema.parse(reminder)).toMatchObject({ dice_expression: '1d12' });
    expect(() => createCampaignTimeReminderInputSchema.parse({
      ...reminder,
      dice_expression: 'roll whatever the GM says',
    })).toThrow();
  });

  it('accepts revision-safe removal of a time reminder', () => {
    expect(deleteCampaignTimeReminderInputSchema.parse({
      campaign_id: baseSearch.campaign_id,
      reminder_id: '15aa8f35-45da-43aa-a767-7c98bba69c72',
      expected_revision: 8,
      idempotency_key: 'campaign-time-reminder-delete-test',
      reason: 'The paused reminder is no longer needed.',
    })).toMatchObject({ reminder_id: '15aa8f35-45da-43aa-a767-7c98bba69c72' });
  });
});
