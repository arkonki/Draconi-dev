// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prepareChatMessage, rollPayload, rollText } from './chatMessages.js';

const PARTY = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const NOTE = '33333333-3333-4333-8333-333333333333';

/** A database stand-in that answers each query with the next prepared result. */
const clientWith = (...results) => ({ query: async () => results.shift() ?? { rows: [] } });

describe('chat message kinds', () => {
  it('keeps plain text but refuses the old fake-able tags', async () => {
    await expect(prepareChatMessage(clientWith(), { party_id: PARTY, content: 'Hello' })).resolves.toEqual({ kind: 'text', payload: {}, content: 'Hello' });
    await expect(prepareChatMessage(clientWith(), { party_id: PARTY, content: `<<<POKE:${TARGET}>>> hi` })).rejects.toThrow('share buttons');
  });

  it('writes a poke from the target the server found, and refuses outsiders', async () => {
    const poke = await prepareChatMessage(clientWith({ rows: [{ name: 'Brynja' }] }), { party_id: PARTY, kind: 'poke', payload: { targetUserId: TARGET }, content: 'anything' });
    expect(poke).toEqual({ kind: 'poke', payload: { targetUserId: TARGET }, content: '👉 Poked Brynja!' });
    await expect(prepareChatMessage(clientWith({ rows: [{ name: null }] }), { party_id: PARTY, kind: 'poke', payload: { targetUserId: TARGET } })).rejects.toThrow('not in this campaign');
  });

  it('shares only a note of this campaign, with its real title', async () => {
    const note = await prepareChatMessage(clientWith({ rows: [{ title: 'The map' }] }), { party_id: PARTY, kind: 'note', payload: { noteId: NOTE, title: 'Fake title' } });
    expect(note).toEqual({ kind: 'note', payload: { noteId: NOTE, title: 'The map' }, content: 'Shared a note: The map' });
    await expect(prepareChatMessage(clientWith({ rows: [] }), { party_id: PARTY, kind: 'note', payload: { noteId: NOTE } })).rejects.toThrow('not in this campaign');
  });

  it('refuses unknown kinds and missing ids', async () => {
    await expect(prepareChatMessage(clientWith(), { party_id: PARTY, kind: 'system', content: 'x' })).rejects.toThrow('Unknown message kind');
    await expect(prepareChatMessage(clientWith(), { party_id: PARTY, kind: 'poke', payload: {} })).rejects.toThrow('Who to poke');
  });

  it('builds a shared roll from its fields only', () => {
    const payload = rollPayload({ label: 'Swords', total: 7, critical: true, success: true, extra: '<script>' });
    expect(payload).toEqual({ label: 'Swords', total: 7, outcome: '', dice: '', critical: true, success: true, manual: false });
    expect(rollText(payload)).toBe('🎲 **Swords**: Result: 7 🔥 CRITICAL! ✅ Success');
    expect(rollText(rollPayload({ label: 'Luck', total: null, outcome: 'Dragon' }))).toBe('🎲 **Luck**: Result: Dragon');
  });
});
