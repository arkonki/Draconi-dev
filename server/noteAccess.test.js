// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canWriteNote, executeDataQuery, materializeAccessContext, validateNoteUpdate } from './data.js';

const personal = { user_id: 'author', party_id: null, character_id: null };
const party = { ...personal, party_id: 'campaign' };
function context(userId = 'author', role = 'player', admin = false) {
  return materializeAccessContext({ id: userId, role: admin ? 'admin' : 'player' }, {
    character_ids: ['owned-character'],
    party_access: role ? [{ party_id: 'campaign', role, owned: role === 'owner' }] : [],
  });
}

describe('journal write authorization', () => {
  it('allows personal and character journal writes without party membership', () => {
    expect(canWriteNote(personal, context('author', null))).toBe(true);
    expect(() => validateNoteUpdate(personal, { character_id: 'owned-character' }, context('author', null))).not.toThrow();
    expect(canWriteNote(personal, context('stranger', 'gm'))).toBe(false);
  });
  it.each(['owner', 'gm'])('lets campaign %s edit another author without taking ownership', role => {
    expect(canWriteNote(party, context('gm-user', role))).toBe(true);
    expect(() => validateNoteUpdate(party, { title: 'Revised' }, context('gm-user', role))).not.toThrow();
    expect(() => validateNoteUpdate(party, { user_id: 'gm-user' }, context('gm-user', role))).toThrow('author cannot be changed');
  });
  it('lets players edit only their own party entries', () => {
    expect(canWriteNote(party, context())).toBe(true);
    expect(canWriteNote(party, context('other'))).toBe(false);
  });
  it('keeps observers and outsiders read-only, including their own party entries', () => {
    expect(canWriteNote(party, context('author', 'observer'))).toBe(false);
    expect(canWriteNote(party, context('author', null))).toBe(false);
  });
  it('authorizes the destination as well as the original entry', () => {
    expect(() => validateNoteUpdate(personal, { party_id: 'campaign' }, context())).not.toThrow();
    expect(() => validateNoteUpdate(personal, { party_id: 'campaign' }, context('author', 'observer'))).toThrow('destination party');
    expect(() => validateNoteUpdate(party, { party_id: 'inaccessible' }, context())).toThrow('destination party');
    expect(() => validateNoteUpdate(party, { party_id: null }, context('other', 'gm'))).toThrow('destination party');
  });
  it('rejects other users’ character links and ambiguous ownership links', () => {
    expect(() => validateNoteUpdate(personal, { character_id: 'foreign-character' }, context())).toThrow('another user');
    expect(() => validateNoteUpdate(party, { character_id: 'owned-character' }, context())).toThrow('not both');
  });
  it('allows admin management but preserves the author even for admins', () => {
    const admin = context('administrator', null, true);
    expect(canWriteNote(party, admin)).toBe(true);
    expect(() => validateNoteUpdate(personal, { character_id: 'foreign-character' }, admin)).not.toThrow();
    expect(() => validateNoteUpdate(personal, { user_id: 'administrator' }, admin)).toThrow('author cannot be changed');
  });
  it('rejects upserts before database access to prevent bypassing existing-entry checks', async () => {
    await expect(executeDataQuery({ id: 'author' }, { table: 'notes', action: 'upsert', payload: party })).rejects.toThrow('explicit journal update');
  });
});
