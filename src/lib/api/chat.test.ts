import { appendMessageIfMissing, orderNewestMessagePageChronologically, type Message } from './chat';

const message: Message = {
  id: 'message-1',
  party_id: 'party-1',
  user_id: 'user-1',
  content: 'Hello',
  created_at: '2026-07-24T00:00:00.000Z',
};

describe('appendMessageIfMissing', () => {
  it('appends a newly received message', () => {
    expect(appendMessageIfMissing([], message)).toEqual([message]);
  });

  it('does not append a message already delivered by realtime', () => {
    const messages = [message];
    expect(appendMessageIfMissing(messages, { ...message })).toBe(messages);
  });
});

describe('orderNewestMessagePageChronologically', () => {
  it('turns the newest-first database page into chronological display order', () => {
    const older = { ...message, id: 'older', created_at: '2026-01-10T21:22:18.102Z' };
    const newer = { ...message, id: 'newer', created_at: '2026-09-17T16:03:32.396Z' };

    expect(orderNewestMessagePageChronologically([newer, older])).toEqual([older, newer]);
  });
});
