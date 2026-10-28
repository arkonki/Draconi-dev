import { beforeEach, describe, expect, it } from 'vitest';
import { setChatViewing } from './activeChat';

const stored = () => sessionStorage.getItem('active_chat_context');

describe('active chat', () => {
  beforeEach(() => sessionStorage.clear());

  it('keeps a party viewed until the last panel showing it goes away', () => {
    setChatViewing('p1', true);
    setChatViewing('p1', true);
    expect(JSON.parse(stored()!)).toEqual({ partyId: 'p1', active: true });
    setChatViewing('p1', false);
    expect(stored()).not.toBeNull();
    setChatViewing('p1', false);
    expect(stored()).toBeNull();
  });
});
